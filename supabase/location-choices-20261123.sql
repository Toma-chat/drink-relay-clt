-- Update validation only. Preserve deployed performance/menu fixes, grants and all rows.
begin;
do $migration$
declare
 definition text;
 signature text;
begin
 foreach signature in array array['public.drink_unlimited_mutate(text,text,text,text,jsonb,jsonb)','public.warmup_api(jsonb,uuid,text)'] loop
  definition := pg_get_functiondef(signature::regprocedure);
  if strpos(definition, '(''tournament'',''ring'',''casino'',''bar'')') = 0 then
   if strpos(definition, '(''bar'',''ring'',''tournament'')') = 0 then
    raise exception 'Unexpected destination validation in %', signature;
   end if;
   definition := replace(definition, '(''bar'',''ring'',''tournament'')', '(''tournament'',''ring'',''casino'',''bar'')');
  end if;
  definition := replace(definition, '(''A'',''B'',''C'',''D'',''E'',''F'',''G'',''H'')', '(''A'',''B'',''C'',''D'',''E'',''F'',''G'')');
  definition := replace(definition, '^[A-H]$', '^[A-G]$');
  execute definition;
 end loop;
end $migration$;
commit;
