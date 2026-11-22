'use server';

import { getAdminSupabase } from '@/lib/server/supabase-admin';
import {
  average,
  compoundCumulative,
  computeMomentumKpis,
  emptyPicksTemplate,
  return5d,
  suggestNextWeek,
} from '@/lib/momentum/formulas';
import type {
  MomentumCurrentPick,
  MomentumCurrentWeek,
  MomentumDirection,
  MomentumKpis,
  MomentumStrategy,
  MomentumTrackWeek,
} from '@/lib/momentum/types';
import { MOMENTUM_STRATEGIES } from '@/lib/momentum/types';
import { err, ok, withAdmin, type ActionResult } from './_shared';

type DbCurrent = {
  id: number;
  year: number;
  week: number;
  week_start: string;
  status: 'open' | 'closed';
  closed_at: string | null;
  updated_at: string | null;
};

type DbPick = {
  id: string;
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

type DbTrack = {
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

function mapPick(p: DbPick): MomentumCurrentPick {
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

function mapTrack(r: DbTrack): MomentumTrackWeek {
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

async function ensureCurrentWeek(
  admin: ReturnType<typeof getAdminSupabase>
): Promise<{ header: DbCurrent; picks: DbPick[] }> {
  const { data: header, error } = await admin
    .from('momentum_week_current')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!header) {
    const today = new Date();
    const weekStart = today.toISOString().slice(0, 10);
    const year = today.getUTCFullYear();
    // ISO-ish week number approximation for bootstrap
    const oneJan = new Date(Date.UTC(year, 0, 1));
    const week = Math.max(
      1,
      Math.min(53, Math.ceil(((today.getTime() - oneJan.getTime()) / 86400000 + oneJan.getUTCDay() + 1) / 7))
    );
    const { data: created, error: insErr } = await admin
      .from('momentum_week_current')
      .upsert({
        id: 1,
        year,
        week,
        week_start: weekStart,
        status: 'open',
      })
      .select('*')
      .single();
    if (insErr) throw new Error(insErr.message);

    const pickRows = MOMENTUM_STRATEGIES.map((s) => ({
      week_id: 1,
      strategy: s.id,
      sort_order: s.sortOrder,
    }));
    const { data: picks, error: pickErr } = await admin
      .from('momentum_week_current_picks')
      .upsert(pickRows, { onConflict: 'week_id,strategy' })
      .select('*');
    if (pickErr) throw new Error(pickErr.message);
    return { header: created as DbCurrent, picks: (picks ?? []) as DbPick[] };
  }

  const { data: picks, error: pickErr } = await admin
    .from('momentum_week_current_picks')
    .select('*')
    .eq('week_id', 1)
    .order('sort_order', { ascending: true });
  if (pickErr) throw new Error(pickErr.message);

  if (!picks || picks.length < 3) {
    const pickRows = MOMENTUM_STRATEGIES.map((s) => ({
      week_id: 1,
      strategy: s.id,
      sort_order: s.sortOrder,
    }));
    const { data: ensured, error: ensErr } = await admin
      .from('momentum_week_current_picks')
      .upsert(pickRows, { onConflict: 'week_id,strategy' })
      .select('*')
      .order('sort_order', { ascending: true });
    if (ensErr) throw new Error(ensErr.message);
    return { header: header as DbCurrent, picks: (ensured ?? []) as DbPick[] };
  }

  return { header: header as DbCurrent, picks: picks as DbPick[] };
}

function toCurrentWeek(header: DbCurrent, picks: DbPick[]): MomentumCurrentWeek {
  const byStrategy = new Map(picks.map((p) => [p.strategy, p]));
  const ordered = MOMENTUM_STRATEGIES.map((s) => {
    const existing = byStrategy.get(s.id);
    if (existing) return mapPick(existing);
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

export async function getCurrentWeekAction(
  accessToken: string | null | undefined
): Promise<ActionResult<MomentumCurrentWeek>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { header, picks } = await ensureCurrentWeek(admin);
    return ok(toCurrentWeek(header, picks));
  });
}

export type SaveCurrentWeekInput = {
  year: number;
  week: number;
  weekStart: string;
  picks: Array<{
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
  }>;
};

export async function saveCurrentWeekAction(
  accessToken: string | null | undefined,
  input: SaveCurrentWeekInput
): Promise<ActionResult<MomentumCurrentWeek>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    await ensureCurrentWeek(admin);

    if (!Number.isFinite(input.year) || !Number.isFinite(input.week) || !input.weekStart) {
      return err('Year, week, and week start are required.');
    }
    if (!Array.isArray(input.picks) || input.picks.length !== 3) {
      return err('Exactly 3 strategy picks are required.');
    }

    const { error: headerErr } = await admin
      .from('momentum_week_current')
      .update({
        year: Math.trunc(input.year),
        week: Math.trunc(input.week),
        week_start: input.weekStart,
        status: 'open',
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (headerErr) return err(headerErr.message);

    for (const pick of input.picks) {
      const ticker = (pick.ticker ?? '').trim().toUpperCase();
      const direction = pick.direction === 'long' || pick.direction === 'short' ? pick.direction : null;
      const computed5d = return5d(pick.weekOpen, pick.currentPrice, direction);
      const return5 = pick.return5d != null ? pick.return5d : computed5d;
      // Default return with stop/loss to return 5d unless explicitly overridden
      const returnStop =
        pick.returnStopLoss != null
          ? pick.returnStopLoss
          : return5;

      const { error: pickErr } = await admin
        .from('momentum_week_current_picks')
        .upsert(
          {
            week_id: 1,
            strategy: pick.strategy,
            ticker: ticker || null,
            direction,
            week_open: pick.weekOpen,
            stop_loss_pct: pick.stopLossPct,
            take_profit_pct: pick.takeProfitPct,
            current_price: pick.currentPrice,
            return_5d: return5,
            return_stop_loss: returnStop,
            comments: pick.comments?.trim() || null,
            sort_order: MOMENTUM_STRATEGIES.find((s) => s.id === pick.strategy)?.sortOrder ?? 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'week_id,strategy' }
        );
      if (pickErr) return err(pickErr.message);
    }

    const { header, picks } = await ensureCurrentWeek(admin);
    return ok(toCurrentWeek(header, picks));
  });
}

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  const sym = ticker.trim().toUpperCase();
  if (!sym) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price != null && Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function refreshCurrentWeekPricesAction(
  accessToken: string | null | undefined
): Promise<ActionResult<MomentumCurrentWeek>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const { header, picks } = await ensureCurrentWeek(admin);

    for (const pick of picks) {
      const ticker = (pick.ticker ?? '').trim().toUpperCase();
      if (!ticker) continue;
      const price = await fetchYahooPrice(ticker);
      if (price == null) continue;
      const direction = pick.direction;
      const weekOpen = pick.week_open == null ? null : Number(pick.week_open);
      const computed5d = return5d(weekOpen, price, direction);
      // Keep explicit stop/loss override if it differs from prior return_5d; else sync to new 5d
      const prior5 = pick.return_5d == null ? null : Number(pick.return_5d);
      const priorStop = pick.return_stop_loss == null ? null : Number(pick.return_stop_loss);
      const hadOverride =
        priorStop != null && prior5 != null && Math.abs(priorStop - prior5) > 1e-9;
      const nextStop = hadOverride ? priorStop : computed5d;

      const { error } = await admin
        .from('momentum_week_current_picks')
        .update({
          current_price: price,
          return_5d: computed5d,
          return_stop_loss: nextStop,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pick.id);
      if (error) return err(error.message);
    }

    await admin
      .from('momentum_week_current')
      .update({ updated_by: ctx.userId, updated_at: new Date().toISOString() })
      .eq('id', 1);

    const refreshed = await ensureCurrentWeek(admin);
    return ok(toCurrentWeek(refreshed.header, refreshed.picks));
  });
}

export async function closeWeekAction(
  accessToken: string | null | undefined
): Promise<ActionResult<{ track: MomentumTrackWeek; next: MomentumCurrentWeek }>> {
  return withAdmin(accessToken, async (ctx) => {
    const admin = getAdminSupabase();
    const { header, picks } = await ensureCurrentWeek(admin);

    if (header.status === 'closed') {
      return err('Current week is already closed.');
    }

    const ordered = MOMENTUM_STRATEGIES.map((s) => picks.find((p) => p.strategy === s.id));
    for (const p of ordered) {
      if (!p?.ticker?.trim()) return err('All three strategies need a ticker before closing.');
      if (p.direction !== 'long' && p.direction !== 'short') {
        return err('All three strategies need a direction before closing.');
      }
      if (p.return_stop_loss == null && p.return_5d == null) {
        return err('Each pick needs Return 5-d or Return with Stop/Loss before closing.');
      }
    }

    const [p1, p2, p3] = ordered as DbPick[];
    const r5 = [
      p1.return_5d == null ? null : Number(p1.return_5d),
      p2.return_5d == null ? null : Number(p2.return_5d),
      p3.return_5d == null ? null : Number(p3.return_5d),
    ];
    const rs = [
      p1.return_stop_loss != null
        ? Number(p1.return_stop_loss)
        : r5[0],
      p2.return_stop_loss != null
        ? Number(p2.return_stop_loss)
        : r5[1],
      p3.return_stop_loss != null
        ? Number(p3.return_stop_loss)
        : r5[2],
    ];
    const weeklyAvg5d = average(r5);
    const weeklyAvgStop = average(rs);

    const { data: prevRows, error: prevErr } = await admin
      .from('momentum_track_weeks')
      .select('year, week, cumulative_5d, cumulative_stop_loss')
      .order('year', { ascending: false })
      .order('week', { ascending: false })
      .limit(1);
    if (prevErr) return err(prevErr.message);

    const prev = prevRows?.[0];
    const prevCum5 = prev?.cumulative_5d == null ? null : Number(prev.cumulative_5d);
    const prevCumStop = prev?.cumulative_stop_loss == null ? null : Number(prev.cumulative_stop_loss);
    const cumulative5d = compoundCumulative(prevCum5, weeklyAvg5d);
    const cumulativeStopLoss = compoundCumulative(prevCumStop, weeklyAvgStop);

    const trackInsert = {
      year: header.year,
      week: header.week,
      week_start: header.week_start,
      pick1_ticker: p1.ticker,
      pick1_direction: p1.direction,
      pick1_return_5d: r5[0],
      pick1_return_stop_loss: rs[0],
      pick2_ticker: p2.ticker,
      pick2_direction: p2.direction,
      pick2_return_5d: r5[1],
      pick2_return_stop_loss: rs[1],
      pick3_ticker: p3.ticker,
      pick3_direction: p3.direction,
      pick3_return_5d: r5[2],
      pick3_return_stop_loss: rs[2],
      weekly_avg_5d: weeklyAvg5d,
      weekly_avg_stop_loss: weeklyAvgStop,
      cumulative_5d: cumulative5d,
      cumulative_stop_loss: cumulativeStopLoss,
      closed_at: new Date().toISOString(),
    };

    const { data: inserted, error: insErr } = await admin
      .from('momentum_track_weeks')
      .upsert(trackInsert, { onConflict: 'year,week' })
      .select('*')
      .single();
    if (insErr) return err(insErr.message);

    const nextMeta = suggestNextWeek({
      year: header.year,
      week: header.week,
      weekStart: header.week_start,
    });

    const { error: resetErr } = await admin
      .from('momentum_week_current')
      .update({
        year: nextMeta.year,
        week: nextMeta.week,
        week_start: nextMeta.weekStart,
        status: 'open',
        closed_at: null,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (resetErr) return err(resetErr.message);

    // Clear pick fields for next week shell
    for (const s of MOMENTUM_STRATEGIES) {
      const { error: clearErr } = await admin
        .from('momentum_week_current_picks')
        .upsert(
          {
            week_id: 1,
            strategy: s.id,
            ticker: null,
            direction: null,
            week_open: null,
            stop_loss_pct: null,
            take_profit_pct: null,
            current_price: null,
            return_5d: null,
            return_stop_loss: null,
            comments: null,
            sort_order: s.sortOrder,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'week_id,strategy' }
        );
      if (clearErr) return err(clearErr.message);
    }

    const next = await ensureCurrentWeek(admin);
    return ok({
      track: mapTrack(inserted as DbTrack),
      next: toCurrentWeek(next.header, next.picks),
    });
  });
}

export async function listTrackRecordAction(
  accessToken: string | null | undefined,
  opts?: { limit?: number }
): Promise<ActionResult<MomentumTrackWeek[]>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    let q = admin
      .from('momentum_track_weeks')
      .select('*')
      .order('year', { ascending: false })
      .order('week', { ascending: false });
    if (opts?.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(((data ?? []) as DbTrack[]).map(mapTrack));
  });
}

export async function getMomentumKpisAction(
  accessToken: string | null | undefined
): Promise<ActionResult<MomentumKpis>> {
  return withAdmin(accessToken, async () => {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('momentum_track_weeks')
      .select('*')
      .order('year', { ascending: false })
      .order('week', { ascending: false });
    if (error) return err(error.message);
    return ok(computeMomentumKpis(((data ?? []) as DbTrack[]).map(mapTrack)));
  });
}
