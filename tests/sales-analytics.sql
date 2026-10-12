-- Run using the Management API / SQL Editor. All fixtures are rolled back.
begin;
do $$
declare staff_id uuid; summary jsonb; sid text:='analytics-test-session'; row_id uuid:=gen_random_uuid();
  item text; item_name text; before_price numeric; after_price numeric; n int;
begin
  select user_id into staff_id from drink_private.staff limit 1;
  if staff_id is null then raise exception 'An existing allowlisted staff account is required'; end if;
  perform set_config('request.jwt.claims','{}',true);
  begin perform public.drink_sales_summary('casinolivetokyo','2099-01-01','2099-01-01');
    raise exception 'anonymous was allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  begin perform public.drink_sales_summary('casinolivetokyo','2099-01-01','2099-01-01');
    raise exception 'non-staff was allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated')::text,true);
  begin perform public.drink_sales_summary('other-store','2099-01-01','2099-01-01');
    raise exception 'wrong store was allowed'; exception when insufficient_privilege then null; end;
  begin perform public.drink_sales_summary('casinolivetokyo','2099-01-01','2101-01-01');
    raise exception 'excessive range was allowed'; exception when invalid_parameter_value then null; end;
  if has_function_privilege('anon','public.drink_sales_summary(text,date,date)','EXECUTE') then raise exception 'anon grant'; end if;
  if has_table_privilege('anon','public.drink_orders','SELECT') then raise exception 'anon orders read'; end if;

  -- Use private archive fixtures; no customer order, kitchen or QR side effects.
  insert into drink_private.analytics_sessions(id,store,kind,plan_id,plan_name,activated_at,expires_at,price)
  values(sid,'casinolivetokyo','unlimited','test-plan','テスト','2098-12-31T15:00Z','2099-01-02T00:00Z',1500),
    ('analytics-test-warmup','casinolivetokyo','warmup','warmup','Warmup飲み放題','2098-12-31T15:00Z','2099-01-02T00:00Z',0);
  for n in 1..8 loop
    insert into drink_private.analytics_orders(id,created_at,row_data,item_id,category_name,unit_price)
    values(gen_random_uuid(),case n when 7 then '2098-12-31T14:59:59Z'::timestamptz when 8 then '2099-01-01T15:00Z'::timestamptz else '2098-12-31T15:00Z'::timestamptz end,
      jsonb_build_object('drink_name','テスト','quantity',2,'status',case when n=5 then 'canceled' when n=2 then 'ordered' else 'served' end,
        'events',jsonb_build_array(jsonb_build_object('type',case when n=6 then 'correction' else 'ordered' end,
          'source',case n when 3 then 'unlimited' when 4 then 'warmup' else 'reception' end,
          'sessionId',case n when 3 then sid when 4 then 'analytics-test-warmup' end))),
      case when n=2 then 'test-other-id' else 'test-id' end,null,case when n=1 then 500 end);
  end loop;
  summary:=public.drink_sales_summary('casinolivetokyo','2099-01-01','2099-01-01');
  if (summary#>>'{totals,total}')::int<>8 or (summary#>>'{totals,served}')::int<>6 or (summary#>>'{totals,pending}')::int<>2
    then raise exception 'boundary/status/correction: %',summary->'totals'; end if;
  if (summary#>>'{totals,single}')::int<>4 or (summary#>>'{totals,unlimited}')::int<>2 or (summary#>>'{totals,warmup}')::int<>2
    then raise exception 'classification'; end if;
  if (summary#>>'{revenue,known}')::int<>2500 or (summary#>>'{revenue,unknownOrders}')::int<>1 then raise exception 'unknown historical pricing'; end if;
  if jsonb_array_length(summary->'drinks')<>2 or summary#>>'{categories,0,category}'<>'カテゴリ不明' then raise exception 'identity/category'; end if;

  -- New order server price snapshot, then served update must preserve it.
  select i->>'id',i->>'name',(i->>'price')::numeric into item,item_name,before_price
    from public.drink_app_settings m,jsonb_array_elements(m.menu)c,jsonb_array_elements(c->'items')i
    where m.id='main' and c->>'id'='soft' limit 1;
  insert into public.drink_orders(id,source,drink_name,quantity,target,payment_status,payment_method,status,events)
    values(row_id,'reception',item_name,1,'bar','paid','cash','ordered',jsonb_build_array(jsonb_build_object('type','ordered','itemId',item)));
  select unit_price into after_price from drink_private.analytics_orders where id=row_id;
  if after_price is distinct from before_price then raise exception 'new order snapshot'; end if;
  update public.drink_orders set status='served',served_at=now() where id=row_id;
  select unit_price into after_price from drink_private.analytics_orders where id=row_id;
  if after_price is distinct from before_price then raise exception 'update snapshot'; end if;
  delete from public.drink_orders where id=row_id;
  if not exists(select 1 from drink_private.analytics_orders where id=row_id and row_data->>'status'='served') then raise exception 'retention archive'; end if;

  -- Reconnection updates one activation, not a new sale. Card reuse keeps history.
  insert into public.drink_app_settings(id,menu) values('aycd-session-analytics-test',jsonb_build_object('sessionId','analytics-trigger-test','planId','unlimited-soft-2h','status','pending'));
  update public.drink_app_settings set menu=menu||jsonb_build_object('activatedAt',now(),'expiresAt',now()+interval '2h','status','active') where id='aycd-session-analytics-test';
  select price into before_price from drink_private.analytics_sessions where id='analytics-trigger-test';
  update public.drink_app_settings set menu=menu||jsonb_build_object('deviceBinding','reconnected','activationRevision',gen_random_uuid()) where id='aycd-session-analytics-test';
  select count(*),max(price) into n,after_price from drink_private.analytics_sessions where id='analytics-trigger-test';
  if n<>1 or after_price is distinct from before_price then raise exception 'reconnection double count'; end if;
  update public.drink_app_settings set menu=jsonb_build_object('sessionId','new-pending-session','status','pending') where id='aycd-session-analytics-test';
  if not exists(select 1 from drink_private.analytics_sessions where id='analytics-trigger-test') then raise exception 'card reuse lost history'; end if;
  -- Warmup repeated authentication keeps one person and a zero price.
  insert into warmup_private.sessions(id,store,day,device,token_hash,expires)
    values(row_id,'casinolivetokyo','2099-01-01','analytics-test-device',gen_random_uuid()::text,'2099-01-01T15:00Z');
  insert into warmup_private.audit(store,action,detail) values('casinolivetokyo','auth-success',jsonb_build_object('session',row_id));
  insert into warmup_private.audit(store,action,detail) values('casinolivetokyo','auth-success',jsonb_build_object('session',row_id));
  select count(*),max(price) into n,after_price from drink_private.analytics_sessions where id=row_id::text;
  if n<>1 or after_price<>0 then raise exception 'Warmup double count/free price'; end if;
  -- Check actual authenticated role grants and RLS, not only function internals.
  execute 'set local role authenticated';
  summary:=public.drink_sales_summary('casinolivetokyo','2099-01-01','2099-01-01');
  if (summary#>>'{totals,total}')::int<>8 then raise exception 'staff RPC role'; end if;
  execute 'reset role';
end $$;
rollback;
select 'PASS: staff authorization, store/range, JST, cancellation/correction, classification, identity, unknown price, snapshots, archive and reconnection' as result;
