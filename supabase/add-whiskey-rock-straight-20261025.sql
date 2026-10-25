-- Add Black Nikka rock and straight to the shared menu and weekday Warmup.
begin;
do $migration$
declare
  current_menu jsonb;
  current_profile jsonb;
  alcohol_items jsonb;
  insert_after bigint;
  matching_items integer;
  rock jsonb := jsonb_build_object(
    'id', 'whiskey-rock', 'name', 'ウイスキーロック', 'price', 800,
    'recipe', 'ブラックニッカを氷入りグラスに注ぐ', 'subcategory_id', 'whiskey',
    'optionGroups', jsonb_build_array(jsonb_build_object(
      'id', 'chaser', 'label', 'チェイサー',
      'choices', jsonb_build_array('チェイサーあり', 'チェイサーなし'), 'required', true
    ))
  );
  straight jsonb := jsonb_build_object(
    'id', 'whiskey-straight', 'name', 'ウイスキーストレート', 'price', 800,
    'recipe', 'ブラックニッカをストレートで提供する', 'subcategory_id', 'whiskey',
    'optionGroups', jsonb_build_array(jsonb_build_object(
      'id', 'chaser', 'label', 'チェイサー',
      'choices', jsonb_build_array('チェイサーあり', 'チェイサーなし'), 'required', true
    ))
  );
begin
  perform pg_advisory_xact_lock(hashtext('drink-menu-whiskey-rock-straight-20261025'));
  select menu::jsonb into current_menu from public.drink_app_settings
    where id = 'main' for update;
  if current_menu is null or jsonb_typeof(current_menu) <> 'array' then
    raise exception 'Shared menu is missing';
  end if;
  select count(*) into matching_items
    from jsonb_array_elements(current_menu) c,
      jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
    where i->>'id' in ('whiskey-rock', 'whiskey-straight')
      or i->>'name' in ('ウイスキーロック', 'ウイスキーストレート');
  if matching_items not in (0, 2) then
    raise exception 'Only one whiskey item exists; inspect before changing it';
  end if;
  if matching_items = 2 and (
    select count(*) from jsonb_array_elements(current_menu) c,
      jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
    where c->>'id' = 'alcohol' and (i = rock or i = straight)
  ) <> 2 then
    raise exception 'Existing whiskey items differ from the requested configuration';
  end if;
  select c->'items' into alcohol_items from jsonb_array_elements(current_menu) c
    where c->>'id' = 'alcohol';
  if alcohol_items is null or jsonb_typeof(alcohol_items) <> 'array' then
    raise exception 'Alcohol category is missing';
  end if;
  select n into insert_after from jsonb_array_elements(alcohol_items)
    with ordinality x(i,n) where i->>'id' = 'nikka-ginger-high';
  if insert_after is null then raise exception 'Existing Black Nikka drinks are missing'; end if;
  select profile into current_profile from warmup_private.stores
    where id = 'casinolivetokyo' for update;
  if current_profile is null
    or jsonb_typeof(current_profile->'includeItemIds') is distinct from 'array' then
    raise exception 'Weekday Warmup profile is missing or invalid';
  end if;
  if matching_items = 0 then
    update public.drink_app_settings s set menu = (
      select jsonb_agg(
        case when c->>'id' = 'alcohol' then
          jsonb_insert(jsonb_insert(c, array['items', insert_after::text], rock, false),
            array['items', (insert_after + 1)::text], straight, false)
        else c end order by position
      ) from jsonb_array_elements(current_menu) with ordinality x(c,position)
    ), updated_at = now() where s.id = 'main';
  end if;
  update warmup_private.stores set profile = jsonb_set(current_profile, '{includeItemIds}',
    current_profile->'includeItemIds'
      || case when current_profile->'includeItemIds' ? 'whiskey-rock'
        then '[]'::jsonb else jsonb_build_array('whiskey-rock') end
      || case when current_profile->'includeItemIds' ? 'whiskey-straight'
        then '[]'::jsonb else jsonb_build_array('whiskey-straight') end
  ) where id = 'casinolivetokyo';
end $migration$;
commit;
