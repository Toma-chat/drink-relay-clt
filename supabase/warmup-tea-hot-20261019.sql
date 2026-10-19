-- Allow the existing hot option for four teas in weekday Warmup.
begin;
do $migration$
declare
  current_profile jsonb;
  tea_id text;
begin
  perform pg_advisory_xact_lock(hashtext('warmup-tea-hot-20261019'));
  select profile into current_profile from warmup_private.stores
    where id = 'casinolivetokyo' for update;
  if current_profile is null then
    raise exception 'Warmup profile is missing';
  end if;
  foreach tea_id in array array[
    'green-tea', 'item-1783049172799',
    'item-1783049181927', 'item-1783049320701'
  ] loop
    if not exists (
      select 1 from public.drink_app_settings s,
        jsonb_array_elements(s.menu::jsonb) c,
        jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i,
        jsonb_array_elements(coalesce(i->'optionGroups', '[]'::jsonb)) g
      where s.id = 'main' and i->>'id' = tea_id
        and g->>'id' = 'hot' and g->'choices' ? 'hot'
    ) then
      raise exception 'Hot option is missing from tea %', tea_id;
    end if;
    current_profile := jsonb_set(
      current_profile,
      array['optionChoiceRules', tea_id, 'hot'],
      '["hot"]'::jsonb,
      true
    );
  end loop;
  update warmup_private.stores set profile = current_profile
    where id = 'casinolivetokyo';
end $migration$;
commit;
