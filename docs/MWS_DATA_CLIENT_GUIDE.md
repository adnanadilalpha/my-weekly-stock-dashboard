# MWS Data Client Guide (Web + Mobile)

Same Supabase project for all clients. Prefer **client → Supabase** for reads/CRUD. Prefer **platform API** only for hosted chat.

## Auth

- Invite-only via `authorized_users`
- Supabase Auth (magic link / session)
- RLS uses `auth.uid()`

## Ticker universe (lookup order)

A ticker lives in **exactly one** table. Resolve in order:

1. `market_segments`
2. `sectors`
3. `mega_caps`
4. `other_stocks`

End-user visibility: respect `is_active` (same filter as web `USER_TICKER_ACTIVE_OR`).

## Important columns

| Column | Meaning | Storage |
|--------|---------|---------|
| `1m_percent` / `3m_percent` / `vs_1y_high` | Returns / distance | Decimal (`0.05` = +5%) |
| `daily_trend_score` / `weekly_trend_score` | 0–5 | Number |
| `daily_rating` / `weekly_rating` | Label from score | Text |
| `daily_outlook` / `weekly_outlook` | State in band | Text |
| `performance_strength` | Strong / Mixed / Weak | Text |
| `pct_from_sma50` / `pct_from_sma200` | Rel. strength axes | Decimal; **nullable** until edge backfill |

Charts candles: `price_history` (`interval` = `daily` \| `weekly`).

## Relative strength chart

- X = `pct_from_sma50 * 100` (%), Y = `pct_from_sma200 * 100` (%)
- Quadrants: see `MWS_BRIEF_ENGINE_SPEC.md` (`quadrant` composer)
- Sector Rotation: all rows in `sectors`
- Peer compare: `mega_caps` + `other_stocks` where `sector_etf` matches, plus the sector ETF row

## My Portfolios (My Holdings)

User-owned ticker basket — **one portfolio per user** in the current version (no list page; open detail directly).

| Table | RLS |
|-------|-----|
| `user_portfolios` | owner `user_id` |
| `user_portfolio_holdings` | owner via portfolio join |

**User enters only:** Start date + Cash Invested (per holding). Hit Rate / Avg Gain / trade-log stats are not tracked.

**Computed / live overlay** (covered tickers via universe tables + `price_history`):

| Field | Source |
|-------|--------|
| Since start % | `price_history` close on/near Start → `daily_current_price` (lump-sum) |
| Book return | Cash-weighted Since start where both Cash and Start price exist |
| 1M / Rating / Outlook / Perf. | Live MWS row (`1m_percent`, `daily_rating`, …) |
| Weight | Cash Invested / book cash total |

**Relative Strength:** on-demand dialog (not embedded on the page). Seeded from holdings; user can add any tickers. Opens from My Holdings, Ticker Analysis, and Momentum Pulse.

Symbols outside the MWS universe are stored but show overlay columns as untracked / —. Tap a covered ticker → Ticker Analysis.

## MWS official portfolios

Sheet-synced tables (`performance_recap`, `momentum_picks_summary`, picks tables, etc.) — read-only for clients.

## Intelligence

| Layer | Where it runs |
|-------|----------------|
| Brief | On device — `MWS_BRIEF_ENGINE_SPEC.md` + fixtures |
| Chat | `POST /api/ai/chat` — `MWS_PLATFORM_API_CONTRACT.md` |

## Display tip

Stored returns are decimals. Multiply by 100 for UI percent labels unless the field is already a display string.
