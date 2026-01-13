'use client';

import { useState, useEffect } from 'react';
import { AuthScreen } from './components/auth-screen';
import { IndexPage } from './components/index-page';
import { ReadMePage } from './components/readme-page';
import { TickerAnalysisPage } from './components/ticker-analysis-page';
import { DashboardPage } from './components/dashboard-page';
import type { PageView } from './types';
import { supabase } from '@/lib/supabase-client';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<PageView>('index');
  const [selectedTicker, setSelectedTicker] = useState('SPY');

  useEffect(() => {
    // Check initial session
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

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUserEmail(session.user.email || '');
          setIsAuthenticated(true);
        } else if (event === 'SIGNED_OUT') {
          setUserEmail('');
          setIsAuthenticated(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleAuthSuccess = (email: string) => {
    // This will be called after successful authentication
    // The actual auth state is handled by the onAuthStateChange listener
    setUserEmail(email);
    setIsAuthenticated(true);
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    setUserEmail('');
    setIsAuthenticated(false);
    setCurrentPage('index');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleNavigate = (page: PageView, ticker?: string) => {
    setCurrentPage(page);
    if (ticker) {
      setSelectedTicker(ticker);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <div className="text-slate-600 font-medium">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <>
      {currentPage === 'index' && (
        <IndexPage 
          userEmail={userEmail} 
          onSignOut={handleSignOut}
          onNavigate={handleNavigate}
        />
      )}
      {currentPage === 'readme' && (
        <ReadMePage 
          userEmail={userEmail} 
          onSignOut={handleSignOut}
          onNavigate={handleNavigate}
        />
      )}
      {currentPage === 'ticker-analysis' && (
        <TickerAnalysisPage 
          userEmail={userEmail} 
          onSignOut={handleSignOut}
          onNavigate={handleNavigate}
          initialTicker={selectedTicker}
        />
      )}
      {currentPage === 'dashboard' && (
        <DashboardPage 
          userEmail={userEmail} 
          onSignOut={handleSignOut}
          onNavigate={handleNavigate}
        />
      )}
    </>
  );
}

