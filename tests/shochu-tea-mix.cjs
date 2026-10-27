const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/@electric-sql/pglite'));
const {stripTypeScriptTypes}=require('node:module');
(async()=>{
 const c={window:{}};for(const f of ['initial-settings.js','unlimited-config.js'])vm.runInNewContext(fs.readFileSync(f,'utf8'),c);
 const menu=JSON.parse(JSON.stringify(c.window.DRINK_RELAY_INITIAL_SETTINGS.menu)),ids=['ichiryuno-mugi','tomino-hozan'],teas=['緑茶','烏龍茶','紅茶'];
 const db=new PGlite();await db.exec('create table public.drink_app_settings(id text primary key,menu jsonb,updated_at timestamptz)');
 const old=structuredClone(menu);for(const i of old.flatMap(c=>c.items))if(ids.includes(i.id))i.optionGroups[0].choices=i.optionGroups[0].choices.filter(v=>!teas.includes(v));
 await db.query("insert into public.drink_app_settings values('main',$1,now())",[JSON.stringify(old)]);
 const sql=fs.readFileSync('supabase/shochu-tea-mix-update.sql','utf8');await db.exec(sql);
 const saved=(await db.query("select menu from public.drink_app_settings where id='main'")).rows[0].menu;
 assert.deepEqual(saved,menu);await db.exec(sql);assert.deepEqual((await db.query("select menu from public.drink_app_settings")).rows[0].menu,saved);
 const scope={createClient:()=>({}),Deno:{env:{get:()=>''},serve(){}},console};
 vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/unlimited/index.ts','utf8').replace(/^import .*\n/,''))+'\nthis.check=validateOptions;',scope);
 for(const i of saved.flatMap(c=>c.items).filter(i=>ids.includes(i.id)))for(const tea of teas)for(const p of ['unlimited-alcohol-all-day','unlimited-alcohol-sp-all-day'])assert.equal(scope.check(i,p,[tea])[0],tea);
 console.log('PASS both shochu gain three tea choices, normal/shared menu matches local, prices/other products unchanged, SQL repeat safe, STD/SP server accepts all six choices');await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
