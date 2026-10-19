-- Keep the shared à-la-carte name, but label weekday Warmup orders as 水.
begin;
do $migration$
declare
  definition text;
  old_expression text := $old$values(gen_random_uuid(),'table',item->>'name',1,$old$;
  new_expression text := $new$values(gen_random_uuid(),'table',case when item->>'id'='oolong-tea' then '水' else item->>'name' end,1,$new$;
begin
  definition := pg_get_functiondef('public.warmup_api(jsonb,uuid,text)'::regprocedure);
  if length(definition) - length(replace(definition, old_expression, '')) <> length(old_expression) then
    raise exception 'Expected Warmup order expression was not found exactly once';
  end if;
  execute replace(definition, old_expression, new_expression);
end $migration$;
commit;
