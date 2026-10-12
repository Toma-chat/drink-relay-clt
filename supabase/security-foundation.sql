-- Phase 1: create the staff allowlist and authorization helpers.
-- Apply this file before deploying the authenticated staff UI or the unlimited Edge Function.
-- This phase intentionally does not change the existing table policies yet.

create schema if not exists drink_private;
revoke all on schema drink_private from public, anon, authenticated;

create table if not exists drink_private.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);

revoke all on table drink_private.staff from public, anon, authenticated;

-- Reuse existing Warmup staff accounts when that feature has already been installed.
do $$
begin
  if to_regclass('warmup_private.staff') is not null then
    execute $copy$
      insert into drink_private.staff (user_id, label)
      select distinct user_id, 'Warmup staff migration'
      from warmup_private.staff
      where user_id is not null
      on conflict (user_id) do nothing
    $copy$;
  end if;
end $$;

create or replace function public.is_drink_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from drink_private.staff
      where user_id = auth.uid()
    );
$$;

revoke all on function public.is_drink_staff() from public, anon;
grant execute on function public.is_drink_staff() to authenticated;

-- Used only by a service-role Edge Function after it has validated the caller JWT.
create or replace function public.drink_staff_allowed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from drink_private.staff
    where user_id = p_user_id
  );
$$;

revoke all on function public.drink_staff_allowed(uuid) from public, anon, authenticated;
grant execute on function public.drink_staff_allowed(uuid) to service_role;

-- If no Warmup staff account was copied, add the intended Auth user manually:
-- insert into drink_private.staff (user_id, label)
-- values ('SUPABASE_AUTH_USER_UUID', 'CLT staff')
-- on conflict (user_id) do nothing;

