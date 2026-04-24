// Auth page — two-panel modern fintech intro.

function AuthPage({ onSignIn }) {
  const [email, setEmail] = useState("user@example.com");
  const [sent, setSent] = useState(false);

  const submit = (e) => { e.preventDefault(); if (email) setSent(true); };

  const tickers = [
    { sym: "SPY", d: "+2.3%", pos: true },
    { sym: "GLD", d: "+7.5%", pos: true },
    { sym: "TSLA", d: "+16.5%", pos: true },
    { sym: "BTC", d: "-23.3%", pos: false },
    { sym: "XLF", d: "+6.8%", pos: true },
    { sym: "LLY", d: "+45.2%", pos: true },
  ];

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="brand">
          <span className="brand-mark"><Icon name="logo" size={16} color="white"/></span>
          Pulse
        </div>
        <div className="auth-hero">
          <span className="chip violet" style={{marginBottom: 20}}><Icon name="sparkles" size={11}/> Weekly Momentum · Updated 12/24</span>
          <h1>Read the market at a <em>glance</em>, not a glance and a prayer.</h1>
          <p>A weekly pulse check across segments, sectors and mega-caps — with the signals, trend ratings and levels that matter, in one clean view.</p>
          <div className="auth-ticker">
            {tickers.map(t => (
              <span key={t.sym} className="tk">
                <span>{t.sym}</span>
                <span className={t.pos ? "pos" : "neg"}>{t.d}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="auth-foot">
          <span>© 2026 Pulse Markets</span>
          <span><a href="#">Privacy</a> · <a href="#">Terms</a> · <a href="#">Contact</a></span>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-card">
          {!sent ? (
            <form onSubmit={submit}>
              <h2 style={{margin: "0 0 6px", fontSize: 22, letterSpacing: "-0.02em", fontWeight: 600}}>Welcome back</h2>
              <p style={{margin: "0 0 24px", color: "var(--ink-3)", fontSize: 14}}>Sign in to access your weekly pulse.</p>
              <label className="label">Email address</label>
              <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
              <button type="submit" className="btn violet" style={{width:"100%", justifyContent:"center", marginTop: 18, padding: "12px 14px"}}>
                <Icon name="mail" size={15}/> Send magic link
              </button>
              <div className="callout muted" style={{marginTop: 22}}>
                <Icon name="sparkles" size={14}/>
                <div>
                  <div><strong>Demo accounts</strong></div>
                  <div style={{marginTop: 4, fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.7}}>
                    admin@example.com<br/>test@example.com
                  </div>
                </div>
              </div>
            </form>
          ) : (
            <div className="fade-in">
              <h2 style={{margin: "0 0 6px", fontSize: 22, letterSpacing: "-0.02em", fontWeight: 600}}>Check your inbox</h2>
              <p style={{margin: "0 0 24px", color: "var(--ink-3)", fontSize: 14}}>We sent a magic link to <strong style={{color:"var(--ink)"}}>{email}</strong></p>
              <div className="callout">
                <Icon name="check" size={14}/>
                <div>
                  <div style={{fontWeight: 600, marginBottom: 2}}>Magic link sent</div>
                  <div>Check your email and click the link to sign in.</div>
                </div>
              </div>
              <div className="callout muted" style={{marginTop: 14}}>
                <div>
                  <strong>Demo mode</strong>
                  <div style={{marginTop: 4}}>In production you'd receive a secure email link. For this demo, click below to simulate the click.</div>
                </div>
              </div>
              <button className="btn primary" style={{width:"100%", justifyContent:"center", marginTop: 14, padding: "12px 14px"}} onClick={onSignIn}>
                Simulate magic link click <Icon name="arrow-right" size={14}/>
              </button>
              <button className="btn ghost" style={{width:"100%", justifyContent:"center", marginTop: 6}} onClick={()=>setSent(false)}>
                Try a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.AuthPage = AuthPage;
