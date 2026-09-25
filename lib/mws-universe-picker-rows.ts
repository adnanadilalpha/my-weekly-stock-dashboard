import { getAllTickers } from '@/lib/queries/ticker';
import { fetchHubTickerMetricsMap } from '@/lib/queries/hub-ticker-metrics';
import type { MwsPickerTickerRow } from '@/app/components/mws-ticker-pick-grid';

/**
 * Same universe list shape as the hub Customize modal:
 * curated name+ticker rows first (optional), then full active DB universe with metric names.
 */
export function mergeUniversePickerRows(
  dbTickers: string[],
  metricsByTicker: Map<string, { name?: string | null }>,
  curatedRows: MwsPickerTickerRow[] = [],
): MwsPickerTickerRow[] {
  const byTicker = new Map<string, MwsPickerTickerRow>();

  for (const row of curatedRows) {
    const t = row.ticker.toUpperCase().trim();
    if (!t) continue;
    byTicker.set(t, { name: row.name, ticker: t });
  }

  for (const raw of dbTickers) {
    const t = String(raw).trim().toUpperCase();
    if (!t) continue;
    if (byTicker.has(t)) continue;
    const metricName = metricsByTicker.get(t)?.name?.trim();
    byTicker.set(t, { name: metricName || t, ticker: t });
  }

  return Array.from(byTicker.values()).sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.ticker.localeCompare(b.ticker);
  });
}

/** Load full MWS universe for the holdings / customize-style picker. */
export async function loadUniversePickerRows(
  curatedRows: MwsPickerTickerRow[] = [],
): Promise<MwsPickerTickerRow[]> {
  const [dbTickers, metricsMap] = await Promise.all([
    getAllTickers(),
    fetchHubTickerMetricsMap(),
  ]);
  return mergeUniversePickerRows(dbTickers, metricsMap, curatedRows);
}
