// On-Demand Pulse — TickerPage with a dropdown to switch tickers.

function OnDemandPage({ onPickTicker }) {
  const { SEGMENTS, SECTORS, LARGE_CAPS } = window.DATA;
  const all = [...SEGMENTS, ...SECTORS, ...LARGE_CAPS];
  const [ticker, setTicker] = useState("SPY");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const groups = [
    { label: "Segments", items: SEGMENTS },
    { label: "Sectors", items: SECTORS },
    { label: "Large Caps", items: LARGE_CAPS },
  ];

  const filteredGroups = q ? groups.map(g => ({ ...g, items: g.items.filter(x => x.name.toLowerCase().includes(q.toLowerCase()) || x.ticker.toLowerCase().includes(q.toLowerCase())) })).filter(g => g.items.length) : groups;

  const current = all.find(x => x.ticker === ticker) || all[0];

  return (
    <div className="page fade-in" style={{paddingTop: 20}}>
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom: 20, flexWrap:"wrap"}}>
        <div style={{fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase", color:"var(--ink-3)", fontWeight:600}}>On-Demand Pulse Check</div>
        <div style={{position:"relative"}}>
          <button className="btn" onClick={()=>setOpen(!open)} style={{minWidth: 320, justifyContent:"space-between"}}>
            <span style={{display:"flex", alignItems:"center", gap:10}}>
              <span className="asset-icon" style={{width:24, height:24, fontSize:10}}>{current.ticker.slice(0,2)}</span>
              <span style={{fontWeight:600}}>{current.name}</span>
              <span style={{fontFamily:"var(--mono)", color:"var(--ink-3)", fontSize:12}}>{current.ticker}</span>
            </span>
            <Icon name="chevron-down" size={14}/>
          </button>
          {open && (
            <>
              <div style={{position:"fixed", inset:0, zIndex:30}} onClick={()=>setOpen(false)}/>
              <div className="card" style={{position:"absolute", top:"calc(100% + 6px)", left:0, width:420, maxHeight: 480, display:"flex", flexDirection:"column", zIndex:31, boxShadow:"var(--shadow-lg)", padding:0, overflow:"hidden"}}>
                <div style={{padding:10, borderBottom:"1px solid var(--line)"}}>
                  <input autoFocus className="picker-search" placeholder="Search tickers…" value={q} onChange={e=>setQ(e.target.value)} style={{margin:0}}/>
                </div>
                <div style={{overflowY:"auto", padding:6}}>
                  {filteredGroups.map(g => (
                    <div key={g.label}>
                      <div style={{fontSize:10.5, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--ink-3)", fontWeight:700, padding:"10px 10px 6px"}}>{g.label}</div>
                      {g.items.map(it => (
                        <button key={it.ticker} className="ticker-pill" style={{width:"100%"}} onClick={()=>{setTicker(it.ticker); setOpen(false); setQ("");}}>
                          <span className="nm">
                            <span className={`dot ${it.score>=3?"emerald":it.score>=2?"amber":"rose"}`} style={{width:7, height:7, borderRadius:"50%", background: it.score>=3?"var(--emerald)":it.score>=2?"oklch(0.72 0.15 75)":"var(--rose)"}}/>
                            {it.name} <span className="sym">{it.ticker}</span>
                          </span>
                          <span className={`trend-chip ${it.m1>=0?"up":"down"}`} style={{fontFamily:"var(--mono)"}}>{it.m1>=0?"+":""}{it.m1.toFixed(1)}%</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {filteredGroups.length === 0 && <div style={{padding:20, textAlign:"center", color:"var(--ink-3)", fontSize:13}}>No tickers match "{q}"</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <TickerPage ticker={ticker} onBack={null}/>
    </div>
  );
}

window.OnDemandPage = OnDemandPage;
