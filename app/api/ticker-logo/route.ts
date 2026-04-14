import { NextRequest, NextResponse } from 'next/server';

const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const logoCache = new Map<string, { logoUrl: string | null; expiresAt: number }>();
const LOGO_DEBUG = true;

interface TradingViewSearchResult {
  symbol?: string;
  logoid?: string;
  logo?: { logoid?: string };
  type?: string;
  exchange?: string;
}

function normalizeSymbol(raw: string): string {
  return raw.replace('$', '').trim().toUpperCase();
}

function pickBestMatch(results: TradingViewSearchResult[], symbol: string): TradingViewSearchResult | null {
  if (!Array.isArray(results) || results.length === 0) return null;

  const clean = (value: string | undefined) => (value ?? '').replace(/<[^>]*>/g, '').toUpperCase();

  const exact = results.find((item) => clean(item.symbol) === symbol);
  if (exact) return exact;

  const preferredTypeOrder = ['stock', 'fund', 'cfd', 'index'];
  for (const type of preferredTypeOrder) {
    const hit = results.find((item) => item.type === type);
    if (hit) return hit;
  }

  return results[0];
}

export async function GET(request: NextRequest) {
  const symbolParam = request.nextUrl.searchParams.get('symbol');
  if (!symbolParam) {
    return NextResponse.json({ logoUrl: null }, { status: 400 });
  }

  const symbol = normalizeSymbol(symbolParam);
  if (!symbol) {
    return NextResponse.json({ logoUrl: null }, { status: 400 });
  }

  const now = Date.now();
  const cached = logoCache.get(symbol);
  if (cached && cached.expiresAt > now) {
    if (LOGO_DEBUG) {
      console.log(`[ticker-logo] ${symbol}: cache hit -> ${cached.logoUrl ?? 'null'}`);
    }
    return NextResponse.json(
      { logoUrl: cached.logoUrl },
      {
        headers: {
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      }
    );
  }

  try {
    const url = `https://symbol-search.tradingview.com/symbol_search/?text=${encodeURIComponent(
      symbol
    )}&hl=1&lang=en&type=&domain=production`;

    const response = await fetch(url, {
      headers: {
        origin: 'https://www.tradingview.com',
        referer: 'https://www.tradingview.com/',
      },
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      if (LOGO_DEBUG) {
        console.log(`[ticker-logo] ${symbol}: TradingView request failed (${response.status})`);
      }
      logoCache.set(symbol, { logoUrl: null, expiresAt: now + CACHE_TTL_MS });
      return NextResponse.json(
        { logoUrl: null },
        {
          headers: {
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          },
        }
      );
    }

    const results = (await response.json()) as TradingViewSearchResult[];
    const match = pickBestMatch(results, symbol);
    const logoid = match?.logo?.logoid ?? match?.logoid ?? null;
    const logoUrl = logoid ? `https://s3-symbol-logo.tradingview.com/${logoid}.svg` : null;
    if (LOGO_DEBUG) {
      console.log(
        `[ticker-logo] ${symbol}: TradingView match -> symbol=${match?.symbol ?? 'n/a'} type=${match?.type ?? 'n/a'} logoid=${logoid ?? 'null'}`
      );
    }

    logoCache.set(symbol, { logoUrl, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(
      { logoUrl },
      {
        headers: {
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      }
    );
  } catch {
    if (LOGO_DEBUG) {
      console.log(`[ticker-logo] ${symbol}: TradingView lookup exception`);
    }
    logoCache.set(symbol, { logoUrl: null, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(
      { logoUrl: null },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      }
    );
  }
}
