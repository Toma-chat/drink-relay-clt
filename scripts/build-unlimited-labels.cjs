// Rename existing cards only. Does not generate or replace any QR token.
const fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('unlimited-config.js','utf8'),{window});
const plans=JSON.stringify(window.DRINK_RELAY_UNLIMITED_CONFIG.planCatalog);
fs.writeFileSync('supabase/rename-unlimited-cards-20261017.sql', `begin;
create temporary table rename_plans on commit drop as select p->>'id' as id,p->>'name' as name from jsonb_array_elements($plans$${plans}$plans$::jsonb) p;
do $rename$
declare before_cards jsonb; after_cards jsonb;
begin
  select menu::jsonb into before_cards from public.drink_app_settings where id='aycd-card-catalog' for update;
  if (select count(*) from jsonb_array_elements(before_cards) c where c->>'status'='active') <> 280 then raise exception 'Expected 280 active cards'; end if;
  if exists(select 1 from jsonb_array_elements(before_cards) c where c->>'status'='active' and (not exists(select 1 from rename_plans p where p.id=c->>'planId') or c->>'label' !~ '[0-9]+番$')) then raise exception 'Unexpected card plan or number'; end if;
  select jsonb_agg(case when c->>'status'='active' then jsonb_set(c,'{label}',to_jsonb(p.name || ' ' || substring(c->>'label' from '([0-9]+)番$') || '番')) else c end order by n)
    into after_cards from jsonb_array_elements(before_cards) with ordinality x(c,n) left join rename_plans p on p.id=c->>'planId';
  if (select jsonb_agg(c-'label' order by n) from jsonb_array_elements(before_cards) with ordinality x(c,n)) is distinct from
     (select jsonb_agg(c-'label' order by n) from jsonb_array_elements(after_cards) with ordinality x(c,n)) then raise exception 'Only labels may change'; end if;
  update public.drink_app_settings set menu=after_cards,updated_at=now() where id='aycd-card-catalog';
end $rename$;
update public.drink_app_settings s set menu=(select jsonb_agg(case when cat->>'id'='all-you-can-drink' then jsonb_set(cat,'{items}',
  (select jsonb_agg(case when p.id is not null then jsonb_set(item,'{name}',to_jsonb(p.name)) else item end order by seq)
    from jsonb_array_elements(cat->'items') with ordinality i(item,seq) left join rename_plans p on p.id=item->>'id')) else cat end order by pos)
  from jsonb_array_elements(s.menu::jsonb) with ordinality x(cat,pos)),updated_at=now() where s.id='main';
-- Current session names follow the same plan name, without changing their authority or expiry.
update public.drink_app_settings s set menu=jsonb_set(s.menu::jsonb,'{planName}',to_jsonb(p.name)),updated_at=now()
  from rename_plans p where s.id like 'aycd-session-%' and s.menu->>'planId'=p.id and s.menu->>'status' in ('active','pending');
commit;
select c->>'planId' as plan, min(c->>'label') as sample_name,count(*) as active_cards
  from public.drink_app_settings s,jsonb_array_elements(s.menu::jsonb) c
  where s.id='aycd-card-catalog' and c->>'status'='active' group by 1 order by 1;
`);
console.log('Generated label-only migration. QR tokens and card IDs are preserved.');
