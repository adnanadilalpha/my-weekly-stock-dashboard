'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PriceChart } from '@/app/components/price-chart';
import { RelativeStrengthScatter } from '@/app/components/charts/relative-strength-scatter';
import { TickerIcon } from '@/app/components/ui/ticker-icon';
import { fetchPriceHistory } from '@/lib/queries/price-history';
import { fetchTickersRelativeStrength } from '@/lib/hooks/useRelativeStrength';
import type { RelativeStrengthPoint } from '@/lib/relative-strength';
import type { ChatWidget } from '@/lib/intelligence/chat/tools';
import { cn } from '@/app/components/ui/utils';

function ChatPriceChartCard({
  ticker,
  interval: initialInterval,
}: {
  ticker: string;
  interval: 'daily' | 'weekly';
}) {
  const [interval, setInterval] = useState<'daily' | 'weekly'>(initialInterval);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bars, setBars] = useState<{ date: string; close: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPriceHistory(ticker, interval, interval === 'weekly' ? 80 : 120)
      .then((rows) => {
        if (!cancelled) setBars(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load chart');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, interval]);

  const emaShort = 9;
  const emaLong = interval === 'weekly' ? 30 : 21;

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
            <TickerIcon ticker={ticker} size={28} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight text-neutral-900">
              {ticker}
            </p>
            <p className="text-[10px] text-neutral-500">
              {interval === 'weekly' ? 'Weekly · 9 & 30 EMA' : 'Daily · 9 & 21 EMA'}
            </p>
          </div>
        </div>
        <div className="flex rounded-lg border border-neutral-200 p-0.5">
          {(['daily', 'weekly'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setInterval(id)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors',
                interval === id
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-800',
              )}
            >
              {id === 'daily' ? 'D' : 'W'}
            </button>
          ))}
        </div>
      </div>
      <div className="relative px-1 pb-1 pt-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
          </div>
        )}
        {error ? (
          <p className="px-3 py-8 text-center text-[12px] text-red-600">{error}</p>
        ) : bars.length === 0 && !loading ? (
          <p className="px-3 py-8 text-center text-[12px] text-neutral-500">
            No price history for {ticker}.
          </p>
        ) : (
          <PriceChart
            bars={bars}
            interval={interval}
            emaShort={emaShort}
            emaLong={emaLong}
            height={200}
          />
        )}
      </div>
    </div>
  );
}

function ChatQuadrantCard({
  tickers,
  title,
}: {
  tickers: string[];
  title?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<RelativeStrengthPoint[]>([]);
  const tickerKey = tickers.join(',');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const list = tickerKey.split(',').filter(Boolean);
    fetchTickersRelativeStrength(list)
      .then((pts) => {
        if (!cancelled) setPoints(pts);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load quadrant');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tickerKey]);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-3 py-2">
        <p className="text-[13px] font-semibold tracking-tight text-neutral-900">
          {title?.trim() || 'Quadrant Analysis'}
        </p>
        <p className="mt-0.5 text-[10px] leading-snug text-neutral-500">
          X = % vs 21-day EMA · Y = % vs 30-week EMA · {tickers.length} ticker
          {tickers.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="relative h-[260px] p-1.5 sm:h-[300px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
          </div>
        )}
        {error ? (
          <p className="px-3 py-10 text-center text-[12px] text-red-600">{error}</p>
        ) : !loading && points.length === 0 ? (
          <p className="px-3 py-10 text-center text-[12px] text-neutral-500">
            No EMA distances available for these tickers.
          </p>
        ) : (
          <RelativeStrengthScatter
            points={points}
            fill
            showBrief={false}
            showTitle={false}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-neutral-100 px-3 py-2">
        {tickers.map((t) => (
          <span
            key={t}
            className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-neutral-700"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ChatWidgetStack({ widgets }: { widgets: ChatWidget[] }) {
  if (!widgets.length) return null;
  return (
    <div className="mt-3 space-y-3">
      {widgets.map((w, i) => {
        if (w.type === 'price_chart') {
          return (
            <ChatPriceChartCard
              key={`chart-${w.ticker}-${w.interval}-${i}`}
              ticker={w.ticker}
              interval={w.interval}
            />
          );
        }
        return (
          <ChatQuadrantCard
            key={`quad-${w.tickers.join('-')}-${i}`}
            tickers={w.tickers}
            title={w.title}
          />
        );
      })}
    </div>
  );
}
