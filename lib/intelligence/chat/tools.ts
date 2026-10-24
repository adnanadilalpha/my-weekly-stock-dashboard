/**
 * Chat visual tools — model calls these; the web UI renders native chart/quadrant cards.
 */

import { suggestTickerCorrection } from '@/lib/intelligence/chat/ticker-resolve';

export type ChatPriceChartWidget = {
  type: 'price_chart';
  ticker: string;
  interval: 'daily' | 'weekly';
};

export type ChatQuadrantWidget = {
  type: 'quadrant';
  tickers: string[];
  title?: string;
};

export type ChatWidget = ChatPriceChartWidget | ChatQuadrantWidget;

export type ChatToolName = 'show_price_chart' | 'show_quadrant';

const MAX_QUADRANT_TICKERS = 24;

function normTicker(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!t || t.length > 12) return null;
  if (!/^[A-Z][A-Z0-9.\-]*$/.test(t)) return null;
  // Match Ask text: APPL → AAPL, apple → AAPL, etc. (widgets previously kept the typo).
  return suggestTickerCorrection(t) ?? t;
}

function uniqTickers(raw: unknown, max: number): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const t = normTicker(item);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** OpenAI / Modal tool schema. */
export const OPENAI_CHAT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'show_price_chart',
      description:
        'Render an interactive MWS price chart with EMAs inside the chat for one ticker. Use when the user asks to see a chart, price action, or how the EMA framework looks on a name.',
      parameters: {
        type: 'object',
        properties: {
          ticker: {
            type: 'string',
            description: 'Ticker symbol, e.g. SLV, AAPL, XLE',
          },
          interval: {
            type: 'string',
            enum: ['daily', 'weekly'],
            description: 'Daily (9/21 EMA) or weekly (9/30 EMA). Default daily.',
          },
        },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'show_quadrant',
      description:
        'Render an interactive Quadrant Analysis scatter (21-day vs 30-week EMA) for a set of tickers inside the chat. Use for quadrant / relative-strength / multi-ticker screener requests.',
      parameters: {
        type: 'object',
        properties: {
          tickers: {
            type: 'array',
            items: { type: 'string' },
            description: '1–24 tickers to plot, e.g. ["SLV","AAPL","MSFT","XLE"]',
          },
          title: {
            type: 'string',
            description: 'Optional short chart title',
          },
        },
        required: ['tickers'],
      },
    },
  },
];

/** Gemini functionDeclarations. */
export const GEMINI_FUNCTION_DECLARATIONS = [
  {
    name: 'show_price_chart',
    description:
      'Render an interactive MWS price chart with EMAs inside the chat for one ticker. Use when the user asks to see a chart, price action, or how the EMA framework looks on a name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ticker: {
          type: 'STRING',
          description: 'Ticker symbol, e.g. SLV, AAPL, XLE',
        },
        interval: {
          type: 'STRING',
          enum: ['daily', 'weekly'],
          description: 'Daily (9/21 EMA) or weekly (9/30 EMA). Default daily.',
        },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'show_quadrant',
    description:
      'Render an interactive Quadrant Analysis scatter (21-day vs 30-week EMA) for a set of tickers inside the chat. Use for quadrant / relative-strength / multi-ticker screener requests.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tickers: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: '1–24 tickers to plot',
        },
        title: {
          type: 'STRING',
          description: 'Optional short chart title',
        },
      },
      required: ['tickers'],
    },
  },
];

export type ToolExecution = {
  name: ChatToolName;
  ok: boolean;
  widget?: ChatWidget;
  /** Compact JSON for the model. */
  result: Record<string, unknown>;
};

export function executeChatTool(
  name: string,
  args: Record<string, unknown>,
): ToolExecution {
  if (name === 'show_price_chart') {
    const ticker = normTicker(args.ticker);
    const interval = args.interval === 'weekly' ? 'weekly' : 'daily';
    if (!ticker) {
      return {
        name: 'show_price_chart',
        ok: false,
        result: { ok: false, error: 'Invalid ticker' },
      };
    }
    const widget: ChatPriceChartWidget = { type: 'price_chart', ticker, interval };
    return {
      name: 'show_price_chart',
      ok: true,
      widget,
      result: {
        ok: true,
        rendered: true,
        ticker,
        interval,
        note:
          interval === 'weekly'
            ? 'Weekly chart with 9-week & 30-week EMAs will appear in chat. Explain using Weekly MWS fields.'
            : 'Daily chart with 9-day & 21-day EMAs will appear in chat. Explain using Daily MWS fields.',
      },
    };
  }

  if (name === 'show_quadrant') {
    const tickers = uniqTickers(args.tickers, MAX_QUADRANT_TICKERS);
    if (tickers.length === 0) {
      return {
        name: 'show_quadrant',
        ok: false,
        result: { ok: false, error: 'Provide at least one valid ticker' },
      };
    }
    const title =
      typeof args.title === 'string' && args.title.trim()
        ? args.title.trim().slice(0, 80)
        : undefined;
    const widget: ChatQuadrantWidget = { type: 'quadrant', tickers, title };
    return {
      name: 'show_quadrant',
      ok: true,
      widget,
      result: {
        ok: true,
        rendered: true,
        tickers,
        title: title ?? null,
        note: 'Quadrant scatter (X = % vs 21-day EMA, Y = % vs 30-week EMA) will appear in chat. Explain each ticker’s quadrant using MWS DATA.',
      },
    };
  }

  return {
    name: name as ChatToolName,
    ok: false,
    result: { ok: false, error: `Unknown tool: ${name}` },
  };
}

export function collectWidgets(executions: ToolExecution[]): ChatWidget[] {
  const out: ChatWidget[] = [];
  const seen = new Set<string>();
  for (const ex of executions) {
    if (!ex.widget) continue;
    const key =
      ex.widget.type === 'price_chart'
        ? `price:${ex.widget.ticker}:${ex.widget.interval}`
        : `quad:${ex.widget.tickers.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ex.widget);
  }
  return out;
}

const VISUAL_ALIASES: Record<string, string> = {
  silver: 'SLV',
  gold: 'GLD',
  apple: 'AAPL',
  appl: 'AAPL',
  aaple: 'AAPL',
  microsoft: 'MSFT',
  amazon: 'AMZN',
  nvidia: 'NVDA',
  nvd: 'NVDA',
  tesla: 'TSLA',
  meta: 'META',
  google: 'GOOGL',
};

/** Clause after of/for that is a pronoun → reuse prior chat focus. */
function isPronounClause(clause: string): boolean {
  return /^\s*(it|its|this|that|them|same)\b/i.test(clause.trim());
}

/**
 * Parse tickers only from an explicit of/for clause — never scan the whole sentence.
 * Stops before trailing English ("and explain…", "please", "now").
 */
function tickersFromOfForClause(clause: string): string[] {
  const head = clause
    .split(/\b(?:and|please|thanks|thank you)\b/i)[0]
    .replace(/\bnow\b/gi, ' ')
    .trim();
  if (!head || isPronounClause(head)) return [];

  const found: string[] = [];
  for (const m of head.matchAll(/\$([A-Za-z][A-Za-z0-9.\-]{0,11})/g)) {
    found.push(m[1]);
  }
  for (const m of head.matchAll(/\b([A-Za-z][A-Za-z0-9.\-]{0,11})\b/g)) {
    const raw = m[1];
    const alias = VISUAL_ALIASES[raw.toLowerCase()];
    found.push(alias ?? raw);
  }
  return uniqTickers(found, MAX_QUADRANT_TICKERS);
}

type VisualAsk =
  | { kind: 'quadrant'; clause: string }
  | { kind: 'chart'; clause: string; weekly: boolean }
  | null;

/** Only explicit show/plot … chart|quadrant of|for … — concept questions return null. */
function parseVisualAsk(question: string): VisualAsk {
  const q = question.trim();
  if (!q) return null;

  const quad =
    q.match(
      /\b(?:show|plot|display|render|create|build|make)\b[\s\S]{0,80}?\bquadrant(?:\s+analysis)?\b[\s\S]{0,40}?\b(?:of|for)\s+(.+)$/i,
    ) || q.match(/\bquadrant(?:\s+analysis)?\b\s+(?:of|for)\s+(.+)$/i);
  if (quad?.[1]) return { kind: 'quadrant', clause: quad[1] };

  const chart =
    q.match(
      /\b(?:show|plot|display|render|create|build|make)\b[\s\S]{0,80}?\b(?:price\s*)?chart\b[\s\S]{0,40}?\b(?:of|for)\s+(.+)$/i,
    ) || q.match(/\b(?:price\s*)?chart\b\s+(?:of|for)\s+(.+)$/i);
  if (chart?.[1]) {
    return { kind: 'chart', clause: chart[1], weekly: /\bweekly\b/i.test(q) };
  }
  return null;
}

export function questionWantsVisual(question: string): boolean {
  return parseVisualAsk(question) != null;
}

export function hasTickerPronoun(question: string): boolean {
  const ask = parseVisualAsk(question);
  return Boolean(ask && isPronounClause(ask.clause));
}

/**
 * Attach chart/quadrant widgets only for explicit "show X of/for TICKER" asks.
 * Concept questions ("what is Quadrant Analysis") never match — no stopword lists needed.
 */
export function inferWidgetsFromQuestion(
  question: string,
  fallbackTickers: string[] = [],
): ChatWidget[] {
  const ask = parseVisualAsk(question);
  if (!ask) return [];

  let tickers = tickersFromOfForClause(ask.clause);
  if (tickers.length === 0 && isPronounClause(ask.clause)) {
    tickers = uniqTickers(fallbackTickers, MAX_QUADRANT_TICKERS);
  }
  if (tickers.length === 0) return [];

  if (ask.kind === 'quadrant') {
    return [{ type: 'quadrant', tickers }];
  }
  return [{ type: 'price_chart', ticker: tickers[0], interval: ask.weekly ? 'weekly' : 'daily' }];
}

export function mergeWidgets(primary: ChatWidget[], fallback: ChatWidget[]): ChatWidget[] {
  if (primary.length > 0) return primary;
  return fallback;
}
