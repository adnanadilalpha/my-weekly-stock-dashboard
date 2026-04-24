'use client';

import { useEffect, useMemo, useState } from 'react';

interface TickerIconProps {
  ticker: string | null | undefined;
  size?: number;
  className?: string;
}

const FALLBACK_COLORS = ['#111827', '#1f2937', '#374151', '#3f3f46', '#334155', '#0f766e', '#1d4ed8', '#7c3aed'];
const tradingViewLogoCache = new Map<string, string | null>();
const LOCAL_CACHE_KEY = 'ticker_logo_cache_v1';
const LOCAL_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;

type LocalLogoCacheEntry = {
  logoUrl: string | null;
  expiresAt: number;
};

function readLocalLogoCache(symbol: string): string | null | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, LocalLogoCacheEntry>;
    const entry = parsed[symbol];
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) return undefined;
    return entry.logoUrl;
  } catch {
    return undefined;
  }
}

function writeLocalLogoCache(symbol: string, logoUrl: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, LocalLogoCacheEntry>) : {};
    parsed[symbol] = {
      logoUrl,
      expiresAt: Date.now() + LOCAL_CACHE_TTL_MS,
    };
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // localStorage may be unavailable or full
  }
}

/** Normalize for logo APIs: keep BRK.B-style symbols; strip noise. */
function normalizeTicker(rawTicker: string | null | undefined): string {
  if (!rawTicker) return '';
  const cleaned = rawTicker.replace(/\$/g, '').trim().toUpperCase();
  if (!cleaned) return '';
  if (/^[A-Z][A-Z0-9.]{0,11}$/.test(cleaned)) return cleaned;
  return cleaned.match(/^([A-Z]{1,6})/)?.[1] ?? cleaned;
}

function getFallbackColor(ticker: string): string {
  const hash = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function TickerIcon({ ticker, size = 18, className = '' }: TickerIconProps) {
  const symbol = useMemo(() => normalizeTicker(ticker), [ticker]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [tradingViewLogoUrl, setTradingViewLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!symbol) {
      setTradingViewLogoUrl(null);
      return;
    }

    const cached = tradingViewLogoCache.get(symbol);
    if (cached !== undefined) {
      setTradingViewLogoUrl(cached);
      return;
    }

    const localCached = readLocalLogoCache(symbol);
    if (localCached !== undefined) {
      tradingViewLogoCache.set(symbol, localCached);
      setTradingViewLogoUrl(localCached);
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/api/ticker-logo?symbol=${encodeURIComponent(symbol)}`);
        if (!response.ok) throw new Error('logo request failed');
        const payload = (await response.json()) as { logoUrl?: string | null };
        const logoUrl = payload.logoUrl ?? null;
        tradingViewLogoCache.set(symbol, logoUrl);
        writeLocalLogoCache(symbol, logoUrl);
        if (!cancelled) setTradingViewLogoUrl(logoUrl);
      } catch {
        tradingViewLogoCache.set(symbol, null);
        writeLocalLogoCache(symbol, null);
        if (!cancelled) setTradingViewLogoUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const logoSources = useMemo(() => {
    if (!symbol) return [];
    return [
      ...(tradingViewLogoUrl ? [tradingViewLogoUrl] : []),
      `https://financialmodelingprep.com/image-stock/${symbol}.png`,
      `https://eodhd.com/img/logos/US/${symbol}.png`,
      `https://companiesmarketcap.com/img/company-logos/64/${symbol}.png`,
    ];
  }, [symbol, tradingViewLogoUrl]);

  useEffect(() => {
    setSourceIndex(0);
  }, [symbol, logoSources.length]);

  if (!symbol || sourceIndex >= logoSources.length) {
    const label = symbol || '?';
    return (
      <div
        className={`inline-flex items-center justify-center rounded-full font-semibold text-white ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: getFallbackColor(label),
          fontSize: Math.max(10, Math.floor(size * 0.45)),
          lineHeight: 1,
        }}
        aria-label={`${label} icon`}
        title={label}
      >
        {label.slice(0, 1)}
      </div>
    );
  }

  return (
    <img
      src={logoSources[sourceIndex]}
      alt={`${symbol} logo`}
      width={size}
      height={size}
      className={`inline-block shrink-0 rounded-full border border-border bg-muted object-contain p-[1px] ${className}`}
      onError={() => setSourceIndex((current) => current + 1)}
      loading="lazy"
    />
  );
}
