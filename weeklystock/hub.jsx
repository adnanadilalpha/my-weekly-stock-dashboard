// Home hub — modal-based customization, drag reorder, personalized tickers.

const ALL_SECTIONS = {
  quick:    { label: "Quick Cards (Read Me / On-Demand / Dashboard)",  meta: "3 cards" },
  personal: { label: "Your Tickers",                        meta: "up to 20" },
  segments: { label: "SEGMENT Ticker Page",                            meta: "10 tickers" },
  sectors:  { label: "SECTOR Ticker Pages",                            meta: "12 tickers" },
  large:    { label: "LARGE CAPS Ticker Pages",                        meta: "60 tickers" },
};

const DEFAULT_ORDER = ["quick", "personal", "segments", "sectors", "large"];

function HubPage({ onNavigate, onPickTicker, prefs, setPrefs }) {
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const { SEGMENTS, SECTORS, LARGE_CAPS } = window.DATA;

  const allItems = [...SEGMENTS, ...SECTORS, ...LARGE_CAPS];
  const filtered = q ? allItems.filter(x =>
    x.name.toLowerCase().includes(q.toLowerCase()) ||
    x.ticker.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8) : [];

  const order = prefs.order && prefs.order.length ? prefs.order : DEFAULT_ORDER;
  const hidden = prefs.hidden || {};
  const personalTickers = prefs.personalTickers || [];
  const personalSet = new Set(personalTickers.map(t => t.ticker));

  const visibleOrder = order.filter(k => ALL_SECTIONS[k] && !hidden[k]);

  const renderSection = (key) => {
    if (key === "quick") return <QuickCards key="quick" onNavigate={onNavigate} />;
    if (key === "personal") return personalTickers.length > 0 ? (
      <GroupCard key="personal" icon="sparkles" iconCls="violet-bg" title="Your Tickers"
        countLabel={`${personalTickers.length}/20`} items={personalTickers.map(t => {
          const match = allItems.find(x => x.ticker === t.ticker);
          return match || { name: t.name, ticker: t.ticker, score: 3, m1: 0 };
        })} onPickTicker={onPickTicker} />
    ) : null;
    if (key === "segments") return <GroupCard key="segments" icon="layers" iconCls="" title="SEGMENT Ticker Page" countLabel="10" items={SEGMENTS} onPickTicker={onPickTicker} compact/>;
    if (key === "sectors") return <GroupCard key="sectors" icon="bar" iconCls="emerald" title="SECTOR Ticker Pages" countLabel="12" items={SECTORS} onPickTicker={onPickTicker} compact/>;
    if (key === "large") return <GroupCard key="large" icon="sparkles" iconCls="amber" title="LARGE CAPS Ticker Pages" countLabel="60" items={LARGE_CAPS} onPickTicker={onPickTicker} showAllFooter/>;
    return null;
  };

  // Render segments+sectors side-by-side if both are adjacent in visibleOrder
  const rendered = [];
  let i = 0;
  while (i < visibleOrder.length) {
    const k = visibleOrder[i];
    const next = visibleOrder[i+1];
    if ((k === "segments" && next === "sectors") || (k === "sectors" && next === "segments")) {
      rendered.push(
        <div className="groups-row" key={`row-${i}`}>
          {renderSection(k)}
          {renderSection(next)}
        </div>
      );
      i += 2;
    } else {
      rendered.push(renderSection(k));
      i += 1;
    }
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">MWS's Momentum Pulse Check</h1>
          <p className="page-subtitle">Market Analysis Dashboard · updated 12/24/2025</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setModalOpen(true)}>
            <Icon name="sliders-ui" size={14}/> Customize
          </button>
          <button className="btn"><Icon name="refresh" size={14}/> Refresh</button>
        </div>
      </div>

      <div style={{position:"relative", marginBottom: 24}}>
        <div className="search-wrap">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input className="search" placeholder="Search all tickers, segments, sectors, and large caps…" value={q} onChange={e => setQ(e.target.value)}/>
          <div className="search-kbd"><span className="kbd">⌘</span><span className="kbd">K</span></div>
        </div>
        {filtered.length > 0 && (
          <div className="card" style={{position:"absolute", top: 60, left: 0, right: 0, padding: 6, zIndex: 10, boxShadow: "var(--shadow-lg)"}}>
            {filtered.map(item => (
              <button key={item.ticker} className="ticker-pill" style={{width:"100%", marginBottom: 2}} onClick={()=>onPickTicker(item.ticker)}>
                <span className="nm">
                  <span className="asset-icon" style={{width:26, height:26, fontSize:10}}>{item.ticker.slice(0,2)}</span>
                  {item.name} <span className="sym">{item.ticker}</span>
                </span>
                <span className={`trend-chip ${item.m1>=0?"up":"down"}`} style={{fontFamily:"var(--mono)"}}>
                  {item.m1>=0?"+":""}{item.m1.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="groups-col">
        {rendered}
      </div>

      {modalOpen && (
        <CustomizeModal prefs={prefs} setPrefs={setPrefs} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}

function QuickCards({ onNavigate }) {
  return (
    <div className="quicks">
      <button className="quick" onClick={() => onNavigate("readme")}>
        <span className="quick-ico amber"><Icon name="book" size={18}/></span>
        <div className="quick-body">
          <div className="quick-title">Read Me</div>
          <div className="quick-sub">1-page explanation of the Pulse Check tool</div>
        </div>
        <Icon name="chevron-right" size={16} className="quick-chev"/>
      </button>
      <button className="quick" onClick={() => onNavigate("pulse")}>
        <span className="quick-ico"><Icon name="radar" size={18}/></span>
        <div className="quick-body">
          <div className="quick-title">On-Demand Pulse Check</div>
          <div className="quick-sub">Pull up the detailed Momentum Pulse. Heck for one the 70+ ticker covered in the app.</div>
        </div>
        <Icon name="chevron-right" size={16} className="quick-chev"/>
      </button>
      <button className="quick" onClick={() => onNavigate("dashboard")}>
        <span className="quick-ico emerald"><Icon name="grid" size={18}/></span>
        <div className="quick-body">
          <div className="quick-title">Dashboard</div>
          <div className="quick-sub">Summary Performance / Trend across Market Segments and Sectors</div>
        </div>
        <Icon name="chevron-right" size={16} className="quick-chev"/>
      </button>
    </div>
  );
}

function GroupCard({ icon, iconCls, title, countLabel, items, onPickTicker, compact, showAllFooter }) {
  const limit = showAllFooter ? 12 : items.length;
  return (
    <div className="group-card-wide">
      <div className="group-wide-head">
        <div className="title">
          <span className={`group-icon ${iconCls}`}><Icon name={icon} size={15}/></span>
          {title}
        </div>
        <span className="count">{countLabel}</span>
      </div>
      <div className="ticker-grid-wide">
        {items.slice(0, limit).map(it => (
          <button key={it.ticker} className="ticker-pill-wide" onClick={()=>onPickTicker(it.ticker)}>
            <span className="pill-body">
              <span className={`dot ${it.score>=3?"emerald":it.score>=2?"amber":"rose"}`}/>
              <span className="name">{it.name}</span>
            </span>
          </button>
        ))}
      </div>
      {showAllFooter && items.length > 12 && (
        <div style={{padding:"14px 22px", borderTop:"1px dashed var(--line)", textAlign:"center"}}>
          <button className="btn ghost" style={{fontSize:13}} onClick={()=>onPickTicker(items[0].ticker)}>
            View all {items.length} tickers <Icon name="arrow-right" size={13}/>
          </button>
        </div>
      )}
    </div>
  );
}

function CustomizeModal({ prefs, setPrefs, onClose }) {
  const [tab, setTab] = useState("sections");
  const [search, setSearch] = useState("");
  const { SEGMENTS, SECTORS, LARGE_CAPS } = window.DATA;
  const allItems = [...SEGMENTS, ...SECTORS, ...LARGE_CAPS];

  const order = prefs.order && prefs.order.length ? prefs.order : DEFAULT_ORDER;
  const hidden = prefs.hidden || {};
  const personal = prefs.personalTickers || [];
  const personalSet = new Set(personal.map(t => t.ticker));

  const [dragIdx, setDragIdx] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const onDragStart = (i) => () => setDragIdx(i);
  const onDragOver = (i) => (e) => { e.preventDefault(); setDragOver(i); };
  const onDrop = (i) => (e) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOver(null); return; }
    const next = [...order];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setPrefs({ ...prefs, order: next });
    setDragIdx(null); setDragOver(null);
  };
  const onDragEnd = () => { setDragIdx(null); setDragOver(null); };

  const toggleHidden = (k) => setPrefs({ ...prefs, hidden: { ...hidden, [k]: !hidden[k] } });
  const togglePersonal = (item) => {
    if (personalSet.has(item.ticker)) {
      setPrefs({ ...prefs, personalTickers: personal.filter(t => t.ticker !== item.ticker) });
    } else if (personal.length < 20) {
      setPrefs({ ...prefs, personalTickers: [...personal, { ticker: item.ticker, name: item.name }] });
    }
  };

  const pickerItems = search
    ? allItems.filter(x => x.name.toLowerCase().includes(search.toLowerCase()) || x.ticker.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Customize dashboard</h2>
            <p>Reorder and toggle sections · add up to 20 personalized tickers</p>
          </div>
          <button className="btn icon" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>

        <div className="modal-tabs">
          <button className="modal-tab" aria-selected={tab==="sections"} onClick={()=>setTab("sections")}>Sections & Order</button>
          <button className="modal-tab" aria-selected={tab==="personal"} onClick={()=>setTab("personal")}>Personalized Tickers ({personal.length}/20)</button>
        </div>

        <div className="modal-body">
          {tab === "sections" && (
            <>
              <p style={{fontSize:12.5, color:"var(--ink-3)", margin:"4px 0 14px"}}>Drag to reorder. Toggle to show / hide.</p>
              <div className="reorder-list">
                {order.map((k, i) => (
                  <div key={k}
                    className={`reorder-row ${dragIdx===i?"dragging":""} ${dragOver===i&&dragIdx!==i?"drag-over":""}`}
                    draggable
                    onDragStart={onDragStart(i)}
                    onDragOver={onDragOver(i)}
                    onDrop={onDrop(i)}
                    onDragEnd={onDragEnd}>
                    <svg className="grip" width="12" height="18" viewBox="0 0 12 18" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>
                    <div style={{flex:1}}>
                      <div className="label">{ALL_SECTIONS[k].label}</div>
                      <div className="meta">{ALL_SECTIONS[k].meta}</div>
                    </div>
                    <button className="switch" aria-pressed={!hidden[k]} onClick={()=>toggleHidden(k)}/>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "personal" && (
            <>
              <p style={{fontSize:12.5, color:"var(--ink-3)", margin:"4px 0 10px"}}>
                Select up to 20 tickers to appear at the top of your dashboard. Drag the section above to change its position.
              </p>
              <input className="picker-search" placeholder="Search tickers by name or symbol…" value={search} onChange={e=>setSearch(e.target.value)}/>
              <div className="picker-grid">
                {pickerItems.map(item => {
                  const on = personalSet.has(item.ticker);
                  const disabled = !on && personal.length >= 20;
                  return (
                    <button key={item.ticker} className="picker-chip" aria-pressed={on}
                      disabled={disabled} onClick={()=>togglePersonal(item)}
                      style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : {}}>
                      <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{item.name}</span>
                      <span className="tk">{item.ticker}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={() => setPrefs({ ...prefs, order: DEFAULT_ORDER, hidden: {}, personalTickers: [] })}>Reset</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

window.HubPage = HubPage;
