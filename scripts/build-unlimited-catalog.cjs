// Compile the browser's shared profiles into the Edge Function and one-time catalog migration.
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('unlimited-config.js', 'utf8'), context);
const config = context.window.DRINK_RELAY_UNLIMITED_CONFIG;
const plans = config.planCatalog;
const profiles = Object.fromEntries([...new Set(plans.map(plan => plan.profile))].map(profile => {
  const rule = config.planRules[plans.find(plan => plan.profile === profile).id];
  return [profile, { itemIds: rule.includeItemIds, options: rule.optionChoiceRules }];
}));
const rules = Object.fromEntries(plans.map(plan => {
  const rule = config.planRules[plan.id];
  return [plan.id, { name: plan.name, duration: rule.durationMinutes, endHour: rule.endHour ?? 22,
    endMinute: rule.endMinute ?? 30, profile: plan.profile }];
}));
const edgePath = 'supabase/functions/unlimited/index.ts';
let edge = fs.readFileSync(edgePath, 'utf8');
const start = edge.indexOf('const SOFT_STANDARD =');
const end = edge.indexOf('class ApiError');
if (start >= 0) edge = edge.slice(0, start) + '__GENERATED_PLANS__\n\n' + edge.slice(end);
const generated = `// BEGIN GENERATED PLANS (scripts/build-unlimited-catalog.cjs)\n` +
  `type JsonObject = Record<string, any>;\n` +
  `const COMPILED_PROFILES = ${JSON.stringify(profiles, null, 2)};\n` +
  `const SHARED_PROFILES = Object.fromEntries(Object.entries(COMPILED_PROFILES).map(([id, profile]) => [id, { items: new Set(profile.itemIds), options: profile.options }]));\n` +
  `const COMPILED_PLANS = ${JSON.stringify(rules, null, 2)};\n` +
  `const PLAN_RULES: Record<string, { name: string; duration: number | null; endHour: number; endMinute: number; items: Set<string>; options: Record<string, Record<string, string[]>> }> = Object.fromEntries(\n` +
  `  Object.entries(COMPILED_PLANS).map(([id, rule]) => [id, { ...rule, ...SHARED_PROFILES[rule.profile] }])\n);\n` +
  `// END GENERATED PLANS`;
edge = edge.replace(/__GENERATED_PLANS__|\/\/ BEGIN GENERATED PLANS[\s\S]*?\/\/ END GENERATED PLANS/, generated);
fs.writeFileSync(edgePath, edge);
const catalog = JSON.stringify(plans);
fs.writeFileSync('supabase/replace-unlimited-catalog-20261017.sql', `-- Re-runnable one-time replacement. Keeps all order history and archived cards.
-- Run only after deploying the matching unlimited Edge Function and frontend.
begin;
do $migration$
declare
  old_cards jsonb;
  archived jsonb;
  fresh jsonb;
  stamp timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtext('aycd-catalog-20261017'));
  if exists(select 1 from public.drink_app_settings where id='aycd-catalog-20261017') then return; end if;
  select menu::jsonb into old_cards from public.drink_app_settings where id='aycd-card-catalog' for update;
  if old_cards is null or jsonb_typeof(old_cards) <> 'array' then raise exception 'Existing QR catalog missing'; end if;
  select coalesce(jsonb_agg(c || jsonb_build_object('status','retired','retiredAt',stamp,'retiredReason','catalog-replaced-20261017') order by n),'[]'::jsonb)
    into archived from jsonb_array_elements(old_cards) with ordinality x(c,n);
  select jsonb_agg(jsonb_build_object(
    'id',gen_random_uuid()::text,'token',encode(extensions.gen_random_bytes(24),'hex'),
    'planId',p->>'id','label',(p->>'name') || ' / ' || (p->>'profile') || ' ' || num || '番',
    'createdAt',stamp,'kind','permanent','status','active','immutable',true,
    'tokenHistory','[]'::jsonb,'catalogVersion','20261017') order by ordinal,num)
    into fresh from jsonb_array_elements($plans$${catalog}$plans$::jsonb) with ordinality x(p,ordinal) cross join generate_series(1,20) num;
  if jsonb_array_length(fresh) <> 280 then raise exception 'Expected 280 new cards'; end if;
  update public.drink_app_settings set menu=archived || fresh, updated_at=stamp where id='aycd-card-catalog';
  update public.drink_app_settings s set menu=s.menu::jsonb || jsonb_build_object('status','revoked','revokedAt',stamp,'revokedReason','catalog-replaced-20261017','reconnectRequest',null), updated_at=stamp
    where s.id like 'aycd-session-%' and s.menu->>'status' in ('active','pending','waiting')
    and exists(select 1 from jsonb_array_elements(old_cards) c where c->>'planId'=s.menu->>'planId');
  -- Existing eight sale items retain their configured prices and other fields.
  update public.drink_app_settings s set menu=(select jsonb_agg(case when cat->>'id'='all-you-can-drink' then
    jsonb_set(cat,'{items}',(select jsonb_agg(case when def.p is not null then jsonb_set(item,'{name}',def.p->'name') else item end order by seq)
      from jsonb_array_elements(cat->'items') with ordinality i(item,seq)
      left join lateral (select p from jsonb_array_elements($plans$${catalog}$plans$::jsonb) p where p->>'id'=item->>'id') def on true))
    else cat end order by pos) from jsonb_array_elements(s.menu::jsonb) with ordinality x(cat,pos)), updated_at=stamp where s.id='main';
  insert into public.drink_app_settings(id,menu,updated_at) values('aycd-catalog-20261017',jsonb_build_object('created',280,'archived',jsonb_array_length(old_cards),'appliedAt',stamp),stamp);
end $migration$;
commit;
-- Only counts are returned. QR tokens are never printed in logs.
select c->>'planId' as plan, count(*) as active_cards from public.drink_app_settings s,
jsonb_array_elements(s.menu::jsonb) c where s.id='aycd-card-catalog' and c->>'status'='active'
group by 1 order by 1;
`);
console.log('Compiled 14 shared profiles and catalog migration (280 cards).');
