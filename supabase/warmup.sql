-- Apply after supabase-schema.sql. Private data is never exposed via PostgREST.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists warmup_private;
revoke all on schema warmup_private from public, anon, authenticated;
create table warmup_private.stores (
 id text primary key, qr text not null default encode(extensions.gen_random_bytes(24),'hex'),
 profile jsonb not null, calendar_until date
);
create table warmup_private.staff (store text references warmup_private.stores, user_id uuid references auth.users, primary key(store,user_id));
create table warmup_private.holidays(day date primary key, name text not null);
create table warmup_private.closures(store text references warmup_private.stores, day date, name text, primary key(store,day));
create table warmup_private.days(store text references warmup_private.stores, day date, code text not null,
 stopped boolean not null default false, changed_at timestamptz, primary key(store,day));
create table warmup_private.sessions(id uuid primary key default gen_random_uuid(), store text references warmup_private.stores,
 day date not null, device text not null, token_hash text unique not null, expires timestamptz not null,
 revoked boolean not null default false, location jsonb not null default '{"target":"bar","tableNo":"","seatNo":""}');
create table warmup_private.attempts(key text primary key, count int not null default 0, reset_at timestamptz not null);
create table warmup_private.audit(id bigint generated always as identity primary key, at timestamptz default now(), store text, action text, detail jsonb);
alter table public.drink_orders add column if not exists warmup_session_id uuid references warmup_private.sessions(id);
create unique index warmup_one_pending on public.drink_orders(warmup_session_id) where status in ('ordered','making','made');

create function warmup_private.code() returns text language plpgsql set search_path='' as $$
declare n int;
begin
 loop
  n := get_byte(extensions.gen_random_bytes(2),0)*256 + get_byte(extensions.gen_random_bytes(2),0);
  exit when n < 60000;
 end loop;
 return lpad((n % 10000)::text,4,'0');
end $$;

create function warmup_private.rollover() returns void language plpgsql security definer set search_path='' as $$
declare st text; value text; previous text; today date := (now() at time zone 'Asia/Tokyo')::date;
begin
 for st in select id from warmup_private.stores loop
  if exists(select 1 from warmup_private.days where store=st and day=today) then continue; end if;
  select code into previous from warmup_private.days where store=st order by day desc limit 1;
  loop value := warmup_private.code(); exit when value is distinct from previous; end loop;
  insert into warmup_private.days(store,day,code) values(st,today,value) on conflict do nothing;
 end loop;
end;
$$;
revoke all on function warmup_private.rollover() from public;
select cron.schedule('warmup-midnight-jst','0 15 * * *','select warmup_private.rollover()');

-- Legacy public writes remain available, but cannot forge or alter Warmup rows.
-- Only service-role RPCs and allowlisted authenticated staff may mutate them.
create function warmup_private.guard_orders() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; st text;
begin
 sid := new.warmup_session_id;
 if TG_OP='UPDATE' then sid := coalesce(old.warmup_session_id,sid); end if;
 if sid is null and not (new.events @> '[{"source":"warmup"}]'::jsonb) then return new; end if;
 if current_setting('request.jwt.claims',true)::jsonb->>'role' = 'service_role' then return new; end if;
 select store into st from warmup_private.sessions where id=sid;
 if TG_OP='UPDATE' and old.warmup_session_id=new.warmup_session_id
    and exists(select 1 from warmup_private.staff where store=st and user_id=auth.uid())
    and new.drink_name=old.drink_name and new.quantity=1 and new.events @> old.events
    and new.target=old.target and new.table_no is not distinct from old.table_no and new.seat_no is not distinct from old.seat_no
 then return new; end if;
 raise exception 'Warmup専用APIまたはスタッフ認証が必要です';
end $$;
create trigger warmup_order_guard before insert or update on public.drink_orders for each row execute function warmup_private.guard_orders();
create policy warmup_no_delete on public.drink_orders as restrictive for delete using(warmup_session_id is null);

create function public.warmup_api(p jsonb, actor uuid default null, ip text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 st warmup_private.stores; d warmup_private.days; s warmup_private.sessions;
 today date := (now() at time zone 'Asia/Tokyo')::date;
 action text := p->>'action'; reason text; token text; k text; a warmup_private.attempts;
 item jsonb; cat jsonb; orders jsonb; loc jsonb; o public.drink_orders; valid boolean; opt text; group_rule jsonb;
begin
 select * into st from warmup_private.stores where id=p->>'store' for update;
 if not found then raise exception '店舗が未設定です'; end if;
 if action like 'staff%' then
  if actor is null or not exists(select 1 from warmup_private.staff where store=st.id and user_id=actor) then raise exception 'スタッフ権限がありません'; end if;
 else
  if p->>'qr' is distinct from st.qr then raise exception 'QRが無効です'; end if;
 end if;
 perform warmup_private.rollover();
 select * into d from warmup_private.days where store=st.id and day=today for update;
 reason := case
 when st.calendar_until is null or st.calendar_until < today then 'calendar_missing'
 when exists(select 1 from warmup_private.holidays where day=today) then 'holiday'
 when extract(isodow from today)>5 then 'weekend'
 when exists(select 1 from warmup_private.closures where store=st.id and day=today) then 'closed'
 else 'weekday' end;
 if action='staff-stop' or action='staff-resume' then
  update warmup_private.days set stopped=(action='staff-stop'),changed_at=now() where store=st.id and day=today returning * into d;
  insert into warmup_private.audit(store,action,detail) values(st.id,action,jsonb_build_object('actor',actor));
 elsif action='staff-regenerate' then
  loop token := warmup_private.code(); exit when token <> d.code; end loop;
  update warmup_private.days set code=token where store=st.id and day=today returning * into d;
  token := null;
  if coalesce((p->>'revoke')::boolean,false) then update warmup_private.sessions set revoked=true where store=st.id and day=today; end if;
  insert into warmup_private.audit(store,action,detail) values(st.id,action,jsonb_build_object('actor',actor,'revoke',p->'revoke'));
 end if;
 if action like 'staff%' and action <> 'staff-location' then
  return jsonb_build_object('day',today,'reason',reason,'stopped',d.stopped,'code',d.code,'changedAt',d.changed_at,'qr',st.qr,
   'devices',(select count(*) from warmup_private.sessions where store=st.id and day=today and not revoked),
   'orders',(select count(*) from public.drink_orders x join warmup_private.sessions y on y.id=x.warmup_session_id where y.store=st.id and y.day=today),
   'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'location',location)),'[]') from warmup_private.sessions where store=st.id and day=today and not revoked));
 end if;
 if action='staff-location' then
  select * into s from warmup_private.sessions where id=(p->>'session')::uuid and store=st.id and day=today and not revoked for update;
 else
  select * into s from warmup_private.sessions where token_hash=encode(extensions.digest(coalesce(p->>'token',''),'sha256'),'hex')
   and store=st.id and device=p->>'device' and day=today and expires>now() and not revoked for update;
 end if;
 if action='activate' then
  if reason <> 'weekday' or d.stopped then
   insert into warmup_private.audit(store,action,detail) values(st.id,'auth-unavailable',jsonb_build_object('reason',reason,'stopped',d.stopped));
   return jsonb_build_object('error','本日は利用できません');
  end if;
  if length(coalesce(p->>'device','')) < 32 then raise exception '端末IDが無効です'; end if;
  -- Store lock serializes counters and auth: failures return JSON so counters/logs commit.
  foreach k in array array[st.id||':device:'||(p->>'device'),st.id||':ip:'||ip,st.id||':qr'] loop
   insert into warmup_private.attempts(key,reset_at) values(k,now()+interval '15 minutes') on conflict do nothing;
   update warmup_private.attempts set count=0,reset_at=now()+interval '15 minutes' where key=k and reset_at<=now();
   select * into a from warmup_private.attempts where key=k for update;
   if a.count >= (case when k=st.id||':qr' then 100 else 5 end) then
    insert into warmup_private.audit(store,action,detail) values(st.id,'locked',jsonb_build_object('key',k));
    return jsonb_build_object('error','試行制限中です。15分後にお試しください');
   end if;
  end loop;
  if p->>'code' is distinct from d.code then
   update warmup_private.attempts set count=count+1 where key in (st.id||':device:'||(p->>'device'),st.id||':ip:'||ip,st.id||':qr');
   insert into warmup_private.audit(store,action,detail) values(st.id,'auth-failure',jsonb_build_object('device',p->>'device'));
   return jsonb_build_object('error','コードが違います');
  end if;
  -- Reuse today's device session, so reauthentication cannot bypass a pending cup.
  select * into s from warmup_private.sessions where store=st.id and day=today and device=p->>'device' order by expires desc limit 1 for update;
  token := encode(extensions.gen_random_bytes(32),'hex');
  if s.id is null then
   insert into warmup_private.sessions(store,day,device,token_hash,expires) values(st.id,today,p->>'device',encode(extensions.digest(token,'sha256'),'hex'),(today+1)::timestamp at time zone 'Asia/Tokyo') returning * into s;
  else
   update warmup_private.sessions set revoked=false,token_hash=encode(extensions.digest(token,'sha256'),'hex') where id=s.id returning * into s;
  end if;
  insert into warmup_private.audit(store,action,detail) values(st.id,'auth-success',jsonb_build_object('session',s.id));
 end if;
 if action in ('order','location','staff-location') then
  if s.id is null then raise exception '本日の認証が必要です'; end if;
  if action <> 'staff-location' and (reason <> 'weekday' or d.stopped) then raise exception '本日は利用できません・停止中です'; end if;
 end if;
 if action in ('location','staff-location') then
  loc := p->'location';
  if loc->>'target' not in ('bar','ring','tournament') or loc->>'target' is null then raise exception '届け先が無効です'; end if;
  if loc->>'target'<>'bar' and (coalesce(loc->>'tableNo','') !~ '^[A-H]$' or coalesce(loc->>'seatNo','') !~ '^[1-9]$') then raise exception '卓・席が無効です'; end if;
  update warmup_private.sessions set location=loc where id=s.id returning * into s;
  update public.drink_orders set target=loc->>'target',table_no=loc->>'tableNo',seat_no=loc->>'seatNo',updated_at=now(),
   events=events||jsonb_build_array(jsonb_build_object('type','location-changed','at',now(),'location',loc,'actor',actor))
   where warmup_session_id=s.id and status in ('ordered','making','made');
 end if;
 if action='order' then
  if p->>'quantity' is distinct from '1' then raise exception '数量は1杯です'; end if;
  if exists(select 1 from public.drink_orders where warmup_session_id=s.id and status in ('ordered','making','made')) then raise exception '前のドリンクが提供済みになるまで注文できません'; end if;
  select c,i into cat,item from public.drink_app_settings m, jsonb_array_elements(m.menu) c, jsonb_array_elements(c->'items') i
   where m.id='main' and c->>'id'<>'all-you-can-drink' and i->>'id'=p->>'item' limit 1;
  if item is null or st.profile->'excludeItemIds' ? (item->>'id') or not (st.profile->'includeItemIds' ? (item->>'id') or st.profile->'categories' ? (cat->>'id')) then raise exception '対象外の商品です'; end if;
  -- Validate each chosen option against live menu and the shared standard profile.
  for opt in select jsonb_array_elements_text(coalesce(p->'options','[]')) loop
   valid := false;
   for group_rule in select * from jsonb_array_elements(coalesce(item->'optionGroups','[]')) loop
    if group_rule->'choices' ? opt and (st.profile->'optionChoiceRules'->(item->>'id')->(group_rule->>'id') is null or st.profile->'optionChoiceRules'->(item->>'id')->(group_rule->>'id') ? opt) then valid := true; end if;
   end loop;
   if not valid then raise exception '対象外のオプションです'; end if;
  end loop;
  if jsonb_array_length(coalesce(p->'options','[]')) <> (select count(distinct v) from jsonb_array_elements_text(coalesce(p->'options','[]')) v) then raise exception 'オプションが重複しています'; end if;
  for group_rule in select * from jsonb_array_elements(coalesce(item->'optionGroups','[]')) loop
   if coalesce((group_rule->>'required')::boolean,false)
    and coalesce(st.profile->'optionChoiceRules'->(item->>'id')->(group_rule->>'id'),group_rule->'choices') <> '[]'::jsonb
    and not exists(select 1 from jsonb_array_elements_text(coalesce(p->'options','[]')) v where group_rule->'choices' ? v)
   then raise exception '必須オプションを選択してください'; end if;
   if (select count(*) from jsonb_array_elements_text(coalesce(p->'options','[]')) v where group_rule->'choices' ? v)>1 then raise exception '同じオプショングループは1つだけ選択できます'; end if;
  end loop;
  loc := s.location;
  insert into public.drink_orders(id,source,drink_name,quantity,target,table_no,seat_no,payment_status,payment_method,notes,status,events,warmup_session_id)
  values(gen_random_uuid(),'table',item->>'name',1,loc->>'target',loc->>'tableNo',loc->>'seatNo','paid','unknown',
   'Warmup / '||coalesce((select string_agg(v,' / ') from jsonb_array_elements_text(coalesce(p->'options','[]')) v),''),'ordered',
   jsonb_build_array(jsonb_build_object('type','ordered','at',now(),'source','warmup','sessionId',s.id,'itemId',item->>'id','orderLocation',loc)),s.id) returning * into o;
 end if;
 select coalesce(jsonb_agg(x),'[]') into orders from public.drink_orders x where warmup_session_id=s.id;
 return jsonb_build_object('day',today,'reason',reason,'stopped',d.stopped,'profile',st.profile,'serverNow',now(),'token',token,'order',to_jsonb(o),'orders',orders,
  'session',case when s.id is null then null else jsonb_build_object('sessionId',s.id,'status','active','deviceBinding',s.device,'expiresAt',s.expires,'currentLocation',s.location,'planId','unlimited-alcohol-all-day') end);
end $$;
revoke all on function public.warmup_api(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.warmup_api(jsonb,uuid,text) to service_role;
