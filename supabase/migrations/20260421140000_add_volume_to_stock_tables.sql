-- Add volume column to all four stock tables.
-- Stores the most-recent trading day's volume (shares traded), sourced from
-- the Finnhub candle endpoint. Nullable because TwelveData doesn't provide it.

ALTER TABLE public.market_segments ADD COLUMN IF NOT EXISTS volume bigint;
ALTER TABLE public.sectors         ADD COLUMN IF NOT EXISTS volume bigint;
ALTER TABLE public.mega_caps       ADD COLUMN IF NOT EXISTS volume bigint;
ALTER TABLE public.other_stocks    ADD COLUMN IF NOT EXISTS volume bigint;
