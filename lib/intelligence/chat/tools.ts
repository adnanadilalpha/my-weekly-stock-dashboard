/**
 * Chat visual tools — model calls these; the web UI renders native chart/quadrant cards.
 */

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
  return t;
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

/**
 * If the model forgot to call tools but the user clearly asked for a visual,
 * infer widgets from the question so the chat still feels native.
 */
export function inferWidgetsFromQuestion(question: string): ChatWidget[] {
  const q = question.trim();
  if (!q) return [];
  const lower = q.toLowerCase();

  const STOP = new Set([
    'A', 'I', 'AM', 'AN', 'AND', 'ARE', 'AS', 'AT', 'BE', 'BY', 'DO', 'FOR', 'FROM',
    'HOW', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY', 'NO', 'NOT', 'OF', 'OK', 'ON', 'OR',
    'SO', 'THE', 'TO', 'UP', 'US', 'VS', 'WE', 'WHAT', 'WHEN', 'WHO', 'WHY', 'WITH',
    'YOU', 'SHOW', 'CHART', 'CREATE', 'BUILD', 'MAKE', 'PLOT', 'PLEASE', 'HELP',
    'EXPLAIN', 'WEEKLY', 'DAILY', 'MWS', 'ETF', 'EMA', 'EMAS',
  ]);

  const tickers = uniqTickers(
    [
      ...q.matchAll(/\$([A-Za-z][A-Za-z0-9.\-]{0,11})/g),
      ...q.matchAll(/\b([A-Z]{1,5}(?:[.\-][A-Z0-9]{1,4})?)\b/g),
    ]
      .flatMap((m) => m[1])
      .filter((t) => !STOP.has(t.toUpperCase())),
    MAX_QUADRANT_TICKERS,
  );

  // Also pick common lowercase aliases / names from a short map
  const aliases: Record<string, string> = {
    silver: 'SLV',
    gold: 'GLD',
    apple: 'AAPL',
    microsoft: 'MSFT',
    amazon: 'AMZN',
    nvidia: 'NVDA',
    tesla: 'TSLA',
    meta: 'META',
    google: 'GOOGL',
  };
  const resolved = [...tickers];
  for (const [name, sym] of Object.entries(aliases)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower) && !resolved.includes(sym)) {
      resolved.push(sym);
    }
  }

  const wantsQuadrant =
    /\b(quadrant|relative\s*strength|screener|scatter|plot\s+(these|them|these\s+names))\b/i.test(
      q,
    ) || /\b(create|build|make|show)\b.+\b(quadrant|screener)\b/i.test(q);
  const wantsChart =
    /\b(chart|price\s*chart|candles?|ema\s*chart|how\s+it\s+looks?|show\s+me\s+.+\s+chart)\b/i.test(
      q,
    );

  if (wantsQuadrant && resolved.length > 0) {
    return [{ type: 'quadrant', tickers: resolved.slice(0, MAX_QUADRANT_TICKERS) }];
  }
  if (wantsChart && resolved.length > 0) {
    const interval = /\bweekly\b/i.test(q) ? 'weekly' : 'daily';
    return [{ type: 'price_chart', ticker: resolved[0], interval }];
  }
  return [];
}

export function mergeWidgets(primary: ChatWidget[], fallback: ChatWidget[]): ChatWidget[] {
  if (primary.length > 0) return primary;
  return fallback;
}
