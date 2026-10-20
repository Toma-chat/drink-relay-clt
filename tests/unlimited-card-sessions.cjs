// Real Edge handler + PostgreSQL WASM. No network requests or production data.
// PGLITE_MODULE may point to an installed @electric-sql/pglite package.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const crypto=require('node:crypto').webcrypto;
(async()=>{
 const db=new PGlite();
 await db.exec('create role anon; create role authenticated; create role service_role;');
 const schema=fs.readFileSync('supabase-schema.sql','utf8').split('alter table public.drink_orders enable')[0];
 await db.exec(schema);
 const migration=fs.readFileSync('supabase/unlimited-card-sessions.sql','utf8');
 await db.exec(migration); await db.exec(migration); // rerunnable
 const store='card-test',token='existing-printed-card-token',plan='unlimited-soft-2h';
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(store+':'+token))).toString('hex');
 const key='aycd-session-'+hash.slice(0,40);
 const put=async(id,value)=>db.query('insert into drink_app_settings(id,menu) values($1,$2) on conflict(id) do update set menu=excluded.menu',[id,JSON.stringify(value)]);
 const current=async()=> (await db.query('select menu from drink_app_settings where id=$1',[key])).rows[0]?.menu;
 await put('main',[{id:'soft',items:[{id:'green-tea',name:'緑茶',optionGroups:[]},{id:'oolong-tea',name:'ミネラルウォーター',optionGroups:[]}]}]);
 const card={token,planId:plan,status:'active'};await put('aycd-card-catalog',[card]);
 class Query{
  constructor(table){this.table=table;this.where=[];this.params=[];this.sort='';}
  select(){return this;} eq(k,v){this.params.push(v);this.where.push(`${k}=$${this.params.length}`);return this;}
  like(k,v){this.params.push(v);this.where.push(`${k} like $${this.params.length}`);return this;}
  filter(k,op,v){assert.equal(op,'cs');this.params.push(v);this.where.push(`${k} @> $${this.params.length}::jsonb`);return this;}
  order(k){this.sort=` order by ${k}`;return this;}
  async result(){try{return {data:(await db.query(`select * from ${this.table}${this.where.length?' where '+this.where.join(' and '):''}${this.sort}`,this.params)).rows,error:null};}catch(error){return {data:null,error};}}
  async maybeSingle(){const r=await this.result();return {...r,data:r.data?.[0]||null};}
  then(a,b){return this.result().then(a,b);}
 }
 let gate=null;
 const rpc=async(name,p)=>{
  if(name==='drink_staff_allowed')return {data:p.p_user_id==='allowed',error:null};
  if(gate){const fn=gate;gate=null;await fn();}
  try{return {data:(await db.query('select public.drink_unlimited_mutate($1,$2,$3,$4,$5,$6) as value',[p.p_action,p.p_store,p.p_hash,p.p_session||null,JSON.stringify(p.p_value),p.p_expected?JSON.stringify(p.p_expected):null])).rows[0].value,error:null};}
  catch(error){console.error(error);return {data:null,error};}
 };
 const admin={from:t=>new Query(t),rpc,auth:{getUser:async jwt=>({data:{user:['allowed','denied'].includes(jwt)?{id:jwt}:null}})}};
 let handler;vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/unlimited/index.ts','utf8').replace(/^import .*\n/,'')),{createClient:()=>admin,Deno:{env:{get:k=>k==='DRINK_RELAY_STORE_ID'?store:''},serve:f=>handler=f},crypto,TextEncoder,Date,Uint32Array,Request,Response,console});
 const request=async(action,extra={},jwt='')=>{const response=await handler(new Request('https://local.test/unlimited',{method:'POST',headers:{'content-type':'application/json',...(jwt?{Authorization:'Bearer '+jwt}:{})},body:JSON.stringify({store,card:token,plan,action,...extra})}));return {status:response.status,...await response.json()};};
 const activate=async()=>{
  const pending=await request('save-session');assert.equal(pending.status,200);assert.match(pending.session.activationCode,/^\d{4}$/);
  const active=await request('staff-save-session',{session:{...pending.session,status:'active'}},'allowed');assert.equal(active.status,200);assert.equal(active.session.locationConfirmed,false);return active.session;
 };
 assert.equal((await request('staff-list-sessions')).status,401);
 assert.equal((await request('staff-list-sessions',{},'denied')).status,403);
 let session=await activate();const sid=session.sessionId;
 session={...session,deviceBinding:"legacy-device-binding",reconnectRequest:{code:"9999"}};await put(key,session);
 const original={...session};
 for(const device of [undefined,'private','other-browser','other-device']){const result=await request('status',{device});assert.equal(result.session.sessionId,sid);assert.equal(result.session.expiresAt,original.expiresAt);assert.equal(result.session.startedAt,original.startedAt);assert.equal(result.session.deviceBinding,undefined);}
 assert.equal((await request('save-session',{session:{reconnectRequest:{}}})).session.sessionId,sid);
 const order=(id=sid)=>request('order',{sessionId:id,item:{sessionId:id,itemId:'green-tea',options:[]}});
 assert.equal((await request("order",{item:{itemId:"green-tea"}})).status,403,"missing session ID rejected");
 assert.equal((await order()).status,409);
 const location={target:'ring',tableNo:'A',seatNo:'1'};
 assert.equal((await request('location',{sessionId:sid,location})).status,200);
 assert.deepEqual((await request('status')).session.currentLocation,location);
 const concurrent=await Promise.all(Array.from({length:8},()=>order()));
 assert.equal(concurrent.filter(x=>x.status===200).length,1);assert.equal(concurrent.filter(x=>x.code==='UNLIMITED_ORDER_PENDING').length,7);
 let state=await request('order-state',{sessionId:sid});assert.equal(state.orders.length,1);assert.ok(state.pendingOrder);
 assert.deepEqual((await request('order-state',{device:'fresh',sessionId:sid})).orders,state.orders);
 const next={target:'tournament',tableNo:'B',seatNo:'2'};
 await request('location',{sessionId:sid,location:next});
 state=await request('order-state',{sessionId:sid});assert.equal(state.pendingOrder.table_no,'B');
 session=await current();await put(key,{...session,expiresAt:new Date(Date.now()-1000).toISOString()});assert.equal((await order()).status,403);
 await put(key,session);
 // Simulate termination exactly after the Edge validation and before DB mutation.
 await db.exec("update drink_orders set status='served'");
 gate=async()=>put(key,{...session,status:'revoked'});assert.equal((await order()).status,403);
 assert.equal((await request('staff-save-session',{session:{...await current(),status:'revoked'}},'allowed')).status,200);
 await put(key,session);
 gate=async()=>put(key,{...session,status:"revoked"});
 assert.equal((await request("location",{sessionId:sid,location})).status,403);
 const reused=await activate();assert.notEqual(reused.sessionId,sid);assert.equal(reused.locationConfirmed,false);assert.equal(reused.currentLocation.target,'bar');
 assert.equal((await request('order-state',{sessionId:reused.sessionId})).orders.length,0);
 assert.equal((await order()).status,403);assert.equal((await request('location',{sessionId:sid,location})).status,403);
 await request('location',{sessionId:reused.sessionId,location});
 await put('aycd-card-catalog',[{...card,status:'retired'}]);assert.equal((await order(reused.sessionId)).status,403);
 await put('aycd-card-catalog',[card]);
 // Retirement at the transaction boundary also rejects a validated request.
 gate=async()=>put('aycd-card-catalog',[{...card,status:'retired'}]);assert.equal((await order(reused.sessionId)).status,403);
 await put('aycd-card-catalog',[card]);
 // Stale compare-and-set cannot resurrect a revoked session.
 const before=await current();await put(key,{...before,status:'revoked'});
 const stale=await rpc('drink_unlimited_mutate',{p_action:'save',p_store:store,p_hash:hash,p_expected:before,p_value:{...before,status:'active'}});assert.equal(stale.data.code,'SESSION_ENDED');
 assert.equal((await db.query('select count(*)::int as n from drink_orders')).rows[0].n,1,'historical orders preserved');
 assert.equal((await db.query("select menu->0->>'token' as token from drink_app_settings where id='aycd-card-catalog'")).rows[0].token,token);
 assert.equal((await db.query("select has_function_privilege('anon','public.drink_unlimited_mutate(text,text,text,text,jsonb,jsonb)','execute') as allowed")).rows[0].allowed,false);
 await db.close();console.log('PASS real Edge + PostgreSQL: activation, storage-free access, unchanged times, shared orders/location, 8 concurrent orders, expiry, termination/retirement races, reuse, stale CAS, history, RPC grants');
})().catch(e=>{console.error(e);process.exitCode=1;});
