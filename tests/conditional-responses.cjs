const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto').webcrypto;
(async()=>{
 const window={DRINK_RELAY_STORE_CONFIG:{instanceId:'test',supabaseUrl:'https://example.test',supabaseAnonKey:'test'},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('unlimited-shared.js','utf8'),{window,Date,crypto,localStorage:{getItem(){return null}},location:{origin:'https://example.test'}});
 window.supabase={createClient:()=>({channel(){throw new Error('unneeded Realtime subscription')}})};window.DrinkRelayClock={sync:async()=>true};
 await new window.DrinkRelayUnlimited.Gateway().init({realtime:false});
 const subscriptions=[];const channel={on(e,filter){subscriptions.push(filter.table);return this},subscribe(){return this}};
 window.supabase={createClient:()=>({channel:()=>channel})};await new window.DrinkRelayUnlimited.Gateway().init({orders:false});assert.deepEqual(subscriptions,['drink_app_settings'],'management does not subscribe to orders');
 const g=new window.DrinkRelayUnlimited.Gateway();g.mode='supabase';let revision='a',value=[{id:'first'}],calls=0;
 g.edgeApi=async(action,p)=>{calls++;const key=action==='menu'?'menu':action==='staff-list-cards'?'cards':'sessions';return p.revision===revision?{unchanged:true,revision}:{[key]:value,revision}};
 for(const name of ['loadMenu','loadCards','listSessions']){
  revision='a';value=[{id:'first'}];const first=await g[name]();assert.equal(first[0].id,'first');assert.equal(await g[name](),first,'unchanged response preserves cache');revision='b';value=[{id:'changed'}];assert.equal((await g[name]())[0].id,'changed');
 }
 let orderRequests=[];g.customerContext={card:'fixture'};g.edgeApi=async(action,p)=>{orderRequests.push(action);return {order:{id:'created'}}};
 assert.equal((await g.createUnlimitedOrder({sessionId:'current'})).id,'created');assert.deepEqual(orderRequests,['order'],'no redundant preflight before server-validated order');
 let handler;const fixture={profile:{categories:['juice'],includeItemIds:Array.from({length:60},(_,i)=>'item-'+i)},orders:[],session:null};
 const admin={rpc:async()=>({data:structuredClone(fixture),error:null}),auth:{getUser:async()=>({data:{user:null},error:new Error('invalid')})}};
 const context={createClient:()=>admin,Deno:{env:{get:()=>''},serve:f=>{handler=f}},crypto,TextEncoder,Uint8Array,Request,Response};
 const src=fs.readFileSync('supabase/functions/warmup/index.ts','utf8').replace(/^import [^\n]*\n/,'');vm.runInNewContext(require('node:module').stripTypeScriptTypes(src),context);
 const request=p=>handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}));
 const first=await(await request({action:'status',compact:true})).json();assert.ok(first.profile);assert.ok(first.profileRevision);
 const second=await(await request({action:'status',compact:true,profileRevision:first.profileRevision})).json();assert.equal(second.profile,undefined);
 fixture.profile.categories.push('alcohol');const changed=await(await request({action:'status',compact:true,profileRevision:first.profileRevision})).json();assert.ok(changed.profile);assert.notEqual(changed.profileRevision,first.profileRevision);
 assert.ok((await(await request({action:'status'})).json()).profile,'legacy clients retain profile');
 assert.equal((await request({action:'staff-status',revision:'any'})).status,400,'conditional responses never bypass staff auth');
 console.log('PASS menu/card/session cache reuse and invalidation, profile conditional response and auth checks');
})().catch(e=>{console.error(e);process.exitCode=1});
