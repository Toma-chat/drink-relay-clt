-- Make Corona's lemon/lime selection optional without changing its choices or price.
begin;
do $migration$
declare
  current_menu jsonb;
  required_path text[];
  current_required jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('corona-optional-lemon-lime-20261123'));
  select menu into current_menu from public.drink_app_settings
    where id = 'main' for update;
  if current_menu is null or jsonb_typeof(current_menu) <> 'array' then
    raise exception 'Shared menu is missing';
  end if;

  select array[(category_position - 1)::text, 'items',
               (item_position - 1)::text, 'optionGroups',
               (option_position - 1)::text, 'required']
    into required_path
    from jsonb_array_elements(current_menu) with ordinality categories(category, category_position),
         jsonb_array_elements(category->'items') with ordinality items(item, item_position),
         jsonb_array_elements(item->'optionGroups') with ordinality options(option, option_position)
    where category->>'id' = 'alcohol'
      and item->>'id' = 'highball'
      and item->>'name' = 'コロナビール'
      and option->>'id' = 'lemon-lime';
  if required_path is null then
    raise exception 'Corona lemon/lime option is missing or has changed';
  end if;
  current_required := current_menu #> required_path;
  if current_required = 'true'::jsonb then
    update public.drink_app_settings
       set menu = jsonb_set(current_menu, required_path, 'false'::jsonb),
           updated_at = now()
     where id = 'main';
  elsif current_required is distinct from 'false'::jsonb then
    raise exception 'Corona lemon/lime required flag is invalid';
  end if;
end $migration$;
commit;
