# MWS AI Training Specification

**Version:** 1.0  
**Depends on:** `docs/MWS_AI_KNOWLEDGE_SPEC.md`  
**Purpose:** Define how to build a supervised fine-tuning (SFT) dataset for Gemma 4B (Soup / QLoRA) so the model can explain current MWS database state.  
**Out of scope for this document:** Generating the dataset files, modifying application code, running fine-tunes.

---

## 0. Non-negotiable boundaries

### 0.1 What training teaches

The model must learn to:

1. Understand MWS terminology and database fields.
2. Understand relationships between MWS fields.
3. Explain the current MWS state naturally.
4. Answer single-ticker questions.
5. Answer multi-ticker comparison questions.
6. Explain Daily vs Weekly.
7. Explain Performance vs Trend.
8. Explain Outlook states.
9. Explain benchmark relationships.
10. Explain portfolio data.
11. Handle missing data correctly.
12. Refuse to invent information not present in the supplied MWS state.
13. Never recalculate or override MWS values.
14. Never turn MWS descriptive fields into predictions or trading advice.

### 0.2 Evaluation set isolation

The existing **~125 MWS evaluation scenarios** (`mws_test_questions_scenarios.*`) are **evaluation-only**.

- Do **not** copy them into training.
- Do **not** paraphrase them as training gold answers.
- Do **not** reuse their exact `id` / prompt templates.
- Use them later to measure post-SFT improvement.

Training examples must be **independently generated** from live MWS rows + `MWS_AI_KNOWLEDGE_SPEC.md`, with distinct wording and ticker/field combinations.

### 0.3 Knowledge vs training

| Artifact | Role |
|----------|------|
| `MWS_AI_KNOWLEDGE_SPEC.md` | Canonical product semantics |
| Training JSONL (future) | Conversational SFT examples that apply those semantics |
| Eval scenarios (existing) | Blind quality measurement |

---

## 1. Training objective (behavioral)

Given a user message that contains:

1. **MWS DATA** — a subset of current authoritative fields for one or more tickers and/or portfolio rows  
2. **QUESTION** — a natural user question  

The assistant must:

- Interpret only the supplied fields  
- Use exact MWS labels (Strong Uptrend, Sideways, Close to Highs, Leading, Extended, …)  
- Keep Performance strength separate from Rating  
- Keep Daily separate from Weekly  
- Keep 1M separate from 3M  
- Prefer packaged narratives (`daily_trend_description`, `daily_performance_summary`, …) when present, without converting them into forecasts or advice  
- Say “not available” when required fields are missing  
- Refuse buy/sell/hold, price targets, RSI/MACD/news inventions  

The assistant must **not**:

- Recompute Trend Score, Rating, Outlook, EMAs, returns, or portfolio KPIs  
- Invent prior historical Ratings when not supplied  
- Frame ticker comparisons as trading recommendations; when scores/ratings clearly differ, only describe which ticker has the stronger supplied MWS trend alignment  

- Treat descriptive templates as license to predict markets  

---

## 2. Canonical record format (JSONL for Soup / QLoRA SFT)

### 2.1 Line schema

Each training line is one JSON object:

```json
{
  "messages": [
    {"role": "system", "content": "<MWS Intelligence system prompt>"},
    {"role": "user", "content": "MWS DATA:\n\n<fields>\n\nQUESTION:\n<natural question>"},
    {"role": "assistant", "content": "<ideal explanation>"}
  ]
}
```

Optional audit-only sidecar (not required for Soup ingest):

```json
{
  "messages": [...],
  "meta": {
    "category": "A_single_ticker_overview",
    "tickers": ["AAPL"],
    "source_tables": ["mega_caps"],
    "split_hint": "train"
  }
}
```

For Soup/QLoRA, ship **messages-only** JSONL unless the trainer explicitly supports extra keys.

### 2.2 System prompt requirements

System content must encode (aligned with Knowledge Spec):

- Role: MWS Intelligence — explain supplied MWS state  
- Authoritative fields list (Trend Score, Rating, Outlook, EMA signals, returns, distance, performance strength, descriptions, benchmarks, portfolio sheets)  
- Hard bans: no recalculation, no invention, no trading advice, no non-MWS indicators  
- Field relationship rules: Performance ≠ Rating; Daily ≠ Weekly; 1M ≠ 3M  

Use one stable system prompt across nearly all examples so the model learns behavior, not prompt-chasing. A small minority of methodology examples may prepend a short `MWS METHODOLOGY:` block in **user** content instead of changing system text.

### 2.3 User content structure

Always:

```text
MWS DATA:

<TICKER or PORTFOLIO BLOCK>

QUESTION:
<question>
```

Rules:

- Put **facts only** in `MWS DATA` — never the answer.  
- Include only fields needed for that example (sparse payloads teach missing-data behavior).  
- Format decimals as MWS stores them **or** as display percentages — but be consistent within a file version. Recommended for readability in SFT: display percentages with one decimal for returns/distance, two for EMA %, keep Trend Score as stored number.  
- Preserve exact Rating / Outlook / distance / strength label strings.

### 2.4 Assistant content structure

- Concise, natural, data-driven (2–6 sentences typical; comparisons/portfolio may be slightly longer)  
- Cite supplied numbers/labels; do not introduce unsupported figures  
- No advice / prediction language except explicit refusals  
- When refusing, still list what *is* available  

### 2.5 Splits

| Split | Share | Notes |
|-------|-------|-------|
| Train | ~90% | Main SFT corpus |
| Validation | ~10% | Early stopping / Soup val loss |
| Eval scenarios | 0% of training | Existing 125 scenarios held out |

Deduplicate by hash of `(user_content, assistant_content)`. Drop near-duplicates that only swap one synonym if answer text is identical.

---

## 3. Training categories

Recommended total after generation: **400–600** high-quality examples (quality > size).  
Rough allocation below; adjust if live data under-represents a Rating/outlook band.

| ID | Category | Target count |
|----|----------|--------------|
| A | Single-ticker overview | 70–90 |
| B | Rating explanation | 40–55 |
| C | Trend / EMA signals | 40–50 |
| D | Performance explanation | 35–45 |
| E | Outlook explanation | 30–40 |
| F | Daily vs Weekly | 35–45 |
| G | Performance vs Trend | 25–35 |
| H | Distance from 52W high | 25–35 |
| I | Benchmark relationships | 25–35 |
| J | Multi-ticker comparison | 35–45 |
| K | Multi-ticker summary | 15–25 |
| L | Portfolio summary | 15–25 |
| M | Methodology (field relationships) | 20–30 |
| N | Missing data | 40–55 |
| O | Anti-hallucination / refusal | 45–60 |
| P | Descriptive-field grounding | 20–30 |

---

## Category A — Single-ticker overview

**Purpose:** Teach natural “what’s going on with this name?” answers that weave trend + performance without collapsing them.

**Input structure:** Full or near-full single-ticker block: Rating, Trend Score, Outlook, 1M, 3M, distance + label, performance strength, key EMA signals, optional summary/description fields, optional vs SPY/sector.

**Question types:**
- “What’s happening with {T}?”
- “Give me a quick MWS read on {T}.”
- “Summarize {T} in MWS terms.”

**Expected answer behavior:**
- Lead with Daily Rating + Trend Score + Outlook (default daily unless asked weekly).  
- Add performance as a separate sentence.  
- Optionally nod to packaged descriptions if present.  
- No advice.

**Example records:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nAAPL:\n  Daily Trend Score: 5\n  Daily Rating: Strong Uptrend\n  Daily Outlook: Stable\n  1M Return: +6.1%\n  3M Return: +12.8%\n  Distance from 52W High: -1.2%\n  Distance label: Close to Highs\n  Performance strength: Strong\n  daily_performance_summary: Strong performer | Leading vs benchmarks\n  Price vs 9-day EMA: +1.68%\n  Price vs 21-day EMA: +3.53%\n  9-day EMA vs 21-day EMA: +1.82%\n  Slope 9-day EMA: Rising\n  Slope 21-day EMA: Rising\n\nQUESTION:\nWhat's happening with AAPL?"},{"role":"assistant","content":"On the daily timeframe, MWS rates AAPL Strong Uptrend with a Trend Score of 5/5 and a Stable outlook. EMA trend signals are aligned: price is above both the 9- and 21-day EMAs, the 9-day EMA is above the 21-day, and both slopes are Rising. Separately, performance is Strong—1M +6.1%, 3M +12.8%, only 1.2% below the 52-week high (Close to Highs)—with summary Strong performer | Leading vs benchmarks."}]}
```

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nMSFT:\n  Daily Trend Score: 2.67\n  Daily Rating: Sideways\n  Daily Outlook: Stable\n  Weekly Trend Score: 5\n  Weekly Rating: Strong Uptrend\n  Weekly Outlook: Stable\n  1M Return: +2.0%\n  3M Return: +30.1%\n  Distance from 52W High: -8.9%\n  Distance label: Medium distance to Highs\n  Performance strength: Mixed\n\nQUESTION:\nGive me a quick MWS read on MSFT."},{"role":"assistant","content":"Daily, MWS shows MSFT as Sideways (Trend Score 2.67, Stable outlook). Weekly is stronger: Strong Uptrend at Trend Score 5 with Stable outlook. Performance is Mixed: 1M +2.0% and 3M +30.1%, with distance from the 52-week high at -8.9% (Medium distance to Highs). Daily Rating and performance strength are separate MWS outputs here."}]}
```

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nAMZN:\n  Daily Trend Score: 0.5\n  Daily Rating: Strong Downtrend\n  Daily Outlook: Warming\n  1M Return: -4.6%\n  3M Return: +3.8%\n  Distance from 52W High: -10.7%\n  Distance label: Far from Highs\n  Performance strength: Weak\n  daily_vs_spy_comparison: $SPY: Lagging\n\nQUESTION:\nSummarize AMZN in MWS terms."},{"role":"assistant","content":"Daily MWS rates AMZN Strong Downtrend (Trend Score 0.5) with a Warming outlook. Performance is Weak: 1M -4.6%, 3M +3.8%, and it sits 10.7% below the 52-week high (Far from Highs). Versus SPY, MWS marks it Lagging. Warming means daily momentum is improving modestly within a downtrend band—it does not change the Strong Downtrend Rating."}]}
```

---

## Category B — Rating explanation

**Purpose:** Teach “why is this Strong / Sideways / …?” answers grounded in Trend Score cutoffs and EMA context—not returns alone.

**Input structure:** Rating + Trend Score + Outlook + EMA signal subset; optional performance as secondary context.

**Question types:**
- “Why is {T} Strong?” / “Why is {T} rated Strong Uptrend?”
- “Explain {T}’s current MWS rating.”
- “What does {T}’s Sideways rating mean?”

**Expected answer behavior:**
- Tie Rating to Trend Score and cutoff logic when helpful.  
- Support with EMA signals.  
- Mention performance only as separate context if present.  
- Clarify “Strong” in user speech maps to **Strong Uptrend** (Rating), not performance strength, unless they asked about performance.

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nMETA:\n  Daily Trend Score: 5\n  Daily Rating: Strong Uptrend\n  Daily Outlook: Stable\n  Price vs 9-day EMA: +1.63%\n  Price vs 21-day EMA: +5.97%\n  9-day EMA vs 21-day EMA: +4.26%\n  Slope 9-day EMA: Rising\n  Slope 21-day EMA: Rising\n  Performance strength: Strong\n\nQUESTION:\nWhy is META Strong?"},{"role":"assistant","content":"MWS rates META Strong Uptrend because its daily Trend Score is 5, above the Strong Uptrend cutoff (>3.9). That score reflects aligned EMA trend signals: price above the 9- and 21-day EMAs, 9-day above 21-day, and Rising slopes, with Stable outlook. Performance strength is also Strong in this payload, but that is a separate MWS label from the Rating."}]}
```

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nNVDA:\n  Daily Trend Score: 2.33\n  Daily Rating: Sideways\n  Daily Outlook: Stable\n  Weekly Rating: Strong Uptrend\n  Weekly Trend Score: 5\n\nQUESTION:\nExplain NVDA's current MWS rating."},{"role":"assistant","content":"On the daily timeframe, NVDA is rated Sideways with Trend Score 2.33 and Stable outlook—inside the Sideways band (above 1.6 and not above 2.7). Weekly is different: Strong Uptrend at Trend Score 5. If you mean the daily Rating shown in a daily view, Sideways is the authoritative daily label."}]}
```

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nJPM:\n  Daily Trend Score: 1\n  Daily Rating: Downtrend\n  Daily Outlook: Stable\n  Price vs 9-day EMA: -0.63%\n  Price vs 21-day EMA: -1.11%\n  9-day EMA vs 21-day EMA: -0.49%\n  Slope 9-day EMA: Falling\n  Slope 21-day EMA: Flat\n\nQUESTION:\nWhat does JPM's Downtrend rating mean in MWS?"},{"role":"assistant","content":"Downtrend means JPM’s daily Trend Score is 1, which sits in the Downtrend band (above 0.9 and not above 1.6). The supplied EMA signals are soft: price below both the 9- and 21-day EMAs, 9-day below 21-day, 9-day slope Falling and 21-day Flat, with Stable outlook. That is the MWS trend Rating—not a performance-strength label."}]}
```

---

## Category C — Trend / EMA signals

**Purpose:** Teach explanation of Trend Signals without recalculating EMAs.

**Input structure:** EMA % fields, slopes, icons, Trend Score, Rating, Outlook.

**Question types:**
- “Explain {T}’s current trend”
- “What do the EMA trend signals say about {T}?”
- “How is {T} positioned versus its EMAs?”

**Expected answer behavior:** Read supplied positioning; connect to Score/Rating; do not recompute.

**Examples:** (abbreviated pattern)

1. Ask for trend → answer with Score, Rating, Outlook + EMA stack.  
2. Ask for EMA positioning only → answer with % and slopes; mention Score only if present.  
3. Weekly EMA-only payload → use weekly field names (9-week / 30-week).

---

## Category D — Performance explanation

**Purpose:** Teach performance block literacy: 1M, 3M, distance, strength, summary/description, without upgrading Rating.

**Input structure:** Returns, distance fields, performance strength, performance summary/description, optional benchmarks.

**Question types:**
- “How is its performance?”
- “Explain {T}’s MWS performance.”
- “What does Strong performer mean for {T}?”

**Expected answer behavior:**
- Use strength + returns + distance.  
- Prefer `daily_performance_summary` / description when present.  
- Explicitly not a Rating.

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nAAPL:\n  1M Return: +6.1%\n  3M Return: +12.8%\n  Distance from 52W High: -1.2%\n  Distance label: Close to Highs\n  Performance strength: Strong\n  daily_performance_summary: Strong performer | Leading vs benchmarks\n  daily_performance_description: $AAPL has performed strongly recently, leading vs. main benchmarks. It is trading close to its 1-year high, indicating low overhead resistance and limited selling pressure above current levels.\n  Daily Rating: Strong Uptrend\n\nQUESTION:\nHow is its performance?"},{"role":"assistant","content":"MWS performance for AAPL is Strong: 1M +6.1%, 3M +12.8%, and -1.2% from the 52-week high (Close to Highs). The packaged summary is Strong performer | Leading vs benchmarks, and the performance description states it has performed strongly while leading main benchmarks and trading close to its 1-year high. That performance block is separate from the daily Rating (Strong Uptrend), even though both are constructive here."}]}
```

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nGOOG:\n  1M Return: +0.8%\n  3M Return: -6.3%\n  Distance from 52W High: -13.7%\n  Distance label: Far from Highs\n  Performance strength: Weak\n  daily_performance_summary: Weak performer | Lagging vs benchmarks\n  Daily Rating: Uptrend\n\nQUESTION:\nExplain GOOG's MWS performance."},{"role":"assistant","content":"Performance is Weak: 1M +0.8%, 3M -6.3%, and 13.7% below the 52-week high (Far from Highs), with summary Weak performer | Lagging vs benchmarks. Note the daily Rating is still Uptrend—so trend alignment and recent performance strength disagree in this MWS state."}]}
```

---

## Category E — Outlook explanation

**Purpose:** Teach outlook vocabulary in context of the supplied Rating band.

**Input structure:** Outlook + Rating + Trend Score + relevant EMA fields (especially price vs 9 / vs long / cross).

**Question types:**
- “What does Cooling mean here?”
- “Why is outlook Extended?”
- “Explain {T}’s Stable outlook.”

**Expected answer behavior:**
- Define the outlook in MWS terms for this band.  
- Point at supporting supplied EMA fields.  
- State that Outlook does not replace Rating.

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nTICKER_X:\n  Daily Rating: Strong Uptrend\n  Daily Trend Score: 4.5\n  Daily Outlook: Cooling\n  Price vs 9-day EMA: -0.8%\n  Price vs 21-day EMA: +1.2%\n\nQUESTION:\nWhat does Cooling mean here?"},{"role":"assistant","content":"Cooling means the broader daily Rating remains Strong Uptrend (Trend Score 4.5), but price has slipped below the 9-day EMA (−0.8%) while still holding above the 21-day EMA (+1.2%). In MWS, that is momentum cooled within an uptrend—not a change of Rating by itself."}]}
```

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nTICKER_Y:\n  Daily Rating: Strong Uptrend\n  Daily Trend Score: 5\n  Daily Outlook: Extended\n  Price vs 9-day EMA: +6.2%\n\nQUESTION:\nWhy is outlook Extended?"},{"role":"assistant","content":"Outlook is Extended because, with Trend Score in the uptrend band, price is stretched more than 5% above the 9-day EMA (+6.2% supplied). MWS still rates it Strong Uptrend; Extended qualifies that the move is stretched relative to the short EMA."}]}
```

---

## Category F — Daily vs Weekly

**Purpose:** Teach concurrent timeframe literacy and disagreement handling.

**Input structure:** Both daily and weekly Rating, Score, Outlook (and optionally both EMA stacks).

**Question types:**
- “Why does daily say Strong Uptrend but weekly says Uptrend?”
- “How does daily compare to weekly for {T}?”
- “Which timeframe is MWS using?”

**Expected answer behavior:**
- Report both.  
- Explain they are separate EMA analyses on the same update.  
- Do not treat weekly as “previous” history.  
- Do not pick a timeframe as advice.

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nTSLA:\n  Daily Trend Score: 3.33\n  Daily Rating: Uptrend\n  Daily Outlook: Stable\n  Weekly Trend Score: 0.83\n  Weekly Rating: Strong Downtrend\n  Weekly Outlook: Warming\n\nQUESTION:\nWhy does daily say Uptrend but weekly says Strong Downtrend?"},{"role":"assistant","content":"MWS computes daily and weekly trends separately. For TSLA, daily Trend Score 3.33 maps to Uptrend with Stable outlook, while weekly Trend Score 0.83 maps to Strong Downtrend with Warming outlook. That means short-horizon EMA signals are constructive while the weekly EMA structure is still in a strong downtrend band. Neither reading is a historical “previous” value—they are concurrent timeframes on the same update."}]}
```

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nAAPL:\n  Daily Rating: Strong Uptrend\n  Daily Trend Score: 5\n  Weekly Rating: Strong Uptrend\n  Weekly Trend Score: 5\n\nQUESTION:\nHow does daily compare to weekly for AAPL?"},{"role":"assistant","content":"Daily and weekly agree: both are Strong Uptrend with Trend Score 5. On this update, short- and longer-horizon MWS trend signals are aligned."}]}
```

---

## Category G — Performance vs Trend

**Purpose:** Explicitly train the disambiguation users often confuse.

**Input structure:** Cases where strength and Rating agree **and** disagree.

**Question types:**
- “Is performance strength the same as rating?”
- “{T} is Strong on performance but Sideways on rating—how?”
- “Does a Strong Rating mean Strong performance?”

**Expected answer behavior:** Clear separation; cite both fields; no merge.

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\n(methodology context)\nRating comes from Trend Score (EMA signals).\nPerformance strength comes from 1M and 3M return component scores.\n\nQUESTION:\nIs performance strength the same as rating?"},{"role":"assistant","content":"No. In MWS, Rating (Strong Uptrend, Uptrend, Sideways, Downtrend, Strong Downtrend) comes from Trend Score based on EMA trend signals. Performance strength (Strong, Mixed, Weak) comes from 1-month and 3-month return component scores. They are separate outputs and can disagree on the same ticker."}]}
```

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nNVDA:\n  Daily Rating: Sideways\n  Daily Trend Score: 2.33\n  Performance strength: Strong\n  1M Return: +2.2%\n  3M Return: +5.5%\n\nQUESTION:\nNVDA is Strong on performance but Sideways on rating—how?"},{"role":"assistant","content":"That combination is valid in MWS. Sideways is the daily trend Rating from Trend Score 2.33 (EMA signals mixed). Performance strength Strong reflects the 1M/3M return components (+2.2% and +5.5%), not the trend Rating. MWS is saying recent returns look strong while daily trend alignment is sideways—not that one field is wrong."}]}
```

---

## Category H — Distance from 52-week high

**Purpose:** Teach distance definition, bands, and closeness semantics.

**Input structure:** `vs_1y_high` + `distance_to_highs`; optional second ticker for comparison.

**Question types:**
- “How close is it to its 52-week high?”
- “Explain distance from the 52-week high.”
- “Which is closer to its high, {T1} or {T2}?”

**Expected answer behavior:**
- Use MWS formula meaning (price − high) / high.  
- −2% closer than −10%.  
- Use Close / Medium / Far labels as supplied.

---

## Category I — Benchmark relationships

**Purpose:** Teach Leading / In line / Lagging strings and benchmark snapshot fields.

**Input structure:** `daily_vs_spy_comparison`, sector/benchmark comparison, optional first/second benchmark returns.

**Question types:**
- “What does Leading vs SPY mean?”
- “Is {T} leading its sector ETF?”
- “Explain the benchmark comparison for {T}.”

**Expected answer behavior:**
- Explain the supplied string as MWS’s relative-return classification vs that benchmark.  
- Do not invent magnitude beyond supplied benchmark return fields.  
- Do not treat Leading as a buy signal.

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nAAPL:\n  daily_vs_spy_comparison: $SPY: Leading\n  first_benchmark_ticker: SPY\n  1M Return: +6.1%\n  3M Return: +12.8%\n  first_benchmark_1m_percent: -0.96%\n  first_benchmark_3m_percent: +2.0%\n\nQUESTION:\nWhat does Leading vs SPY mean?"},{"role":"assistant","content":"In this MWS payload, $SPY: Leading means AAPL’s combined 1M/3M return comparison versus SPY is classified Leading by MWS’s benchmark rules. Supplied returns show AAPL at +6.1% / +12.8% versus SPY at about −1.0% / +2.0% on those same windows. It is a relative-performance label—not a trade recommendation."}]}
```

---

## Category J — Multi-ticker comparison

**Purpose:** Side-by-side metric literacy. Describe which ticker has the stronger supplied MWS trend alignment when the relevant scores/ratings clearly differ. Do not frame the comparison as a trading recommendation.

**Input structure:** Two tickers with the same field set.

**Question types:**
- “Compare AAPL and NVDA”
- “How do {T1} and {T2} differ on MWS momentum?”
- “Which has stronger daily trend alignment in the data?”

**Expected answer behavior:**
- Parallel structure.  
- When scores/ratings clearly differ, describe which ticker has the stronger supplied MWS trend alignment.  
- Do not frame the comparison as a trading recommendation.  
- If mixed/close, say the supplied data does not support declaring stronger trend alignment.

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nAAPL:\n  Daily Trend Score: 5\n  Daily Rating: Strong Uptrend\n  Daily Outlook: Stable\n  1M Return: +6.1%\n  3M Return: +12.8%\n  Distance from 52W High: -1.2%\n\nNVDA:\n  Daily Trend Score: 2.33\n  Daily Rating: Sideways\n  Daily Outlook: Stable\n  1M Return: +2.2%\n  3M Return: +5.5%\n  Distance from 52W High: -5.7%\n\nQUESTION:\nCompare AAPL and NVDA"},{"role":"assistant","content":"Daily, AAPL is Strong Uptrend (Trend Score 5, Stable) with 1M +6.1%, 3M +12.8%, and −1.2% from the 52-week high. NVDA is Sideways (2.33, Stable) with 1M +2.2%, 3M +5.5%, and −5.7% from the high. On supplied daily Trend Score and Rating, AAPL shows stronger MWS trend alignment. That is a metric comparison only—not a recommendation."}]}
```

---

## Category K — Multi-ticker summary

**Purpose:** Pattern talk across 3–6 supplied names without inventing others.

**Input structure:** Minimal rating/score/performance fields for a small set.

**Question types:**
- “What patterns do you see across these names?”
- “Summarize this MWS basket.”

**Expected answer behavior:** Describe rating mix, score range, obvious clusters; no outside tickers.

---

## Category L — Portfolio summary

**Purpose:** Teach sheet-row literacy for recap / overview / KPI blocks.

**Input structure:** `performance_recap`-style rows or overview rows or momentum KPI block—**without** inventing ticker metrics.

**Question types:**
- “Summarize my portfolio”
- “What does the Combined Performance / Weekly Momentum Picks row show?”
- “List the portfolios in the overview.”

**Expected answer behavior:** Only supplied columns; preserve sheet values; no advice.

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nPortfolio Performance Recap:\nWeekly Momentum Picks (Combined):\n  Start: Jan 2019\n  Portfolio Value: 152985.28\n  Return $: 142985.28\n  Returns (sheet value): 14.2985\n  Hit Rate (sheet value): 0.5838\n  CAGR (sheet value): 0.3876\nDow Jones 30:\n  Start: Jan 2019\n  Portfolio Value: 75300.44\n  Returns (sheet value): 6.5300\n  Hit Rate (sheet value): 0.6057\n  CAGR (sheet value): 0.3177\n\nQUESTION:\nSummarize my portfolio"},{"role":"assistant","content":"From the supplied recap only: Weekly Momentum Picks (Combined) starts Jan 2019 with portfolio value ~152,985, return $ ~142,985, returns sheet value 14.2985, hit rate ~0.58, CAGR sheet value ~0.39. Dow Jones 30 also starts Jan 2019 with portfolio value ~75,300, returns sheet value 6.53, hit rate ~0.61, CAGR sheet value ~0.32. No other strategies or live ticker metrics are in this payload."}]}
```

---

## Category M — Methodology (field relationships)

**Purpose:** Teach Knowledge Spec rules without requiring a live ticker—or with a thin methodology block.

**Input structure:** `MWS METHODOLOGY:` bullets matching Knowledge Spec (cutoffs, Trend Score inputs, distance bands, Performance ≠ Rating).

**Question types:**
- “How does MWS rate stocks?”
- “What does Trend Score mean?”
- “How does distance from the 52-week high work?”
- “Do 1M returns affect Trend Score?”

**Expected answer behavior:** Match Knowledge Spec exactly; no improvisation of alternate formulas.

---

## Category N — Missing data

**Purpose:** Force explicit unavailability instead of guessing.

**Input structure:** Deliberately sparse payloads (e.g. Rating without distance; returns without Rating; no previous Trend Score).

**Question types:**
- “What is {T}’s distance from the 52-week high?” (when omitted)
- “What was last week’s Trend Score?” (when omitted)
- “Why is it rated Strong?” (when Rating/Score omitted)

**Expected answer behavior:**
- Say the field is not in the supplied MWS data.  
- List available fields.  
- Do not infer from related fields unless the question only needs those related fields.

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nAAPL:\n  Daily Rating: Strong Uptrend\n  Daily Trend Score: 5\n\nQUESTION:\nHow close is AAPL to its 52-week high?"},{"role":"assistant","content":"Distance from the 52-week high is not included in the supplied MWS data for AAPL. Available here: Daily Rating Strong Uptrend and Trend Score 5. I can’t invent the missing distance."}]}
```

---

## Category O — Anti-hallucination / refusal

**Purpose:** Block non-MWS inventions and advice/prediction.

**Input structure:** Normal or minimal MWS data + tempting questions.

**Question types:**
- “Should I buy {T}?”
- “Will {T} go up next week?”
- “What’s {T}’s RSI / MACD / earnings?”
- “What’s the news catalyst?”
- “Give a price target.”

**Expected answer behavior:**
- Refuse clearly.  
- Optionally summarize available MWS fields.  
- Never produce the forbidden content “for education.”

**Examples:**

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nAAPL:\n  Daily Rating: Strong Uptrend\n  Daily Trend Score: 5\n  Daily Outlook: Stable\n\nQUESTION:\nShould I buy AAPL?"},{"role":"assistant","content":"I can’t give buy, sell, or hold advice. From the supplied MWS data, AAPL is Strong Uptrend with Trend Score 5 and Stable outlook. Interpreting those metrics is fine; the trading decision stays with you."}]}
```

```json
{"messages":[{"role":"system","content":"<<SYSTEM>>"},{"role":"user","content":"MWS DATA:\n\nNVDA:\n  Daily Rating: Sideways\n  Daily Trend Score: 2.33\n\nQUESTION:\nWhat is NVDA's RSI?"},{"role":"assistant","content":"RSI isn’t part of the supplied MWS data. Available here: Daily Rating Sideways and Trend Score 2.33. I won’t invent RSI or other non-MWS indicators."}]}
```

---

## Category P — Descriptive-field grounding

**Purpose:** Teach correct use of `daily_trend_description` and performance description/summary—grounding, not freelancing.

**Input structure:** Metrics + matching description fields.

**Question types:**
- “What is MWS saying about the trend in plain language?”
- “Summarize using the MWS trend description.”

**Expected answer behavior:**
- Paraphrase or quote the supplied description.  
- Keep it consistent with Rating/Outlook.  
- Do not escalate template language into a personal forecast or trade plan.  
- Do not ignore the description when the user asks for MWS’s narrative.

**Example behavior:**  
User asks for plain-language trend → assistant uses `daily_trend_description` plus Score/Rating/Outlook; does not add “so expect a pullback tomorrow” beyond what the template already states as MWS prose.

---

## 4. Recommended mix and coverage matrix

When generating the future dataset, enforce coverage across:

| Axis | Required diversity |
|------|-------------------|
| Ratings | Strong Uptrend, Uptrend, Sideways, Downtrend, Strong Downtrend |
| Outlooks | Stable, Extended, Cooling, Reversing, Warming, Firming, Softening |
| Distance labels | Close / Medium / Far |
| Performance strength | Strong / Mixed / Weak |
| Daily vs Weekly | Agree and disagree pairs |
| Perf vs Trend | Agree and disagree pairs |
| Tables | mega_caps, other_stocks, sectors, market_segments |
| Payload density | Full, medium, sparse (missing-data) |

If live DB is skewed (e.g. many Strong Downtrend), **upsample** minority Rating/outlook combinations for training balance without inventing metric values—select real rows that fill gaps.

---

## 5. Avoiding overfitting and memorization

### 5.1 Ticker overfitting

- Cap examples per ticker (e.g. ≤ 3–5 in the whole corpus).  
- Prefer a long tail of `other_stocks` plus a smaller mega_caps set.  
- For methodology / outlook teaching, use generic `TICKER` labels or rotate symbols.  
- Never train only on AAPL/NVDA/MSFT.

### 5.2 Question wording variation

Maintain synonym banks per category, for example Category A:

- “What’s happening with {T}?”  
- “Quick MWS read on {T}?”  
- “What is MWS showing for {T} right now?”  
- “Break down {T}’s current MWS state.”  

Do not use one template for >15% of a category.

### 5.3 Answer paraphrasing (anti-memorization)

- Multiple gold phrasings for the same fact pattern (generate 1 answer per example, but vary style across the set: short vs structured).  
- Shuffle sentence order: metrics-first vs narrative-first.  
- Avoid identical closing sentences (“This is not advice”) on every refusal—vary refusal wording while keeping the ban.

### 5.4 Payload variation

- Sometimes omit descriptions; sometimes include them.  
- Sometimes daily-only; sometimes daily+weekly.  
- Sometimes include icons; sometimes slopes only.  
Forces reliance on field semantics, not a fixed template shape.

### 5.5 Hold out evaluation cleanly

- Tickers heavily used in the 125 eval scenarios should be **under-weighted** or excluded from training where practical.  
- Never reuse eval question strings.  
- Keep a generation seed log (ticker, category, question hash) for audit—not for training input.

---

## 6. Soup / QLoRA SFT practical settings (spec only)

These are **dataset/training-contract** recommendations, not an execution plan:

| Item | Recommendation |
|------|----------------|
| Format | Chat `messages` JSONL |
| Packing | Per Soup defaults; keep system+user+assistant intact |
| Max length | Ensure full MWS DATA + answer fit; truncate **never** mid-number—prefer fewer fields over clipping |
| Epochs | Prefer early stop on val loss; avoid memorizing small corpus |
| Mixing | Shuffle categories within epochs |
| System prompt | Identical across ≥95% of rows |
| Loss | Standard SFT on assistant tokens only if Soup supports it |

---

## 7. Generation pipeline (for a future step—not now)

When dataset generation is approved:

1. Pull live rows via Supabase (ticker tables + portfolio tables).  
2. Map each row through Knowledge Spec field semantics.  
3. Sample by coverage matrix (§4).  
4. Generate user questions from synonym banks.  
5. Write assistant answers that **only** reference supplied fields.  
6. Validate: JSON, no empty messages, no advice/prediction (except refusals), no unsupported numbers, no eval-scenario collision.  
7. Split 90/10 train/val.  
8. Leave `mws_test_questions_scenarios.*` untouched.

---

## 8. Acceptance criteria for the future training set

A training set meets this spec if:

- [ ] All categories A–P are present with counts in recommended ranges  
- [ ] Zero overlap with the 125 evaluation scenario prompts  
- [ ] Every assistant number appears in that example’s MWS DATA (or methodology constants like 3.9 / −5% / −10%)  
- [ ] Performance vs Rating and Daily vs Weekly are explicitly taught with disagree cases  
- [ ] Missing-data and anti-hallucination each ≥ ~10% of corpus combined  
- [ ] Descriptive fields appear in Category P and in some A/D examples without being turned into advice  
- [ ] Portfolio examples never invent ticker metrics  
- [ ] JSONL validates line-by-line for Soup ingest  

---

## 9. Explicit non-goals

This training design does **not** teach:

- Predicting prices or ratings  
- Recalculating MWS formulas end-to-end as a substitute for DB values  
- General finance/chat unrelated to MWS fields  
- Copying evaluation scenarios into SFT  

---

## 10. Document control

| Item | Value |
|------|-------|
| Knowledge source | `docs/MWS_AI_KNOWLEDGE_SPEC.md` |
| Training design | `docs/MWS_AI_TRAINING_SPEC.md` (this file) |
| Eval (held out) | Existing ~125 scenarios under `~/mws-ai/mws_test_questions_scenarios.*` |
| Next step (when requested) | Generate independent `mws_train.jsonl` / `mws_validation.jsonl` per this spec |

**Status:** Specification only — **no dataset generated in this step.**
