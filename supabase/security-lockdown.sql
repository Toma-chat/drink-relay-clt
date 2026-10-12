-- Phase 2: deny direct public table access.
-- Apply only after the `unlimited` Edge Function and the authenticated staff UI are deployed.

alter table public.drink_orders enable row level security;
alter table public.drink_app_settings enable row level security;

drop policy if exists "drink_orders_select" on public.drink_orders;
drop policy if exists "drink_orders_insert" on public.drink_orders;
drop policy if exists "drink_orders_update" on public.drink_orders;
drop policy if exists "drink_orders_delete" on public.drink_orders;
drop policy if exists "drink_app_settings_select" on public.drink_app_settings;
drop policy if exists "drink_app_settings_insert" on public.drink_app_settings;
drop policy if exists "drink_app_settings_update" on public.drink_app_settings;
drop policy if exists "drink_app_settings_delete" on public.drink_app_settings;

revoke all on table public.drink_orders from anon, authenticated;
revoke all on table public.drink_app_settings from anon, authenticated;

grant select, insert, update, delete on table public.drink_orders to authenticated;
grant select, insert, update, delete on table public.drink_app_settings to authenticated;

create policy "drink_orders_staff_select"
  on public.drink_orders
  for select
  to authenticated
  using ((select public.is_drink_staff()));

create policy "drink_orders_staff_insert"
  on public.drink_orders
  for insert
  to authenticated
  with check ((select public.is_drink_staff()));

create policy "drink_orders_staff_update"
  on public.drink_orders
  for update
  to authenticated
  using ((select public.is_drink_staff()))
  with check ((select public.is_drink_staff()));

create policy "drink_orders_staff_delete"
  on public.drink_orders
  for delete
  to authenticated
  using ((select public.is_drink_staff()));

create policy "drink_app_settings_staff_select"
  on public.drink_app_settings
  for select
  to authenticated
  using ((select public.is_drink_staff()));

create policy "drink_app_settings_staff_insert"
  on public.drink_app_settings
  for insert
  to authenticated
  with check ((select public.is_drink_staff()));

create policy "drink_app_settings_staff_update"
  on public.drink_app_settings
  for update
  to authenticated
  using ((select public.is_drink_staff()))
  with check ((select public.is_drink_staff()));

create policy "drink_app_settings_staff_delete"
  on public.drink_app_settings
  for delete
  to authenticated
  using ((select public.is_drink_staff()));

-- The publishable browser key can call only explicitly granted functions after this point.
-- Customer ordering is handled by the `unlimited` Edge Function using server-side checks.

