const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/@electric-sql/pglite'));
(async()=>{
 const w={};for(const f of ['unlimited-config.js','initial-settings.js'])vm.runInNewContext(fs.readFileSync(f,'utf8'),{window:w});
 const expected=JSON.parse(JSON.stringify(w.DRINK_RELAY_UNLIMITED_CONFIG.planRules['unlimited-alcohol-all-day']));
 const db=new PGlite();await db.exec(`create schema warmup_private;create table warmup_private.stores(id text primary key,qr text,profile jsonb,calendar_until date);create table warmup_private.audit(store text,action text,detail jsonb);create table public.drink_app_settings(id text,menu jsonb);insert into warmup_private.stores values('casinolivetokyo','keep-fixed-qr','{}','2027-12-31');`);
 await db.query("insert into public.drink_app_settings values('main',$1)",[JSON.stringify(w.DRINK_RELAY_INITIAL_SETTINGS.menu)]);
 const sql=fs.readFileSync('supabase/warmup-menu-update.sql','utf8');await db.exec(sql);
 const row=(await db.query('select * from warmup_private.stores')).rows[0];assert.deepEqual(row.profile,expected);assert.equal(row.qr,'keep-fixed-qr');
 await db.exec(sql);assert.equal((await db.query('select count(*)::int as n from warmup_private.audit')).rows[0].n,1);
 assert.equal(expected.includeItemIds.length,47);
 for(const id of ['item-1783053258647','item-1783053270509','item-1783053301898','item-1783053313814','mistia-cola','mistia-ginger','mistia-soda','item-1783053614958'])assert(expected.includeItemIds.includes(id));
 console.log('PASS all 47 STD products and options match, missing tea/Mistia/screwdriver included, QR preserved, audit recorded, repeat safe');await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
