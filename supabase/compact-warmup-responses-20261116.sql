-- Patch only response construction; preserve deployed menu rules, locks and permissions.
begin;
do $migration$
declare
 definition text;
 old_query text := $old$ select coalesce(jsonb_agg(x),'[]') into orders from public.drink_orders x where warmup_session_id=s.id;$old$;
 new_query text := $new$ if coalesce((p->>'compact')::boolean,false) then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'status',x.status)),'[]') into orders
   from (select id,status from public.drink_orders where warmup_session_id=s.id and status in ('ordered','making','made') limit 1) x;
 else
  select coalesce(jsonb_agg(x),'[]') into orders from public.drink_orders x where warmup_session_id=s.id;
 end if;$new$;
 old_fields text := $old$'order',to_jsonb(o),'orders',orders,$old$;
 new_fields text := $new$'order',to_jsonb(o),'orders',orders,'hasOrders',exists(select 1 from public.drink_orders where warmup_session_id=s.id),$new$;
begin
 definition := replace(pg_get_functiondef('public.warmup_api(jsonb,uuid,text)'::regprocedure),E'\r\n',E'\n');
 if strpos(definition, 'compact') > 0 and strpos(definition, 'hasOrders') > 0 then return; end if;
 if length(definition)-length(replace(definition,old_query,'')) <> length(old_query)
   or length(definition)-length(replace(definition,old_fields,'')) <> length(old_fields) then
   raise exception 'Unexpected Warmup response definition: no changes applied';
 end if;
 execute replace(replace(definition,old_query,new_query),old_fields,new_fields);
end $migration$;
create index if not exists drink_orders_warmup_session_idx on public.drink_orders(warmup_session_id) where warmup_session_id is not null;
commit;
