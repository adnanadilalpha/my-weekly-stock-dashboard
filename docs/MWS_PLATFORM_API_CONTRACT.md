# MWS Platform API Contract

**Audience:** Web + iOS + Android  
**Auth:** Supabase user JWT (`Authorization: Bearer <access_token>`)

## Feature flags

| Env | Default | Effect |
|-----|---------|--------|
| `NEXT_PUBLIC_FEATURE_BRIEF` | `true` | On-device Brief UI |
| `NEXT_PUBLIC_FEATURE_RELATIVE_STRENGTH` | `false` | Relative Strength chart dialog (falls back to legacy `SECTOR_ROTATION`) |
| `NEXT_PUBLIC_FEATURE_MY_PORTFOLIOS` | `false` | My Holdings UI |
| `NEXT_PUBLIC_FEATURE_AI_CHAT` | `false` | Chat UI + API acceptance |

Server also requires `MODAL_CHAT_URL` for real model replies.

---

## `POST /api/ai/chat`

### Request headers

```
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

### Body

```json
{
  "message": "What does Strong Uptrend mean for AAPL?",
  "sessionId": null,
  "stream": false,
  "contextRef": {
    "ticker": "AAPL",
    "sector": "XLK",
    "portfolioPage": "dashboard",
    "userPortfolioId": "uuid-or-null"
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `message` | yes | User question |
| `sessionId` | no | Continue a session; omit to create |
| `stream` | no | `true` → SSE; `false`/omit → JSON |
| `contextRef` | no | Server loads MWS DATA from DB; never trust client metrics |

### Non-stream success (`200`)

```json
{
  "sessionId": "uuid",
  "role": "assistant",
  "content": "...",
  "contextRef": { "ticker": "AAPL" }
}
```

### SSE (`stream: true`)

Events:

| Event | Data |
|-------|------|
| `session` | `{ "sessionId": "..." }` |
| `token` | `{ "token": "..." }` |
| `done` | `{ "sessionId": "...", "content": "full text" }` |

### Errors

| Status | `error` | Meaning |
|--------|---------|---------|
| 401 | `unauthorized` | Missing/invalid JWT |
| 400 | `message_required` / `invalid_json` | Bad body |
| 429 | `rate_limited` | Too many requests (~30/min/user) |
| 503 | `ai_chat_disabled` | Feature flag off |
| 503 | `chat_unavailable` | Modal not configured / cold; use Brief |

Advice-seeking prompts are answered with a refusal (still `200`) — no trading recommendations.

---

## Chat history (Supabase direct)

Clients may **read** (and optionally delete) their own rows:

- `ai_chat_sessions` — RLS: `auth.uid() = user_id`
- `ai_chat_messages` — RLS: `auth.uid() = user_id`

**Generation** must go through `/api/ai/chat` so MWS DATA is assembled server-side.

---

## Mobile integration checklist

1. Auth with same Supabase project (magic link / session).
2. Read ticker tables with `is_active` visibility (see Data Client Guide).
3. Port Brief composers + run `docs/fixtures/brief` fixtures in CI.
4. CRUD `user_portfolios` / `user_portfolio_holdings` via Supabase.
5. Call `/api/ai/chat` with Bearer JWT when chat flag is on.
6. If chat returns 503, show Brief-only UX.
