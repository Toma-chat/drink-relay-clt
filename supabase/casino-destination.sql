-- Add the requested staff destination without changing rows or access policies.
begin;
alter table public.drink_orders drop constraint drink_orders_target_check;
alter table public.drink_orders add constraint drink_orders_target_check
  check (target in ('tournament','ring','bar','casino'));
commit;
