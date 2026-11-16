-- Add read indexes/revisions without changing existing QR identities or mutation locks.
begin;
create schema if not exists drink_private;
create sequence if not exists drink_private.unlimited_revision_sequence;
create table if not exists drink_private.unlimited_read_versions(kind text primary key, revision bigint not null);
create table if not exists drink_private.unlimited_card_index(token text primary key, card jsonb not null);
revoke all on drink_private.unlimited_read_versions,drink_private.unlimited_card_index from public,anon,authenticated;
revoke all on sequence drink_private.unlimited_revision_sequence from public,anon,authenticated;
create or replace function drink_private.refresh_unlimited_read_index() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior_id text; next_id text; read_kind text;
begin
 if TG_OP <> 'INSERT' then prior_id:=old.id; end if;
 if TG_OP <> 'DELETE' then next_id:=new.id; end if;
 if TG_OP='UPDATE' and prior_id=next_id and old.menu is not distinct from new.menu then return new; end if;
 if next_id='aycd-card-catalog' then
  delete from drink_private.unlimited_card_index;
  insert into drink_private.unlimited_card_index(token,card)
   select c->>'token',c from jsonb_array_elements(case when jsonb_typeof(new.menu)='array' then new.menu else '[]' end) c
   where coalesce(c->>'token','')<>'';
 elsif prior_id='aycd-card-catalog' then delete from drink_private.unlimited_card_index;
 end if;
 for read_kind in select distinct k from (values
  (case when prior_id='aycd-card-catalog' or next_id='aycd-card-catalog' then 'cards' end),
  (case when prior_id like 'aycd-session-%' or next_id like 'aycd-session-%' then 'sessions' end)) v(k) where k is not null
 loop
  insert into drink_private.unlimited_read_versions values(read_kind,nextval('drink_private.unlimited_revision_sequence'))
   on conflict(kind) do update set revision=excluded.revision;
 end loop;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
drop trigger if exists unlimited_read_index_update on public.drink_app_settings;
create trigger unlimited_read_index_update after insert or update or delete on public.drink_app_settings
 for each row execute function drink_private.refresh_unlimited_read_index();
-- Lock against concurrent catalog writes while backfilling the derived index.
lock table public.drink_app_settings in share row exclusive mode;
delete from drink_private.unlimited_card_index;
insert into drink_private.unlimited_card_index(token,card)
 select c->>'token',c from public.drink_app_settings s,
 jsonb_array_elements(case when jsonb_typeof(s.menu)='array' then s.menu else '[]' end) c
 where s.id='aycd-card-catalog' and coalesce(c->>'token','')<>'';
insert into drink_private.unlimited_read_versions values
 ('cards',nextval('drink_private.unlimited_revision_sequence')),('sessions',nextval('drink_private.unlimited_revision_sequence'))
 on conflict(kind) do update set revision=excluded.revision;
create or replace function public.drink_unlimited_card(p_token text) returns jsonb
language sql stable security definer set search_path='' as $$
 select card from drink_private.unlimited_card_index where token=p_token;
$$;
create or replace function public.drink_unlimited_read_revision(p_kind text) returns text
language sql stable security definer set search_path='' as $$
 select revision::text from drink_private.unlimited_read_versions where kind=p_kind;
$$;
revoke all on function public.drink_unlimited_card(text),public.drink_unlimited_read_revision(text) from public,anon,authenticated;
grant execute on function public.drink_unlimited_card(text),public.drink_unlimited_read_revision(text) to service_role;
commit;
