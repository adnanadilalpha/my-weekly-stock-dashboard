'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import {
  QUADRANT_COLORS,
  QUADRANT_COPY,
  sharedSymmetricDomain,
  ticksForWindow,
  toChartPoints,
  type RelativeStrengthPoint,
} from '@/lib/relative-strength';
import { composeQuadrantBrief } from '@/lib/intelligence/brief';
import { BriefCard } from '@/app/components/intelligence/brief-card';
import { cn } from '@/app/components/ui/utils';

/** Extra top/bottom room for longer quadrant titles like "Synced Uptrend". */
const PAD = { top: 40, right: 28, bottom: 44, left: 52 };

const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;

type ViewWindow = {
  /** 1 = full domain; higher = closer. */
  zoom: number;
  /** Center of the visible window in data units. */
  cx: number;
  cy: number;
};

const DEFAULT_VIEW: ViewWindow = { zoom: 1, cx: 0, cy: 0 };

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function RelativeStrengthScatter({
  points,
  onSelectTicker,
  showTitle = false,
  /** Fill parent — chart stretches to all available width/height (dialog). */
  fill = false,
  showBrief = true,
}: {
  points: RelativeStrengthPoint[];
  onSelectTicker?: (ticker: string) => void;
  showTitle?: boolean;
  fill?: boolean;
  showBrief?: boolean;
}) {
  const chartPoints = useMemo(() => toChartPoints(points), [points]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState<ViewWindow>(DEFAULT_VIEW);
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 520 });
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startCx: number;
    startCy: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const baseDomain = useMemo(() => {
    const xs = chartPoints.map((p) => p.x);
    const ys = chartPoints.map((p) => p.y);
    return sharedSymmetricDomain(xs, ys, { minExtent: 20, hardMax: 40 }).domain;
  }, [chartPoints]);

  const [baseLo, baseHi] = baseDomain;
  const baseSpan = baseHi - baseLo;

  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const baseRef = useRef({ baseLo, baseHi, baseSpan });
  viewRef.current = view;
  sizeRef.current = size;
  baseRef.current = { baseLo, baseHi, baseSpan };

  // Reset zoom when the underlying point set / scale changes meaningfully.
  useEffect(() => {
    setView(DEFAULT_VIEW);
  }, [baseSpan, chartPoints.length]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(280, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { baseLo: bLo, baseHi: bHi, baseSpan: bSpan } = baseRef.current;
      const sz = sizeRef.current;
      const prev = viewRef.current;
      const plotW = Math.max(40, sz.w - PAD.left - PAD.right);
      const plotH = Math.max(40, sz.h - PAD.top - PAD.bottom);
      const prevSpan = bSpan / prev.zoom;
      const prevHalf = prevSpan / 2;
      const prevCx = clamp(prev.cx, bLo + prevHalf, bHi - prevHalf);
      const prevCy = clamp(prev.cy, bLo + prevHalf, bHi - prevHalf);
      const xLo = prevCx - prevHalf;
      const yHi = prevCy + prevHalf;

      const rect = el.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / Math.max(1, rect.width)) * sz.w;
      const py = ((e.clientY - rect.top) / Math.max(1, rect.height)) * sz.h;
      const ax = xLo + ((px - PAD.left) / plotW) * prevSpan;
      const ay = yHi - ((py - PAD.top) / plotH) * prevSpan;

      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextZoom = clamp(Number((prev.zoom * factor).toFixed(4)), ZOOM_MIN, ZOOM_MAX);
      if (nextZoom === prev.zoom) return;
      const nextSpan = bSpan / nextZoom;
      const nextCx = ax - (ax - prevCx) * (nextSpan / prevSpan);
      const nextCy = ay - (ay - prevCy) * (nextSpan / prevSpan);
      const nextHalf = nextSpan / 2;
      setView({
        zoom: nextZoom,
        cx: clamp(nextCx, bLo + nextHalf, bHi - nextHalf),
        cy: clamp(nextCy, bLo + nextHalf, bHi - nextHalf),
      });
    };

    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onNativeWheel);
    };
  }, []);

  const viewSpan = baseSpan / view.zoom;
  const half = viewSpan / 2;
  const maxCenter = baseHi - half;
  const minCenter = baseLo + half;
  const centerX = clamp(view.cx, minCenter, maxCenter);
  const centerY = clamp(view.cy, minCenter, maxCenter);
  const xLo = centerX - half;
  const xHi = centerX + half;
  const yLo = centerY - half;
  const yHi = centerY + half;

  const ticks = useMemo(() => ticksForWindow(xLo, xHi), [xLo, xHi]);
  const yTicks = useMemo(() => ticksForWindow(yLo, yHi), [yLo, yHi]);

  const plotW = Math.max(40, size.w - PAD.left - PAD.right);
  const plotH = Math.max(40, size.h - PAD.top - PAD.bottom);

  const cx = (x: number) => PAD.left + ((x - xLo) / viewSpan) * plotW;
  const cy = (y: number) => PAD.top + (plotH - ((y - yLo) / viewSpan) * plotH);

  const zeroX = cx(0);
  const zeroY = cy(0);
  const zx = clamp(zeroX, PAD.left, PAD.left + plotW);
  const zy = clamp(zeroY, PAD.top, PAD.top + plotH);
  const showZeroX = zeroX >= PAD.left && zeroX <= PAD.left + plotW;
  const showZeroY = zeroY >= PAD.top && zeroY <= PAD.top + plotH;

  const titleSize = Math.max(10, Math.min(13, Math.round(plotW / 52)));
  const subSize = Math.max(8, Math.min(10, Math.round(plotW / 68)));
  const tickSize = Math.max(9, Math.min(11, Math.round(plotW / 70)));
  const axisSize = Math.max(10, Math.min(12, Math.round(plotW / 58)));
  const labelSize = Math.max(10, Math.min(12, Math.round(plotW / 58)));
  const dotR = Math.max(5, Math.min(7, plotW / 90));
  const pointInset = Math.max(12, dotR + 6);
  const isZoomed = view.zoom > 1.01;

  const selectedPoint = chartPoints.find((p) => p.ticker === selected) ?? null;
  const activeTicker = hover ?? selected;
  const hoverPoint = chartPoints.find((p) => p.ticker === activeTicker) ?? null;

  let hoverPos: {
    px: number;
    py: number;
    placeRight: boolean;
    placeBelow: boolean;
  } | null = null;
  if (hoverPoint && hover) {
    const hx = clamp(hoverPoint.x, xLo, xHi);
    const hy = clamp(hoverPoint.y, yLo, yHi);
    const inView =
      hoverPoint.x >= xLo &&
      hoverPoint.x <= xHi &&
      hoverPoint.y >= yLo &&
      hoverPoint.y <= yHi;
    if (inView || view.zoom <= 1.01) {
      const rawX = cx(view.zoom <= 1.01 ? hx : hoverPoint.x);
      const rawY = cy(view.zoom <= 1.01 ? hy : hoverPoint.y);
      const px = clamp(rawX, PAD.left + pointInset, PAD.left + plotW - pointInset);
      const py = clamp(rawY, PAD.top + pointInset, PAD.top + plotH - pointInset);
      hoverPos = {
        px,
        py,
        placeRight: px < size.w * 0.62,
        placeBelow: py < size.h * 0.55,
      };
    }
  }

  const brief = selectedPoint
    ? composeQuadrantBrief({
        ticker: selectedPoint.ticker,
        pct_from_21d_ema: selectedPoint.pctFrom21DayEma,
        pct_from_30w_ema: selectedPoint.pctFrom30WeekEma,
      })
    : null;

  const outsideCount = chartPoints.filter(
    (p) => p.x < xLo || p.x > xHi || p.y < yLo || p.y > yHi,
  ).length;

  const zoomAt = useCallback(
    (factor: number, anchorX?: number, anchorY?: number) => {
      setView((prev) => {
        const nextZoom = clamp(Number((prev.zoom * factor).toFixed(4)), ZOOM_MIN, ZOOM_MAX);
        if (nextZoom === prev.zoom) return prev;
        const prevSpan = baseSpan / prev.zoom;
        const nextSpan = baseSpan / nextZoom;
        const ax = anchorX ?? prev.cx;
        const ay = anchorY ?? prev.cy;
        const nextCx = ax - (ax - prev.cx) * (nextSpan / prevSpan);
        const nextCy = ay - (ay - prev.cy) * (nextSpan / prevSpan);
        const nextHalf = nextSpan / 2;
        return {
          zoom: nextZoom,
          cx: clamp(nextCx, baseLo + nextHalf, baseHi - nextHalf),
          cy: clamp(nextCy, baseLo + nextHalf, baseHi - nextHalf),
        };
      });
    },
    [baseSpan, baseLo, baseHi],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as Element | null;
      if (target?.closest('[data-rs-point]')) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startCx: centerX,
        startCy: centerY,
        moved: false,
      };
      setDragging(true);
    },
    [centerX, centerY],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const el = hostRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dxPx = e.clientX - drag.startClientX;
      const dyPx = e.clientY - drag.startClientY;
      if (Math.abs(dxPx) + Math.abs(dyPx) > 3) drag.moved = true;
      const dxData = (dxPx / Math.max(1, rect.width)) * size.w * (viewSpan / plotW);
      const dyData = -(dyPx / Math.max(1, rect.height)) * size.h * (viewSpan / plotH);
      const nextHalf = viewSpan / 2;
      setView((prev) => ({
        ...prev,
        cx: clamp(drag.startCx - dxData, baseLo + nextHalf, baseHi - nextHalf),
        cy: clamp(drag.startCy - dyData, baseLo + nextHalf, baseHi - nextHalf),
      }));
    },
    [size.w, size.h, viewSpan, plotW, plotH, baseLo, baseHi],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    dragRef.current = null;
    setDragging(false);
  }, []);

  const labelPullback = xLo < 0 && yHi > 0;
  const labelSynced = xHi > 0 && yHi > 0;
  const labelBroken = xLo < 0 && yLo < 0;
  const labelTurning = xHi > 0 && yLo < 0;

  return (
    <div className={cn('flex min-h-0 flex-col', fill ? 'h-full gap-1.5' : 'gap-2.5')}>
      {showTitle && (
        <h3 className="shrink-0 text-sm font-semibold tracking-tight text-foreground">
          Relative Strength
        </h3>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] leading-snug text-neutral-500">
          <span className="font-medium text-neutral-700">Zoom:</span> scroll or use + / −
          <span className="mx-1.5 text-neutral-300">·</span>
          <span className="font-medium text-neutral-700">Pan:</span> drag the chart
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomAt(1 / ZOOM_STEP)}
            disabled={view.zoom <= ZOOM_MIN}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => zoomAt(ZOOM_STEP)}
            disabled={view.zoom >= ZOOM_MAX}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView(DEFAULT_VIEW)}
            disabled={!isZoomed && Math.abs(view.cx) < 0.01 && Math.abs(view.cy) < 0.01}
            className="flex h-7 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Reset zoom"
            title="Reset zoom"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          {isZoomed && (
            <span className="ml-1 rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-neutral-600">
              {view.zoom.toFixed(1)}×
            </span>
          )}
        </div>
      </div>

      <div
        ref={hostRef}
        className={cn(
          'relative min-h-0 touch-none overflow-hidden rounded-2xl border border-neutral-200/80 bg-white',
          fill ? 'h-full min-h-0 flex-1' : 'mx-auto aspect-square w-full max-w-[min(100%,560px)]',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg
          viewBox={`0 0 ${size.w} ${size.h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 block h-full w-full"
          role="img"
          aria-label="Relative Strength scatter: percent from 21-day EMA vs 30-week EMA. Scroll to zoom, drag to pan."
        >
          {yHi > 0 && xLo < 0 && (
            <rect
              x={PAD.left}
              y={PAD.top}
              width={Math.max(0, zx - PAD.left)}
              height={Math.max(0, zy - PAD.top)}
              fill={QUADRANT_COLORS.PULLBACK.fill}
            />
          )}
          {yHi > 0 && xHi > 0 && (
            <rect
              x={zx}
              y={PAD.top}
              width={Math.max(0, PAD.left + plotW - zx)}
              height={Math.max(0, zy - PAD.top)}
              fill={QUADRANT_COLORS.SYNCED_UPTREND.fill}
            />
          )}
          {yLo < 0 && xLo < 0 && (
            <rect
              x={PAD.left}
              y={zy}
              width={Math.max(0, zx - PAD.left)}
              height={Math.max(0, PAD.top + plotH - zy)}
              fill={QUADRANT_COLORS.BROKEN_TREND.fill}
            />
          )}
          {yLo < 0 && xHi > 0 && (
            <rect
              x={zx}
              y={zy}
              width={Math.max(0, PAD.left + plotW - zx)}
              height={Math.max(0, PAD.top + plotH - zy)}
              fill={QUADRANT_COLORS.TURNING.fill}
            />
          )}

          {ticks.map((t) => {
            if (t < xLo || t > xHi) return null;
            const px = cx(t);
            return (
              <line
                key={`gx-${t}`}
                x1={px}
                y1={PAD.top}
                x2={px}
                y2={PAD.top + plotH}
                stroke="#e8e8e8"
                strokeWidth={1}
              />
            );
          })}
          {yTicks.map((t) => {
            if (t < yLo || t > yHi) return null;
            const py = cy(t);
            return (
              <line
                key={`gy-${t}`}
                x1={PAD.left}
                y1={py}
                x2={PAD.left + plotW}
                y2={py}
                stroke="#e8e8e8"
                strokeWidth={1}
              />
            );
          })}

          {showZeroX && (
            <line
              x1={zeroX}
              y1={PAD.top}
              x2={zeroX}
              y2={PAD.top + plotH}
              stroke="#a8a8a8"
              strokeWidth={1.35}
              strokeDasharray="5 4"
            />
          )}
          {showZeroY && (
            <line
              x1={PAD.left}
              y1={zeroY}
              x2={PAD.left + plotW}
              y2={zeroY}
              stroke="#a8a8a8"
              strokeWidth={1.35}
              strokeDasharray="5 4"
            />
          )}

          {labelPullback && (
            <>
              <text
                x={PAD.left + 12}
                y={PAD.top + titleSize + 4}
                fontSize={titleSize}
                fontWeight={700}
                fill={QUADRANT_COLORS.PULLBACK.label}
              >
                {QUADRANT_COPY.PULLBACK.title}
              </text>
              <text
                x={PAD.left + 12}
                y={PAD.top + titleSize + subSize + 10}
                fontSize={subSize}
                fill="#737373"
              >
                {QUADRANT_COPY.PULLBACK.subtitle}
              </text>
            </>
          )}
          {labelSynced && (
            <>
              <text
                x={PAD.left + plotW - 12}
                y={PAD.top + titleSize + 4}
                fontSize={titleSize}
                fontWeight={700}
                fill={QUADRANT_COLORS.SYNCED_UPTREND.label}
                textAnchor="end"
              >
                {QUADRANT_COPY.SYNCED_UPTREND.title}
              </text>
              <text
                x={PAD.left + plotW - 12}
                y={PAD.top + titleSize + subSize + 10}
                fontSize={subSize}
                fill="#737373"
                textAnchor="end"
              >
                {QUADRANT_COPY.SYNCED_UPTREND.subtitle}
              </text>
            </>
          )}
          {labelBroken && (
            <>
              <text
                x={PAD.left + 12}
                y={PAD.top + plotH - subSize - 8}
                fontSize={titleSize}
                fontWeight={700}
                fill={QUADRANT_COLORS.BROKEN_TREND.label}
              >
                {QUADRANT_COPY.BROKEN_TREND.title}
              </text>
              <text
                x={PAD.left + 12}
                y={PAD.top + plotH - 6}
                fontSize={subSize}
                fill="#737373"
              >
                {QUADRANT_COPY.BROKEN_TREND.subtitle}
              </text>
            </>
          )}
          {labelTurning && (
            <>
              <text
                x={PAD.left + plotW - 12}
                y={PAD.top + plotH - subSize - 8}
                fontSize={titleSize}
                fontWeight={700}
                fill={QUADRANT_COLORS.TURNING.label}
                textAnchor="end"
              >
                {QUADRANT_COPY.TURNING.title}
              </text>
              <text
                x={PAD.left + plotW - 12}
                y={PAD.top + plotH - 6}
                fontSize={subSize}
                fill="#737373"
                textAnchor="end"
              >
                {QUADRANT_COPY.TURNING.subtitle}
              </text>
            </>
          )}

          {ticks.map((t) => {
            if (t < xLo || t > xHi) return null;
            return (
              <text
                key={`tx-${t}`}
                x={cx(t)}
                y={PAD.top + plotH + 16}
                fontSize={tickSize}
                fill="#8a8a8a"
                textAnchor="middle"
              >
                {t}
              </text>
            );
          })}
          {yTicks.map((t) => {
            if (t < yLo || t > yHi) return null;
            return (
              <text
                key={`ty-${t}`}
                x={PAD.left - 8}
                y={cy(t) + 3}
                fontSize={tickSize}
                fill="#8a8a8a"
                textAnchor="end"
              >
                {t}
              </text>
            );
          })}

          <text
            x={PAD.left + plotW / 2}
            y={size.h - 8}
            fontSize={axisSize}
            fill="#525252"
            textAnchor="middle"
          >
            % from 21-day EMA
          </text>
          <text
            x={14}
            y={PAD.top + plotH / 2}
            fontSize={axisSize}
            fill="#525252"
            textAnchor="middle"
            transform={`rotate(-90 14 ${PAD.top + plotH / 2})`}
          >
            % from 30-week EMA
          </text>

          {chartPoints.map((p) => {
            const inView = p.x >= xLo && p.x <= xHi && p.y >= yLo && p.y <= yHi;
            // At full zoom, clamp outliers toward the edge; when zoomed, only show in-view dots.
            if (!inView && isZoomed) return null;
            const x = clamp(p.x, xLo, xHi);
            const y = clamp(p.y, yLo, yHi);
            const inset = pointInset;
            const plotLeft = PAD.left + inset;
            const plotRight = PAD.left + plotW - inset;
            const plotTop = PAD.top + inset;
            const plotBottom = PAD.top + plotH - inset;
            const px = clamp(cx(x), plotLeft, plotRight);
            const py = clamp(cy(y), plotTop, plotBottom);
            const fillColor =
              p.quadrant === 'UNKNOWN' ? '#737373' : QUADRANT_COLORS[p.quadrant].dot;
            const active = p.ticker === selected || p.ticker === hover;
            const r = active || p.highlight ? dotR + 1.5 : dotR;

            // Flip label side/side so text stays inside the chart bounds.
            const approxLabelW = Math.max(18, p.ticker.length * labelSize * 0.62);
            const placeLeft = px + 9 + approxLabelW > PAD.left + plotW - 6;
            const placeBelow = py - 8 < PAD.top + labelSize + 4;
            const labelX = placeLeft ? px - 8 : px + 9;
            const labelY = placeBelow ? py + labelSize + 3 : py - 7;
            const labelAnchor = placeLeft ? 'end' : 'start';

            return (
              <g
                key={p.ticker}
                data-rs-point=""
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(p.ticker)}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  if (dragRef.current?.moved) return;
                  setSelected(p.ticker);
                  onSelectTicker?.(p.ticker);
                }}
              >
                <circle
                  cx={px}
                  cy={py}
                  r={r}
                  fill={fillColor}
                  stroke="#fff"
                  strokeWidth={active || p.highlight ? 2.25 : 1.5}
                />
                <text
                  x={labelX}
                  y={labelY}
                  fontSize={labelSize}
                  fontWeight={600}
                  fill="#1a1a1a"
                  textAnchor={labelAnchor}
                >
                  {p.ticker}
                </text>
              </g>
            );
          })}
        </svg>

        {hoverPoint && hoverPos && (
          <div
            className="pointer-events-none absolute z-10 min-w-28 rounded-xl border border-neutral-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
            style={{
              left: `${(hoverPos.px / size.w) * 100}%`,
              top: `${(hoverPos.py / size.h) * 100}%`,
              transform: [
                hoverPos.placeRight ? 'translateX(14px)' : 'translateX(calc(-100% - 14px))',
                hoverPos.placeBelow ? 'translateY(8px)' : 'translateY(calc(-100% - 8px))',
              ].join(' '),
            }}
          >
            <div className="font-semibold text-neutral-900">{hoverPoint.ticker}</div>
            <div className="text-neutral-500">21d EMA: {hoverPoint.x.toFixed(1)}%</div>
            <div className="text-neutral-500">30w EMA: {hoverPoint.y.toFixed(1)}%</div>
            {hoverPoint.dailyRating && (
              <div className="text-neutral-500">Rating: {hoverPoint.dailyRating}</div>
            )}
            <div className="mt-0.5 font-medium text-neutral-800">
              {hoverPoint.quadrant === 'UNKNOWN'
                ? 'Unknown'
                : QUADRANT_COPY[hoverPoint.quadrant].title}
            </div>
          </div>
        )}
      </div>

      {outsideCount > 0 && isZoomed && (
        <p className="shrink-0 text-[11px] text-neutral-500">
          {outsideCount} ticker{outsideCount === 1 ? '' : 's'} outside this view — zoom out, pan, or
          hit Reset.
        </p>
      )}

      {chartPoints.length === 0 && (
        <p className="shrink-0 text-sm text-neutral-500">
          Relative Strength needs 21-day and 30-week EMA distance for the selected tickers.
        </p>
      )}

      {showBrief && brief && (
        <div className="shrink-0">
          <BriefCard brief={brief} defaultOpen compact />
        </div>
      )}
    </div>
  );
}
