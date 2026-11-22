'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { computeMomentumKpis } from '@/lib/momentum/formulas';
import {
  assembleCurrentWeek,
  mapDbTrack,
  type DbCurrentHeader,
  type DbCurrentPick,
  type DbTrackWeek,
} from '@/lib/momentum/db-map';
import type { MomentumCurrentWeek, MomentumKpis, MomentumTrackWeek } from '@/lib/momentum/types';

export function useMomentumCurrentWeek() {
  const [week, setWeek] = useState<MomentumCurrentWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [headerRes, picksRes] = await Promise.all([
        supabase.from('momentum_week_current').select('*').eq('id', 1).maybeSingle(),
        supabase
          .from('momentum_week_current_picks')
          .select('*')
          .eq('week_id', 1)
          .order('sort_order', { ascending: true }),
      ]);
      if (headerRes.error) throw new Error(headerRes.error.message);
      if (picksRes.error) throw new Error(picksRes.error.message);
      setWeek(
        assembleCurrentWeek(
          headerRes.data as DbCurrentHeader | null,
          (picksRes.data ?? []) as DbCurrentPick[]
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load current week.');
      setWeek(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { week, loading, error, refetch };
}

export function useMomentumTrackRecord() {
  const [weeks, setWeeks] = useState<MomentumTrackWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('momentum_track_weeks')
        .select('*')
        .order('year', { ascending: false })
        .order('week', { ascending: false });
      if (qErr) throw new Error(qErr.message);
      setWeeks(((data ?? []) as DbTrackWeek[]).map(mapDbTrack));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load track record.');
      setWeeks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { weeks, loading, error, refetch };
}

export function useMomentumKpis() {
  const { weeks, loading, error, refetch } = useMomentumTrackRecord();
  const kpis: MomentumKpis = computeMomentumKpis(weeks);
  return { kpis, weeks, loading, error, refetch };
}
