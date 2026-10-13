// Exercise the real Edge Function handler with an in-memory Supabase adapter.
// No production QR/session/order is modified.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const crypto=require('node:crypto').webcrypto;
(async()=>{
  const token='fixed-existing-qr-token',device='original-device-binding',plan='unlimited-soft-2h';
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('casinolivetokyo:'+token))).toString('hex');
  const settings=[{id:'main',menu:[{id:'soft',items:[{id:'green-tea',name:'緑茶',price:500,optionGroups:[]}]}]},
    {id:'aycd-card-catalog',menu:[{token,status:'active',planId:plan}]},
    {id:'aycd-session-'+hash.slice(0,40),menu:{sessionId:'test-session',cardHash:hash,planId:plan,planName:'テスト',status:'active',deviceBinding:device,activatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),currentLocation:{target:'bar',tableNo:'',seatNo:''}}}];
  const orders=[];
  class Query {
    constructor(name){this.rows=name==='drink_orders'?orders:settings;this.tests=[];this.operation='read';}
    select(){return this;} eq(k,v){this.tests.push(x=>x[k]===v);return this;}
    like(k,v){this.tests.push(x=>x[k].startsWith(v.replace('%','')));return this;}
    filter(k,op,v){const expected=JSON.parse(v)[0];this.tests.push(x=>x[k].some(e=>Object.keys(expected).every(k=>e[k]===expected[k])));return this;}
    order(){return this;} in(k,vs){this.tests.push(x=>vs.includes(x[k]));return this;}
    insert(row){this.rows.push(row);return this;} upsert(row){const i=this.rows.findIndex(x=>x.id===row.id);if(i<0)this.rows.push(row);else this.rows[i]=row;return this;}
    update(patch){this.operation='update';this.patch=patch;return this;}
    result(){let rows=this.rows.filter(x=>this.tests.every(t=>t(x)));if(this.operation==='update')rows.forEach(x=>Object.assign(x,this.patch));return rows;}
    single(){return Promise.resolve({data:this.result()[0],error:null});} maybeSingle(){return this.single();}
    then(resolve,reject){return Promise.resolve({data:this.result(),error:null}).then(resolve,reject);}
  }
  const admin={from:name=>new Query(name),auth:{getUser:async(jwt)=>({data:{user:jwt==='allowed'||jwt==='denied'?{id:jwt}:null},error:null})},rpc:async(name,p)=>({data:p.p_user_id==='allowed',error:null})};
  let handler;
  const context={createClient:()=>admin,Deno:{env:{get:name=>name==='DRINK_RELAY_STORE_ID'?'casinolivetokyo':''},serve:fn=>{handler=fn;}},crypto,TextEncoder,Date,Uint32Array,Request,Response,console};
  const source=fs.readFileSync('supabase/functions/unlimited/index.ts','utf8').replace(/^import .*\n/,'');
  vm.runInNewContext(stripTypeScriptTypes(source),context);
  const request=(action,extra={},jwt='')=>handler(new Request('https://test/unlimited',{method:'POST',headers:{'content-type':'application/json',...(jwt?{Authorization:'Bearer '+jwt}:{})},body:JSON.stringify({action,store:'casinolivetokyo',card:token,plan,device,...extra})}));
  assert.equal((await request('staff-list-sessions')).status,401);
  assert.equal((await request('staff-list-sessions',{},'denied')).status,403);
  assert.equal((await request('staff-list-sessions',{},'allowed')).status,200);
  assert.equal((await request('card')).status,200,'existing fixed QR');
  assert.equal((await request('order',{item:{itemId:'green-tea',options:[]}})).status,200);
  assert.equal(orders[0].events[0].itemId,'green-tea');assert.equal(orders[0].quantity,1);
  assert.equal((await request('order',{item:{itemId:'green-tea'}})).status,409,'pending cup blocks next order');
  orders[0].status='served';
  assert.equal((await request('order',{item:{itemId:'green-tea'}})).status,200,'served enables next cup');
  orders[1].status='served';
  const session=settings.find(x=>x.id.startsWith('aycd-session-')).menu;
  session.locationConfirmed=false;
  assert.equal((await request('order',{item:{itemId:'green-tea'}})).status,409,'unconfirmed first location blocks ordering');
  const located=await request('location',{sessionId:session.sessionId,location:{target:'ring',tableNo:'A',seatNo:'1'}});
  assert.equal(located.status,200);assert.equal((await located.json()).session.locationConfirmed,true);
  assert.equal((await request('order',{item:{itemId:'green-tea'}})).status,200,'confirmed location enables ordering');
  assert.equal((await request('order',{device:'different-device-binding',item:{itemId:'green-tea'}})).status,403);
  const reconnectCurrent=settings.find(x=>x.id.startsWith('aycd-session-')).menu;
  reconnectCurrent.reconnectRequest={deviceBinding:'new-device-binding'};
  const reconnect=await request('staff-save-session',{session:{...reconnectCurrent,deviceBinding:'new-device-binding'}},'allowed');
  assert.equal(reconnect.status,200);const updated=(await reconnect.json()).session;
  assert.equal(updated.sessionId,'test-session');assert.equal(updated.activatedAt,reconnectCurrent.activatedAt);
  assert.equal(settings.find(x=>x.id==='aycd-card-catalog').menu[0].token,token);
  const current=settings.find(x=>x.id.startsWith('aycd-session-')).menu;
  current.status='pending';current.deviceBinding='new-device-binding';
  const activation=await request('staff-save-session',{session:{...current,status:'active'}},'allowed');
  assert.equal(activation.status,200);assert.equal((await activation.json()).session.locationConfirmed,false);
  console.log('PASS Edge JWT allowlist, fixed QR, ordering, first-location guard, device binding and reconnection');
})().catch(e=>{console.error(e);process.exitCode=1;});
