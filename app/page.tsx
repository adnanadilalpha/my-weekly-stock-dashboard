'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AuthScreen } from './components/auth-screen';
import { IndexPage } from './components/index-page';
import { ReadMePage } from './components/readme-page';
import { TickerAnalysisPage } from './components/ticker-analysis-page';
import { DashboardPage } from './components/dashboard-page';
import { PortfolioDashboardPage } from './components/portfolio-dashboard-page';
import { PortfolioDetailPage } from './components/portfolio-detail-page';
import { MyPortfoliosPage } from './components/my-portfolio/my-portfolios-page';
import { ChatDrawer } from './components/intelligence/chat-drawer';
import type { PageView, AppMode, PortfolioPage } from './types';
import { supabase } from '@/lib/supabase-client';
import { ActivityProvider, useActivity } from '@/lib/activity/ActivityProvider';

const isDevBypassEnabled =
  (process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS ?? '').toLowerCase().trim() === 'true';

/** Temporarily skip hub chooser — land on MWS Portfolios; restore last page on refresh. */
const NAV_STORAGE_KEY = 'mws_nav_v1';
const HUB_DISABLED = true;

type PersistedNav = {
  appMode: AppMode;
  currentPage: PageView;
  portfolioPage: PortfolioPage;
  selectedTicker: string;
  myPortfolioId: string | null;
};

const DEFAULT_NAV: PersistedNav = {
  appMode: 'portfolio',
  currentPage: 'index',
  portfolioPage: 'dashboard',
  selectedTicker: 'SPY',
  myPortfolioId: null,
};

function readPersistedNav(): PersistedNav | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(NAV_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedNav>;
    const appMode = parsed.appMode;
    if (appMode !== 'mws' && appMode !== 'portfolio' && appMode !== 'my-holdings') return null;
    return {
      appMode,
      currentPage:
        parsed.currentPage === 'readme' ||
        parsed.currentPage === 'ticker-analysis' ||
        parsed.currentPage === 'dashboard' ||
        parsed.currentPage === 'index'
          ? parsed.currentPage
          : 'index',
      portfolioPage: (parsed.portfolioPage as PortfolioPage) || 'dashboard',
      selectedTicker:
        typeof parsed.selectedTicker === 'string' && parsed.selectedTicker.trim()
          ? parsed.selectedTicker.trim().toUpperCase()
          : 'SPY',
      myPortfolioId:
        typeof parsed.myPortfolioId === 'string' && parsed.myPortfolioId
          ? parsed.myPortfolioId
          : null,
    };
  } catch {
    return null;
  }
}

function writePersistedNav(nav: PersistedNav) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(nav));
  } catch {
    // ignore quota / private mode
  }
}

function clearPersistedNav() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(NAV_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  // Hub chooser disabled: default to MWS Portfolios; hydrate from sessionStorage after mount.
  const [appMode, setAppMode] = useState<AppMode>(DEFAULT_NAV.appMode);
  const [currentPage, setCurrentPage] = useState<PageView>(DEFAULT_NAV.currentPage);
  const [portfolioPage, setPortfolioPage] = useState<PortfolioPage>(DEFAULT_NAV.portfolioPage);
  const [selectedTicker, setSelectedTicker] = useState(DEFAULT_NAV.selectedTicker);
  const [myPortfolioId, setMyPortfolioId] = useState<string | null>(DEFAULT_NAV.myPortfolioId);
  const [navReady, setNavReady] = useState(false);

  // Restore last page on refresh so we don't bounce back to the entry dashboard.
  useEffect(() => {
    const saved = readPersistedNav();
    if (saved) {
      setAppMode(saved.appMode);
      setCurrentPage(saved.currentPage);
      setPortfolioPage(saved.portfolioPage);
      setSelectedTicker(saved.selectedTicker);
      setMyPortfolioId(saved.myPortfolioId);
    } else if (HUB_DISABLED) {
      setAppMode(DEFAULT_NAV.appMode);
      setPortfolioPage(DEFAULT_NAV.portfolioPage);
    }
    setNavReady(true);
  }, []);

  // If anything still routes to hub while it's disabled, bounce to MWS Portfolios.
  useEffect(() => {
    if (!HUB_DISABLED || appMode !== 'hub') return;
    setAppMode('portfolio');
    setPortfolioPage('dashboard');
  }, [appMode]);

  // Persist navigation while signed in (survives refresh within the tab).
  useEffect(() => {
    if (!navReady || !isAuthenticated) return;
    if (appMode === 'hub') return;
    writePersistedNav({
      appMode,
      currentPage,
      portfolioPage,
      selectedTicker,
      myPortfolioId,
    });
  }, [navReady, isAuthenticated, appMode, currentPage, portfolioPage, selectedTicker, myPortfolioId]);

  useEffect(() => {
    if (isDevBypassEnabled) {
      setUserEmail('dev@local');
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Error getting session:', error);
          setIsLoading(false);
          return;
        }

        if (session?.user) {
          setUserEmail(session.user.email || '');
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error('Error checking session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUserEmail(session.user.email || '');
          setIsAuthenticated(true);
          // Fresh login with no saved nav → MWS Portfolios (hub chooser disabled).
          if (HUB_DISABLED && !readPersistedNav()) {
            setAppMode('portfolio');
            setPortfolioPage('dashboard');
            setCurrentPage('index');
            setMyPortfolioId(null);
          }
        } else if (event === 'SIGNED_OUT') {
          setUserEmail('');
          setIsAuthenticated(false);
          clearPersistedNav();
        }
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleAuthSuccess = useCallback((email: string) => {
    setUserEmail(email);
    setIsAuthenticated(true);
    if (HUB_DISABLED && !readPersistedNav()) {
      setAppMode('portfolio');
      setPortfolioPage('dashboard');
      setCurrentPage('index');
      setMyPortfolioId(null);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    clearPersistedNav();
    if (isDevBypassEnabled) {
      setUserEmail('dev@local');
      setIsAuthenticated(true);
      setAppMode(DEFAULT_NAV.appMode);
      setCurrentPage(DEFAULT_NAV.currentPage);
      setPortfolioPage(DEFAULT_NAV.portfolioPage);
      setMyPortfolioId(null);
      return;
    }

    try {
      await supabase.auth.signOut();
      setUserEmail('');
      setIsAuthenticated(false);
      setAppMode(DEFAULT_NAV.appMode);
      setCurrentPage(DEFAULT_NAV.currentPage);
      setPortfolioPage(DEFAULT_NAV.portfolioPage);
      setMyPortfolioId(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  const handleNavigate = useCallback((page: PageView, ticker?: string) => {
    setCurrentPage(page);
    if (ticker) setSelectedTicker(ticker);
  }, []);

  const handleGoToPortfolio = useCallback(() => {
    setAppMode('portfolio');
    setPortfolioPage('dashboard');
    setMyPortfolioId(null);
  }, []);

  const handleGoToMyHoldings = useCallback(() => {
    setAppMode('my-holdings');
    setMyPortfolioId(null);
  }, []);

  const handleGoToMWS = useCallback(() => {
    setAppMode('mws');
    setCurrentPage('index');
  }, []);

  const handleSelectPortfolio = useCallback((page: PortfolioPage) => {
    setPortfolioPage(page);
    setMyPortfolioId(null);
  }, []);

  const activityContext = useMemo(
    () => ({
      appMode,
      page:
        appMode === 'mws'
          ? currentPage
          : appMode === 'portfolio'
            ? portfolioPage
            : appMode === 'my-holdings'
              ? ('my-holdings' as const)
              : ('hub' as const),
      portfolioPage: appMode === 'portfolio' ? portfolioPage : undefined,
    }),
    [appMode, currentPage, portfolioPage],
  );

  const trackingEnabled = isAuthenticated && !isDevBypassEnabled;

  // Wait for sessionStorage hydrate so refresh restores the same page (not a flash to Portfolios).
  if (isLoading || !navReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 px-4">
        <div className="flex flex-col items-center space-y-2 sm:space-y-3">
          <svg className="h-6 w-6 animate-spin text-blue-600 sm:h-8 sm:w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <div className="text-sm font-medium text-slate-600 sm:text-base">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <ActivityProvider enabled={trackingEnabled} context={activityContext}>
      <HomeContent
        isLoading={false}
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
        appMode={appMode}
        currentPage={currentPage}
        portfolioPage={portfolioPage}
        selectedTicker={selectedTicker}
        myPortfolioId={myPortfolioId}
        onAuthSuccess={handleAuthSuccess}
        onSignOut={handleSignOut}
        onNavigate={handleNavigate}
        onGoToPortfolio={handleGoToPortfolio}
        onGoToMyHoldings={handleGoToMyHoldings}
        onGoToMWS={handleGoToMWS}
        onSelectPortfolio={handleSelectPortfolio}
        onBackToPortfolioDashboard={() => {
          setPortfolioPage('dashboard');
          setMyPortfolioId(null);
        }}
        onSelectMyPortfolioId={setMyPortfolioId}
        onSwitchToMwsTicker={(ticker) => {
          setAppMode('mws');
          setCurrentPage('ticker-analysis');
          setSelectedTicker(ticker);
        }}
      />
    </ActivityProvider>
  );
}

type HomeContentProps = {
  isLoading: boolean;
  isAuthenticated: boolean;
  userEmail: string;
  appMode: AppMode;
  currentPage: PageView;
  portfolioPage: PortfolioPage;
  selectedTicker: string;
  myPortfolioId: string | null;
  onAuthSuccess: (email: string) => void;
  onSignOut: () => Promise<void>;
  onNavigate: (page: PageView, ticker?: string) => void;
  onGoToPortfolio: () => void;
  onGoToMyHoldings: () => void;
  onGoToMWS: () => void;
  onSelectPortfolio: (page: PortfolioPage) => void;
  onBackToPortfolioDashboard: () => void;
  onSelectMyPortfolioId: (id: string | null) => void;
  onSwitchToMwsTicker: (ticker: string) => void;
};

function HomeContent({
  isLoading,
  isAuthenticated,
  userEmail,
  appMode,
  currentPage,
  portfolioPage,
  selectedTicker,
  myPortfolioId,
  onAuthSuccess,
  onSignOut: onSignOutProp,
  onNavigate: onNavigateProp,
  onGoToPortfolio: onGoToPortfolioProp,
  onGoToMyHoldings: onGoToMyHoldingsProp,
  onGoToMWS: onGoToMWSProp,
  onSelectPortfolio: onSelectPortfolioProp,
  onBackToPortfolioDashboard,
  onSelectMyPortfolioId,
  onSwitchToMwsTicker,
}: HomeContentProps) {
  const activity = useActivity();

  const handleSignOut = async () => {
    await onSignOutProp();
  };

  const handleNavigate = (page: PageView, ticker?: string) => {
    if (page === 'ticker-analysis' && ticker) {
      activity?.trackEvent({
        eventType: 'ticker_view',
        eventName: ticker.toUpperCase(),
        metadata: { ticker: ticker.toUpperCase(), source: 'navigation' },
      });
    }
    onNavigateProp(page, ticker);
  };

  const handleGoToPortfolio = () => {
    onGoToPortfolioProp();
  };

  const handleGoToMyHoldings = () => {
    onGoToMyHoldingsProp();
  };

  const handleGoToMWS = () => {
    onGoToMWSProp();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 px-4">
        <div className="flex flex-col items-center space-y-2 sm:space-y-3">
          <svg className="h-6 w-6 animate-spin text-blue-600 sm:h-8 sm:w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <div className="text-sm font-medium text-slate-600 sm:text-base">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onAuthSuccess={onAuthSuccess} />;
  }

  // Hub chooser temporarily disabled — never render the chooser screen.
  const effectiveMode: AppMode = appMode === 'hub' ? 'portfolio' : appMode;

  if (effectiveMode === 'my-holdings') {
    return (
      <>
        <MyPortfoliosPage
          userEmail={userEmail}
          currentAppMode={effectiveMode}
          onGoToPortfolio={handleGoToPortfolio}
          onGoToMyHoldings={handleGoToMyHoldings}
          onGoToMWS={handleGoToMWS}
          onSignOut={handleSignOut}
          selectedPortfolioId={myPortfolioId}
          onSelectMyPortfolioId={onSelectMyPortfolioId}
          onNavigateMws={(page, ticker) => {
            if (page === 'ticker-analysis' && ticker) onSwitchToMwsTicker(ticker);
          }}
        />
        <ChatDrawer contextRef={{ userPortfolioId: myPortfolioId ?? undefined }} />
      </>
    );
  }

  if (effectiveMode === 'portfolio') {
    if (portfolioPage === 'dashboard') {
      return (
        <>
          <PortfolioDashboardPage
            userEmail={userEmail}
            currentAppMode={effectiveMode}
            onGoToPortfolio={handleGoToPortfolio}
            onGoToMyHoldings={handleGoToMyHoldings}
            onGoToMWS={handleGoToMWS}
            onSignOut={handleSignOut}
            onSelectPortfolio={onSelectPortfolioProp}
          />
          <ChatDrawer contextRef={{ portfolioPage: 'dashboard' }} />
        </>
      );
    }
    return (
      <>
        <PortfolioDetailPage
          portfolioPage={portfolioPage as Exclude<PortfolioPage, 'dashboard'>}
          userEmail={userEmail}
          currentAppMode={effectiveMode}
          onGoToPortfolio={handleGoToPortfolio}
          onGoToMyHoldings={handleGoToMyHoldings}
          onGoToMWS={handleGoToMWS}
          onSignOut={handleSignOut}
          onBack={onBackToPortfolioDashboard}
        />
        <ChatDrawer contextRef={{ portfolioPage }} />
      </>
    );
  }

  return (
    <>
      {currentPage === 'index' && (
        <IndexPage
          userEmail={userEmail}
          onSignOut={handleSignOut}
          onNavigate={handleNavigate}
          currentAppMode={effectiveMode}
          onGoToPortfolio={handleGoToPortfolio}
          onGoToMyHoldings={handleGoToMyHoldings}
          onGoToMWS={handleGoToMWS}
        />
      )}
      {currentPage === 'readme' && (
        <ReadMePage
          userEmail={userEmail}
          onSignOut={handleSignOut}
          onNavigate={handleNavigate}
          currentAppMode={effectiveMode}
          onGoToPortfolio={handleGoToPortfolio}
          onGoToMyHoldings={handleGoToMyHoldings}
          onGoToMWS={handleGoToMWS}
        />
      )}
      {currentPage === 'ticker-analysis' && (
        <TickerAnalysisPage
          userEmail={userEmail}
          onSignOut={handleSignOut}
          onNavigate={handleNavigate}
          initialTicker={selectedTicker}
          currentAppMode={effectiveMode}
          onGoToPortfolio={handleGoToPortfolio}
          onGoToMyHoldings={handleGoToMyHoldings}
          onGoToMWS={handleGoToMWS}
        />
      )}
      {currentPage === 'dashboard' && (
        <DashboardPage
          userEmail={userEmail}
          onSignOut={handleSignOut}
          onNavigate={handleNavigate}
          currentAppMode={effectiveMode}
          onGoToPortfolio={handleGoToPortfolio}
          onGoToMyHoldings={handleGoToMyHoldings}
          onGoToMWS={handleGoToMWS}
        />
      )}
      {currentPage !== 'ticker-analysis' && <ChatDrawer />}
    </>
  );
}
