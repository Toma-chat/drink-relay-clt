-- Additive upgrade. Existing RLS, QR cards, retention job and APIs remain intact.
begin;
create table if not exists drink_private.analytics_store (
  id boolean primary key default true check(id), store text not null
);
insert into drink_private.analytics_store values(true,'casinolivetokyo') on conflict do nothing;
create table if not exists drink_private.analytics_orders (
  id uuid primary key, created_at timestamptz not null, row_data jsonb not null,
  item_id text, category_id text, category_name text, unit_price numeric,
  captured_at timestamptz not null default now()
);
create index if not exists analytics_orders_date on drink_private.analytics_orders(created_at);
create table if not exists drink_private.analytics_sessions (
  id text primary key, store text not null, kind text not null,
  plan_id text not null, plan_name text not null, activated_at timestamptz not null,
  expires_at timestamptz, ended boolean not null default false, price numeric
);
create index if not exists analytics_sessions_date on drink_private.analytics_sessions(activated_at);
revoke all on all tables in schema drink_private from public,anon,authenticated;

-- Resolve legacy names only when exactly one item matches. Never merge distinct IDs.
create or replace function drink_private.analytics_menu(p_id text,p_name text)
returns table(item_id text,category_id text,category_name text,price numeric,plan boolean)
language sql stable security definer set search_path='' as $$
  with matches as (
    select i->>'id' iid,c->>'id' cid,
      case when c->>'id'='alcohol' then coalesce(
        (select s->>'label' from jsonb_array_elements(coalesce(c->'subcategories','[]')) s
          where s->>'id'=i->>'subcategory_id' limit 1),c->>'label') else c->>'label' end cname,
      case when jsonb_typeof(i->'price')='number' and (i->>'price')::numeric>=0
        then (i->>'price')::numeric end amount,
      c->>'id'='all-you-can-drink' isplan
    from public.drink_app_settings m,
      jsonb_array_elements(case when jsonb_typeof(m.menu)='array' then m.menu else '[]' end) c,
      jsonb_array_elements(coalesce(c->'items','[]')) i
    where m.id='main' and case when nullif(p_id,'') is not null then i->>'id'=p_id else i->>'name'=p_name end
  ) select iid,cid,cname,amount,isplan from matches where (select count(*) from matches)=1;
$$;

create or replace function drink_private.analytics_capture_order()
returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; iid text; m record;
begin
  if TG_OP='DELETE' then return old; end if;
  r:=to_jsonb(new);
  select e->>'itemId' into iid from jsonb_array_elements(new.events) e
    where e->>'type'='ordered' and e->>'itemId' is not null limit 1;
  select * into m from drink_private.analytics_menu(iid,new.drink_name);
  insert into drink_private.analytics_orders(id,created_at,row_data,item_id,category_id,category_name,unit_price)
    values(new.id,new.created_at,r,coalesce(iid,m.item_id),m.category_id,m.category_name,
      case when TG_OP='INSERT' and new.created_at>=now()-interval '5 minutes' then m.price end)
  on conflict(id) do update set row_data=excluded.row_data;
  return new;
end $$;
drop trigger if exists analytics_order_capture on public.drink_orders;
create trigger analytics_order_capture after insert or update on public.drink_orders
  for each row execute function drink_private.analytics_capture_order();

create or replace function drink_private.analytics_capture_session()
returns trigger language plpgsql security definer set search_path='' as $$
declare v jsonb:=new.menu; m record; st text; amount numeric;
begin
  if new.id not like 'aycd-session-%' or jsonb_typeof(v)<>'object'
     or nullif(v->>'activatedAt','') is null or nullif(v->>'sessionId','') is null then return new; end if;
  select store into st from drink_private.analytics_store where id;
  select * into m from drink_private.analytics_menu(v->>'planId',null);
  -- Reconnection cannot change the original activation or price.
  if TG_OP='INSERT' then amount:=m.price;
  elsif old.menu->>'sessionId' is distinct from v->>'sessionId'
     or nullif(old.menu->>'activatedAt','') is null then amount:=m.price; end if;
  insert into drink_private.analytics_sessions(id,store,kind,plan_id,plan_name,activated_at,expires_at,ended,price)
    values(v->>'sessionId',st,'unlimited',v->>'planId',coalesce(v->>'planName',v->>'planId'),
      (v->>'activatedAt')::timestamptz,(v->>'expiresAt')::timestamptz,v->>'status'='revoked',amount)
    on conflict(id) do update set expires_at=excluded.expires_at,ended=excluded.ended;
  return new;
end $$;
drop trigger if exists analytics_session_capture on public.drink_app_settings;
create trigger analytics_session_capture after insert or update on public.drink_app_settings
  for each row execute function drink_private.analytics_capture_session();

-- The auth-success audit occurs in the same transaction as Warmup authentication.
create or replace function drink_private.analytics_capture_warmup()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.action='auth-success' then
    insert into drink_private.analytics_sessions(id,store,kind,plan_id,plan_name,activated_at,expires_at,ended,price)
    select s.id::text,s.store,'warmup','warmup','Warmup飲み放題',new.at,s.expires,s.revoked,0
      from warmup_private.sessions s where s.id::text=new.detail->>'session'
    on conflict(id) do update set expires_at=excluded.expires_at,ended=excluded.ended;
  end if;
  return new;
end $$;
drop trigger if exists analytics_warmup_capture on warmup_private.audit;
create trigger analytics_warmup_capture after insert on warmup_private.audit
  for each row execute function drink_private.analytics_capture_warmup();

-- Preserve all currently available history; past prices remain unknown.
insert into drink_private.analytics_orders(id,created_at,row_data,item_id,category_id,category_name)
select o.id,o.created_at,to_jsonb(o),coalesce(e.iid,m.item_id),m.category_id,m.category_name
from public.drink_orders o
left join lateral (select x->>'itemId' iid from jsonb_array_elements(o.events) x
  where x->>'type'='ordered' and x->>'itemId' is not null limit 1) e on true
left join lateral drink_private.analytics_menu(e.iid,o.drink_name) m on true
on conflict do nothing;
insert into drink_private.analytics_sessions(id,store,kind,plan_id,plan_name,activated_at,expires_at,ended)
select menu->>'sessionId',(select store from drink_private.analytics_store where id),'unlimited',
  menu->>'planId',coalesce(menu->>'planName',menu->>'planId'),(menu->>'activatedAt')::timestamptz,
  (menu->>'expiresAt')::timestamptz,menu->>'status'='revoked'
from public.drink_app_settings where id like 'aycd-session-%' and nullif(menu->>'activatedAt','') is not null
on conflict do nothing;
insert into drink_private.analytics_sessions(id,store,kind,plan_id,plan_name,activated_at,expires_at,ended,price)
select s.id::text,s.store,'warmup','warmup','Warmup飲み放題',min(a.at),s.expires,s.revoked,0
from warmup_private.sessions s join warmup_private.audit a
  on a.detail->>'session'=s.id::text and a.action='auth-success'
group by s.id on conflict do nothing;
create table if not exists drink_private.analytics_metadata (
  id boolean primary key default true check(id), history_since timestamptz not null default now()
);
insert into drink_private.analytics_metadata(id) values(true) on conflict do nothing;

create or replace function public.drink_sales_summary(p_store text,p_start date,p_end date)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='15s' as $$
declare result jsonb; lo timestamptz; hi timestamptz;
begin
  if auth.uid() is null then raise exception 'スタッフログインが必要です' using errcode='42501'; end if;
  if not public.is_drink_staff() then raise exception 'スタッフ権限がありません' using errcode='42501'; end if;
  if not exists(select 1 from drink_private.analytics_store where id and store=p_store)
    then raise exception '店舗情報が一致しません' using errcode='42501'; end if;
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>365
    then raise exception '期間は最大366日です' using errcode='22023'; end if;
  lo:=p_start::timestamp at time zone 'Asia/Tokyo';
  hi:=(p_end+1)::timestamp at time zone 'Asia/Tokyo';
  with orders as (
    select a.*,coalesce(a.item_id,'legacy:'||(a.row_data->>'drink_name')) as key,
      coalesce(a.category_name,m.category_name,'カテゴリ不明') category,
      (a.row_data->>'quantity')::int qty,a.row_data->>'status' status,
      coalesce(a.row_data->>'warmup_session_id',e.sid) sid,
      case when a.row_data->>'warmup_session_id' is not null or e.src='warmup' then 'warmup'
        when e.src='unlimited' then 'unlimited' else 'single' end kind,
      (a.category_id='all-you-can-drink' or coalesce(m.plan,false)) is_plan_product
    from drink_private.analytics_orders a
    left join lateral (select x->>'sessionId' sid,x->>'source' src from jsonb_array_elements(a.row_data->'events') x
      where x->>'type'='ordered' limit 1) e on true
    left join lateral drink_private.analytics_menu(a.item_id,a.row_data->>'drink_name') m on true
    where a.created_at>=lo and a.created_at<hi and a.row_data->>'status' in ('ordered','making','made','served')
      and not exists(select 1 from jsonb_array_elements(a.row_data->'events') x
        where x->>'type' in ('correction','corrected','replaced','voided','canceled'))
  ), cups as (select * from orders where not coalesce(is_plan_product,false)),
  groups as (
    select key,row_data->>'drink_name' name,category,kind,sum(qty) total,
      coalesce(sum(qty) filter(where status='served'),0) served,
      coalesce(sum(qty) filter(where status<>'served'),0) pending
    from cups group by key,row_data->>'drink_name',category,kind
  ), drinks as (
    select key,name,category,sum(total) total,sum(served) served,sum(pending) pending,
      coalesce(sum(total) filter(where kind='single'),0) single,
      coalesce(sum(total) filter(where kind='unlimited'),0) unlimited,
      coalesce(sum(total) filter(where kind='warmup'),0) warmup
    from groups group by key,name,category
  ), sessions as (
    select s.*,s.activated_at>=lo and s.activated_at<hi in_period,
      not s.ended and s.expires_at>now() and case when s.kind='warmup' then
        exists(select 1 from warmup_private.sessions w where w.id::text=s.id and not w.revoked and w.expires>now())
        else true end active
    from drink_private.analytics_sessions s where s.store=p_store
  ), plan_catalog as (
    select i->>'id' id,i->>'name' name from public.drink_app_settings a,
      jsonb_array_elements(case when jsonb_typeof(a.menu)='array' then a.menu else '[]' end) c,
      jsonb_array_elements(coalesce(c->'items','[]')) i where a.id='main' and c->>'id'='all-you-can-drink'
    union select 'warmup','Warmup飲み放題'
    union select plan_id,max(plan_name) from sessions group by plan_id
  ), plans as (
    select p.id,max(p.name) name,
      (select count(*) from sessions s where s.plan_id=p.id and s.in_period) people,
      (select count(*) from sessions s where s.plan_id=p.id and s.in_period and s.active) active,
      (select count(*) from sessions s where s.plan_id=p.id and s.in_period and not s.active) ended,
      coalesce((select sum(c.qty) from cups c join sessions s on c.sid=s.id where s.plan_id=p.id),0) total,
      coalesce((select sum(c.qty) from cups c join sessions s on c.sid=s.id where s.plan_id=p.id and c.status='served'),0) served,
      (select round(coalesce((select sum(c.qty) from cups c join sessions s on c.sid=s.id where s.plan_id=p.id),0)::numeric/
        nullif(count(*),0),2) from sessions s where s.plan_id=p.id and
          (s.in_period or exists(select 1 from cups c where c.sid=s.id))) average
    from plan_catalog p group by p.id
  ) select jsonb_build_object(
    'start',p_start,'end',p_end,'generatedAt',now(),'historySince',(select history_since from drink_private.analytics_metadata where id),
    'totals',(select jsonb_build_object('total',coalesce(sum(qty),0),'served',coalesce(sum(qty) filter(where status='served'),0),
      'pending',coalesce(sum(qty) filter(where status<>'served'),0),'single',coalesce(sum(qty) filter(where kind='single'),0),
      'unlimited',coalesce(sum(qty) filter(where kind='unlimited'),0),'warmup',coalesce(sum(qty) filter(where kind='warmup'),0),
      'people',(select count(*) from sessions where kind='unlimited' and in_period),
      'average',(select round(coalesce((select sum(c.qty) from cups c where c.kind in ('unlimited','warmup')
          and exists(select 1 from sessions s where s.id=c.sid)),0)::numeric/nullif(count(*),0),2)
        from sessions s where s.in_period or exists(select 1 from cups c where c.sid=s.id))) from cups),
    'revenue',jsonb_build_object(
      'known',coalesce((select sum(unit_price*qty) from cups where kind='single'),0)+coalesce((select sum(price) from sessions where kind='unlimited' and in_period),0),
      'unknownOrders',(select count(*) from cups where kind='single' and unit_price is null),
      'unknownPlans',(select count(*) from sessions where kind='unlimited' and in_period and price is null)),
    'drinks',coalesce((select jsonb_agg(to_jsonb(d) order by d.total desc,d.key,d.name) from drinks d),'[]'),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.total desc) from (select category,sum(total) total from groups group by category) c),'[]'),
    'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from plans p),'[]'),
    'csv',coalesce((select jsonb_agg(to_jsonb(g) order by g.total desc,g.key) from groups g),'[]'),
    'unmatchedSessionCups',coalesce((select sum(qty) from cups c where kind<>'single' and not exists(select 1 from sessions s where s.id=c.sid)),0)
  ) into result;
  return result;
end $$;
revoke all on all functions in schema drink_private from public,anon,authenticated;
revoke all on function public.drink_sales_summary(text,date,date) from public,anon;
grant execute on function public.drink_sales_summary(text,date,date) to authenticated;
commit;
