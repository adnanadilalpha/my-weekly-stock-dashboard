// Data — mirrors the real screenshot content exactly.

// SEGMENT Ticker Page (10)
const SEGMENTS = [
  { name: "S&P500", ticker: "SPY", m1: 8.9, m3: 3.2, vsHigh: -0.2, score: 3.7, rating: "Uptrend", outlook: "Stable" },
  { name: "Nasdaq", ticker: "QQQ", m1: 12.2, m3: 5.2, vsHigh: -2.2, score: 3.3, rating: "Uptrend", outlook: "Stable" },
  { name: "Small Caps", ticker: "IWM", m1: 5.2, m3: 4.4, vsHigh: -2.4, score: 3.3, rating: "Uptrend", outlook: "Stable" },
  { name: "Treasuries", ticker: "TLT", m1: -3.0, m3: -2.3, vsHigh: -7.2, score: 0.8, rating: "Strong Downtrend", outlook: "Stable" },
  { name: "US Dollar fund", ticker: "UUP", m1: -5.0, m3: -2.0, vsHigh: -9.8, score: 0.3, rating: "Strong Downtrend", outlook: "Stable" },
  { name: "Gold", ticker: "GLD", m1: 7.5, m3: 19.0, vsHigh: -0.5, score: 5.0, rating: "Strong Uptrend", outlook: "Stable" },
  { name: "Silver", ticker: "SLV", m1: 34.7, m3: 57.7, vsHigh: -1.4, score: 5.0, rating: "Strong Uptrend", outlook: "Extended" },
  { name: "Bitcoin", ticker: "IBIT", m1: -2.2, m3: -23.3, vsHigh: -31.2, score: 0.2, rating: "Strong Downtrend", outlook: "Stable" },
  { name: "Ethereum", ticker: "ETHA", m1: -1.6, m3: -29.8, vsHigh: -40.0, score: 0.0, rating: "Strong Downtrend", outlook: "Stable" },
  { name: "Oil", ticker: "USO", m1: -1.2, m3: -8.9, vsHigh: -17.7, score: 1.5, rating: "Downtrend", outlook: "Reversing" },
];

// SECTOR Ticker Pages (12)
const SECTORS = [
  { name: "Technology", ticker: "XLK", m1: 3.6, m3: 4.0, vsHigh: -5.3, score: 1.7, rating: "Sideways", outlook: "Stable" },
  { name: "Telecommunication Services", ticker: "XLC", m1: 3.5, m3: -0.4, vsHigh: -2.2, score: 2.7, rating: "Sideways", outlook: "Stable" },
  { name: "Semiconductors", ticker: "SMH", m1: 6.2, m3: 12.2, vsHigh: -4.1, score: 2.7, rating: "Sideways", outlook: "Firming" },
  { name: "Consumer Cyclicals", ticker: "XLY", m1: 6.8, m3: 1.8, vsHigh: -1.3, score: 3.3, rating: "Uptrend", outlook: "Stable" },
  { name: "Financials", ticker: "XLF", m1: 6.8, m3: 3.1, vsHigh: -0.2, score: 3.7, rating: "Uptrend", outlook: "Stable" },
  { name: "Industrials", ticker: "XLI", m1: 4.7, m3: 2.7, vsHigh: -0.8, score: 3.3, rating: "Uptrend", outlook: "Stable" },
  { name: "Energy", ticker: "XLE", m1: -0.6, m3: -1.8, vsHigh: -6.5, score: 0.5, rating: "Sideways", outlook: "Stable" },
  { name: "Materials", ticker: "XLB", m1: 5.4, m3: 1.2, vsHigh: -1.8, score: 4.0, rating: "Strong Uptrend", outlook: "Stable" },
  { name: "Real Estate", ticker: "XLRE", m1: -2.2, m3: -4.6, vsHigh: -8.7, score: 0.8, rating: "Strong Downtrend", outlook: "Stable" },
  { name: "Utilities", ticker: "XLU", m1: -4.3, m3: -1.0, vsHigh: -9.0, score: 0.8, rating: "Strong Downtrend", outlook: "Stable" },
  { name: "Healthcare", ticker: "XLV", m1: 0.0, m3: 13.8, vsHigh: -2.3, score: 3.3, rating: "Uptrend", outlook: "Stable" },
  { name: "Consumer Defensive", ticker: "XLP", m1: 0.7, m3: -1.1, vsHigh: -8.1, score: 1.2, rating: "Downtrend", outlook: "Stable" },
];

// LARGE CAPS Ticker Pages (60) — first 10 shown with full data, rest name/ticker only.
const LARGE_CAPS_FULL = [
  { name: "Nvidia", ticker: "NVDA", m1: 1.4, m3: 4.6, vsHigh: -12.8, score: 3.3, rating: "Uptrend", outlook: "Stable" },
  { name: "Microsoft", ticker: "MSFT", m1: 2.5, m3: -4.8, vsHigh: -12.5, score: 1.7, rating: "Sideways", outlook: "Stable" },
  { name: "Apple", ticker: "AAPL", m1: -1.9, m3: 6.4, vsHigh: -6.2, score: 1.3, rating: "Downtrend", outlook: "Stable" },
  { name: "Alphabet", ticker: "GOOG", m1: -1.5, m3: 26.6, vsHigh: -4.5, score: 3.7, rating: "Uptrend", outlook: "Stable" },
  { name: "Amazon", ticker: "AMZN", m1: 1.8, m3: 4.6, vsHigh: -11.0, score: 2.0, rating: "Sideways", outlook: "Stable" },
  { name: "Meta", ticker: "META", m1: 8.1, m3: -12.3, vsHigh: -16.8, score: 4.0, rating: "Strong Uptrend", outlook: "Stable" },
  { name: "Tesla", ticker: "TSLA", m1: 16.5, m3: 9.9, vsHigh: -2.4, score: 5.0, rating: "Strong Uptrend", outlook: "Stable" },
  { name: "JPMorgan", ticker: "JPM", m1: 9.1, m3: 3.7, vsHigh: -0.2, score: 4.3, rating: "Strong Uptrend", outlook: "Stable" },
  { name: "Walmart", ticker: "WMT", m1: 7.1, m3: 8.5, vsHigh: -5.1, score: 2.5, rating: "Sideways", outlook: "Stable" },
  { name: "Eli Lilly", ticker: "LLY", m1: 0.7, m3: 45.2, vsHigh: -3.1, score: 5.0, rating: "Strong Uptrend", outlook: "Stable" },
];
// Additional names to pad to 60 for the grid
const LARGE_CAPS_NAMES = [
  "Berkshire Hathaway","Visa","Mastercard","UnitedHealth","Johnson & Johnson","ExxonMobil","Procter & Gamble","Home Depot","Costco","Bank of America",
  "AbbVie","Chevron","Pepsi","Oracle","Coca-Cola","Merck","Netflix","Adobe","Salesforce","Cisco",
  "AMD","Qualcomm","Broadcom","Intel","IBM","ServiceNow","Accenture","Disney","McDonald's","Nike",
  "Abbott","Thermo Fisher","Pfizer","Danaher","Goldman Sachs","Morgan Stanley","Wells Fargo","American Express","Boeing","Caterpillar",
  "Union Pacific","FedEx","UPS","Starbucks","Lowe's","Target","Deere","Honeywell","3M","GE",
];
const LARGE_TICKERS = ["BRK.B","V","MA","UNH","JNJ","XOM","PG","HD","COST","BAC","ABBV","CVX","PEP","ORCL","KO","MRK","NFLX","ADBE","CRM","CSCO","AMD","QCOM","AVGO","INTC","IBM","NOW","ACN","DIS","MCD","NKE","ABT","TMO","PFE","DHR","GS","MS","WFC","AXP","BA","CAT","UNP","FDX","UPS","SBUX","LOW","TGT","DE","HON","MMM","GE"];
const LARGE_CAPS_EXTRA = LARGE_CAPS_NAMES.map((name, i) => {
  const seed = (name.charCodeAt(0) + i) % 10;
  const m1 = [4.2,-2.1,6.7,-0.5,3.1,8.3,-3.2,1.4,5.9,-1.8][seed];
  const m3 = [7.5,-5.3,12.1,2.0,1.1,14.2,-6.5,3.8,9.3,-2.6][seed];
  const vsHigh = [-1.5,-6.2,-3.1,-8.4,-2.9,-0.7,-14.2,-4.8,-1.9,-10.3][seed];
  const score = [3.3,1.2,4.0,2.0,2.5,4.3,0.8,3.0,3.7,1.5][seed];
  const rating = score >= 4 ? "Strong Uptrend" : score >= 3 ? "Uptrend" : score >= 2 ? "Sideways" : score >= 1 ? "Downtrend" : "Strong Downtrend";
  return { name, ticker: LARGE_TICKERS[i] || name.slice(0,4).toUpperCase(), m1, m3, vsHigh, score, rating, outlook: "Stable" };
});
const LARGE_CAPS = [...LARGE_CAPS_FULL, ...LARGE_CAPS_EXTRA];

// Portfolio Performance rows
const PORTFOLIO = {
  weekly: [
    { name: "COMBINED PERFORMANCE", start: "1/1/2019", returns: 1085.1, hit: 58.3, avgGain: 3.4, avgLoss: -1.9, netAvg: 0.7, cagr: 35, hold: 5, access: "—" },
    { name: "Dow Jones 30",         start: "1/1/2019", returns: 641.3,  hit: 60.7, avgGain: 2.7, avgLoss: -1.9, netAvg: 0.6, cagr: 32, hold: 5, access: "Access Here" },
    { name: "US Large Caps",        start: "1/1/2025", returns: 63.5,   hit: 54.8, avgGain: 4.7, avgLoss: -3.0, netAvg: 1.2, cagr: 46, hold: 5, access: "Access Here" },
    { name: "Nasdaq 100",           start: "1/1/2026", returns: 150.6,  hit: 75.0, avgGain: 8.8, avgLoss: -2.6, netAvg: 6.0, cagr: 1,  hold: 5, access: "Access Here" },
  ],
  etf: [
    { name: "Macro ETF",    start: "11/1/2023", returns: 44.8, hit: 40.0, avgGain: 23.6, avgLoss: -9.8,  netAvg: 10.1, cagr: 16, hold: 231, access: "Access Here" },
    { name: "Macro 2-3xETF",start: "11/1/2023", returns: 71.5, hit: 39.7, avgGain: 31.1, avgLoss: -14.4, netAvg: 11.3, cagr: 25, hold: 218, access: "Access Here" },
  ],
};

const GROUPS = [
  { key: "segments", title: "SEGMENT Ticker Page", items: SEGMENTS, count: 10 },
  { key: "sectors", title: "SECTOR Ticker Pages", items: SECTORS, count: 12 },
  { key: "large", title: "LARGE CAPS Ticker Pages", items: LARGE_CAPS, count: 60 },
];

window.DATA = { SEGMENTS, SECTORS, LARGE_CAPS, GROUPS, PORTFOLIO };
