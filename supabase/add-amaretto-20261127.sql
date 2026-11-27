-- Add Amaretto to the shared cocktail menu. The Alcohol SP plan is configured in unlimited-config.js.
begin;
do $migration$
declare
  current_menu jsonb;
  existing_count integer;
  kahlua_position bigint;
  amaretto jsonb := jsonb_build_object(
    'id', 'amaretto',
    'name', 'アマレット',
    'price', 800,
    'recipe', 'アマレット30mlを入れ、選択した割り材で満たして軽くステアする',
    'subcategory_id', 'cocktail',
    'optionGroups', jsonb_build_array(
      jsonb_build_object('id', 'amaretto-mix', 'label', '割り方',
        'choices', jsonb_build_array('ミルク', 'ジンジャーエール', 'コーラ', '烏龍茶'),
        'required', true),
      jsonb_build_object('id', 'straw', 'label', 'ストロー',
        'choices', jsonb_build_array('ストローあり'), 'required', false),
      jsonb_build_object('id', 'ice', 'label', '氷',
        'choices', jsonb_build_array('氷少なめ', '氷なし'), 'required', false)
    )
  );
begin
  perform pg_advisory_xact_lock(hashtext('drink-menu-amaretto-20261127'));
  select menu into current_menu from public.drink_app_settings
    where id = 'main' for update;
  if current_menu is null or jsonb_typeof(current_menu) <> 'array' then
    raise exception 'Shared menu is missing';
  end if;

  select count(*) into existing_count
    from jsonb_array_elements(current_menu) c,
         jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
    where i->>'id' = 'amaretto' or i->>'name' = 'アマレット';
  if existing_count = 1 and exists (
    select 1 from jsonb_array_elements(current_menu) c,
         jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
    where c->>'id' = 'alcohol' and i = amaretto
  ) then
    return;
  elsif existing_count <> 0 then
    raise exception 'An incompatible Amaretto item already exists';
  end if;

  select n into kahlua_position
    from jsonb_array_elements(current_menu) c,
         jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) with ordinality x(i, n)
    where c->>'id' = 'alcohol' and i->>'id' = 'item-1783053374220'
      and i->>'subcategory_id' = 'cocktail';
  if kahlua_position is null then
    raise exception 'Cocktail insertion point is missing';
  end if;

  update public.drink_app_settings s
     set menu = (
       select jsonb_agg(case when c->>'id' = 'alcohol'
         then jsonb_insert(c, array['items', kahlua_position::text], amaretto, false)
         else c end order by n)
       from jsonb_array_elements(current_menu) with ordinality x(c, n)
     ), updated_at = now()
   where s.id = 'main';
end $migration$;
commit;
