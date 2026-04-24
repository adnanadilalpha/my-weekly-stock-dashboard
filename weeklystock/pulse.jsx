// Pulse — full momentum table across groups with sort + filter.

function PulsePage({ onPickTicker }) {
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const { GROUPS } = window.DATA;

  const sortItems = (items) => {
    const mult = sortDir === "desc" ? -1 : 1;
    return [...items].sort((a,b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "number") return (av - bv) * mult;
      return String(av).localeCompare(String(bv)) * mult;
    });
  };

  const applyFilter = (items) => {
    let out = items;
    if (q) {
      const n = q.toLowerCase();
      out = out.filter(x => x.name.toLowerCase().includes(n) || x.ticker.toLowerCase().includes(n));
    }
    if (filter === "up") out = out.filter(x => x.score >= 3);
    if (filter === "down") out = out.filter(x => x.score < 2);
    if (filter === "flat") out = out.filter(x => x.score >= 2 && x.score < 3);
    return out;
  };

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const SortHead = ({ k, children, align }) => (
    <th style={{textAlign: align||"left", cursor:"pointer"}} onClick={()=>toggleSort(k)}>
      <span style={{display:"inline-flex", alignItems:"center", gap:4}}>
        {children}
        {sortKey === k && <Icon name={sortDir==="desc"?"chevron-down":"chevron-down"} size={10} style={{transform: sortDir==="asc"?"rotate(180deg)":""}}/>}
      </span>
    </th>
  );

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Full Pulse</h1>
          <p className="page-subtitle">Performance & trend across all tracked tickers · last updated 12/24/2025</p>
        </div>
        <div className="page-actions">
          <div className="segmented">
            <button aria-pressed={"D"==="D"}>D</button>
            <button aria-pressed={false}>W</button>
          </div>
          <button className="btn"><Icon name="refresh" size={14}/> Refresh</button>
        </div>
      </div>

      <div className="pulse-toolbar">
        <div className="search-wrap" style={{flex:1, maxWidth: 420}}>
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input className="search" style={{padding:"12px 16px 12px 42px", fontSize:13.5}} placeholder="Filter tickers…" value={q} onChange={e=>setQ(e.target.value)}/>
        </div>
        <div className="segmented">
          <button aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>All</button>
          <button aria-pressed={filter==="up"} onClick={()=>setFilter("up")}>Uptrends</button>
          <button aria-pressed={filter==="flat"} onClick={()=>setFilter("flat")}>Sideways</button>
          <button aria-pressed={filter==="down"} onClick={()=>setFilter("down")}>Downtrends</button>
        </div>
      </div>

      <div className="pulse-groups">
        {GROUPS.map(g => {
          const items = applyFilter(sortItems(g.items));
          const upN = g.items.filter(x => x.score >= 3).length;
          const dnN = g.items.filter(x => x.score < 2).length;
          return (
            <div key={g.key} className="pulse-group">
              <div className="pulse-group-head">
                <div className="left">
                  <span className="title">{g.title}</span>
                  <span className="chip">{g.items.length}</span>
                </div>
                <div className="summary">
                  <span><span className="dot emerald"/> {upN} up</span>
                  <span><span className="dot rose"/> {dnN} down</span>
                  <span className="sep"/>
                  <span>Avg <strong className="mono" style={{color:"var(--ink-2)"}}>{(g.items.reduce((s,x)=>s+x.score,0)/g.items.length).toFixed(1)}</strong></span>
                </div>
              </div>
              {items.length === 0 ? (
                <div style={{padding: 40, textAlign:"center", color:"var(--ink-3)", fontSize:13.5}}>No tickers match.</div>
              ) : (
              <table className="pulse-table">
                <thead>
                  <tr>
                    <SortHead k="name">Asset</SortHead>
                    <SortHead k="m1">1-Month</SortHead>
                    <SortHead k="m3">3-Month</SortHead>
                    <SortHead k="vsHigh">vs 1Y High</SortHead>
                    <SortHead k="score">Score</SortHead>
                    <SortHead k="rating">Rating</SortHead>
                    <th>Outlook</th>
                    <th style={{width: 40}}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.ticker} onClick={() => onPickTicker(item.ticker)}>
                      <td>
                        <div className="asset">
                          <div className="asset-icon">{item.ticker.slice(0,2)}</div>
                          <div>
                            <div className="name">{item.name}</div>
                            <div className="sub">{item.ticker}</div>
                          </div>
                        </div>
                      </td>
                      <td><PerfBar val={item.m1} max={20}/></td>
                      <td><PerfBar val={item.m3} max={30}/></td>
                      <td><PerfBar val={item.vsHigh} max={40}/></td>
                      <td><Score value={item.score}/></td>
                      <td><TrendChip rating={item.rating}/></td>
                      <td><OutlookPill outlook={item.outlook}/></td>
                      <td style={{color:"var(--ink-4)"}}><Icon name="chevron-right" size={14}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.PulsePage = PulsePage;
