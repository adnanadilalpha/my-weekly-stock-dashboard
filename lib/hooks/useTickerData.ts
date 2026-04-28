import { useState, useEffect } from 'react';
import { getTickerData, TickerData, TickerType } from '../queries/ticker';

export interface TickerDataResult {
  data: TickerData | null;
  type: TickerType | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useTickerData(ticker: string): TickerDataResult {
  const [data, setData] = useState<TickerData | null>(null);
  const [type, setType] = useState<TickerType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    if (!ticker) {
      setData(null);
      setType(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await getTickerData(ticker);
      setData(result.data);
      setType(result.type);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch ticker data'));
      console.error('Error fetching ticker data:', err);
      setData(null);
      setType(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [ticker]);

  return {
    data,
    type,
    loading,
    error,
    refetch: fetchData,
  };
}

