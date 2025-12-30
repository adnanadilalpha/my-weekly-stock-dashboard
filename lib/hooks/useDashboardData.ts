import { useState, useEffect } from 'react';
import { getAllMarketSegments, MarketSegment } from '../queries/segments';
import { getAllSectors, Sector } from '../queries/sectors';
import { getAllMegaCaps, MegaCap } from '../queries/mega-caps';

export interface DashboardData {
  segments: MarketSegment[];
  sectors: Sector[];
  megaCaps: MegaCap[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useDashboardData(timeframe: 'D' | 'W' = 'D'): DashboardData {
  const [segments, setSegments] = useState<MarketSegment[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [megaCaps, setMegaCaps] = useState<MegaCap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [segmentsData, sectorsData, megaCapsData] = await Promise.all([
        getAllMarketSegments(timeframe),
        getAllSectors(timeframe),
        getAllMegaCaps(timeframe),
      ]);

      setSegments(segmentsData);
      setSectors(sectorsData);
      setMegaCaps(megaCapsData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch dashboard data'));
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeframe]);

  return {
    segments,
    sectors,
    megaCaps,
    loading,
    error,
    refetch: fetchData,
  };
}

