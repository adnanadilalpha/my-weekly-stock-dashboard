'use client';

import { useEffect, useRef, memo } from 'react';
import {
  createChart,
  LineSeries,
  ColorType,
  LineStyle,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { PriceBar } from '@/lib/queries/price-history';

// --- EMA helper -------------------------------------------------------
function calcEma(values: number[], period: number): (number | null)[] {
  if (values.length < period) return values.map(() => null);
  const k = 2 / (period + 1);
  const out: (number | null)[] = new Array(period - 1).fill(null);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

interface PriceChartProps {
  bars: PriceBar[];
  interval: 'daily' | 'weekly';
  emaShort?: number;
  emaLong?: number;
  height?: number;
}

type LineSeriesApi = ISeriesApi<'Line'>;
type ChartTime = string | { year: number; month: number; day: number } | number;

function parseChartDate(time: ChartTime): Date | null {
  if (typeof time === 'number') return new Date(time * 1000);
  if (typeof time === 'string') {
    const d = new Date(`${time}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (time && typeof time === 'object' && 'year' in time && 'month' in time && 'day' in time) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }
  return null;
}

function PriceChartInner({ bars, interval, emaShort, emaLong, height = 220 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const priceRef     = useRef<LineSeriesApi | null>(null);
  const ema1Ref      = useRef<LineSeriesApi | null>(null);
  const ema2Ref      = useRef<LineSeriesApi | null>(null);

  const shortPeriod = emaShort ?? (interval === 'weekly' ? 9  : 9);
  const longPeriod  = emaLong  ?? (interval === 'weekly' ? 30 : 21);

  // Create chart once.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor:  '#94a3b8',
        fontSize:   11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.08)' },
        horzLines: { color: 'rgba(148,163,184,0.08)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(148,163,184,0.4)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(148,163,184,0.4)', width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor:   'rgba(148,163,184,0.15)',
        scaleMargins:  { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor:     'rgba(148,163,184,0.15)',
        timeVisible:     true,
        secondsVisible:  false,
        tickMarkFormatter: (time: ChartTime) => {
          const d = parseChartDate(time);
          if (!d) return '';
          return interval === 'weekly'
            ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        },
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale:  {
        axisPressedMouseMove: false,
        mouseWheel: false,
        pinch: false,
      },
    });

    const priceSeries = chart.addSeries(LineSeries, {
      color:              '#6366f1',
      lineWidth:          2,
      priceLineVisible:   false,
      lastValueVisible:   true,
      crosshairMarkerVisible: true,
    });

    const ema1Series = chart.addSeries(LineSeries, {
      color:              '#f59e0b',
      lineWidth:          1,
      lineStyle:          LineStyle.Dashed,
      priceLineVisible:   false,
      lastValueVisible:   false,
      crosshairMarkerVisible: false,
    });

    const ema2Series = chart.addSeries(LineSeries, {
      color:              '#10b981',
      lineWidth:          1,
      lineStyle:          LineStyle.Dashed,
      priceLineVisible:   false,
      lastValueVisible:   false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    priceRef.current = priceSeries;
    ema1Ref.current  = ema1Series;
    ema2Ref.current  = ema2Series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, interval]);

  // Update data when bars change.
  useEffect(() => {
    if (!priceRef.current || !ema1Ref.current || !ema2Ref.current) return;
    if (!bars || bars.length === 0) return;

    const closes = bars.map((b) => b.close);

    const priceData = bars.map((b) => ({
      time: b.date as `${number}-${number}-${number}`,
      value: b.close,
    }));

    const emaShortVals = calcEma(closes, shortPeriod);
    const emaLongVals  = calcEma(closes, longPeriod);

    const ema1Data = bars
      .map((b, i) => ({ time: b.date as `${number}-${number}-${number}`, value: emaShortVals[i] }))
      .filter((d): d is { time: `${number}-${number}-${number}`; value: number } => d.value !== null);

    const ema2Data = bars
      .map((b, i) => ({ time: b.date as `${number}-${number}-${number}`, value: emaLongVals[i] }))
      .filter((d): d is { time: `${number}-${number}-${number}`; value: number } => d.value !== null);

    priceRef.current.setData(priceData);
    ema1Ref.current.setData(ema1Data);
    ema2Ref.current.setData(ema2Data);

    chartRef.current?.timeScale().fitContent();
  }, [bars, shortPeriod, longPeriod]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}

export const PriceChart = memo(PriceChartInner);
