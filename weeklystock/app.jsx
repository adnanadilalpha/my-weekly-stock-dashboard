// App shell — nav with Portfolio + MWS Dashboard pills.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentHue": 285,
  "dark": false
}/*EDITMODE-END*/;

function App() {
  const [route, setRoute] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pulse.route")) || { name: "auth" }; }
    catch(e) { return { name: "auth" }; }
  });
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pulse.prefs")) || { hidden: {}, customTickers: [], editing: false }; }
    catch(e) { return { hidden: {}, customTickers: [], editing: false }; }
  });
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => { localStorage.setItem("pulse.route", JSON.stringify(route)); }, [route]);
  useEffect(() => { localStorage.setItem("pulse.prefs", JSON.stringify(prefs)); }, [prefs]);

  useEffect(() => {
    document.documentElement.style.setProperty("--violet", `oklch(0.56 0.21 ${tweaks.accentHue})`);
    document.documentElement.style.setProperty("--violet-soft", `oklch(${tweaks.dark?0.3:0.95} ${tweaks.dark?0.08:0.04} ${tweaks.accentHue})`);
    document.documentElement.setAttribute("data-theme", tweaks.dark ? "dark" : "light");
  }, [tweaks]);

  useEffect(() => {
    const handler = (e) => {
      if (!e.data) return;
      if (e.data.type === "__activate_edit_mode") setTweaksOpen(true);
      if (e.data.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  const updateTweak = (k, v) => {
    setTweaks(t => {
      const next = { ...t, [k]: v };
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*");
      return next;
    });
  };

  const nav = (name, extra={}) => setRoute({ name, ...extra });
  const pickTicker = (ticker) => nav("ticker", { ticker });
  const isAuth = route.name === "auth";

  return (
    <div className="app" data-screen-label={route.name}>
      {!isAuth && (
        <header className="topbar">
          <div className="topnav">
            <button aria-current={route.name==="portfolio"?"page":undefined} onClick={()=>nav("portfolio")}>
              <Icon name="radar" size={13}/> Portfolio
            </button>
            <button aria-current={["hub","pulse","ticker","dashboard","readme"].includes(route.name)?"page":undefined} onClick={()=>nav("hub")}>
              <Icon name="grid" size={13}/> MWS Dashboard
            </button>
          </div>
          <div className="topbar-end">
            <button className="btn ghost" title="Toggle theme" onClick={()=>updateTweak("dark", !tweaks.dark)}>
              <Icon name={tweaks.dark ? "sun" : "moon"} size={15}/>
            </button>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11, color:"var(--ink-3)"}}>Signed in as</div>
              <div style={{fontSize:12.5, color:"var(--ink-2)"}}>saproductionltd8@gmail.com</div>
            </div>
            <button className="btn" onClick={()=>nav("auth")}><Icon name="logout" size={14}/> Sign Out</button>
          </div>
        </header>
      )}

      {route.name === "auth" && <AuthPage onSignIn={() => nav("hub")}/>}
      {route.name === "hub" && <HubPage onNavigate={nav} onPickTicker={pickTicker} prefs={prefs} setPrefs={setPrefs}/>}
      {route.name === "pulse" && <OnDemandPage onPickTicker={pickTicker}/>}
      {route.name === "dashboard" && <PulsePage onPickTicker={pickTicker}/>}
      {route.name === "readme" && <ReadMePage/>}
      {route.name === "ticker" && <TickerPage ticker={route.ticker || "SPY"} onBack={()=>nav("hub")}/>}
      {route.name === "portfolio" && <PortfolioPage onOpen={(k)=>nav("portfolio-detail", {key:k})}/>}
      {route.name === "portfolio-detail" && <PortfolioDetailPage portfolioKey={route.key} onBack={()=>nav("portfolio")}/>}

      <div className={`tweaks ${tweaksOpen?"open":""}`}>
        <h4>Tweaks</h4>
        <div className="tweak-row">
          <span className="lbl">Dark mode</span>
          <button className="switch" aria-pressed={tweaks.dark} onClick={()=>updateTweak("dark", !tweaks.dark)}/>
        </div>
        <div className="tweak-row">
          <span className="lbl">Accent hue</span>
          <div className="swatches">
            {[{h:285,c:"oklch(0.56 0.21 285)"},{h:245,c:"oklch(0.6 0.18 245)"},{h:155,c:"oklch(0.58 0.16 155)"},{h:30,c:"oklch(0.62 0.18 30)"},{h:75,c:"oklch(0.72 0.16 75)"}].map(s => (
              <button key={s.h} aria-pressed={tweaks.accentHue===s.h} onClick={()=>updateTweak("accentHue", s.h)} style={{background: s.c}}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
