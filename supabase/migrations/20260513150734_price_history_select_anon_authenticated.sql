-- Allow price charts for anon (dev bypass) and authenticated sessions.
drop policy if exists price_history_select_authenticated on public.price_history;
create policy price_history_select_end_user on public.price_history
  for select to anon, authenticated using (true);
