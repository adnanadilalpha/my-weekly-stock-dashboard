// Read Me — How to Use the Momentum Pulse

function ReadMePage() {
  const Check = () => <Icon name="check" size={14} color="var(--emerald)"/>;
  const Warn = () => <span style={{display:"inline-flex", alignItems:"center", justifyContent:"center", width:16, height:16, borderRadius:4, background:"var(--amber-soft)", color:"oklch(0.5 0.14 70)", flexShrink:0}}><Icon name="minus" size={10}/></span>;

  return (
    <div className="page fade-in" style={{maxWidth: 900}}>
      <div className="page-header">
        <div>
          <h1 className="page-title">How to Use the Momentum Pulse</h1>
          <p className="page-subtitle">A quick guide to interpreting the dashboard</p>
        </div>
      </div>

      <div className="section">
        <div className="section-body" style={{padding: 28}}>
          <h3 style={{fontSize:12, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--ink-3)", fontWeight:700, margin:"0 0 14px"}}>Objective</h3>
          <p className="copy" style={{margin:0}}>I developed the Momentum Pulse to help navigate markets and ride uptrends with confidence. Built on years of research, it cuts through the noise of price action to answer two key questions: How strong is the momentum? And how sustainable is it?</p>

          <h3 style={{fontSize:12, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--ink-3)", fontWeight:700, margin:"28px 0 14px", borderTop:"1px solid var(--line)", paddingTop:24}}>Framework</h3>

          <h4 style={{fontSize:14.5, fontWeight:600, margin:"0 0 10px"}}>1. Performance</h4>
          <p className="copy" style={{margin:"0 0 8px"}}>1-month and 3-month returns (and vs. sector/market benchmarks).</p>
          <p className="copy" style={{margin:"0 0 8px"}}>Distance from the 1-year high:</p>
          <ul style={{margin:"0 0 0 4px", padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
            <li style={{display:"flex", gap:10, alignItems:"flex-start"}}><Check/><span className="copy" style={{margin:0}}><strong>Close to high (≤5%):</strong> Low overhead resistance → more reliable moves.</span></li>
            <li style={{display:"flex", gap:10, alignItems:"flex-start"}}><Warn/><span className="copy" style={{margin:0}}><strong>Far from high (&gt;10%):</strong> Higher drawdown risk → more resistance levels to clear.</span></li>
          </ul>

          <h4 style={{fontSize:14.5, fontWeight:600, margin:"24px 0 10px"}}>2. Trend Assessment</h4>
          <p className="copy" style={{margin:"0 0 8px"}}><strong>Timeframes:</strong> based on Daily or Weekly chart.</p>
          <p className="copy" style={{margin:"0 0 8px"}}><strong>Key Tools:</strong> Two EMAs, short-term (9-period) and mid-term (21/30-period).</p>
          <p className="copy" style={{margin:"0 0 8px"}}><strong>Trend Rating Criteria (Score: out of 5):</strong></p>
          <ul style={{margin:"0 0 0 4px", padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
            {["9-EMA > 21/30-EMA (most important).","Price above the 9-EMA.","Price above the 21/30-EMA.","9-EMA slope is rising.","21/30-EMA slope is rising."].map((t,i) => (
              <li key={i} style={{display:"flex", gap:10, alignItems:"flex-start"}}><Check/><span className="copy" style={{margin:0}}>{t}</span></li>
            ))}
          </ul>
          <p className="copy" style={{margin:"12px 0 0"}}><strong>Classification:</strong> (Strong) Uptrend, Sideways, (Strong) Downtrend.</p>

          <h4 style={{fontSize:14.5, fontWeight:600, margin:"24px 0 10px"}}>3. Trend Outlook</h4>
          <div style={{display:"flex", flexDirection:"column", gap:10}}>
            {[
              {k:"Extended", v:"Price stretched far above the 9-EMA → consolidation likely."},
              {k:"Stable", v:"Price near 9-EMA → trend intact."},
              {k:"Cooling", v:"Price below the 9-EMA but holding the 21/30 EMA."},
              {k:"Reversing", v:"Price breaking the 21/30-EMA increases risk of trend reversal."},
            ].map(r => (
              <div key={r.k} className="copy" style={{margin:0}}><strong>{r.k}:</strong> {r.v}</div>
            ))}
          </div>

          <h3 style={{fontSize:12, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--ink-3)", fontWeight:700, margin:"28px 0 14px", borderTop:"1px solid var(--line)", paddingTop:24}}>How do I use it?</h3>

          <h4 style={{fontSize:14.5, fontWeight:600, margin:"0 0 10px"}}>1. Timeframes</h4>
          <p className="copy" style={{margin:"0 0 4px"}}><strong>Daily:</strong> Swing trades.</p>
          <p className="copy" style={{margin:0}}><strong>Weekly:</strong> Position/long-term trades.</p>

          <h4 style={{fontSize:14.5, fontWeight:600, margin:"20px 0 10px"}}>2. Buy & Sell</h4>
          <ul style={{margin:"0 0 0 4px", padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
            <li className="copy" style={{margin:0}}><strong>Favorite Setup:</strong> 9-EMA crossing above the 21/30-EMA. Sometimes, I enter early and use the crossover as validation.</li>
            <li className="copy" style={{margin:0}}>Avoid new entries if trend score &gt;4 (especially if extended).</li>
            <li className="copy" style={{margin:0}}>Hold comfortably if trend score &gt;2.5.</li>
          </ul>

          <h4 style={{fontSize:14.5, fontWeight:600, margin:"20px 0 10px"}}>3. Watchouts</h4>
          <ul style={{margin:"0 0 0 4px", padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8}}>
            <li className="copy" style={{margin:0}}>Extended trends can persist (especially in volatile assets: leverage ETFs, crypto, meme stocks). But gravity always kicks in eventually.</li>
            <li className="copy" style={{margin:0}}>Sideways trends are tricky and lower conviction trades.</li>
            <li className="copy" style={{margin:0}}>&gt;10% below 1-year high: Higher fake out risk.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

window.ReadMePage = ReadMePage;
