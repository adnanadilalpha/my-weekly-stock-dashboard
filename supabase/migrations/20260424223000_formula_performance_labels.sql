create table if not exists public.formula_performance_labels (
  strength text primary key check (strength in ('Strong', 'Mixed', 'Weak')),
  label text not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.formula_performance_labels (strength, label, description) values
  ('Strong', 'Strong performer', 'This ticker is currently showing strong performance and is close to highs.'),
  ('Mixed', 'Mixed performer', 'This ticker is currently showing mixed performance and is far below highs.'),
  ('Weak', 'Weak performer', 'This ticker is currently showing weak performance and is far below highs.')
on conflict (strength) do nothing;
