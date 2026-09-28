
# My Weekly Stock

My Weekly Stock dashboard app.

## Run locally

- Install deps: `npm i`
- Create local env file: `cp .env.example .env.local`
- Start dev server: `npm run dev`

## Supabase

This app uses a **single production Supabase project**.

Required env (see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL_PROD`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD`
- `SUPABASE_SERVICE_ROLE_KEY_PROD` (server only)

Unsuffixed names (`NEXT_PUBLIC_SUPABASE_URL`, etc.) are also accepted.

Auth uses normal magic-link / session login against that project.

