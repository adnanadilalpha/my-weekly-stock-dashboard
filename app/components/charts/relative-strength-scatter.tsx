'use client';

import { useMemo, useState } from 'react';
import {
  QUADRANT_COLORS,
  sharedSymmetricDomain,
  toChartPoints,
  type RelativeStrengthPoint,
} from '@/lib/relative-strength';
import { composeQuadrantBrief } from '@/lib/intelligence/brief';
import { BriefCard } from '@/app/components/intelligence/brief-card';

/** Inner plot is a perfect square — equal margins keep all 4 quadrants equal. */
const PAD = { top: 44, right: 28, bottom: 44, left: 44 };
const VIEW = 400;
const PLOT = VIEW - PAD.left - PAD.right; // square plot area

export function RelativeStrengthScatter({
  points,
  onSelectTicker,
  height = 440,
  showTitle = false,
}: {
  points: RelativeStrengthPoint[];
  onSelectTicker?: (ticker: string) => void;
  height?: number;
  showTitle?: boolean;
}) {
  const chartPoints = useMemo(() => toChartPoints(points), [points]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const { domain, ticks } = useMemo(() => {
    const xs = chartPoints.map((p) => p.x);
    const ys = chartPoints.map((p) => p.y);
    return sharedSymmetricDomain(xs, ys, { minExtent: 20, hardMax: 40 });
  }, [chartPoints]);

  const [lo, hi] = domain;
  const span = hi - lo; // always 2 * extent

  const toPx = (v: number) => ((v - lo) / span) * PLOT;
  const cx = (x: number) => PAD.left + toPx(x);
  const cy = (y: number) => PAD.top + (PLOT - toPx(y)); // flip Y

  const midX = PAD.left + PLOT / 2;
  const midY = PAD.top + PLOT / 2;

  const selectedPoint = chartPoints.find((p) => p.ticker === selected) ?? null;
  const hoverPoint = chartPoints.find((p) => p.ticker === (hover ?? selected)) ?? null;

  const brief = selectedPoint
    ? composeQuadrantBrief({
        ticker: selectedPoint.ticker,
        pct_from_sma50: selectedPoint.pctFromSma50,
        pct_from_sma200: selectedPoint.pctFromSma200,
      })
    : null;

  const clippedCount = chartPoints.filter(
    (p) => Math.abs(p.x) > hi || Math.abs(p.y) > hi,
  ).length;

  return (
    <div className="space-y-2.5">
      {showTitle && (
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Relative Strength</h3>
      )}

      <div className="mx-auto w-full" style={{ maxWidth: height }}>
        <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card">
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="block h-auto w-full"
            role="img"
            aria-label="Relative Strength scatter: percent from 50-day MA vs 200-day MA"
          >
            {/* Equal quadrants — same pixel size by construction */}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={PLOT / 2}
              height={PLOT / 2}
              fill={QUADRANT_COLORS.PULLBACK.fill}
            />
            <rect
              x={midX}
              y={PAD.top}
              width={PLOT / 2}
              height={PLOT / 2}
              fill={QUADRANT_COLORS.STRONG.fill}
            />
            <rect
              x={PAD.left}
              y={midY}
              width={PLOT / 2}
              height={PLOT / 2}
              fill={QUADRANT_COLORS.WEAK.fill}
            />
            <rect
              x={midX}
              y={midY}
              width={PLOT / 2}
              height={PLOT / 2}
              fill={QUADRANT_COLORS.RECOVERY.fill}
            />

            {/* Grid */}
            {ticks.map((t) => {
              const px = cx(t);
              const py = cy(t);
              return (
                <g key={`g-${t}`}>
                  <line
                    x1={px}
                    y1={PAD.top}
                    x2={px}
                    y2={PAD.top + PLOT}
                    stroke="#e5e5e5"
                    strokeWidth={1}
                  />
                  <line
                    x1={PAD.left}
                    y1={py}
                    x2={PAD.left + PLOT}
                    y2={py}
                    stroke="#e5e5e5"
                    strokeWidth={1}
                  />
                </g>
              );
            })}

            {/* Zero crosshair */}
            <line
              x1={midX}
              y1={PAD.top}
              x2={midX}
              y2={PAD.top + PLOT}
              stroke="#a3a3a3"
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <line
              x1={PAD.left}
              y1={midY}
              x2={PAD.left + PLOT}
              y2={midY}
              stroke="#a3a3a3"
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />

            {/* Corner labels */}
            <text x={PAD.left + 8} y={PAD.top + 14} fontSize={10} fontWeight={600} fill={QUADRANT_COLORS.PULLBACK.label}>
              PULLBACK
            </text>
            <text x={PAD.left + 8} y={PAD.top + 26} fontSize={8} fill="#737373">
              Above 200d, below 50d
            </text>

            <text
              x={PAD.left + PLOT - 8}
              y={PAD.top + 14}
              fontSize={10}
              fontWeight={600}
              fill={QUADRANT_COLORS.STRONG.label}
              textAnchor="end"
            >
              STRONG
            </text>
            <text
              x={PAD.left + PLOT - 8}
              y={PAD.top + 26}
              fontSize={8}
              fill="#737373"
              textAnchor="end"
            >
              Above both 50d &amp; 200d
            </text>

            <text
              x={PAD.left + 8}
              y={PAD.top + PLOT - 18}
              fontSize={10}
              fontWeight={600}
              fill={QUADRANT_COLORS.WEAK.label}
            >
              WEAK
            </text>
            <text x={PAD.left + 8} y={PAD.top + PLOT - 6} fontSize={8} fill="#737373">
              Below both 50d &amp; 200d
            </text>

            <text
              x={PAD.left + PLOT - 8}
              y={PAD.top + PLOT - 18}
              fontSize={10}
              fontWeight={600}
              fill={QUADRANT_COLORS.RECOVERY.label}
              textAnchor="end"
            >
              RECOVERY
            </text>
            <text
              x={PAD.left + PLOT - 8}
              y={PAD.top + PLOT - 6}
              fontSize={8}
              fill="#737373"
              textAnchor="end"
            >
              Above 50d, below 200d
            </text>

            {/* Axis ticks + numbers (identical on both axes) */}
            {ticks.map((t) => {
              const px = cx(t);
              const py = cy(t);
              return (
                <g key={`t-${t}`}>
                  <text
                    x={px}
                    y={PAD.top + PLOT + 14}
                    fontSize={9}
                    fill="#737373"
                    textAnchor="middle"
                  >
                    {t}
                  </text>
                  <text
                    x={PAD.left - 6}
                    y={py + 3}
                    fontSize={9}
                    fill="#737373"
                    textAnchor="end"
                  >
                    {t}
                  </text>
                </g>
              );
            })}

            <text
              x={PAD.left + PLOT / 2}
              y={VIEW - 8}
              fontSize={10}
              fill="#525252"
              textAnchor="middle"
            >
              % from 50-day MA
            </text>
            <text
              x={14}
              y={PAD.top + PLOT / 2}
              fontSize={10}
              fill="#525252"
              textAnchor="middle"
              transform={`rotate(-90 14 ${PAD.top + PLOT / 2})`}
            >
              % from 200-day MA
            </text>

            {/* Points — clamp into plot so outliers sit on the edge */}
            {chartPoints.map((p) => {
              const x = Math.min(hi, Math.max(lo, p.x));
              const y = Math.min(hi, Math.max(lo, p.y));
              const px = cx(x);
              const py = cy(y);
              const fill =
                p.quadrant === 'UNKNOWN'
                  ? '#737373'
                  : QUADRANT_COLORS[p.quadrant].dot;
              const active = p.ticker === selected || p.ticker === hover;
              return (
                <g
                  key={p.ticker}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(p.ticker)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => {
                    setSelected(p.ticker);
                    onSelectTicker?.(p.ticker);
                  }}
                >
                  <circle
                    cx={px}
                    cy={py}
                    r={active || p.highlight ? 6 : 5}
                    fill={fill}
                    stroke={active || p.highlight ? '#171717' : 'transparent'}
                    strokeWidth={active || p.highlight ? 2 : 0}
                  />
                  <text
                    x={px + 7}
                    y={py - 7}
                    fontSize={9}
                    fontWeight={600}
                    fill="#404040"
                  >
                    {p.ticker}
                  </text>
                </g>
              );
            })}
          </svg>

          {hoverPoint && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
              <div className="font-semibold text-foreground">{hoverPoint.ticker}</div>
              <div className="text-muted-foreground">50d: {hoverPoint.x.toFixed(1)}%</div>
              <div className="text-muted-foreground">200d: {hoverPoint.y.toFixed(1)}%</div>
              {hoverPoint.dailyRating && (
                <div className="text-muted-foreground">Rating: {hoverPoint.dailyRating}</div>
              )}
              <div className="mt-0.5 font-medium text-foreground">{hoverPoint.quadrant}</div>
            </div>
          )}
        </div>
      </div>

      {clippedCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {clippedCount} ticker{clippedCount === 1 ? '' : 's'} beyond ±{hi}% are shown on the edge so quadrants stay even.
        </p>
      )}

      {chartPoints.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Relative Strength needs SMA % data for the selected tickers.
        </p>
      )}

      {brief && <BriefCard brief={brief} defaultOpen />}
    </div>
  );
}
