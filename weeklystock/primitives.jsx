// Shared primitives + icons.

const { useState, useEffect, useRef, useMemo } = React;

// ————— Icons (stroke-based, 16px default)
const Icon = ({ name, size = 16, color = "currentColor", ...rest }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", ...rest };
  switch (name) {
    case "search": return (<svg {...common}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>);
    case "arrow-right": return (<svg {...common}><path d="M5 12h14M13 5l7 7-7 7"/></svg>);
    case "arrow-left": return (<svg {...common}><path d="M19 12H5M11 5l-7 7 7 7"/></svg>);
    case "chevron-right": return (<svg {...common}><path d="m9 18 6-6-6-6"/></svg>);
    case "chevron-down": return (<svg {...common}><path d="m6 9 6 6 6-6"/></svg>);
    case "trend-up": return (<svg {...common}><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>);
    case "trend-down": return (<svg {...common}><path d="m3 7 6 6 4-4 8 8"/><path d="M14 17h7v-7"/></svg>);
    case "arrow-up-right": return (<svg {...common}><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>);
    case "arrow-down-right": return (<svg {...common}><path d="M7 7 17 17"/><path d="M17 7v10H7"/></svg>);
    case "minus": return (<svg {...common}><path d="M5 12h14"/></svg>);
    case "mail": return (<svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>);
    case "sparkles": return (<svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>);
    case "logo": return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M4 14 L9 9 L13 13 L20 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="20" cy="6" r="2" fill={color}/></svg>);
    case "refresh": return (<svg {...common}><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>);
    case "logout": return (<svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>);
    case "bell": return (<svg {...common}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>);
    case "moon": return (<svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>);
    case "sun": return (<svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>);
    case "slider": return (<svg {...common}><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>);
    case "book": return (<svg {...common}><path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>);
    case "grid": return (<svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>);
    case "radar": return (<svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 3 6"/></svg>);
    case "layers": return (<svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5M3 18l9 5 9-5"/></svg>);
    case "bar": return (<svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>);
    case "check": return (<svg {...common}><path d="m5 12 4 4L19 6"/></svg>);
    case "sliders-ui": return (<svg {...common}><path d="M4 4h16M4 12h16M4 20h16"/><circle cx="8" cy="4" r="1.7" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="10" cy="20" r="1.7" fill="currentColor" stroke="none"/></svg>);
    case "star": return (<svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1L12 2Z"/></svg>);
    case "x": return (<svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>);
    case "plus": return (<svg {...common}><path d="M12 5v14M5 12h14"/></svg>);
    default: return null;
  }
};

// Sparkline
function Sparkline({ data, width = 120, height = 36, negative = false }) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height}>
      <path className={`spark-area${negative ? " neg" : ""}`} d={area} />
      <path className={`spark-path${negative ? " neg" : ""}`} d={d} />
    </svg>
  );
}

// Deterministic pseudo-series from a ticker symbol, ending at magnitude that reflects the perf trend.
function seriesFromTicker(ticker, trend) {
  let s = 0;
  for (let i = 0; i < ticker.length; i++) s = (s * 31 + ticker.charCodeAt(i)) >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 0xffffffff); };
  const n = 28;
  const out = [];
  let v = 50;
  for (let i = 0; i < n; i++) {
    v += (rand() - 0.5) * 4 + (trend / n) * 0.8;
    out.push(v);
  }
  return out;
}

// Trend icon + chip
function TrendChip({ rating }) {
  const r = rating.toLowerCase();
  if (r.includes("strong uptrend")) return <span className="trend-chip up"><Icon name="arrow-up-right" size={11}/>{rating}</span>;
  if (r.includes("uptrend")) return <span className="trend-chip up"><Icon name="trend-up" size={11}/>{rating}</span>;
  if (r.includes("strong downtrend")) return <span className="trend-chip down"><Icon name="arrow-down-right" size={11}/>{rating}</span>;
  if (r.includes("downtrend")) return <span className="trend-chip down"><Icon name="trend-down" size={11}/>{rating}</span>;
  if (r.includes("sideways")) return <span className="trend-chip flat"><Icon name="minus" size={11}/>{rating}</span>;
  return <span className="trend-chip flat">{rating}</span>;
}

function OutlookPill({ outlook }) {
  const cls = outlook.toLowerCase();
  return (<span className={`outlook ${cls}`}><span className="outlook-dot"/>{outlook}</span>);
}

// Perf bar: shows magnitude relative to ±max
function PerfBar({ val, max = 15 }) {
  const clamped = Math.max(-max, Math.min(max, val));
  const pct = Math.abs(clamped) / max * 50;
  const pos = val >= 0;
  const fmt = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
  return (
    <div className="perf">
      <div className="bar">
        <div className="center"/>
        <div className={`fill ${pos ? "pos" : "neg"}`} style={{ width: `${pct}%` }}/>
      </div>
      <span className={`val ${val === 0 ? "" : (pos ? "pos" : "neg")}`}>{fmt(val)}</span>
    </div>
  );
}

// Score bars (0–5)
function Score({ value }) {
  const n = Math.round(value);
  return (
    <div className="score">
      <div className="dots">
        {[0,1,2,3,4].map(i => <span key={i} className={i < n ? "on" : ""}/>)}
      </div>
      <span className="num-val">{value.toFixed(1)}</span>
    </div>
  );
}

Object.assign(window, { Icon, Sparkline, seriesFromTicker, TrendChip, OutlookPill, PerfBar, Score });
