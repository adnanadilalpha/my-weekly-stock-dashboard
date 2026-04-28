alter table if exists public.market_segments
  add column if not exists is_active boolean;

alter table if exists public.sectors
  add column if not exists is_active boolean;

alter table if exists public.mega_caps
  add column if not exists is_active boolean;

alter table if exists public.other_stocks
  add column if not exists is_active boolean;

update public.market_segments set is_active = true where is_active is null;
update public.sectors set is_active = true where is_active is null;
update public.mega_caps set is_active = true where is_active is null;
update public.other_stocks set is_active = true where is_active is null;

alter table if exists public.market_segments
  alter column is_active set default true;

alter table if exists public.sectors
  alter column is_active set default true;

alter table if exists public.mega_caps
  alter column is_active set default true;

alter table if exists public.other_stocks
  alter column is_active set default true;
