const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {PGlite}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/@electric-sql/pglite'));
(async()=>{
  const window={};vm.runInNewContext(fs.readFileSync('unlimited-config.js','utf8'),{window});
  const config=window.DRINK_RELAY_UNLIMITED_CONFIG;
  const whiskeyIds=['whiskey-rock','whiskey-straight'];
  for(const plan of config.planCatalog)for(const id of whiskeyIds)
    assert.equal(config.planRules[plan.id].includeItemIds.includes(id),plan.profile==='アルコールSTD'||plan.profile==='アルコールSP',`${plan.id} whiskey ${id}`);
  for(const plan of config.planCatalog){
    const ids=config.planRules[plan.id].includeItemIds;
    assert(ids.includes('sonic'),`${plan.id} includes Sonic`);
    for(const id of ['orange-beer','kahlua-beer','diesel'])
      assert.equal(ids.includes(id),plan.profile==='アルコールSP',`${plan.id} beer cocktail ${id}`);
  }
  for(const id of ['oolong-tea','sparkling-water'])assert.ok(config.planRules['unlimited-warmup-sp'].includeItemIds.includes(id),`Warm Up includes ${id}`);
  for(const plan of config.planCatalog.filter(p=>p.profile==='アルコールSTD'))for(const id of ['item-1783052950604','item-1783052961537']){
    assert(!config.planRules[plan.id].includeItemIds.includes(id),`${plan.id} does not include premium whiskey ${id}`);
    assert(config.planRules[plan.id].excludeItemIds.includes(id),`${plan.id} explicitly hides premium whiskey ${id}`);
  }
  for(const id of ['unlimited-soft-sp-2h','unlimited-soft-sp-all-day','unlimited-alcohol-sp-2h','unlimited-alcohol-sp-all-day','unlimited-warmup-sp'])
    assert.deepEqual(JSON.parse(JSON.stringify(config.planRules[id].optionChoiceRules['item-1783049580653']['mango-mix'])),['牛乳'],`${id} allows mango juice with milk`);
  assert.equal(config.planCatalog.length,13);assert.equal(new Set(config.planCatalog.map(p=>p.id)).size,13);
  const edge=fs.readFileSync('supabase/functions/unlimited/index.ts','utf8').replace(/^import .*\n/,'');
  const scope={Deno:{env:{get:()=>''},serve(){}},createClient:()=>({})};
  vm.runInNewContext(stripTypeScriptTypes(edge)+'\nthis.testRules=PLAN_RULES;this.expiry=expiryFor;this.validateOptions=validateOptions;',scope);
  const mango={id:'item-1783049580653',optionGroups:[{id:'mango-mix',choices:['ソーダ','牛乳'],required:false}]};
  assert.deepEqual(JSON.parse(JSON.stringify(scope.validateOptions(mango,'unlimited-soft-sp-2h',['牛乳']))),['牛乳']);
  assert.throws(()=>scope.validateOptions(mango,'unlimited-soft-sp-2h',['ソーダ']),/選択できないカスタム/);
  const chaser={id:'whiskey-rock',optionGroups:[{id:'chaser',choices:['チェイサーあり','チェイサーなし'],required:true}]};
  assert.deepEqual(JSON.parse(JSON.stringify(scope.validateOptions(chaser,'unlimited-alcohol-2h',['チェイサーあり']))),['チェイサーあり']);
  assert.throws(()=>scope.validateOptions(chaser,'unlimited-alcohol-2h',[]),/必須のカスタム/);
  for(const plan of config.planCatalog){
    const rule=config.planRules[plan.id],server=scope.testRules[plan.id];
    assert.deepEqual([...server.items], [...rule.includeItemIds]);
    assert.deepEqual(JSON.parse(JSON.stringify(server.options)),JSON.parse(JSON.stringify(rule.optionChoiceRules)));
    assert.equal(server.name,plan.name);
    const reference=plan.profile==='アルコールSTD'?'unlimited-alcohol-all-day':plan.profile==='アルコールSP'?'unlimited-alcohol-sp-all-day':plan.profile==='ソフトドリンクSTD'?'unlimited-soft-all-day':'unlimited-soft-sp-all-day';
    assert.deepEqual([...rule.includeItemIds],[...config.planRules[reference].includeItemIds]);
  }
  assert.equal(scope.expiry('unlimited-happy-hour-sp',Date.parse('2026-10-17T08:00:00Z')),Date.parse('2026-10-17T09:00:00Z'));
  assert.ok(scope.expiry('unlimited-happy-hour-sp',Date.parse('2026-10-17T10:00:00Z'))<Date.parse('2026-10-17T10:00:00Z'));
  assert.equal(scope.expiry('unlimited-ring-sp',Date.parse('2026-10-17T08:00:00Z')),Date.parse('2026-10-17T13:30:00Z'));
  console.log('PASS 14 profiles agree between client/server; STD/SP references; JST 18:00 and 22:30 expiry');
  const db=new PGlite();
  await db.exec(`create schema extensions; create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(md5(random()::text)||substr(md5(random()::text),1,16),'hex')$$;
    create table public.drink_app_settings(id text primary key,menu jsonb,updated_at timestamptz);
    create table public.drink_orders(id text,status text);insert into public.drink_orders values('pending','ordered');`);
  const old=[{id:'old',token:'old-token',planId:'unlimited-soft-2h',label:'old',kind:'permanent',status:'active'}];
  const menu=[{id:'all-you-can-drink',items:[{id:'unlimited-soft-sp-2h',name:'old',price:2000,custom:'preserve'}]},{id:'normal',items:[{id:'normal',price:500}]}];
  await db.query("insert into public.drink_app_settings values('aycd-card-catalog',$1,now()),('main',$2,now()),('aycd-session-old',$3,now())",[JSON.stringify(old),JSON.stringify(menu),JSON.stringify({planId:old[0].planId,status:'active',sessionId:'old-session'})]);
  const sql=fs.readFileSync('supabase/replace-unlimited-catalog-20261017.sql','utf8');
  await db.exec(sql);
  const read=async id=>(await db.query('select menu from public.drink_app_settings where id=$1',[id])).rows[0].menu;
  const cards=await read('aycd-card-catalog');const active=cards.filter(c=>c.status==='active');
  assert.equal(active.length,280);assert.equal(new Set(active.map(c=>c.token)).size,280);
  for(const p of config.planCatalog)assert.equal(active.filter(c=>c.planId===p.id&&c.kind==='permanent').length,20);
  assert.equal(cards.find(c=>c.id==='old').status,'retired');assert.equal((await read('aycd-session-old')).status,'revoked');
  assert.equal((await db.query('select status from public.drink_orders')).rows[0].status,'ordered');
  const saved=await read('main');assert.equal(saved[0].items[0].name,'2時間ソフトドリンクSP飲み放題');assert.equal(saved[0].items[0].price,2000);assert.equal(saved[0].items[0].custom,'preserve');assert.deepEqual(saved[1],menu[1]);
  await db.exec(sql);assert.deepEqual(await read('aycd-card-catalog'),cards);
  const rename=fs.readFileSync('supabase/rename-unlimited-cards-20261017.sql','utf8');
  await db.exec(rename);const renamed=await read('aycd-card-catalog');
  assert.deepEqual(renamed.map(({label,...card})=>card),cards.map(({label,...card})=>card));
  for(const p of config.planCatalog){const group=renamed.filter(c=>c.planId===p.id&&c.status==='active');assert.equal(group.length,20);assert.deepEqual(new Set(group.map(c=>c.label)),new Set(Array.from({length:20},(_,i)=>p.name+' '+(i+1)+'番')));}
  await db.exec(rename);assert.deepEqual(await read('aycd-card-catalog'),renamed);
  console.log('PASS rename changes only labels, matches all 14 names and 1-20 numbers, preserves every token/ID/status and is repeat safe');
  // Simulate the earlier deletion of archived cards before the new count reduction.
  await db.query("update public.drink_app_settings set menu=$1 where id='aycd-card-catalog'",[JSON.stringify(renamed.filter(c=>c.status==='active'))]);
  const reduction=fs.readFileSync('supabase/reduce-unlimited-cards-20261017.sql','utf8');
  await db.exec("create function extensions.digest(t text,a text) returns bytea language sql as $$select decode(md5(t),'hex')$$");
  await db.exec(reduction);const reduced=await read('aycd-card-catalog');
  assert.equal(reduced.length,245);assert.equal(reduced.filter(c=>c.planId==='unlimited-happy-hour-sp').length,5);
  assert(!reduced.some(c=>c.planId==='unlimited-warmup-std'));
  for(const card of reduced)assert.deepEqual(card,renamed.find(c=>c.id===card.id));
  await db.exec(reduction);assert.deepEqual(await read('aycd-card-catalog'),reduced);
  console.log('PASS reduce to 245 cards, happy-hour 1-5 only, standard Warm Up removed, remaining QR identities unchanged, repeat safe');
  await db.close();console.log('PASS migration creates 20 x14, archives old, revokes sessions, keeps pending orders/prices, repeat is no-op');
})().catch(e=>{console.error(e);process.exitCode=1});
