// Portfolio detail — styled to match MWS Dashboard design language.

function PortfolioDetailPage({ portfolioKey = "dow30", onBack }) {
  const header = {
    name: "Momentum Picks: DOW 30",
    start: "1/1/2019",
    init: 10000,
    cash: "N/A",
    pfValue: 74422,
    returnDol: 64422,
    returnPct: 6.4,
    hitRate: 60.6,
    avgGain: 2.6,
    avgLoss: -1.9,
    netAvg: 0.6,
    cagr: 32,
  };

  const tickers = ["PG","MCD","NKE","NKE","BA","BA","BA","BA","BA","CSCO","CSCO","MRK","PG","MSFT","CSCO","JPM","HD","WMT","KO","PEP","JNJ","MMM","IBM","AXP","V","UNH","DIS","VZ","CAT","GS"];
  const rows = tickers.map((tk, i) => {
    const seed = (tk.charCodeAt(0) + i * 17) % 10;
    const r = [-0.2, 0.6, 0.3, 2.1, 4.1, 2.4, 2.1, 3.1, -4.7, 4.0, -1.0, 1.3, -0.6, 1.0, 0.0, 1.7, -0.8, 2.4, 3.3, -1.2][i % 20];
    const val = 9885 + i * 120 + seed * 30;
    const dol = Math.round(r * val / 100);
    const slR = Math.max(r, -3.0);
    const slD = Math.round(slR * val / 100);
    const algo = 88 + (seed % 12);
    const date = new Date(2019, 0, 7 + i * 7);
    const ws = `${date.getMonth()+1}/${date.getDate()}/${date.getFullYear()}`;
    return { year: 2019, week: i+1, ws, tk, r, dol, pf: val, slR, slD, pf2: val + 120, algo };
  });

  const fmt$ = (n) => `$${Math.abs(n).toLocaleString()}`;
  const PctChip = ({ v }) => {
    const pos = v > 0, neg = v < 0;
    return <span className={`trend-chip ${pos?"up":neg?"down":""}`} style={{fontFamily:"var(--mono)", fontWeight:600, minWidth:56, justifyContent:"center"}}>
      {pos?"+":neg?"":""}{v.toFixed(1)}%
    </span>;
  };
  const DollarCell = ({ v }) => {
    const pos = v > 0, neg = v < 0;
    return <span style={{fontFamily:"var(--mono)", color: pos?"var(--emerald)":neg?"var(--rose)":"var(--ink-3)", fontWeight: v!==0?600:400}}>
      {neg?"-":pos?"+":""}{fmt$(v)}
    </span>;
  };

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{header.name}</h1>
          <p className="page-subtitle">Weekly log · tracked since {header.start} · {rows.length} positions</p>
        </div>
        <div className="page-actions">
          {onBack && <button className="btn" onClick={onBack}><Icon name="arrow-left" size={14}/> Back to Portfolio</button>}
          <button className="btn"><Icon name="refresh" size={14}/> Refresh</button>
        </div>
      </div>

      {/* Summary stat cards — matches MWS Dashboard */}
      <div className="stat-grid" style={{marginBottom: 20}}>
        <div className="stat-card">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value">${header.pfValue.toLocaleString()}</div>
          <div className="stat-sub">Initial ${header.init.toLocaleString()} · {header.cash} cash</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Return</div>
          <div className="stat-value pos">+${header.returnDol.toLocaleString()}</div>
          <div className="stat-sub" style={{color:"var(--emerald)"}}>+{header.returnPct}% returns</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">CAGR</div>
          <div className="stat-value">{header.cagr}%</div>
          <div className="stat-sub">Compound annual</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Hit Rate</div>
          <div className="stat-value">{header.hitRate}%</div>
          <div className="stat-sub">Net avg {header.netAvg}% / trade</div>
        </div>
      </div>

      {/* Win / loss breakdown row */}
      <div className="section" style={{marginBottom: 16}}>
        <div className="pulse-group-head" style={{borderBottom:"1px solid var(--line)"}}>
          <div className="left">
            <span className="group-icon"><Icon name="bar" size={14}/></span>
            <span className="title">Trade Economics</span>
          </div>
          <div className="summary">
            <span style={{color:"var(--ink-3)", fontSize:12}}>Average P&L per position</span>
          </div>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))"}}>
          {[
            {k:"Avg Gain", v: `+${header.avgGain}%`, cls: "emerald"},
            {k:"Avg Loss", v: `${header.avgLoss}%`, cls: "rose"},
            {k:"Net Avg Return", v: `+${header.netAvg}%`, cls: "emerald"},
            {k:"Start Date", v: header.start, cls: ""},
          ].map((c,i) => (
            <div key={i} style={{padding:"18px 20px", borderRight: i<3?"1px solid var(--line)":"none", display:"flex", flexDirection:"column", gap:6}}>
              <div style={{fontSize:11, letterSpacing:"0.06em", textTransform:"uppercase", color:"var(--ink-3)", fontWeight:600}}>{c.k}</div>
              <div style={{fontFamily:"var(--mono)", fontSize:20, fontWeight:600, color: c.cls==="emerald"?"var(--emerald)":c.cls==="rose"?"var(--rose)":"var(--ink)"}}>{c.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly log table */}
      <div className="section">
        <div className="pulse-group-head" style={{borderBottom:"1px solid var(--line)"}}>
          <div className="left">
            <span className="group-icon emerald"><Icon name="radar" size={14}/></span>
            <span className="title">Weekly Pick Log</span>
            <span className="chip">{rows.length}</span>
          </div>
          <div className="summary">
            <span><span className="dot emerald"/> {rows.filter(r=>r.r>0).length} winners</span>
            <span><span className="dot rose"/> {rows.filter(r=>r.r<0).length} losers</span>
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table className="portfolio-table minimal" style={{minWidth: 900}}>
            <thead>
              <tr>
                <th style={{width: 70}}>Week</th>
                <th>Date</th>
                <th>Ticker</th>
                <th>5-d Return</th>
                <th>5-d P&L</th>
                <th>PF Value</th>
                <th>Stop-Loss</th>
                <th>SL P&L</th>
                <th>PF Value (SL)</th>
                <th style={{width: 110}}>Algo Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i) => (
                <tr key={i}>
                  <td className="num" style={{color:"var(--ink-3)"}}>{r.year} · {String(r.week).padStart(2,"0")}</td>
                  <td className="num" style={{color:"var(--ink-2)"}}>{r.ws}</td>
                  <td>
                    <div className="asset">
                      <div className="asset-icon" style={{width:28, height:28, fontSize:10}}>{r.tk}</div>
                      <div className="name" style={{fontWeight:600, fontSize:13}}>{r.tk}</div>
                    </div>
                  </td>
                  <td className="num"><PctChip v={r.r}/></td>
                  <td className="num"><DollarCell v={r.dol}/></td>
                  <td className="num" style={{color:"var(--ink-2)", fontWeight:500}}>${r.pf.toLocaleString()}</td>
                  <td className="num"><PctChip v={r.slR}/></td>
                  <td className="num"><DollarCell v={r.slD}/></td>
                  <td className="num" style={{color:"var(--ink-2)", fontWeight:500}}>${r.pf2.toLocaleString()}</td>
                  <td>
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                      <div style={{flex:1, height:4, borderRadius:2, background:"var(--paper-2)", overflow:"hidden", minWidth:50}}>
                        <div style={{width:`${r.algo}%`, height:"100%", background: r.algo>=95?"var(--emerald)":r.algo>=90?"oklch(0.72 0.15 75)":"var(--violet)"}}/>
                      </div>
                      <span style={{fontFamily:"var(--mono)", fontSize:12, fontWeight:600, color:"var(--ink-2)", minWidth:24, textAlign:"right"}}>{r.algo}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

window.PortfolioDetailPage = PortfolioDetailPage;
