export type MomentumStrategy = 'dow' | 'large_cap' | 'nasdaq';
export type MomentumDirection = 'long' | 'short';
export type MomentumWeekStatus = 'open' | 'closed';

export const MOMENTUM_STRATEGIES: readonly {
  id: MomentumStrategy;
  label: string;
  sortOrder: number;
}[] = [
  { id: 'dow', label: 'Dow', sortOrder: 0 },
  { id: 'large_cap', label: 'Large Cap', sortOrder: 1 },
  { id: 'nasdaq', label: 'Nasdaq', sortOrder: 2 },
] as const;

export type MomentumStrategyId = (typeof MOMENTUM_STRATEGIES)[number]['id'];

export interface MomentumCurrentPick {
  id?: string;
  strategy: MomentumStrategy;
  ticker: string;
  direction: MomentumDirection | '';
  weekOpen: number | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  currentPrice: number | null;
  return5d: number | null;
  returnStopLoss: number | null;
  comments: string;
  sortOrder: number;
}

export interface MomentumCurrentWeek {
  year: number;
  week: number;
  weekStart: string; // YYYY-MM-DD
  status: MomentumWeekStatus;
  closedAt: string | null;
  updatedAt: string | null;
  picks: MomentumCurrentPick[];
}

export interface MomentumTrackWeek {
  id: string;
  year: number;
  week: number;
  weekStart: string;
  pick1Ticker: string | null;
  pick1Direction: MomentumDirection | null;
  pick1Return5d: number | null;
  pick1ReturnStopLoss: number | null;
  pick2Ticker: string | null;
  pick2Direction: MomentumDirection | null;
  pick2Return5d: number | null;
  pick2ReturnStopLoss: number | null;
  pick3Ticker: string | null;
  pick3Direction: MomentumDirection | null;
  pick3Return5d: number | null;
  pick3ReturnStopLoss: number | null;
  weeklyAvg5d: number | null;
  weeklyAvgStopLoss: number | null;
  cumulative5d: number | null;
  cumulativeStopLoss: number | null;
  closedAt: string | null;
}

export interface MomentumKpis {
  totalReturn: number | null; // ratio, e.g. 12.53 => 1253%
  cagr: number | null; // ratio
  hitRate: number | null; // 0..1
  weekCount: number;
  latestYear: number | null;
  latestWeek: number | null;
}
