import { supabase } from '../supabase-client';
import { USER_TICKER_ACTIVE_OR, rowVisibleToEndUser } from './user-ticker-visibility';

export interface Sector {
  id: string;
  ticker: string;
  sector_name: string;
  // New simplified performance fields (preferred)
  '1m_percent': number | null;
  '3m_percent': number | null;
  'vs_1y_high': number | null;
  '1m_score': number | null;
  '3m_score': number | null;
  'vs_1y_score': number | null;
  'performance_strength': string | null;
  'distance_to_highs': string | null;
  // Old daily_* fields (backward compatibility - will be removed)
  daily_1m_percent: number | null;
  daily_3m_percent: number | null;
  daily_vs_1y_high: number | null;
  daily_1m_score: number | null;
  daily_3m_score: number | null;
  daily_vs_1y_score: number | null;
  daily_performance_strength: string | null;
  daily_distance_to_highs: string | null;
  // Weekly performance fields removed - they don't exist in sheets
  daily_performance_summary: string | null;
  daily_performance_description: string | null;
  // weekly_performance_summary and weekly_performance_description removed - they don't exist in sheets
  daily_trend_score: number | null;
  daily_rating: string | null;
  daily_outlook: string | null;
  weekly_trend_score: number | null;
  weekly_rating: string | null;
  weekly_outlook: string | null;
  daily_trend_description: string | null;
  weekly_trend_description: string | null;
  daily_price_vs_9ema: number | null;
  daily_price_vs_21ema: number | null;
  daily_ema9_vs_21ema: number | null;
  daily_slope_9ema: string | null;
  daily_slope_21ema: string | null;
  daily_price_vs_9ema_icon: string | null;
  daily_price_vs_21ema_icon: string | null;
  daily_ema9_vs_21ema_icon: string | null;
  daily_slope_9ema_icon: string | null;
  daily_slope_21ema_icon: string | null;
  weekly_price_vs_9ema: number | null;
  weekly_price_vs_30ema: number | null;
  weekly_ema9_vs_30ema: number | null;
  weekly_slope_9ema: string | null;
  weekly_slope_30ema: string | null;
  weekly_price_vs_9ema_icon: string | null;
  weekly_price_vs_30ema_icon: string | null;
  weekly_ema9_vs_30ema_icon: string | null;
  weekly_slope_9ema_icon: string | null;
  weekly_slope_30ema_icon: string | null;
  daily_current_price: number | null;
  daily_ema_9: number | null;
  daily_ema_21: number | null;
  daily_month_high: number | null;
  daily_month_low: number | null;
  weekly_current_price: number | null;
  weekly_ema_9: number | null;
  weekly_ema_30: number | null;
  daily_rating_stars: string | null;
  weekly_rating_stars: string | null;
  weekly_month_high: number | null;
  weekly_month_low: number | null;
  price_1m: number | null;
  price_3m: number | null;
  spy_price_1m: number | null;
  spy_price_3m: number | null;
  sector_price_1m: number | null;
  sector_price_3m: number | null;
  daily_vs_spy_comparison: string | null;
  daily_vs_benchmark_comparison: string | null;
  weekly_vs_spy_comparison: string | null;
  weekly_vs_benchmark_comparison: string | null;
  last_updated: string | null;
  created_at: string;
  updated_at: string;
}

export async function getAllSectors(timeframe: 'D' | 'W' = 'D'): Promise<Sector[]> {
  const { data, error } = await supabase
    .from('sectors')
    .select('*')
    .or(USER_TICKER_ACTIVE_OR)
    .order('ticker');

  if (error) {
    console.error('Error fetching sectors:', error);
    throw error;
  }

  return data || [];
}

export async function getSectorByTicker(ticker: string): Promise<Sector | null> {
  const { data, error } = await supabase
    .from('sectors')
    .select('*')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();

  if (error) {
    console.error('Error fetching sector:', error);
    throw error;
  }

  if (!rowVisibleToEndUser(data)) return null;
  return data;
}

