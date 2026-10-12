// Read-only checks against the existing project's public interfaces.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
  const window={};vm.runInNewContext(fs.readFileSync('store-config.js','utf8'),{window});
  const c=window.DRINK_RELAY_STORE_CONFIG;
  async function call(path,body){return fetch(c.supabaseUrl+path,{method:body?'POST':'GET',headers:{apikey:c.supabaseAnonKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
  for(const table of ['drink_orders','drink_app_settings']){
    const r=await call('/rest/v1/'+table+'?select=id&limit=1');assert.ok([401,403].includes(r.status),'anonymous '+table+' rejected: '+r.status);
  }
  const sales=await call('/rest/v1/rpc/drink_sales_summary',{p_store:c.instanceId,p_start:'2026-10-12',p_end:'2026-10-12'});
  assert.ok([401,403].includes(sales.status),'anonymous summary rejected: '+sales.status);
  const staff=await call('/functions/v1/unlimited',{action:'staff-list-sessions',store:c.instanceId});assert.equal(staff.status,401);
  const menu=await call('/functions/v1/unlimited',{action:'menu',store:c.instanceId});assert.equal(menu.status,200);
  const clock=await call('/rest/v1/rpc/drink_server_time',{});assert.equal(clock.status,200);
  console.log('PASS live HTTP: anonymous summary/tables/staff API denied; customer menu and server clock available');
})().catch(e=>{console.error(e);process.exitCode=1;});
