alter table public.formula_rating_labels
add column if not exists color_hex text;

update public.formula_rating_labels
set color_hex = case tier
  when 'strong_bull' then '#16a34a'
  when 'bull' then '#22c55e'
  when 'neutral' then '#f59e0b'
  when 'bear' then '#f97316'
  when 'strong_bear' then '#ef4444'
  else '#6b7280'
end
where color_hex is null or color_hex !~ '^#[0-9a-fA-F]{6}$';

alter table public.formula_rating_labels
alter column color_hex set default '#22c55e';

alter table public.formula_rating_labels
alter column color_hex set not null;

alter table public.formula_rating_labels
drop constraint if exists formula_rating_labels_color_hex_format;

alter table public.formula_rating_labels
add constraint formula_rating_labels_color_hex_format
check (color_hex ~ '^#[0-9a-fA-F]{6}$');
