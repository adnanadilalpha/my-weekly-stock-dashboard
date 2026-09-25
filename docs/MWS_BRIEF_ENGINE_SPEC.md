# MWS Brief Engine Specification

**Version:** 1.0.0  
**Audience:** Web (reference), iOS, Android engineers  
**Runtime:** On-device / in-app only — **never** call a network API for Brief.

## Role

MWS Brief **presents packaged MWS narratives** (`daily_performance_description`, `daily_trend_description`, summaries, labels) in a friendlier layout.

It must **not invent new prose**. If packaged text is missing, show the missing card — do not write educational filler about what Rating means.

## Output contract

```ts
type MwsBriefOutput = {
  version: string;           // "1.0.0"
  composerId: string;        // rating | performance | quadrant | portfolio_holding
  title: string;
  body: string;
  bullets: string[];
  disclaimer?: string;
  sourceFields: string[];
};
```

Default disclaimer:

> MWS Brief explains stored MWS state only. It does not give trading advice.

## Normalization

| Rule | Behavior |
|------|----------|
| Percent decimals | `0.123` → `+12.3%` (one decimal); negative keeps minus |
| Null / missing | Prefer packaged description when present; else compose; else missing card |
| Ticker | Uppercase in titles |

## Composers

### `rating`

**Input fields:** `ticker`, `daily_trend_score`, `daily_rating`, `daily_outlook`, `daily_trend_description`, weekly equivalents, `timeframe` (`daily` \| `weekly`).

**Precedence:** If `*_trend_description` is non-empty, use it as `body` and list rating/score/outlook as bullets. Else compose from rating/score/outlook. Else missing card.

### `performance`

**Input fields:** `performance_strength` / `daily_performance_strength`, `distance_to_highs`, `daily_performance_summary`, `daily_performance_description`, `1m_percent` / `daily_1m_percent`, `3m_percent`, benchmark comparison strings.

**Precedence:** description → summary → compose from strength/returns → missing.

### `quadrant`

**Input fields:** `ticker`, `pct_from_sma50`, `pct_from_sma200` (decimals).

**Quadrants:**

| Condition | Id |
|-----------|-----|
| ≥0 & ≥0 | STRONG |
| <0 & ≥0 | PULLBACK |
| <0 & <0 | WEAK |
| ≥0 & <0 | RECOVERY |

### `portfolio_holding`

**Input fields:** `ticker`, `daily_rating`, `daily_outlook`, `daily_trend_score`, `performance_strength`, `in_mws_coverage`.

If `in_mws_coverage === false`, explain not in MWS universe.

## Golden fixtures

Canonical cases live in:

- `docs/fixtures/brief/*.json`
- `lib/intelligence/brief/__fixtures__/*.json` (copy)

Each file: `{ composerId, version, cases: [{ input, output }] }`.

**Parity rule:** Mobile implementations must match `title`, `body`, and `bullets` exactly (UTF-8) for every fixture case at this `version`.

Regenerate from the TypeScript reference:

```bash
npx tsx lib/intelligence/brief/scripts/generate-fixtures.ts
```

## Versioning

Bump `BRIEF_ENGINE_VERSION` in `lib/intelligence/brief/types.ts` when copy rules change.
Keep old fixture files for regression until mobile apps upgrade.

## Bans

- No buy/sell/hold language
- No recomputing Trend Score / Rating / SMA from prices inside Brief (use supplied fields)
- No HTTP / Modal calls
