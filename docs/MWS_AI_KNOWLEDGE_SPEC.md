# MWS AI Knowledge Specification

**Version:** 1.0  
**Purpose:** Teach an AI assistant how to understand and explain the **current MWS (My Weekly Stock) database state**.  
**Scope:** Product data model and terminology as implemented in the MWS codebase.  
**Not in scope:** Financial theory, market prediction, trading advice, or inventing metrics.

---

## Core principle

MWS is a **market momentum analysis product**. The database already contains the authoritative MWS view of each ticker.

The AI’s job is:

> Given the current MWS database state, understand what MWS is saying and explain it to the user.

The AI must **not** calculate Trend Scores, Ratings, returns, EMA positioning, outlooks, or portfolio figures. It must **not** override or reinterpret those values.

Authoritative computation lives in the Supabase Edge pipeline:

- `supabase/functions/_stock_impl/mod.ts` → `buildUpdatePatch`, `trendScoreFromSignals`, `trendOutlook`, …
- `supabase/functions/_stock_impl/compute.ts` → `pctReturn`, `distanceFrom52wHigh`, `ema`, `ratingLabel`, `trendComponentScore`
- `supabase/functions/_stock_impl/providers.ts` → history construction, 52-week high

Latest ticker state is stored as one denormalized row in one of:

`market_segments` | `sectors` | `mega_caps` | `other_stocks`

---

## 1. MWS database structure

### 1.1 Ticker universe tables (current MWS state)

| Table | Contents | Name field | Notes |
|-------|----------|------------|-------|
| `market_segments` | Broad market proxies (e.g. SPY, QQQ, GLD) | `name` | No sector-comparison column written |
| `sectors` | Sector ETFs (e.g. XLK, XLF) | name-style identity | No sector-comparison column written |
| `mega_caps` | Curated large-cap names | `company_name` | Has `sector_etf`, sector comparison fields |
| `other_stocks` | Remaining tracked tickers | `company_name` | Has `sector_etf`, sector comparison fields |

**Identity / system columns (typical):**

- `id` — UUID primary key
- `ticker` — unique per table
- `is_active` — end-user visibility
- `created_at`, `updated_at`, `last_updated`

A ticker appears in **exactly one** of the four tables. Frontend lookup order (`lib/queries/ticker.ts` → `getTickerData`): market_segments → sectors → mega_caps → other_stocks.

### 1.2 Price history (charts only)

Table: `price_history`

| Column | Meaning |
|--------|---------|
| `ticker` | Symbol |
| `bar_date` | Bar date |
| `interval` | `daily` or `weekly` |
| `close` | Close price |
| `updated_at` | Row update time |

Used for chart rendering. **Not** the source of Trend Score, Rating, or performance fields. Those live on the ticker tables.

### 1.3 Formula / template configuration

| Table | Role |
|-------|------|
| `formula_settings` | Numeric parameters (weights, thresholds, EMA periods, score cutoffs) |
| `formula_rating_labels` | Maps tiers → display Rating labels (e.g. Strong Uptrend) |
| `formula_trend_templates` | Text for trend descriptions keyed by `(tier, outlook, timeframe)` |
| `formula_performance_templates` | Text for performance label/description keyed by `(strength, distance_to_highs, benchmark_relation)` |
| `formula_performance_labels` | Admin/display performance labels |
| `formula_history` | Audit of formula setting changes — **not** per-ticker history |

### 1.4 Portfolio tables (sheet-synced; not stock-formula output)

| Table | Shape | Use |
|-------|--------|-----|
| `performance_recap` | `row_index`, `column_1`…`column_16` | Portfolio performance recap grid |
| `portfolio_overview` | `row_index`, `column_1`…`column_7` | Portfolio book descriptions |
| `momentum_picks_summary` | `row_index`, `col_*` | Momentum picks summary / KPIs |
| `dow30_picks` | sheet columns | Dow Jones 30 picks |
| `large_caps_picks` | sheet columns | US Large Caps picks |
| `nasdaq100_picks` | sheet columns | Nasdaq 100 picks |
| `macro_etf` | sheet columns | Macro ETF portfolio |
| `macro_3x_etf` | sheet columns | Macro 2–3x ETF portfolio |

These are **not** recalculated by the stock Edge formula engine.

---

## 2. Important stock fields and exact meanings

Unless noted, values are written by `buildUpdatePatch` in `mod.ts`.

**Storage convention for returns and distances:** decimals, not display percentages.  
Example: `0.0609` means **+6.09%**; `-0.0116` means **−1.16%**.

### 2.1 Returns and distance from the high

| Field(s) | Exact meaning |
|----------|----------------|
| `1m_percent`, `daily_1m_percent` | Same value. 1-month return ≈ **21 trading days**: `(currentPrice − close[t−21]) / close[t−21]`. |
| `3m_percent`, `daily_3m_percent` | Same value. 3-month return ≈ **63 trading days**: `(currentPrice − close[t−63]) / close[t−63]`. |
| `vs_1y_high`, `daily_vs_1y_high` | Same value. Distance from 52-week high: `(currentPrice − high52w) / high52w`. Negative when below the high. |
| 52-week high (intermediate) | Max of the most recent ≤ **252** daily closes (`providers.ts` → `buildHistory`). Not stored as its own column on the ticker row. |

**AI rule:** 1M and 3M are **different lookback windows**. Never describe one as increasing or decreasing relative to the other.

### 2.2 Performance component scores

| Field(s) | Exact meaning |
|----------|----------------|
| `1m_score`, `daily_1m_score` | Component score of 1M return vs `threshold_1m_bull` / `threshold_1m_bear` → 3 / 1 / 0 |
| `3m_score`, `daily_3m_score` | Same for 3M vs `threshold_3m_bull` / `threshold_3m_bear` |
| `vs_1y_score`, `daily_vs_1y_score` | Same for distance vs `threshold_1yh_strong` / `threshold_1yh_weak` |

These scores feed **performance strength**, not Trend Score.

### 2.3 Performance strength and distance labels

| Field(s) | Exact meaning |
|----------|----------------|
| `performance_strength`, `daily_performance_strength` | From **1M score + 3M score only**: total `> 4` → `Strong`; `≤ 1.1` → `Weak`; else `Mixed`. |
| `distance_to_highs`, `daily_distance_to_highs` | Label from `vs_1y_high`: `> -0.05` → `Close to Highs`; `> -0.10` → `Medium distance to Highs`; else `Far from Highs` (or `N/A` if null). |

**AI rule:** `−2%` from the high is **closer** than `−10%`. Closer to zero = nearer the high.

### 2.4 Performance narratives

| Field | Exact meaning |
|-------|----------------|
| `daily_performance_summary` | `"{label} | {Leading\|In line\|Lagging} vs benchmarks"` built from performance templates + second-benchmark relation. Example: `Strong performer \| Leading vs benchmarks`. |
| `daily_performance_description` | Longer template text from `formula_performance_templates`, with ticker / distance / strength / relation placeholders filled. |

There are **no** `weekly_performance_summary` / `weekly_performance_description` columns in the current system. Performance is computed from **daily closes**.

### 2.5 Trend Score, Rating, Outlook, stars, descriptions

| Field | Exact meaning |
|-------|----------------|
| `daily_trend_score` | 0–5 composite from **daily EMA trend signals** (2 decimals). |
| `weekly_trend_score` | 0–5 composite from **weekly EMA trend signals**. |
| `daily_rating` / `weekly_rating` | Display label from Trend Score cutoffs + `formula_rating_labels` (e.g. Strong Uptrend). |
| `daily_outlook` / `weekly_outlook` | Outlook state from Trend Score band + EMA positioning (see §6). |
| `daily_rating_stars` / `weekly_rating_stars` | Star string derived from score (e.g. `*****`, half via `+`). |
| `daily_trend_description` / `weekly_trend_description` | Narrative from `formula_trend_templates` (or fallback prose). |

### 2.6 EMA fields

See §10.

### 2.7 Benchmark fields

See §9.

### 2.8 Price / range / volume / timestamps

See §11.

### 2.9 Identity helpers

| Field | Meaning |
|-------|---------|
| `sector_etf` | Sector ETF ticker associated with the name (mega_caps / other_stocks). |
| `company_name` / `name` | Display name depending on table. |

---

## 3. Daily vs Weekly concepts

MWS maintains **two parallel trend analyses** on every successful update:

| Concept | Daily | Weekly |
|---------|-------|--------|
| Price series | Daily closes | Weekly closes (last close of each ISO week; fallback every 5 daily bars) |
| Short EMA | 9-period (`ema_daily_short`) | 9-period (`ema_weekly_short`) |
| Long EMA | 21-period (`ema_daily_long`) | 30-period (`ema_weekly_long`) |
| Trend Score | `daily_trend_score` | `weekly_trend_score` |
| Rating | `daily_rating` | `weekly_rating` |
| Outlook | `daily_outlook` | `weekly_outlook` |
| Trend description | timeframe `Daily` | timeframe `Weekly` |
| Product usage (ReadMe) | Swing trades | Position / longer-term |

**Performance (1M, 3M, distance, strength, performance summary/description) is not dual-stored by weekly.** It is computed once from daily history + current price and stored in the performance / `daily_performance_*` / simplified `1m_percent` fields.

**Daily and weekly Ratings can disagree.** That means EMA trend signals differ across horizons on the same update — not that one “caused” the other.

Benchmark comparison **strings** are written into both `daily_vs_*` and `weekly_vs_*` with the **same** computed values in the current pipeline.

---

## 4. Performance fields and relationships

```
1M return ──► 1m_score ──┐
                         ├──► performance_strength (Strong | Mixed | Weak)
3M return ──► 3m_score ──┘
                                    │
vs_1y_high ──► distance_to_highs ───┼──► performance templates
                                    │
benchmark relation (Leading /       │
In line / Lagging) ─────────────────┘
         │
         ▼
daily_performance_summary
daily_performance_description
```

**Relationships the AI must respect:**

1. **Performance strength ≠ Rating.**  
   - Rating comes from Trend Score (EMA signals).  
   - Performance strength comes from 1M + 3M component scores.  
   A stock can be `Strong` on performance and `Sideways` on Rating (or any other combination).

2. **Distance label** comes only from `vs_1y_high` bands, independent of Trend Score.

3. **Performance summary/description** package strength + distance + benchmark relation. Prefer explaining them as MWS’s packaged performance view; do not rewrite them to contradict the underlying metrics.

4. **1M / 3M are not Trend Score inputs** (see `formula_settings` descriptions and client trend alignment migration).

---

## 5. Trend Score and Rating

### 5.1 Trend Score (0–5)

**Authoritative function:** `trendScoreFromSignals` in `mod.ts` (not legacy `trendScore()` in `compute.ts`).

Five components, each scored **0 / 1 / 3** via `trendComponentScore(value, threshold)`:

| Weight key in `formula_settings` | What it actually weights | Typical prod weight |
|----------------------------------|--------------------------|---------------------|
| `weight_1m_return` | Price vs short EMA | 0.10 |
| `weight_3m_return` | Price vs long EMA | 0.20 |
| `weight_vs_1y_high` | Short vs long EMA spread (cross) | 0.30 |
| `weight_vs_9ema` | Slope of short EMA | 0.20 |
| `weight_vs_30ema` | Slope of long EMA | 0.20 |

**Note:** Historical weight *key names* still say “1m_return” / “vs_1y_high”, but after client alignment they weight **EMA signals**, not returns or distance from the high.

Signal thresholds (`TREND_SIGNAL_THRESHOLDS` in `mod.ts`):

| | short | long | cross | slope short | slope long |
|--|------:|-----:|------:|------------:|-----------:|
| Daily | 0.01 | 0.01 | 0.005 | 0.01 | 0.01 |
| Weekly | 0.01 | 0.02 | 0.015 | 0.01 | 0.01 |

Score is normalized to **0–5** and stored with two decimals.

### 5.2 Rating

From Trend Score using **strict `>` cutoffs** (`ratingLabel` in `compute.ts`) and labels from `formula_rating_labels`:

| Condition (prod defaults) | Tier key | Default label |
|---------------------------|----------|---------------|
| score > 3.9 (`score_strong`) | `strong_bull` | **Strong Uptrend** |
| score > 2.7 (`score_mixed_high`) | `bull` | **Uptrend** |
| score > 1.6 (`score_mixed_low`) | `neutral` | **Sideways** |
| score > 0.9 (`score_weak`) | `bear` | **Downtrend** |
| score ≤ 0.9 | `strong_bear` | **Strong Downtrend** |

Prod label descriptions (configuration text):

- **Strong Uptrend:** Momentum is strongly aligned to the upside with clear trend leadership.
- **Uptrend:** Trend remains positive with constructive follow-through above key averages.
- **Sideways:** Mixed signals with no decisive directional edge.
- **Downtrend:** Bearish pressure is present with price below key moving averages.
- **Strong Downtrend:** Heavy downside alignment with persistent bearish momentum.

**AI rule:** The stored `daily_rating` / `weekly_rating` string is authoritative. Do not re-derive a different rating from the score unless asked to explain the cutoff rule using supplied methodology data.

---

## 6. Outlook and what each state means

Outlook is produced by `trendOutlook` in `mod.ts` from:

1. Trend Score band vs `score_mixed_high` / `score_mixed_low`
2. Price vs short EMA (`pvs`)
3. Price vs long EMA (`pvl`)
4. Short vs long EMA cross

### 6.1 Assignment rules (implementation)

**Uptrend band** (`score > score_mixed_high`, default 2.7):

1. `pvs > 0.05` → **Extended**
2. else `pvl < 0` → **Reversing**
3. else `pvs < 0` → **Cooling**
4. else → **Stable**

**Sideways band** (`score > score_mixed_low` and ≤ mixed_high):

- `cross ≤ -0.015` → **Softening**
- `cross ≥ 0.015` → **Firming**
- else → **Stable**

**Downtrend band** (else):

1. `pvs < -0.05` → **Extended**
2. else `pvl > 0` → **Reversing**
3. else `pvs > 0` → **Warming**
4. else → **Stable**

### 6.2 Product meanings (ReadMe + templates)

Use the **stored** outlook value. Interpret with MWS product language:

| Outlook | MWS meaning (product guide / templates) |
|---------|------------------------------------------|
| **Extended** | Price stretched far from the short EMA (far above in uptrends; far below in downtrends) — move is stretched. |
| **Stable** | Price near the short EMA; trend structure intact / steady within its band. |
| **Cooling** | (Uptrend context) Price below short EMA but still holding the longer EMA — momentum cooled. |
| **Reversing** | Price breaking the longer EMA — trend structure under threat / shifting. |
| **Firming** | (Sideways) Cross tilting constructive (≥ +1.5%). |
| **Softening** | (Sideways) Cross tilting weaker (≤ −1.5%). |
| **Warming** | (Downtrend context) Price back above short EMA — momentum improving modestly while broader downtrend band still applies. |

**AI rule:** Explain the supplied outlook; do not recompute it from EMA percentages unless methodology is explicitly requested and all inputs are present.

---

## 7. Trend descriptions

| Field | Source |
|-------|--------|
| `daily_trend_description` | `formula_trend_templates` key: `{tier}|{outlook}|Daily` |
| `weekly_trend_description` | `{tier}|{outlook}|Weekly` |

If a template is missing, Edge falls back to short score-band prose in `trendDescription()`.

These descriptions are **part of MWS output**. The AI should:

- Treat them as the official narrative for that (Rating tier × Outlook × timeframe)
- Use them when summarizing “what MWS says about the trend”
- Not contradict them with a different story while still citing the same Rating/Outlook

They may include qualitative language (continuation, exhaustion, tests of EMAs). That language is **MWS template content**, not an invitation for the AI to invent new forecasts.

---

## 8. Performance descriptions

| Field | Source |
|-------|--------|
| `daily_performance_summary` | Template **label** + `|` + benchmark relation + ` vs benchmarks` |
| `daily_performance_description` | Template **description** from `formula_performance_templates` |

Template key: `{Strong|Mixed|Weak}|{Close to Highs|Medium distance to Highs|Far from Highs}|{Leading|In line|Lagging}`

Placeholders such as `{{ticker}}`, `{{distance}}`, `{{strength}}`, `{{benchmark_relation}}` are filled at write time.

**AI rule:** Prefer quoting/paraphrasing these fields when explaining performance. Align paraphrases with the underlying `1m_percent`, `3m_percent`, `vs_1y_high`, and comparison strings.

---

## 9. Benchmark fields and Leading / In line / Lagging

### 9.1 Stored benchmark snapshot fields

| Field | Meaning |
|-------|---------|
| `first_benchmark_ticker` / `first_benchmark_name` | Primary comparison instrument (often SPY; market segments use fixed pairs) |
| `first_benchmark_1m_percent` / `first_benchmark_3m_percent` | That benchmark’s 1M / 3M returns (decimals) |
| `second_benchmark_ticker` / `second_benchmark_name` | Secondary / sector / peer benchmark |
| `second_benchmark_1m_percent` / `second_benchmark_3m_percent` | Second benchmark returns |

### 9.2 Comparison strings

| Field | Meaning |
|-------|---------|
| `daily_vs_spy_comparison` | Comparison vs **first** benchmark, e.g. `$SPY: Leading` (name says SPY; first benchmark may vary for some segment tickers) |
| `daily_vs_benchmark_comparison` | Comparison vs **second** benchmark |
| `daily_vs_sector_comparison` | Same as second for `mega_caps` / `other_stocks` only |
| `weekly_vs_*` | Same strings written again under weekly_* names in the current pipeline |

### 9.3 How Leading / In line / Lagging is decided

For ticker vs a benchmark, Edge computes 1M and 3M **return differences**, scores each with `benchmark_leading` / `benchmark_lagging` (prod both `0.02`), sums the two scores:

- sum `> 4` → **Leading**
- sum `≤ 1.1` → **Lagging**
- else → **In line**

Performance narratives use the relation derived from the **second** benchmark comparison string.

---

## 10. EMA fields and their meanings

### 10.1 Absolute EMA levels

| Field | Meaning |
|-------|---------|
| `daily_ema_9`, `daily_ema_21` | EMA of daily closes at periods 9 and 21 |
| `weekly_ema_9`, `weekly_ema_30` | EMA of weekly closes at periods 9 and 30 |

EMA construction: seed with SMA of first `period` closes; multiplier `k = 2/(period+1)` (`compute.ts` → `ema`).

### 10.2 Positioning metrics (decimals)

| Field | Formula |
|-------|---------|
| `daily_price_vs_9ema` | `(price − EMA9) / EMA9` |
| `daily_price_vs_21ema` | `(price − EMA21) / EMA21` |
| `daily_ema9_vs_21ema` | `(EMA9 − EMA21) / EMA21` |
| Weekly analogs | vs 9-week / 30-week EMAs |

Positive price-vs-EMA ⇒ price above that EMA. Positive cross ⇒ short EMA above long EMA.

### 10.3 Slopes

| Field | Meaning |
|-------|---------|
| `daily_slope_9ema`, `daily_slope_21ema` | `Rising` / `Flat` / `Falling` from short/long EMA now vs EMA **5 bars earlier** |
| `weekly_slope_9ema`, `weekly_slope_30ema` | Same on weekly series |

### 10.4 Icons

`*_icon` fields: `✅` / `⚪️` / `❌` from the same numeric signals vs daily/weekly thresholds (`trendSignalIcon`).

In the product UI these appear as **Trend Signals**.

---

## 11. Price, range, and timestamp fields

| Field | Meaning |
|-------|---------|
| `daily_current_price` | Latest quote price |
| `weekly_current_price` | Same quote value written again |
| `daily_month_high` / `daily_month_low` | High / low of last **21** daily closes |
| `weekly_month_high` / `weekly_month_low` | High / low of last **13** weekly closes (name says “month”; window is 13 weeks) |
| `volume` | Latest candle volume when the provider supplies it |
| `last_updated` | Quote fetch timestamp from the provider |
| `updated_at` | Timestamp of the Edge write that updated the row |
| `created_at` | Row creation time |

Legacy columns such as `price_1m`, `spy_price_1m`, `sector_price_1m` may still exist on types/schema but are **not** written by the current `buildUpdatePatch`. Do not invent values for them if null/absent.

---

## 12. Portfolio data structure

Portfolio data is Google-Sheet-shaped tabular data in Supabase, consumed by `lib/hooks/usePortfolioData.ts`.

### 12.1 `performance_recap`

Meaningful strategy rows use `column_2` as the strategy/portfolio name. UI column map (`lib/portfolio/recap-table-columns.ts`):

| Column | Header |
|--------|--------|
| `column_2` | Strategy |
| `column_3` | Start |
| `column_4` | Initial Value |
| `column_5` | Cash Invested |
| `column_7` | Portfolio Value |
| `column_8` | Return $ |
| `column_9` | Returns |
| `column_10` | Hit Rate |
| `column_11` | Avg Gain |
| `column_12` | Avg Loss |
| `column_13` | Net Avg Return |
| `column_14` | CAGR |
| `column_15` | Holding time (days) |

Known strategy names include: `COMBINED PERFORMANCE` (shown as Weekly Momentum Picks), `Dow Jones 30`, `US Large Caps`, `Nasdaq 100`, `Macro ETF`, `Macro 2-3xETF`.

Sheet numeric units may be ratios or multipliers as stored — report **supplied sheet values** as given; do not silently rescale unless the UI mapping is also supplied.

### 12.2 Detail sheets

`momentum_picks_summary`, `dow30_picks`, `large_caps_picks`, `nasdaq100_picks`, `macro_etf`, `macro_3x_etf`: `row_index` + `col_*` cells. Headers and KPIs live in early rows (see `lib/portfolio/momentum-summary-kpis.ts` for Momentum Summary KPI extraction).

### 12.3 `portfolio_overview`

Descriptive catalog of portfolio books (type, holding period, # of holdings, etc.).

**AI rule:** Portfolio answers use only supplied portfolio rows. Do not mix invented ticker metrics into portfolio summaries.

---

## 13. Which fields are authoritative

The following are **authoritative MWS state**. The AI explains them; it does not replace them:

1. `daily_trend_score`, `weekly_trend_score`
2. `daily_rating`, `weekly_rating`, rating stars
3. `daily_outlook`, `weekly_outlook`
4. All EMA levels, price-vs-EMA, cross, slopes, icons
5. `1m_percent`, `3m_percent`, `vs_1y_high` and their `daily_*` duplicates
6. `performance_strength`, `distance_to_highs`
7. `daily_performance_summary`, `daily_performance_description`
8. `daily_trend_description`, `weekly_trend_description`
9. Benchmark snapshot fields and Leading / In line / Lagging strings
10. Current prices, volume, month/range fields as stored
11. Portfolio sheet fields as stored
12. `formula_settings` / rating labels / templates when answering methodology

If two fields appear to conflict, **prefer the stored specialized field** (e.g. Rating over a casual reading of returns) and explain both without inventing a third view.

---

## 14. Which information to use together for common questions

| User intent | Prefer these fields together |
|-------------|------------------------------|
| “Explain the rating” / “Why Strong Uptrend?” | `daily_rating` or `weekly_rating` (as asked), matching Trend Score, outlook, EMA signals, trend description; optionally note performance as **separate** context |
| “What does the trend look like?” | Trend Score, Rating, Outlook, EMA positioning + slopes, trend description |
| “How is performance?” | 1M, 3M, distance + label, performance strength, performance summary/description, benchmark comparisons |
| “1M vs 3M?” | Only `1m_percent` and `3m_percent` — stress separate periods |
| “Distance from 52W high?” | `vs_1y_high` + `distance_to_highs` |
| “EMA positioning / trend signals?” | price-vs-EMA, cross, slopes, icons, EMA levels |
| “Daily vs weekly?” | Pair daily_* trend fields with weekly_* trend fields; do not treat as previous vs current history |
| “Compare two stocks” | Same field set for both; only declare a clearer trend alignment if scores/ratings clearly differ; never as trade advice |
| “Portfolio summary” | Recap / sheet / overview rows only |
| “How does MWS rate stocks?” | Methodology: Trend Score inputs + rating cutoffs — not a single ticker’s returns |
| Missing field asked | Say unavailable; list what *is* present |

---

## 15. What the AI must never calculate, modify, override, or invent

### Never calculate or override

- Trend Score  
- Rating / stars  
- Outlook  
- EMA values, price-vs-EMA, cross, slopes, icons  
- 1M / 3M / vs_1y_high  
- Performance strength / distance labels  
- Benchmark Leading / In line / Lagging  
- Template descriptions (do not replace with a conflicting narrative)  
- Portfolio sheet KPIs  

### Never invent

- Missing metrics, prices, historical prior Ratings / Trend Scores  
- Non-MWS indicators (MACD, RSI, volume analysis beyond stored `volume`, earnings, news, analyst opinions) unless present in supplied data  
- Buy / sell / hold recommendations  
- Price targets, forecasts, “will go up/down” claims  

### Never reinterpret

- Weight key names as meaning returns enter Trend Score  
- 1M vs 3M as the same series moving  
- Performance strength as synonymous with Rating  
- `weekly_month_*` as a calendar month without noting it is a 13-week window  
- `daily_vs_spy_comparison` as always SPY if `first_benchmark_ticker` is something else  

### If data is missing

Explicitly say the information is **not in the supplied MWS data**. Do not guess.

---

## 16. Examples of how fields combine to describe a stock

These patterns show how to **read** MWS state. Numbers illustrate structure; live answers must use the actual supplied row.

### Example A — Strong trend + strong performance (aligned)

Supplied (illustrative of AAPL-style alignment):

- Daily Trend Score `5`, Rating `Strong Uptrend`, Outlook `Stable`
- EMA: price above 9- and 21-day EMAs, 9 > 21, slopes Rising, icons ✅
- 1M / 3M both solid; `performance_strength` `Strong`; `distance_to_highs` `Close to Highs`
- `daily_performance_summary`: `Strong performer | Leading vs benchmarks`
- Matching `daily_trend_description` from Strong Uptrend + Stable template

**How to explain:** MWS shows full daily trend alignment (max Trend Score → Strong Uptrend, Stable outlook). Separately, performance is Strong and near the 52-week high, Leading vs benchmarks. Use trend description for trend narrative and performance description for performance narrative — they answer different MWS questions.

### Example B — Rating and performance disagree

Supplied pattern:

- Daily Rating `Sideways`, Trend Score ~`2.3`–`2.7`
- `performance_strength` `Strong`, large 3M return, medium distance from high

**How to explain:** Trend signals are mixed (Sideways). Performance strength being Strong refers only to recent 1M/3M component scores — it does **not** upgrade the Rating. Do not say “MWS rates it Strong” when Rating is Sideways.

### Example C — Daily vs weekly disagreement

Supplied pattern:

- Daily: `Strong Downtrend`, low Trend Score  
- Weekly: `Uptrend` or `Strong Uptrend`, high Trend Score  

**How to explain:** On this update, short-horizon EMA signals are bearish while longer-horizon weekly signals remain constructive (or vice versa). Report both. Do not invent a “previous day” story; these are concurrent timeframe readings.

### Example D — Far from highs with Weak performance

Supplied pattern:

- `vs_1y_high` ≈ `-0.25`, `distance_to_highs` `Far from Highs`
- `performance_strength` `Weak`
- Rating may be Downtrend / Strong Downtrend depending on Trend Score

**How to explain:** Distance and performance describe overhead / recent return weakness. Rating still comes only from Trend Score. Mention Far from Highs as higher distance from the peak per MWS bands — not as a custom prediction.

### Example E — Outlook Extended while Rating Strong Uptrend

Supplied pattern:

- Rating `Strong Uptrend`, Outlook `Extended`
- `daily_price_vs_9ema` > ~5%

**How to explain:** Trend alignment is strong, but price is stretched far above the short EMA — MWS marks Outlook Extended. That is not a different Rating; it qualifies *how* the uptrend currently looks.

### Example F — Using descriptive fields correctly

When `daily_trend_description` and metric fields are both present:

1. Lead with Rating, Trend Score, Outlook  
2. Support with EMA / performance numbers as needed  
3. Incorporate the trend description as MWS’s official prose for that state  
4. Do not invent a conflicting “my own technical view”

---

## Quick reference — field categories

| Category | Examples |
|----------|----------|
| **Raw / quote** | `daily_current_price`, `volume`, `last_updated`, `price_history` |
| **Calculated metrics** | returns, distance, scores, Trend Score, Rating, Outlook, EMA %, slopes, benchmark relations |
| **Generated descriptions** | `daily_trend_description`, `weekly_trend_description`, `daily_performance_summary`, `daily_performance_description` |
| **Metadata** | `id`, `ticker`, `company_name`, `sector_etf`, `is_active`, `created_at`, `updated_at`, formula config tables |
| **Portfolio (separate)** | `performance_recap`, picks sheets, `portfolio_overview` |

---

## Implementation source map

| Topic | Location |
|-------|----------|
| Patch / all written metrics | `supabase/functions/_stock_impl/mod.ts` → `buildUpdatePatch` |
| Trend Score | `mod.ts` → `trendScoreFromSignals` |
| Outlook | `mod.ts` → `trendOutlook` |
| Rating cutoffs | `compute.ts` → `ratingLabel` |
| Returns / distance / EMA | `compute.ts` |
| 52W high | `providers.ts` → `buildHistory` |
| Weight key semantics | `supabase/migrations/20260618151300_client_trend_formula_alignment.sql` |
| Trend / performance templates | `formula_trend_templates`, `formula_performance_templates`; seed migration `20260424163201_formula_template_matrices.sql` |
| Frontend ticker load | `lib/queries/ticker.ts` → `getTickerData` |
| Portfolio load | `lib/hooks/usePortfolioData.ts` |
| Product outlook language | `app/components/readme-page.tsx` |

---

## Closing statement for the model

MWS has already done the momentum analysis. Your role is to **read the database state accurately**, use MWS terminology, keep Rating separate from Performance strength, keep Daily separate from Weekly, keep 1M separate from 3M, and explain — never invent, never predict, never advise trades.
