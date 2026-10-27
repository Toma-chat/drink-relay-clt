-- Keep Sonic and tonic as distinct drinks while preserving their existing price and ice options.
begin;
do $migration$
declare
  current_menu jsonb;
  updated_menu jsonb;
  juice_category jsonb;
  updated_juice jsonb;
  sonic_item jsonb;
  tonic_item jsonb;
  sonic_position bigint;
  tonic_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('drink-menu-tonic-sonic-20261027'));
  select menu into current_menu from public.drink_app_settings
    where id = 'main' for update;
  if current_menu is null or jsonb_typeof(current_menu) <> 'array' then
    raise exception 'Shared menu is missing';
  end if;

  select c into juice_category from jsonb_array_elements(current_menu) c
    where c->>'id' = 'juice';
  select i, n into sonic_item, sonic_position
    from jsonb_array_elements(juice_category->'items') with ordinality x(i, n)
    where i->>'id' = 'sonic';
  if sonic_item is null or sonic_item->>'name' not in ('トニック', 'ソニック') then
    raise exception 'Expected the existing Sonic item in the juice category';
  end if;
  if (select count(*) from jsonb_array_elements(current_menu) c,
      jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
      where i->>'id' = 'sonic') <> 1 then
    raise exception 'Sonic must have exactly one product ID';
  end if;

  select count(*) into tonic_count from jsonb_array_elements(current_menu) c,
    jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
    where i->>'id' = 'tonic';
  if tonic_count > 1 or (tonic_count = 1 and not exists (
    select 1 from jsonb_array_elements(juice_category->'items') i
      where i->>'id' = 'tonic' and i->>'name' = 'トニック'
  )) then
    raise exception 'An incompatible tonic item already exists';
  end if;

  tonic_item := sonic_item || jsonb_build_object(
    'id', 'tonic', 'name', 'トニック', 'recipe', 'トニックウォーターを注ぐ'
  );
  updated_juice := jsonb_set(juice_category, '{items}', (
    select jsonb_agg(case when i->>'id' = 'sonic' then
      i || jsonb_build_object('name', 'ソニック', 'recipe', '炭酸水とトニックウォーターを合わせる')
      else i end order by n)
    from jsonb_array_elements(juice_category->'items') with ordinality x(i, n)
  ));
  if tonic_count = 0 then
    updated_juice := jsonb_insert(updated_juice,
      array['items', sonic_position::text], tonic_item, false);
  end if;
  select jsonb_agg(case when c->>'id' = 'juice' then updated_juice else c end order by n)
    into updated_menu from jsonb_array_elements(current_menu) with ordinality x(c, n);
  if updated_menu is distinct from current_menu then
    update public.drink_app_settings set menu = updated_menu, updated_at = now()
      where id = 'main';
  end if;
end $migration$;
commit;
