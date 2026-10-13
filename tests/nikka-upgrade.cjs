const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/@electric-sql/pglite'));
async function main(){
 const db=new PGlite();await db.exec("create table public.drink_app_settings(id text primary key,menu jsonb,updated_at timestamptz);create schema warmup_private;create table warmup_private.stores(id text primary key,profile jsonb);");
 const old={id:'item-1783052940322',name:'ブラックニッカ',price:800,subcategory_id:'whiskey',optionGroups:[{id:'whiskey-mix',choices:['炭酸','コーラ']},{id:'strength',choices:['濃いめ']}],recipe:'old'};
 const other={id:'other',name:'他の商品',price:1234};
 await db.query("insert into public.drink_app_settings values('main',$1,now())",[JSON.stringify([{id:'alcohol',items:[old,other]}])]);
 await db.query("insert into warmup_private.stores values('casinolivetokyo',$1)",[JSON.stringify({includeItemIds:[old.id,'other'],optionChoiceRules:{[old.id]:{'whiskey-mix':['炭酸']}}})]);
 const sql=fs.readFileSync('supabase/nikka-drinks-update.sql','utf8');await db.exec(sql);
 const items=(await db.query("select menu from public.drink_app_settings")).rows[0].menu[0].items;
 assert.equal(items.length,4);assert.deepEqual(items.find(i=>i.id==='other'),other);
 for(const name of ['ハイボール','コークハイ','ジンジャーハイ']){const item=items.find(i=>i.name===name);assert.equal(item.price,800);assert.deepEqual(item.optionGroups,[old.optionGroups[1]]);}
 const profile=(await db.query('select profile from warmup_private.stores')).rows[0].profile;
 assert(!profile.includeItemIds.includes(old.id));assert.equal(profile.includeItemIds.length,4);
 await db.exec(sql);assert.equal((await db.query('select menu from public.drink_app_settings')).rows[0].menu[0].items.length,4);
 console.log('PASS SQL replacement preserves other products/price/options; three drinks permitted; old product removed; repeat safe');
 const css=fs.readFileSync('styles.css','utf8');const block=css.match(/\ndialog \{([^}]+)\}/)[1];assert(block.includes('background: var(--surface)'));assert(!block.includes('transparent'));
 console.log('PASS popup background is opaque');await db.close();
}main().catch(e=>{console.error(e);process.exitCode=1});
