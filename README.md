
# My Weekly Stock

My Weekly Stock dashboard app.

## Run locally

- Install deps: `npm i`
- Create local env file: `cp .env.example .env.local`
- Start dev server: `npm run dev`

## Supabase environment switching (safe by default)

This project supports explicit data targets via `APP_ENV`:

- `APP_ENV=dev` -> uses `*_DEV` Supabase credentials
- `APP_ENV=prod` -> uses `*_PROD` Supabase credentials
- `NEXT_PUBLIC_APP_ENV` should match `APP_ENV` for client-side behavior

Safety guard:

- Production Supabase is blocked outside production runtime unless you explicitly set `ALLOW_PROD_FROM_LOCAL=true`.

Recommended local setup:

- Keep `APP_ENV=dev`
- Keep `NEXT_PUBLIC_APP_ENV=dev`
- Use only `*_DEV` keys for daily development
- Set `APP_ENV=prod` only for intentional production verification

Auth behavior:

- In `dev`, login screen is bypassed automatically for faster local testing.
- In `prod`, normal magic-link authentication is required.
