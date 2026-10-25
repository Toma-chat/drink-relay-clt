-- Add three beer cocktails and Sonic to the shared menu; include Sonic in weekday Warmup.
begin;
do $migration$
declare
  current_menu jsonb;
  current_profile jsonb;
  beer_after bigint;
  juice_after bigint;
  existing_items integer;
  orange_beer jsonb := jsonb_build_object(
    'id', 'orange-beer', 'name', 'オレンジビール', 'price', 800,
    'recipe', '生ビールとオレンジジュースを合わせる',
    'optionGroups', '[]'::jsonb, 'subcategory_id', 'beer'
  );
  kahlua_beer jsonb := jsonb_build_object(
    'id', 'kahlua-beer', 'name', 'カルーアビール', 'price', 800,
    'recipe', '生ビールとカルーアを合わせる',
    'optionGroups', '[]'::jsonb, 'subcategory_id', 'beer'
  );
  diesel jsonb := jsonb_build_object(
    'id', 'diesel', 'name', 'ディーゼル', 'price', 800,
    'recipe', '生ビールとコーラを合わせる',
    'optionGroups', '[]'::jsonb, 'subcategory_id', 'beer'
  );
  sonic jsonb := jsonb_build_object(
    'id', 'sonic', 'name', 'ソニック', 'price', 600,
    'recipe', '炭酸水とトニックウォーターを合わせる',
    'optionGroups', jsonb_build_array(jsonb_build_object(
      'id', 'ice', 'label', '氷',
      'choices', jsonb_build_array('氷少なめ', '氷なし'), 'required', false
    )), 'subcategory_id', 'default'
  );
begin
  perform pg_advisory_xact_lock(hashtext('drink-menu-beer-sonic-20261025'));
  select menu::jsonb into current_menu from public.drink_app_settings
    where id = 'main' for update;
  if current_menu is null or jsonb_typeof(current_menu) <> 'array' then
    raise exception 'Shared menu is missing';
  end if;
  select count(*) into existing_items from jsonb_array_elements(current_menu) c,
    jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
    where i->>'id' in ('orange-beer', 'kahlua-beer', 'diesel', 'sonic')
      or i->>'name' in ('オレンジビール', 'カルーアビール', 'ディーゼル', 'ソニック');
  if existing_items not in (0, 4) then
    raise exception 'Only some new drinks exist; inspect before changing the menu';
  end if;
  if existing_items = 4 and (
    select count(*) from jsonb_array_elements(current_menu) c,
      jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
    where (c->>'id' = 'alcohol' and i in (orange_beer, kahlua_beer, diesel))
       or (c->>'id' = 'juice' and i = sonic)
  ) <> 4 then
    raise exception 'Existing drinks differ from the requested configuration';
  end if;
  select n into beer_after from jsonb_array_elements(
    (select c->'items' from jsonb_array_elements(current_menu) c where c->>'id' = 'alcohol')
  ) with ordinality x(i,n) where i->>'id' = 'item-1783052901930';
  select n into juice_after from jsonb_array_elements(
    (select c->'items' from jsonb_array_elements(current_menu) c where c->>'id' = 'juice')
  ) with ordinality x(i,n) where i->>'id' = 'item-1783049531455';
  if beer_after is null or juice_after is null then
    raise exception 'Existing beer or juice menu has changed';
  end if;
  select profile into current_profile from warmup_private.stores
    where id = 'casinolivetokyo' for update;
  if current_profile is null
    or jsonb_typeof(current_profile->'includeItemIds') is distinct from 'array' then
    raise exception 'Weekday Warmup profile is missing or invalid';
  end if;
  if existing_items = 0 then
    update public.drink_app_settings s set menu = (
      select jsonb_agg(case
        when c->>'id' = 'alcohol' then
          jsonb_insert(jsonb_insert(jsonb_insert(c,
            array['items', beer_after::text], orange_beer, false),
            array['items', (beer_after + 1)::text], kahlua_beer, false),
            array['items', (beer_after + 2)::text], diesel, false)
        when c->>'id' = 'juice' then
          jsonb_insert(c, array['items', juice_after::text], sonic, false)
        else c end order by position)
      from jsonb_array_elements(current_menu) with ordinality x(c,position)
    ), updated_at = now() where s.id = 'main';
  end if;
  update warmup_private.stores set profile = jsonb_set(current_profile, '{includeItemIds}',
    current_profile->'includeItemIds'
      || case when current_profile->'includeItemIds' ? 'sonic'
        then '[]'::jsonb else jsonb_build_array('sonic') end
  ) where id = 'casinolivetokyo';
end $migration$;
commit;
