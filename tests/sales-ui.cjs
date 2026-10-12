// Test real frontend handlers without a customer/staff credential or production writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
  const nodes=new Map(),events={},timers=[],subscriptions=[];
  class Node {constructor(){this.value='';this.disabled=false;this.hidden=false;this.innerHTML='';this.textContent='';this.dataset={};this.listeners={};this.classList={toggle(){}};}addEventListener(n,f){this.listeners[n]=f;}setAttribute(){}focus(){}click(){this.clicked=true;}}
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
  const buttons=['today','yesterday','week','month','custom'].map(period=>{const b=new Node();b.dataset.salesPeriod=period;return b;});
  const document={getElementById:node,querySelectorAll:()=>buttons,addEventListener:(n,f)=>{events[n]=f;},createElement:()=>{const n=new Node();nodes.set('download',n);return n;},hidden:false};
  let signedIn=true,allowed=true,fail=false,calls=0;
  const result={start:'2026-10-12',end:'2026-10-12',generatedAt:'2026-10-12T09:00:00Z',historySince:'2026-10-12T09:00:00Z',unmatchedSessionCups:0,
    totals:{total:4,served:3,pending:1,single:2,unlimited:1,warmup:1,people:1,average:1},revenue:{known:1500,unknownOrders:1,unknownPlans:0},
    drinks:[{key:'test',name:'<script>attack</script>',category:'カテゴリ不明',total:4,served:3,pending:1,single:2,unlimited:1,warmup:1}],
    categories:[{category:'カテゴリ不明',total:4}],plans:[],csv:[]};
  const channel={on(event,filter,cb){subscriptions.push({filter,cb});return this;},subscribe(){return this;}};
  const client={auth:{getSession:async()=>({data:{session:signedIn?{}:null}})},rpc:async(name)=>{
    if(name==='is_drink_staff')return {data:allowed};calls++;return fail?{error:{message:'通信エラー'}}:{data:result};},channel:()=>channel};
  const window={DrinkRelayStaffAuth:{requireStaff:async()=>true,client},DRINK_RELAY_STORE_CONFIG:{instanceId:'casinolivetokyo'},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync('sales-analytics.js','utf8'),{window,document,Date,console,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setInterval(){},clearTimeout(){},setTimeout:f=>{timers.push(f);return timers.length;}});
  await events.DOMContentLoaded();assert.equal(calls,0,'no background summary before view opens');
  events['drink-view-changed']({detail:'sales'});await new Promise(setImmediate);
  assert.equal(calls,1);assert.equal(node('salesCsv').disabled,false);assert.ok(node('salesDrinks').innerHTML.includes('&lt;script&gt;'));
  const cards=node('salesCards').innerHTML;fail=true;await node('salesRefresh').listeners.click();
  assert.equal(node('salesCards').innerHTML,cards,'preserve previous data on failure');assert.equal(node('salesRetry').hidden,false);assert.equal(node('salesRefresh').disabled,false);
  fail=false;await node('salesRetry').listeners.click();assert.equal(node('salesRetry').hidden,true);
  assert.equal(subscriptions.length,2);subscriptions[0].cb();await timers.pop()();assert.equal(calls,4,'order event triggers refresh');
  signedIn=false;await node('salesCsv').listeners.click();assert.equal(nodes.has('download'),false,'CSV requires login');
  signedIn=true;allowed=false;await node('salesCsv').listeners.click();assert.equal(nodes.has('download'),false,'CSV requires allowlist');
  allowed=true;await node('salesCsv').listeners.click();assert.equal(node('download').clicked,true);
  console.log('PASS UI: open fetch, realtime refresh, stale-value preservation, retry, escaping and staff-only CSV');
})().catch(e=>{console.error(e);process.exitCode=1;});
