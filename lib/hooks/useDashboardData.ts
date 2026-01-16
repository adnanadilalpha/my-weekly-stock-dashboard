import { useState, useEffect } from 'react';
import { getAllMarketSegments, MarketSegment } from '../queries/segments';
import { getAllSectors, Sector } from '../queries/sectors';
import { getAllMegaCaps, MegaCap } from '../queries/mega-caps';
import { getAllOtherStocks, OtherStock } from '../queries/other-stocks';

export interface DashboardData {
  segments: MarketSegment[];
  sectors: Sector[];
  megaCaps: MegaCap[];
  otherStocks: OtherStock[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useDashboardData(timeframe: 'D' | 'W' = 'D'): DashboardData {
  const [segments, setSegments] = useState<MarketSegment[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [megaCaps, setMegaCaps] = useState<MegaCap[]>([]);
  const [otherStocks, setOtherStocks] = useState<OtherStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [segmentsData, sectorsData, megaCapsData, otherStocksData] = await Promise.all([
        getAllMarketSegments(timeframe),
        getAllSectors(timeframe),
        getAllMegaCaps(timeframe),
        getAllOtherStocks(timeframe),
      ]);

      setSegments(segmentsData);
      setSectors(sectorsData);
      setMegaCaps(megaCapsData);
      setOtherStocks(otherStocksData);
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
    otherStocks,
    loading,
    error,
    refetch: fetchData,
  };
}

