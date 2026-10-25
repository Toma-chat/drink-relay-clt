const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/@electric-sql/pglite'));
(async()=>{
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync('initial-settings.js','utf8'),context);
  const menu=JSON.parse(JSON.stringify(context.window.DRINK_RELAY_INITIAL_SETTINGS.menu));
  const alcohol=menu.find(category=>category.id==='alcohol');
  alcohol.items=alcohol.items.filter(item=>!['whiskey-rock','whiskey-straight'].includes(item.id));
  const db=new PGlite();
  await db.exec('create table public.drink_app_settings(id text primary key,menu jsonb,updated_at timestamptz);create schema warmup_private;create table warmup_private.stores(id text primary key,profile jsonb)');
  await db.query("insert into public.drink_app_settings(id,menu) values('main',$1)",[JSON.stringify(menu)]);
  await db.query("insert into warmup_private.stores(id,profile) values('casinolivetokyo',$1)",[JSON.stringify({includeItemIds:['nikka-highball']})]);
  const migration=fs.readFileSync('supabase/add-whiskey-rock-straight-20261025.sql','utf8');
  await db.exec(migration);
  await db.exec(migration);
  const saved=(await db.query("select menu from public.drink_app_settings where id='main'")).rows[0].menu;
  const whiskey=saved.find(category=>category.id==='alcohol').items.filter(item=>item.subcategory_id==='whiskey');
  assert.deepEqual(whiskey.slice(3,5).map(item=>item.id),['whiskey-rock','whiskey-straight']);
  for(const item of whiskey.slice(3,5)){
    assert.equal(item.price,800);
    assert.deepEqual(item.optionGroups[0],{id:'chaser',label:'チェイサー',choices:['チェイサーあり','チェイサーなし'],required:true});
  }
  const profile=(await db.query("select profile from warmup_private.stores where id='casinolivetokyo'")).rows[0].profile;
  assert.deepEqual(profile.includeItemIds,['nikka-highball','whiskey-rock','whiskey-straight']);
  await db.close();
  console.log('PASS whiskey rock/straight added once to single menu and weekday Warmup with required chaser choice');
})().catch(error=>{console.error(error);process.exitCode=1});
