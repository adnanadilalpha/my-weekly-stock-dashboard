'use client';

import { useState, useEffect } from 'react';
import { AuthScreen } from './components/auth-screen';
import { IndexPage } from './components/index-page';
import { ReadMePage } from './components/readme-page';
import { TickerAnalysisPage } from './components/ticker-analysis-page';
import { DashboardPage } from './components/dashboard-page';
import type { PageView } from './types';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<PageView>('index');
  const [selectedTicker, setSelectedTicker] = useState('SPY');

  useEffect(() => {
    // Check if user is already authenticated
    const savedEmail = localStorage.getItem('userEmail');
    if (savedEmail) {
      setUserEmail(savedEmail);
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleAuthSuccess = (email: string) => {
    setUserEmail(email);
    setIsAuthenticated(true);
    localStorage.setItem('userEmail', email);
  };

  const handleSignOut = () => {
    setUserEmail('');
    setIsAuthenticated(false);
    setCurrentPage('index');
    localStorage.removeItem('userEmail');
  };

  const handleNavigate = (page: PageView, ticker?: string) => {
    setCurrentPage(page);
    if (ticker) {
      setSelectedTicker(ticker);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-neutral-600">Loading...</div>
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

