import { ArrowLeft, CheckCircle, XCircle, Square } from 'lucide-react';
import { Button } from './ui/button';
import type { PageView } from '../types';

interface ReadMePageProps {
  userEmail: string;
  onSignOut: () => void;
  onNavigate: (page: PageView) => void;
}

export function ReadMePage({ userEmail, onSignOut, onNavigate }: ReadMePageProps) {
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('index')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="font-semibold text-neutral-900">How to Use the Momentum Pulse</h1>
              <p className="text-sm text-neutral-600 mt-0.5">A quick guide to interpreting the dashboard</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-4xl mx-auto">
        <div className="bg-white border border-neutral-200 rounded-lg">
          <div className="px-8 py-6 space-y-8">
            {/* OBJECTIVE */}
            <div>
              <h3 className="font-semibold text-neutral-900 mb-3 pb-2 border-b border-neutral-200">
                OBJECTIVE
              </h3>
              <p className="text-neutral-700 leading-relaxed">
                I developed the Momentum Pulse to help navigate markets and ride uptrends with confidence. Built on
                years of research, it cuts through the noise of price action to answer two key questions: How strong is
                the momentum? And how sustainable is it?
              </p>
            </div>

            {/* FRAMEWORK */}
            <div>
              <h3 className="font-semibold text-neutral-900 mb-4 pb-2 border-b border-neutral-200">
                FRAMEWORK
              </h3>

              {/* 1. Performance */}
              <div className="mb-6">
                <h4 className="font-semibold text-neutral-900 mb-3">1. Performance</h4>
                <ul className="space-y-2 ml-6">
                  <li className="text-neutral-700">
                    <span className="font-medium">1-month and 3-month returns</span> (and vs. sector/market benchmarks).
                  </li>
                  <li className="text-neutral-700">
                    <span className="font-medium">Distance from the 1-year high:</span>
                    <ul className="ml-6 mt-1 space-y-1">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />
                        <span>Close to high (≤5%): Low overhead resistance → more reliable moves.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Square className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <span>Far from high (&gt;10%): Higher drawdown risk → more resistance levels to clear.</span>
                      </li>
                    </ul>
                  </li>
                </ul>
              </div>

              {/* 2. Trend Assessment */}
              <div className="mb-6">
                <h4 className="font-semibold text-neutral-900 mb-3">2. Trend Assessment</h4>
                <p className="text-neutral-700 mb-3">Timeframes: based on Daily or Weekly chart.</p>
                <p className="text-neutral-700 mb-3">Key Tools: Two EMAs, short-term (9-period) and mid-term (21/30-period).</p>
                <p className="font-medium text-neutral-900 mb-3">Trend Rating Criteria (Score: out of 5):</p>
                
                <div className="space-y-2 ml-6 mb-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />
                    <span className="text-neutral-700">9-EMA &gt; 21/30-EMA (most important).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />
                    <span className="text-neutral-700">Price above the 9-EMA.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />
                    <span className="text-neutral-700">Price above the 21/30-EMA.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />
                    <span className="text-neutral-700">9-EMA slope is rising.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />
                    <span className="text-neutral-700">21/30-EMA slope is rising.</span>
                  </div>
                </div>

                <p className="text-neutral-700 ml-6">
                  <span className="font-medium">Classification:</span> (Strong) Uptrend, Sideways, (Strong) Downtrend.
                </p>
              </div>

              {/* 3. Trend Outlook */}
              <div className="mb-6">
                <h4 className="font-semibold text-neutral-900 mb-3">3. Trend Outlook</h4>
                <ul className="space-y-2 ml-6">
                  <li className="flex items-start gap-2">
                    <span className="font-medium text-neutral-900">Extended:</span>
                    <span className="text-neutral-700">Price stretched far above the 9-EMA → consolidation likely.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium text-neutral-900">Stable:</span>
                    <span className="text-neutral-700">Price near 9-EMA → trend intact.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium text-neutral-900">Cooling:</span>
                    <span className="text-neutral-700">Price below the 9-EMA but holding the 21/30 EMA.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium text-neutral-900">Reversing:</span>
                    <span className="text-neutral-700">Price breaking the 21/30-EMA increases risk of trend reversal.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* HOW DO I USE IT? */}
            <div>
              <h3 className="font-semibold text-neutral-900 mb-4 pb-2 border-b border-neutral-200">
                HOW DO I USE IT?
              </h3>

              {/* 1. Timeframes */}
              <div className="mb-6">
                <h4 className="font-semibold text-neutral-900 mb-3">1. Timeframes</h4>
                <ul className="space-y-2 ml-6">
                  <li className="text-neutral-700">
                    <span className="font-medium">Daily:</span> Swing trades.
                  </li>
                  <li className="text-neutral-700">
                    <span className="font-medium">Weekly:</span> Position/long-term trades.
                  </li>
                </ul>
              </div>

              {/* 2. Buy & Sell */}
              <div className="mb-6">
                <h4 className="font-semibold text-neutral-900 mb-3">2. Buy & Sell</h4>
                <ul className="space-y-2 ml-6">
                  <li className="text-neutral-700">
                    <span className="font-medium">Favorite Setup:</span> 9-EMA crossing above the 21/30-EMA. Sometimes, I enter early and use the crossover as validation.
                  </li>
                  <li className="text-neutral-700">
                    Avoid new entries if trend score &gt;4 (especially if extended).
                  </li>
                  <li className="text-neutral-700">
                    Hold comfortably if trend score &gt;2.5.
                  </li>
                </ul>
              </div>

              {/* 3. Watchouts */}
              <div>
                <h4 className="font-semibold text-neutral-900 mb-3">3. Watchouts</h4>
                <ul className="space-y-2 ml-6">
                  <li className="text-neutral-700">
                    Extended trends can persist (especially in volatile assets: leverage ETFs, crypto, meme stocks). But gravity always kicks in eventually.
                  </li>
                  <li className="text-neutral-700">
                    Sideways trends are tricky and lower conviction trades.
                  </li>
                  <li className="text-neutral-700">
                    &gt;10% below 1-year high: Higher fake out risk.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}