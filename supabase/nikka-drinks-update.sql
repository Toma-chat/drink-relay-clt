-- Run in SQL Editor. Preserves existing price/options and all other products.
begin;
do $$
declare m jsonb; category jsonb; original jsonb; updated jsonb; replacements jsonb; options jsonb;
begin
 select menu into m from public.drink_app_settings where id='main' for update;
 if m is null then raise exception '共有メニューがありません'; end if;
 select c into category from jsonb_array_elements(m) c where c->>'id'='alcohol';
 select i into original from jsonb_array_elements(category->'items') i where i->>'id'='item-1783052940322';
 if original is not null then
  if exists(select 1 from jsonb_array_elements(category->'items') i where i->>'id' in ('nikka-highball','nikka-cola-high','nikka-ginger-high')) then raise exception '新旧商品が混在しています。確認してください'; end if;
  select coalesce(jsonb_agg(g),'[]') into options from jsonb_array_elements(coalesce(original->'optionGroups','[]')) g where g->>'id'<>'whiskey-mix';
  replacements := jsonb_build_array(
   original || jsonb_build_object('id','nikka-highball','name','ハイボール','optionGroups',options,'recipe','ブラックニッカを炭酸で割る'),
   original || jsonb_build_object('id','nikka-cola-high','name','コークハイ','optionGroups',options,'recipe','ブラックニッカをコーラで割る'),
   original || jsonb_build_object('id','nikka-ginger-high','name','ジンジャーハイ','optionGroups',options,'recipe','ブラックニッカをジンジャーエールで割る'));
  select coalesce(jsonb_agg(i),'[]') into updated from jsonb_array_elements(category->'items') i where i->>'id'<>'item-1783052940322';
  category := jsonb_set(category,'{items}',updated||replacements);
  select jsonb_agg(case when c->>'id'='alcohol' then category else c end order by n) into m from jsonb_array_elements(m) with ordinality as x(c,n);
  update public.drink_app_settings set menu=m,updated_at=now() where id='main';
 elsif (select count(*) from jsonb_array_elements(category->'items') i where i->>'id' in ('nikka-highball','nikka-cola-high','nikka-ginger-high'))<>3 then
  raise exception 'ブラックニッカまたは置換後の商品が見つかりません';
 end if;
end $$;
update warmup_private.stores set profile=jsonb_set(
 jsonb_set(profile,'{includeItemIds}',
  (select jsonb_agg(distinct value) from (
   select value from jsonb_array_elements_text(profile->'includeItemIds') where value<>'item-1783052940322'
   union all select unnest(array['nikka-highball','nikka-cola-high','nikka-ginger-high'])
  ) x)),
 '{optionChoiceRules}',coalesce(profile->'optionChoiceRules','{}')-'item-1783052940322')
where id='casinolivetokyo';
commit;
