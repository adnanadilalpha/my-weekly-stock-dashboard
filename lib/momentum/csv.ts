import type { MomentumTrackWeek } from './types';
import { formatRatioAsPct } from './formulas';

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function trackRecordToCsv(weeks: MomentumTrackWeek[]): string {
  const headers = [
    'Year',
    'Week',
    'Week Start',
    'Pick1',
    'Dir1',
    'Return5d1',
    'ReturnStop1',
    'Pick2',
    'Dir2',
    'Return5d2',
    'ReturnStop2',
    'Pick3',
    'Dir3',
    'Return5d3',
    'ReturnStop3',
    'Weekly Avg 5d',
    'Cumulative 5d',
    'Weekly Avg Stop-Loss',
    'Cumulative Stop-Loss',
  ];

  const lines = [headers.join(',')];
  for (const w of weeks) {
    lines.push(
      [
        w.year,
        w.week,
        w.weekStart,
        w.pick1Ticker,
        w.pick1Direction,
        w.pick1Return5d,
        w.pick1ReturnStopLoss,
        w.pick2Ticker,
        w.pick2Direction,
        w.pick2Return5d,
        w.pick2ReturnStopLoss,
        w.pick3Ticker,
        w.pick3Direction,
        w.pick3Return5d,
        w.pick3ReturnStopLoss,
        w.weeklyAvg5d,
        w.cumulative5d,
        w.weeklyAvgStopLoss,
        w.cumulativeStopLoss,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function downloadTrackRecordCsv(weeks: MomentumTrackWeek[], filename?: string): void {
  const csv = trackRecordToCsv(weeks);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `mws-momentum-track-record.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Display helper for compact pick cell */
export function formatPickCell(
  ticker: string | null,
  direction: string | null,
  r5: number | null,
  rStop: number | null
): string {
  if (!ticker) return '—';
  const dir = direction === 'long' ? 'L' : direction === 'short' ? 'S' : '?';
  return `${ticker} ${dir} ${formatRatioAsPct(r5, 1)} / ${formatRatioAsPct(rStop, 1)}`;
}
