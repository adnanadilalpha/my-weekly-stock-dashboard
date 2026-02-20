'use client';

import { LayoutDashboard, PieChart } from 'lucide-react';

export interface HubPageProps {
  onGoToPortfolio: () => void;
  onGoToMWS: () => void;
}

export function HubPage({ onGoToPortfolio, onGoToMWS }: HubPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-xl sm:text-2xl font-semibold text-neutral-900">
            My Weekly Stock
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            Choose where to go
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onGoToPortfolio}
            className="group flex flex-col gap-3 p-5 sm:p-6 bg-white border-2 border-neutral-200 rounded-xl hover:border-neutral-900 hover:shadow-lg transition-all text-left cursor-pointer transform hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-neutral-100 rounded-lg group-hover:bg-neutral-900 transition-colors flex-shrink-0">
                <PieChart className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-700 group-hover:text-white transition-colors" />
              </div>
              <span className="font-semibold text-base sm:text-lg text-neutral-900 truncate">
                View Portfolio
              </span>
              <svg className="w-5 h-5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              Performance recap and portfolio details: Dow 30, Large Caps, Nasdaq 100, Macro ETF
            </p>
          </button>

          <button
            type="button"
            onClick={onGoToMWS}
            className="group flex flex-col gap-3 p-5 sm:p-6 bg-white border-2 border-neutral-200 rounded-xl hover:border-neutral-900 hover:shadow-lg transition-all text-left cursor-pointer transform hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-neutral-100 rounded-lg group-hover:bg-neutral-900 transition-colors flex-shrink-0">
                <LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-700 group-hover:text-white transition-colors" />
              </div>
              <span className="font-semibold text-base sm:text-lg text-neutral-900 truncate">
                View MWS Dashboard
              </span>
              <svg className="w-5 h-5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              Momentum Pulse Check, segments, sectors, large caps and on-demand analysis
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
