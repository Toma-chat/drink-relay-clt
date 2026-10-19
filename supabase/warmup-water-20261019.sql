-- Add mineral and sparkling water to the existing weekday Warmup profile.
begin;
do $migration$
declare
  current_profile jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('warmup-water-20261019'));
  select profile into current_profile from warmup_private.stores
    where id = 'casinolivetokyo' for update;
  if current_profile is null
    or jsonb_typeof(current_profile->'includeItemIds') is distinct from 'array' then
    raise exception 'Warmup profile is missing or invalid';
  end if;
  if (
    select count(*) from public.drink_app_settings s,
      jsonb_array_elements(s.menu::jsonb) c,
      jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i
    where s.id = 'main' and i->>'id' in ('oolong-tea', 'sparkling-water')
  ) <> 2 then
    raise exception 'Water items are missing from the shared menu';
  end if;
  update warmup_private.stores
    set profile = jsonb_set(current_profile, '{includeItemIds}',
      current_profile->'includeItemIds'
      || case when current_profile->'includeItemIds' ? 'oolong-tea'
        then '[]'::jsonb else jsonb_build_array('oolong-tea') end
      || case when current_profile->'includeItemIds' ? 'sparkling-water'
        then '[]'::jsonb else jsonb_build_array('sparkling-water') end)
    where id = 'casinolivetokyo';
end $migration$;
commit;
