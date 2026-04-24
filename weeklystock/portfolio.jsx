// Portfolio Performance — styled to match MWS Dashboard aesthetic.

function PortfolioPage({ onOpen }) {
  const { PORTFOLIO } = window.DATA;
  const [filter, setFilter] = useState("all");

  const all = [...PORTFOLIO.weekly, ...PORTFOLIO.etf];
  const avgReturn = (all.reduce((s,r)=>s+r.returns,0) / all.length).toFixed(1);
  const avgCAGR = (all.reduce((s,r)=>s+r.cagr,0) / all.length).toFixed(0);
  const avgHit = (all.reduce((s,r)=>s+r.hit,0) / all.length).toFixed(1);
  const accessible = all.filter(r => r.access !== "—").length;

  const Ret = ({ v, strong }) => {
    const pos = v >= 0;
    return <span className={`trend-chip ${pos?"up":"down"}`} style={{fontFamily:"var(--mono)", fontWeight: strong?700:600}}>
      {pos?"+":""}{v.toFixed(1)}%
    </span>;
  };

  const Row = ({ r }) => (
    <tr onClick={()=> r.access !== "—" && onOpen && onOpen(r.name)}
        style={{cursor: r.access !== "—" ? "pointer" : "default"}}>
      <td>
        <div className="asset">
          <div className="asset-icon" style={{background: r.cagr >= 25 ? "var(--emerald-soft)" : "var(--paper-2)", color: r.cagr >= 25 ? "var(--emerald)" : "var(--ink-3)"}}>
            {r.name.match(/[A-Z0-9]/g)?.slice(0,2).join("") || r.name.slice(0,2).toUpperCase()}
          </div>
          <div style={{minWidth:0}}>
            <div className="name" style={{fontWeight:500}}>{r.name}</div>
            <div className="sub" style={{fontFamily:"var(--mono)", fontSize:11}}>Since {r.start}</div>
          </div>
        </div>
      </td>
      <td className="num"><Ret v={r.returns} strong/></td>
      <td className="num">
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <div style={{width: 60, height: 4, borderRadius: 2, background: "var(--paper-2)", overflow:"hidden", flexShrink: 0}}>
            <div style={{width: `${r.hit}%`, height: "100%", background: r.hit >= 60 ? "var(--emerald)" : r.hit >= 50 ? "oklch(0.72 0.15 75)" : "var(--rose)"}}/>
          </div>
          <span style={{fontSize:12.5, color:"var(--ink-2)"}}>{r.hit.toFixed(1)}%</span>
        </div>
      </td>
      <td className="num" style={{color:"var(--emerald)"}}>+{r.avgGain.toFixed(1)}%</td>
      <td className="num" style={{color:"var(--rose)"}}>{r.avgLoss.toFixed(1)}%</td>
      <td className="num" style={{fontWeight:600}}><Ret v={r.netAvg}/></td>
      <td className="num" style={{fontWeight:600, color:"var(--ink)"}}>{r.cagr}%</td>
      <td className="num" style={{color:"var(--ink-3)"}}>{r.hold}d</td>
      <td>
        {r.access === "—"
          ? <span style={{color:"var(--ink-4)", fontSize:12}}>—</span>
          : <button onClick={(e)=>{e.stopPropagation(); onOpen && onOpen(r.name);}}
              className="btn ghost" style={{padding:"6px 10px", fontSize:12, color:"var(--violet)"}}>
              {r.access} <Icon name="chevron-right" size={12}/>
            </button>}
      </td>
    </tr>
  );

  const filterRows = (rows) => {
    if (filter === "all") return rows;
    if (filter === "high") return rows.filter(r => r.cagr >= 20);
    if (filter === "stable") return rows.filter(r => r.hit >= 55);
    return rows;
  };

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portfolio Performance</h1>
          <p className="page-subtitle">Tracked since 2019 · {all.length} strategies · updated 12/24/2025</p>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh" size={14}/> Refresh</button>
        </div>
      </div>

      {/* Summary stat cards (same visual DNA as ticker overview) */}
      <div className="stat-grid" style={{marginBottom: 20}}>
        <div className="stat-card">
          <div className="stat-label">Avg Return</div>
          <div className="stat-value pos">+{avgReturn}%</div>
          <div className="stat-sub">Across all portfolios</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg CAGR</div>
          <div className="stat-value">{avgCAGR}%</div>
          <div className="stat-sub">Compound annual</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Hit Rate</div>
          <div className="stat-value">{avgHit}%</div>
          <div className="stat-sub">Winning trades</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value">{accessible}<span style={{fontSize:16, color:"var(--ink-3)", fontWeight:500}}>/{all.length}</span></div>
          <div className="stat-sub">With detailed log</div>
        </div>
      </div>

      <div className="pulse-toolbar" style={{marginBottom: 16}}>
        <div style={{fontSize:12.5, color:"var(--ink-3)"}}>Filter by characteristic</div>
        <div className="segmented">
          <button aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>All</button>
          <button aria-pressed={filter==="high"} onClick={()=>setFilter("high")}>High CAGR</button>
          <button aria-pressed={filter==="stable"} onClick={()=>setFilter("stable")}>Consistent</button>
        </div>
      </div>

      <div className="section">
        <div className="pulse-group-head" style={{borderBottom:"1px solid var(--line)"}}>
          <div className="left">
            <span className="group-icon"><Icon name="radar" size={14}/></span>
            <span className="title">Weekly Momentum Picks</span>
            <span className="chip">{PORTFOLIO.weekly.length}</span>
          </div>
          <div className="summary">
            <span style={{color:"var(--ink-3)", fontSize:12}}>Rotating picks based on momentum signals</span>
          </div>
        </div>
        <table className="portfolio-table minimal">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Returns</th>
              <th>Hit Rate</th>
              <th>Avg Gain</th>
              <th>Avg Loss</th>
              <th>Net Avg</th>
              <th>CAGR</th>
              <th>Hold</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filterRows(PORTFOLIO.weekly).map((r,i) => <Row key={i} r={r}/>)}
          </tbody>
        </table>
      </div>

      <div className="section" style={{marginTop: 16}}>
        <div className="pulse-group-head" style={{borderBottom:"1px solid var(--line)"}}>
          <div className="left">
            <span className="group-icon emerald"><Icon name="bar" size={14}/></span>
            <span className="title">ETF Portfolios</span>
            <span className="chip">{PORTFOLIO.etf.length}</span>
          </div>
          <div className="summary">
            <span style={{color:"var(--ink-3)", fontSize:12}}>Passive and tactical ETF strategies</span>
          </div>
        </div>
        <table className="portfolio-table minimal">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Returns</th>
              <th>Hit Rate</th>
              <th>Avg Gain</th>
              <th>Avg Loss</th>
              <th>Net Avg</th>
              <th>CAGR</th>
              <th>Hold</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filterRows(PORTFOLIO.etf).map((r,i) => <Row key={i} r={r}/>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.PortfolioPage = PortfolioPage;
