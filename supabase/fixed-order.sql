-- Requires the existing security foundation and sales-analytics.sql.
begin;
-- Distinguish scheduled retention from an intentional hard deletion. Archive
-- retention history stays valid; explicitly deleted orders are excluded.
do $$
declare job record;
begin
 select jobid,command into job from cron.job where jobname='drink-orders-retention-24h';
 if found and job.command not like '%drink.retention_cleanup%' then
   if regexp_replace(job.command,'\s','','g') <> 'deletefrompublic.drink_orderswherecreated_at<now()-interval''24hours'';' then
     raise exception 'Retention command changed; inspect before migration';
   end if;
   perform cron.alter_job(job.jobid,command := 'begin; select set_config(''drink.retention_cleanup'',''on'',true); '||job.command||' commit;');
 end if;
end $$;
create or replace function drink_private.popular_capture_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('drink.retention_cleanup',true),'')<>'on' then
   update drink_private.analytics_orders set row_data=jsonb_set(row_data,'{popularity_deleted}','true') where id=old.id;
 end if;
 return old;
end $$;
revoke all on function drink_private.popular_capture_delete() from public,anon,authenticated;
drop trigger if exists popular_order_delete on public.drink_orders;
create trigger popular_order_delete after delete on public.drink_orders for each row execute function drink_private.popular_capture_delete();
-- Reviewed live menu: these three whiskey products have soda highball options.
-- Keep the alcohol parent and all item fields, so plan IDs and recipes survive.
do $$
declare before_menu jsonb; after_menu jsonb; c jsonb; ids text[]:=array['item-1783052940322','item-1783052950604','item-1783052961537'];
begin
 select menu into before_menu from public.drink_app_settings where id='main' for update;
 select x into c from jsonb_array_elements(before_menu) x where x->>'id'='alcohol';
 if (select count(*) from jsonb_array_elements(c->'items') i where i->>'id'=any(ids)
     and i->>'name' in ('ブラックニッカ','メーカーズマーク','ジャックダニエル')
     and i->>'subcategory_id' in ('whiskey','highball')
     and i->'optionGroups' @> '[{"id":"whiskey-mix","choices":["炭酸"]}]')<>3
 then raise exception 'Reviewed whiskey items changed; inspect menu before migration'; end if;
 if not exists(select 1 from jsonb_array_elements(c->'subcategories') s where s->>'id'='highball') then
   c:=jsonb_set(c,'{subcategories}',c->'subcategories'||'[{"id":"highball","label":"ハイボール"}]');
 end if;
 c:=jsonb_set(c,'{items}',(select jsonb_agg(case when i->>'id'=any(ids) then jsonb_set(i,'{subcategory_id}','"highball"') else i end order by n)
   from jsonb_array_elements(c->'items') with ordinality as t(i,n)));
 select jsonb_agg(case when x->>'id'='alcohol' then c else x end order by n) into after_menu
   from jsonb_array_elements(before_menu) with ordinality as t(x,n);
 if before_menu is distinct from after_menu then
   update public.drink_app_settings set menu=after_menu,updated_at=now() where id='main';
 end if;
end $$;

create or replace function public.drink_popular_items(p_store text,p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare result jsonb; lo timestamptz; hi timestamptz;
begin
 if auth.uid() is null or not public.is_drink_staff() then
   raise exception 'スタッフ権限が必要です' using errcode='42501'; end if;
 if not exists(select 1 from drink_private.analytics_store where id and store=p_store) then
   raise exception '店舗情報が一致しません' using errcode='42501'; end if;
 if p_limit is null or p_limit<1 or p_limit>10 then
   raise exception '取得件数は1〜10件です' using errcode='22023'; end if;
 lo:=(((now() at time zone 'Asia/Tokyo')::date-29)::timestamp at time zone 'Asia/Tokyo');
 hi:=now();
 with menu as (
   select i->>'id' iid,i->>'name' name,c->>'id' cid,
     row_number() over(order by coalesce(array_position(array[
       'beer','item-1783052940322','oolong-tea','green-tea','item-1783049172799',
       'iced-coffee','item-1783049531455','item-1783049599311','item-1783053231839','item-1783053270509'
     ]::text[],i->>'id'),100),case when c->>'id'='soft' then 0 else 1 end,cn,inumber) pos
   from public.drink_app_settings s,jsonb_array_elements(s.menu) with ordinality as ct(c,cn),
     jsonb_array_elements(c->'items') with ordinality as it(i,inumber)
   where s.id='main' and c->>'id' in ('soft','alcohol')
 ), valid as (
   select m.iid,a.created_at,greatest(0,least(1000,(a.row_data->>'quantity')::int)) qty
   from drink_private.analytics_orders a
   join lateral drink_private.analytics_menu(a.item_id,a.row_data->>'drink_name') resolved on true
   join menu m on m.iid=resolved.item_id
   where a.created_at<=hi and a.created_at>=hi-interval '366 days'
     and a.row_data->>'status' in ('ordered','making','made','served')
     and coalesce(a.row_data->>'popularity_deleted','false')<>'true'
     and not exists(select 1 from jsonb_array_elements(coalesce(a.row_data->'events','[]')) e
       where e->>'type' in ('correction','corrected','replaced','voided','canceled','cancelled','deleted','removed','modified','edited','updated'))
 ), ranked as (
   select iid,sum(qty) filter(where created_at>=lo) recent,sum(qty) older,
     max(created_at) filter(where created_at>=lo) recent_at,max(created_at) last_at
   from valid group by iid
 ), selected as (
   select m.*,coalesce(r.recent,0) recent,coalesce(r.older,0) history,r.last_at,
     case when coalesce(r.recent,0)>0 then 'recent' when coalesce(r.older,0)>0 then 'history' else 'fallback' end origin
   from menu m left join ranked r on r.iid=m.iid
   order by case when coalesce(r.recent,0)>0 then 0 when coalesce(r.older,0)>0 then 1 else 2 end,
     r.recent desc nulls last,r.recent_at desc nulls last,r.older desc nulls last,r.last_at desc nulls last,m.pos,m.iid
   limit p_limit
 ) select coalesce(jsonb_agg(jsonb_build_object('itemId',iid,'categoryId',cid,'count',recent,'origin',origin)), '[]') into result from selected;
 return jsonb_build_object('items',result,'since',lo,'generatedAt',hi,'historyDays',366);
end $$;
revoke all on function public.drink_popular_items(text,integer) from public,anon;
grant execute on function public.drink_popular_items(text,integer) to authenticated;
commit;
