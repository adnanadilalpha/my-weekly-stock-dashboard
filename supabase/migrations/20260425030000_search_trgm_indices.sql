-- Fast text search: pg_trgm extension + GIN indices on ticker symbol and name columns.
-- ilike '%term%' queries will use these indices instead of doing full table scans.
create extension if not exists pg_trgm schema public;

-- market_segments
create index if not exists idx_ms_ticker_trgm  on public.market_segments using gin (ticker  gin_trgm_ops);
create index if not exists idx_ms_name_trgm    on public.market_segments using gin (name    gin_trgm_ops);

-- sectors
create index if not exists idx_sectors_ticker_trgm on public.sectors using gin (ticker      gin_trgm_ops);
create index if not exists idx_sectors_name_trgm   on public.sectors using gin (sector_name gin_trgm_ops);

-- mega_caps
create index if not exists idx_mega_ticker_trgm on public.mega_caps using gin (ticker       gin_trgm_ops);
create index if not exists idx_mega_name_trgm   on public.mega_caps using gin (company_name gin_trgm_ops);

-- other_stocks
create index if not exists idx_other_ticker_trgm on public.other_stocks using gin (ticker       gin_trgm_ops);
create index if not exists idx_other_name_trgm   on public.other_stocks using gin (company_name gin_trgm_ops);

-- ticker_import_candidates
create index if not exists idx_cand_ticker_trgm on public.ticker_import_candidates using gin (ticker        gin_trgm_ops);
create index if not exists idx_cand_name_trgm   on public.ticker_import_candidates using gin (provider_name gin_trgm_ops);
