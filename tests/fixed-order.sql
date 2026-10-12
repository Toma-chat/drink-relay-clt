-- No persistent fixtures or kitchen orders. All test menu/archive changes roll back.
begin;
do $$
declare staff_id uuid; result jsonb; n integer; t timestamptz:=now();
begin
 select user_id into staff_id from drink_private.staff limit 1;
 if staff_id is null then raise exception 'Existing staff required'; end if;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.drink_popular_items('casinolivetokyo');raise exception 'Anonymous allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 begin perform public.drink_popular_items('casinolivetokyo');raise exception 'Nonstaff allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated')::text,true);
 begin perform public.drink_popular_items('wrong-store');raise exception 'Wrong store allowed';exception when insufficient_privilege then null;end;
 begin perform public.drink_popular_items('casinolivetokyo',11);raise exception 'Limit allowed';exception when invalid_parameter_value then null;end;
 if has_function_privilege('anon','public.drink_popular_items(text,integer)','EXECUTE') then raise exception 'Anonymous execute grant'; end if;
 if has_table_privilege('anon','public.drink_orders','SELECT') then raise exception 'Anonymous history grant'; end if;
 -- Replace only the transaction-local menu with twelve unique test products.
 update public.drink_app_settings set menu=jsonb_build_array(jsonb_build_object('id','soft','label','テスト','items',
   (select jsonb_agg(jsonb_build_object('id','fixed-test-'||i,'name','fixed test '||i,'price',500,'optionGroups','[]'::jsonb)) from generate_series(1,12)i))) where id='main';
 for n in 1..12 loop
  insert into drink_private.analytics_orders(id,created_at,item_id,row_data) values(gen_random_uuid(),
    case when n=1 then t-interval '20 days' when n=3 then t-interval '31 days' when n=4 then t-interval '367 days' else t-interval '1 minute' end,
    'fixed-test-'||n,jsonb_build_object('drink_name','fixed test '||n,'quantity',
      case when n in(1,2) then 100 when n=3 then 1000 else 10 end,
      'status',case when n=5 then 'canceled' else 'served' end,
      'popularity_deleted',n=7,'events',case when n=6 then '[{"type":"correction"}]'::jsonb else '[{"type":"ordered"}]'::jsonb end));
 end loop;
 -- Additional Warmup and unlimited cups count with the same stable product ID.
 insert into drink_private.analytics_orders(id,created_at,item_id,row_data)
 select gen_random_uuid(),t-interval '5 seconds','fixed-test-2',jsonb_build_object('drink_name','fixed test 2','quantity',1,'status','served',
   'events',jsonb_build_array(jsonb_build_object('type','ordered','source',kind))) from unnest(array['warmup','unlimited'])kind;
 insert into drink_private.analytics_orders(id,created_at,item_id,row_data) values
   (gen_random_uuid(),t-interval '20 days','fixed-test-1','{"drink_name":"fixed test 1","quantity":3,"status":"served","events":[]}'),
   (gen_random_uuid(),t-interval '1 minute',null,'{"drink_name":"fixed test 2","quantity":1,"status":"served","events":[]}'),
   (gen_random_uuid(),t-interval '1 minute','fixed-test-2','{"drink_name":"fixed test 2","quantity":1000,"status":"served","events":[{"type":"updated"}]}');
 -- A legacy name with multiple exact matches must not be merged.
 update public.drink_app_settings s set menu=jsonb_set(s.menu,'{0,items}',
   (select jsonb_agg(case when i->>'id' in ('fixed-test-11','fixed-test-12') then jsonb_set(i,'{name}','"ambiguous"') else i end order by t.n)
     from jsonb_array_elements(s.menu#>'{0,items}') with ordinality as t(i,n))) where id='main';
 insert into drink_private.analytics_orders(id,created_at,row_data) values(gen_random_uuid(),t-interval '1 minute',
   '{"drink_name":"ambiguous","quantity":1000,"status":"served","events":[]}');
 result:=public.drink_popular_items('casinolivetokyo');
 if jsonb_array_length(result->'items')<>10 or result#>>'{items,0,itemId}'<>'fixed-test-2' or result#>>'{items,0,count}'<>'103' or result#>>'{items,1,count}'<>'103' then raise exception 'Counts/identity/tie: %',result;end if;
 if exists(select 1 from jsonb_array_elements(result->'items')i where i->>'itemId' in ('fixed-test-11','fixed-test-12') and (i->>'count')::int<>10) then raise exception 'Ambiguous name merged';end if;
 if result#>>'{items,7,itemId}'<>'fixed-test-3' or result#>>'{items,7,origin}'<>'history' then raise exception 'Old history supplement: %',result;end if;
 if exists(select 1 from jsonb_array_elements(result->'items')i where i->>'itemId' in ('fixed-test-4','fixed-test-5','fixed-test-6','fixed-test-7') and i->>'origin'<>'fallback') then raise exception 'Invalid rows counted';end if;
 if not exists(select 1 from jsonb_array_elements(result->'items')i where i->>'origin'='fallback') then raise exception 'Fallback missing';end if;
 if (result->>'since')::timestamptz<>(((now() at time zone 'Asia/Tokyo')::date-29)::timestamp at time zone 'Asia/Tokyo') then raise exception 'JST boundary';end if;
 raise notice 'PASS auth/store/limits, quantities, all sources, cancellations/corrections/deletions, 30-day priority, older history, fallback and JST';
end $$;
rollback;
