const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const window={};vm.runInNewContext(fs.readFileSync('store-config.js','utf8'),{window});const c=window.DRINK_RELAY_STORE_CONFIG;
 const headers={apikey:c.supabaseAnonKey,'Content-Type':'application/json'};
 const r=await fetch(c.supabaseUrl+'/rest/v1/rpc/drink_popular_items',{method:'POST',headers,body:JSON.stringify({p_store:c.instanceId,p_limit:10})});
 assert.ok([401,403].includes(r.status),'Anonymous popular RPC rejected: '+r.status);
 const m=await fetch(c.supabaseUrl+'/functions/v1/unlimited',{method:'POST',headers,body:JSON.stringify({action:'menu',store:c.instanceId})});assert.equal(m.status,200);
 console.log('PASS live HTTP: new popular RPC denies anonymous; existing customer menu remains available');
})().catch(e=>{console.error(e);process.exitCode=1});
