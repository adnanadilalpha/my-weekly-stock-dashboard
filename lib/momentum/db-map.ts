import type {
  MomentumCurrentPick,
  MomentumCurrentWeek,
  MomentumDirection,
  MomentumStrategy,
  MomentumTrackWeek,
} from './types';
import { MOMENTUM_STRATEGIES } from './types';
import { emptyPicksTemplate } from './formulas';

export type DbCurrentHeader = {
  id: number;
  year: number;
  week: number;
  week_start: string;
  status: 'open' | 'closed';
  closed_at: string | null;
  updated_at: string | null;
};

export type DbCurrentPick = {
  id?: string;
  strategy: MomentumStrategy;
  ticker: string | null;
  direction: MomentumDirection | null;
  week_open: number | null;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  current_price: number | null;
  return_5d: number | null;
  return_stop_loss: number | null;
  comments: string | null;
  sort_order: number;
};

export type DbTrackWeek = {
  id: string;
  year: number;
  week: number;
  week_start: string;
  pick1_ticker: string | null;
  pick1_direction: MomentumDirection | null;
  pick1_return_5d: number | null;
  pick1_return_stop_loss: number | null;
  pick2_ticker: string | null;
  pick2_direction: MomentumDirection | null;
  pick2_return_5d: number | null;
  pick2_return_stop_loss: number | null;
  pick3_ticker: string | null;
  pick3_direction: MomentumDirection | null;
  pick3_return_5d: number | null;
  pick3_return_stop_loss: number | null;
  weekly_avg_5d: number | null;
  weekly_avg_stop_loss: number | null;
  cumulative_5d: number | null;
  cumulative_stop_loss: number | null;
  closed_at: string | null;
};

export function mapDbPick(p: DbCurrentPick): MomentumCurrentPick {
  return {
    id: p.id,
    strategy: p.strategy,
    ticker: (p.ticker ?? '').toUpperCase(),
    direction: p.direction ?? '',
    weekOpen: p.week_open == null ? null : Number(p.week_open),
    stopLossPct: p.stop_loss_pct == null ? null : Number(p.stop_loss_pct),
    takeProfitPct: p.take_profit_pct == null ? null : Number(p.take_profit_pct),
    currentPrice: p.current_price == null ? null : Number(p.current_price),
    return5d: p.return_5d == null ? null : Number(p.return_5d),
    returnStopLoss: p.return_stop_loss == null ? null : Number(p.return_stop_loss),
    comments: p.comments ?? '',
    sortOrder: p.sort_order,
  };
}

export function mapDbTrack(r: DbTrackWeek): MomentumTrackWeek {
  return {
    id: r.id,
    year: r.year,
    week: r.week,
    weekStart: r.week_start,
    pick1Ticker: r.pick1_ticker,
    pick1Direction: r.pick1_direction,
    pick1Return5d: r.pick1_return_5d == null ? null : Number(r.pick1_return_5d),
    pick1ReturnStopLoss: r.pick1_return_stop_loss == null ? null : Number(r.pick1_return_stop_loss),
    pick2Ticker: r.pick2_ticker,
    pick2Direction: r.pick2_direction,
    pick2Return5d: r.pick2_return_5d == null ? null : Number(r.pick2_return_5d),
    pick2ReturnStopLoss: r.pick2_return_stop_loss == null ? null : Number(r.pick2_return_stop_loss),
    pick3Ticker: r.pick3_ticker,
    pick3Direction: r.pick3_direction,
    pick3Return5d: r.pick3_return_5d == null ? null : Number(r.pick3_return_5d),
    pick3ReturnStopLoss: r.pick3_return_stop_loss == null ? null : Number(r.pick3_return_stop_loss),
    weeklyAvg5d: r.weekly_avg_5d == null ? null : Number(r.weekly_avg_5d),
    weeklyAvgStopLoss: r.weekly_avg_stop_loss == null ? null : Number(r.weekly_avg_stop_loss),
    cumulative5d: r.cumulative_5d == null ? null : Number(r.cumulative_5d),
    cumulativeStopLoss: r.cumulative_stop_loss == null ? null : Number(r.cumulative_stop_loss),
    closedAt: r.closed_at,
  };
}

export function assembleCurrentWeek(
  header: DbCurrentHeader | null,
  picks: DbCurrentPick[]
): MomentumCurrentWeek | null {
  if (!header) return null;
  const byStrategy = new Map(picks.map((p) => [p.strategy, p]));
  const ordered = MOMENTUM_STRATEGIES.map((s) => {
    const existing = byStrategy.get(s.id);
    if (existing) return mapDbPick(existing);
    return { ...emptyPicksTemplate().find((p) => p.strategy === s.id)! };
  });
  return {
    year: header.year,
    week: header.week,
    weekStart: header.week_start,
    status: header.status,
    closedAt: header.closed_at,
    updatedAt: header.updated_at,
    picks: ordered,
  };
}
