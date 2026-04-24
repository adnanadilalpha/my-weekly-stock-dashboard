// Ticker detail — weekly chart with 9/30-week EMA, $SPY/$DIA/$QQQ benchmarks.

function TickerPage({ ticker, onBack }) {
  const { SEGMENTS, SECTORS, LARGE_CAPS } = window.DATA;
  const all = [...SEGMENTS, ...SECTORS, ...LARGE_CAPS];
  const item = all.find(x => x.ticker === ticker) || all[0];

  const [tf, setTf] = useState("W");

  const longName = {
    SPY: "S&P 500", QQQ: "Invesco QQQ Trust", IWM: "iShares Russell 2000 ETF",
    TLT: "iShares 20+ Year Treasury", UUP: "Invesco DB USD Bullish", GLD: "SPDR Gold Shares",
    SLV: "iShares Silver Trust", IBIT: "iShares Bitcoin Trust", ETHA: "iShares Ethereum Trust",
    USO: "United States Oil Fund",
  }[item.ticker] || item.name;

  const price = (100 + (item.ticker.charCodeAt(0) % 40) * 15 + item.m1 * 4);
  const ema9 = price * (1 - item.m1/2000);
  const ema30 = price * (1 - item.m3/1500);
  const m1High = price * 1.01;
  const m1Low = price * 0.975;

  const summary = (() => {
    if (item.score >= 4) return { head: "Strong performer", sub: "Leading benchmarks", body: `$${item.ticker} is trading near multi-week highs with broad breadth supporting the move.` };
    if (item.score >= 3) return { head: "Mixed performer", sub: "Lagging vs benchmarks", body: `$${item.ticker} has delivered mixed performance and lags benchmarks. Remaining close to its 1-year high indicates that the stock is consolidating after prior strength.` };
    if (item.score >= 2) return { head: "Consolidating", sub: "In line with benchmarks", body: `$${item.ticker} is consolidating near key moving averages with no clear directional bias.` };
    return { head: "Under pressure", sub: "Lagging benchmarks", body: `$${item.ticker} is trading with weak momentum across timeframes.` };
  })();

  const benchmarks = [
    { tk: `$${item.ticker} (${item.name.split(" ")[0]})`, m1: item.m1, m3: item.m3, vs1y: item.vsHigh, note: `1Y High: ${item.vsHigh.toFixed(1)}%` },
    { tk: "$DIA (Dow Jones)", m1: 7.3, m3: 0.8, vs1y: 0, note: "$DIA: In line" },
    { tk: "$QQQ (Nasdaq)", m1: 12.2, m3: 5.2, vs1y: 0, note: "$QQQ: Lagging" },
  ];

  function seed(str) { let s = 0; for (const c of str) s = (s*31 + c.charCodeAt(0)) >>> 0; return s; }
  function series(str, trend) {
    let s = seed(str); const r = () => { s = (s*1664525 + 1013904223) >>> 0; return s/0xffffffff; };
    const n = 32, out = []; let v = 60;
    for (let i = 0; i < n; i++) { v += (r()-0.5)*5 + trend/n*0.9; out.push(v); }
    return out;
  }
  const s = series(item.ticker, item.m1 * 4);
  const chartW = 860, chartH = 260;
  const max = Math.max(...s), min = Math.min(...s), range = max - min || 1;
  const stepX = chartW / (s.length - 1);
  const pathD = s.map((v,i) => `${i===0?"M":"L"} ${(i*stepX).toFixed(1)} ${(chartH - ((v-min)/range)*(chartH-40) - 20).toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${chartW} ${chartH} L 0 ${chartH} Z`;
  const neg = item.m1 < 0;
  const ema = (arr, p) => { const k=2/(p+1); const o=[]; arr.forEach((v,i)=>o.push(i===0?v:o[i-1]+k*(v-o[i-1]))); return o; };
  const e9 = ema(s, 9), e30 = ema(s, 30);
  const mkPath = (series) => series.map((v,i) => `${i===0?"M":"L"} ${(i*stepX).toFixed(1)} ${(chartH - ((v-min)/range)*(chartH-40) - 20).toFixed(1)}`).join(" ");

  const stars = Math.round(item.score);
  const pricePctVsEma9 = ((price/ema9 - 1) * 100);
  const pricePctVsEma30 = ((price/ema30 - 1) * 100);
  const ema9VsEma30 = ((ema9/ema30 - 1) * 100);

  return (
    <div className="page fade-in">
      <div className="tk-header">
        <div className="tk-title-block">
          <button className="btn icon" onClick={onBack}><Icon name="arrow-left" size={16}/></button>
          <div className="tk-avatar">{item.ticker.slice(0,3)}</div>
          <div>
            <h1>{longName}</h1>
            <div className="sub">
              <span className="mono">{item.ticker}</span>
              <span className="sep"/>
              <TrendChip rating={item.rating}/>
              <OutlookPill outlook={item.outlook}/>
              <span className="sep"/>
              <span>Updated 12/24/2025</span>
            </div>
          </div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap: 20}}>
          <div className="tk-price">
            <div className="p mono num">${price.toFixed(2)}</div>
            <div className={`d ${item.m1>=0?"pos":"neg"}`}>{item.m1>=0?"+":""}{(item.m1/20).toFixed(2)} ({item.m1>=0?"+":""}{(item.m1/10).toFixed(2)}%) today</div>
          </div>
          <button className="btn"><Icon name="refresh" size={14}/> Refresh</button>
        </div>
      </div>

      <div className="tk-grid">
        <div className="vstack" style={{gap: 20}}>
          {/* PERFORMANCE */}
          <div className="section">
            <div className="section-head">
              <h3>Performance</h3>
              <span className="chip">{summary.sub}</span>
            </div>
            <div className="section-body">
              <p className="lead"><strong>{summary.head}</strong> <span style={{color:"var(--ink-3)"}}>| {summary.sub}</span></p>
              <p className="copy">{summary.body}</p>
              <table className="perf-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>1-Month</th>
                    <th>3-Month</th>
                    <th>{item.ticker} performance vs</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((b,i) => (
                    <tr key={i}>
                      <td className="num" style={{fontWeight: i===0?600:500}}>{b.tk}</td>
                      <td className={`val num ${b.m1>=0?"pos":"neg"}`}>{b.m1>=0?"+":""}{b.m1.toFixed(1)}%</td>
                      <td className={`val num ${b.m3>=0?"pos":"neg"}`}>{b.m3>=0?"+":""}{b.m3.toFixed(1)}%</td>
                      <td className="num" style={{color:"var(--ink-2)"}}>{b.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* WEEKLY CHART TREND */}
          <div className="section">
            <div className="section-head">
              <h3>Weekly Chart Trend</h3>
              <div style={{display:"flex", alignItems:"center", gap:12}}>
                <div className="chart-legend">
                  <span className="lg"><span className="sw" style={{background:"var(--violet)"}}/>Price</span>
                  <span className="lg"><span className="sw" style={{background:"oklch(0.7 0.14 85)"}}/>9-week EMA</span>
                  <span className="lg"><span className="sw" style={{background:"oklch(0.6 0.1 240)"}}/>30-week EMA</span>
                </div>
                <div className="segmented">
                  {["D","W"].map(x => (<button key={x} aria-pressed={tf===x} onClick={()=>setTf(x)}>{x}</button>))}
                </div>
              </div>
            </div>
            <div className="section-body">
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 14}}>
                <div style={{display:"flex", alignItems:"center", gap:14}}>
                  <div style={{display:"flex", gap:2}}>
                    {[0,1,2,3,4].map(i => (
                      <Icon key={i} name="star" size={16} color={i < stars ? "oklch(0.78 0.14 85)" : "var(--line-2)"}/>
                    ))}
                  </div>
                  <span className="mono" style={{fontSize:18, fontWeight:600}}>| {item.score.toFixed(1)}</span>
                </div>
                <div style={{fontSize:13.5, color:"var(--ink-2)"}}>
                  {item.rating} | Outlook: <strong style={{color:"var(--ink)"}}>{item.outlook}</strong>
                </div>
              </div>

              <div className="chart-note" style={{padding:"14px 16px", background:"var(--paper-2)", borderRadius:10, marginBottom: 16, fontSize:13.5, color:"var(--ink-2)"}}>
                {item.score >= 3 ?
                  "The uptrend is intact, with price holding above key EMAs. Momentum is steady, showing balanced strength without signs of excess. As long as price stays above the 9-week EMA, the trend should continue gradually higher." :
                  item.score >= 2 ? "Momentum signals show consolidation. Price trading near both EMAs with no clear directional bias." :
                  "Momentum is weak. Price is below key EMAs and trend slopes are pointing lower."}
              </div>

              <div className="chart-canvas">
                <svg width="100%" height="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`g-${item.ticker}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={neg?"var(--rose)":"var(--violet)"} stopOpacity="0.25"/>
                      <stop offset="100%" stopColor={neg?"var(--rose)":"var(--violet)"} stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  {[0.25,0.5,0.75].map(f => (<line key={f} x1="0" x2={chartW} y1={chartH*f} y2={chartH*f} stroke="var(--line)" strokeDasharray="3 4"/>))}
                  <path d={areaD} fill={`url(#g-${item.ticker})`}/>
                  <path d={mkPath(e30)} stroke="oklch(0.6 0.1 240)" strokeWidth="1.4" fill="none" opacity="0.75"/>
                  <path d={mkPath(e9)} stroke="oklch(0.72 0.14 85)" strokeWidth="1.4" fill="none" opacity="0.9"/>
                  <path d={pathD} stroke={neg?"var(--rose)":"var(--violet)"} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="vstack" style={{gap: 20}}>
          <div className="section">
            <div className="section-head"><h3>Trend Signals</h3></div>
            <div className="section-body" style={{paddingTop: 8, paddingBottom: 8}}>
              <div className="signals">
                {[
                  { k: "Price vs 9-week EMA", v: `${pricePctVsEma9>=0?"+":""}${pricePctVsEma9.toFixed(1)}%`, pos: pricePctVsEma9>=0 },
                  { k: "Price vs 30-week EMA", v: `${pricePctVsEma30>=0?"+":""}${pricePctVsEma30.toFixed(1)}%`, pos: pricePctVsEma30>=0 },
                  { k: "9-week EMA vs. 30-week EMA", v: `${ema9VsEma30>=0?"+":""}${ema9VsEma30.toFixed(1)}%`, pos: ema9VsEma30>=0 },
                  { k: "Slope 9-week EMA", v: item.m1>=0?"Rising":"Flat", pos: item.m1>=0, flat: Math.abs(item.m1) < 2 },
                  { k: "Slope 30-week EMA", v: item.m3>=0?"Rising":"Flat", pos: item.m3>=0, flat: Math.abs(item.m3) < 2 },
                ].map((sig,i) => (
                  <div key={i} className="signal-row">
                    <span className="k">{sig.k}</span>
                    <span style={{display:"flex", alignItems:"center", gap:8}}>
                      <span className="v" style={{color: sig.flat?"var(--ink-3)":(sig.pos?"var(--emerald)":"var(--rose)")}}>{sig.v}</span>
                      <Icon name={sig.flat?"minus":(sig.pos?"check":"x")} size={12} color={sig.flat?"var(--ink-3)":(sig.pos?"var(--emerald)":"var(--rose)")}/>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-head"><h3>Key Levels</h3></div>
            <div className="section-body" style={{paddingTop: 8, paddingBottom: 8}}>
              <div className="signals">
                {[
                  { k: "Current Price", v: price.toFixed(2) },
                  { k: "9-week EMA", v: ema9.toFixed(2) },
                  { k: "30-week EMA", v: ema30.toFixed(2) },
                  { k: "3-month High", v: m1High.toFixed(2) },
                  { k: "3-month Low", v: m1Low.toFixed(2) },
                ].map((sig,i) => (
                  <div key={i} className="signal-row">
                    <span className="k">{sig.k}</span>
                    <span className="v num">{sig.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.TickerPage = TickerPage;
