-- Preserve live product prices, recipes, existing choices and other products.
-- Normal orders, unlimited STD/SP and shared Warmup all read these live options.
begin;
do $mix$
declare source jsonb; count_targets int;
begin
 select menu::jsonb into source from public.drink_app_settings where id='main' for update;
 select count(*) into count_targets from jsonb_array_elements(source) c,jsonb_array_elements(c->'items') i
 where i->>'id' in ('ichiryuno-mugi','tomino-hozan')
 and exists(select 1 from jsonb_array_elements(i->'optionGroups') g where g->>'id'='whiskey-mix');
 if count_targets<>2 then raise exception 'Both shochu mixing groups must exist'; end if;
 update public.drink_app_settings set menu=(select jsonb_agg(jsonb_set(c,'{items}',
   (select jsonb_agg(case when i->>'id' in ('ichiryuno-mugi','tomino-hozan') then jsonb_set(i,'{optionGroups}',
     (select jsonb_agg(case when g->>'id'='whiskey-mix' then jsonb_set(g,'{choices}',g->'choices' ||
       to_jsonb(array(select tea from unnest(array['緑茶','烏龍茶','紅茶']) tea where not(g->'choices' ? tea)))) else g end order by gn)
       from jsonb_array_elements(i->'optionGroups') with ordinality y(g,gn))) else i end order by ino)
    from jsonb_array_elements(c->'items') with ordinality z(i,ino))) order by cn)
   from jsonb_array_elements(source) with ordinality x(c,cn)),updated_at=now() where id='main';
end $mix$;
commit;
