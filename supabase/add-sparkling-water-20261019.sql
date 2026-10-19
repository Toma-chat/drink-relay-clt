-- Add carbonated water to the shared menu without changing existing items.
begin;
do $migration$
declare
  current_menu jsonb;
  water_items jsonb;
  new_item jsonb := jsonb_build_object(
    'id', 'sparkling-water',
    'name', '炭酸水',
    'price', 600,
    'recipe', '',
    'optionGroups', jsonb_build_array(jsonb_build_object(
      'id', 'ice', 'label', '氷', 'choices', jsonb_build_array('氷あり', '氷なし'), 'required', true
    )),
    'subcategory_id', 'default'
  );
begin
  perform pg_advisory_xact_lock(hashtext('drink-menu-sparkling-water-20261019'));
  select menu::jsonb into current_menu
    from public.drink_app_settings where id = 'main' for update;
  if current_menu is null or jsonb_typeof(current_menu) <> 'array' then
    raise exception 'Shared menu is missing';
  end if;
  if exists (
    select 1 from jsonb_array_elements(current_menu) c,
      jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
    where i->>'id' = 'sparkling-water' or i->>'name' = '炭酸水'
  ) then
    raise exception 'Carbonated water already exists; inspect before changing it';
  end if;
  select c->'items' into water_items
    from jsonb_array_elements(current_menu) c where c->>'id' = 'water-tea';
  if water_items is null or jsonb_typeof(water_items) <> 'array'
    or water_items->0->>'id' <> 'oolong-tea' then
    raise exception 'Water and tea category has changed';
  end if;
  update public.drink_app_settings s
    set menu = (
      select jsonb_agg(
        case when c->>'id' = 'water-tea'
          then jsonb_insert(c, '{items,1}', new_item, false)
          else c end order by position
      ) from jsonb_array_elements(current_menu) with ordinality x(c, position)
    ), updated_at = now()
    where s.id = 'main';
end $migration$;
commit;
