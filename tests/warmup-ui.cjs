const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/jsdom'));
const ts=require(path.join(process.env.TEMP,'warmup-validation/node_modules/typescript'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
async function main(){
 const dom=new JSDOM(fs.readFileSync('unlimited-customer.html','utf8'),{url:'http://localhost/unlimited-customer.html?warmup=1&card=valid-fixed-qr',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;Object.defineProperty(w,'TextEncoder',{value:TextEncoder});Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};
 let poll;w.setInterval=(fn,ms)=>{if(ms===3000)poll=fn;return 1;};w.clearInterval=()=>{};
 const evaluate=file=>w.eval(fs.readFileSync(file,'utf8'));
 evaluate('store-config.js');evaluate('initial-settings.js');evaluate('unlimited-config.js');evaluate('unlimited-shared.js');
 w.DrinkRelayUnlimited.Gateway.prototype.init=async function(){return this;};
 let session=null,orders=[],stopped=false,reason='weekday',fail=false;
 const profile=w.DRINK_RELAY_UNLIMITED_CONFIG.planRules['unlimited-alcohol-all-day'];
 w.fetch=async(url,request)=>{
  if(fail)throw new Error('network unavailable');const p=JSON.parse(request.body);let error;
  if(p.action==='activate'){if(p.code!=='1234')error='コードが違います';else session={sessionId:'test-session',status:'active',deviceBinding:p.device,expiresAt:'2099-10-06T00:00:00+09:00',currentLocation:{target:'bar',tableNo:'',seatNo:''},planId:'unlimited-alcohol-all-day'};}
  if(p.action==='order'){if(orders.some(o=>o.status==='ordered'))error='提供待ち';else orders.push({id:'test-order',quantity:1,status:'ordered',target:'bar',drink_name:'Drink'});}
  if(p.action==='location')session.currentLocation=p.location;
  return {ok:true,json:async()=>error?{error}:{reason,stopped,profile,session,orders,token:p.action==='activate'?'random-test-token':null,serverNow:new Date().toISOString(),order:orders.at(-1)}};
 };
 evaluate('warmup-client.js');evaluate('unlimited-customer.js');await tick();
 const $=s=>w.document.querySelector(s);let count=0;const ok=(v,label)=>{assert.ok(v,label);console.log('PASS '+label);count++;};
 ok(!$('#warmupActivation').hidden && !$('#warmupForm').hidden,'code entry screen');
 $('#warmupCode').value='9999';$('#warmupForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();ok($('#warmupAuthError').textContent.includes('違い'),'code error rendered');
 $('#warmupCode').value='1234';$('#warmupForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 ok(!$('#warmupLocationState').hidden && $('#orderState').hidden,'first authentication requires destination');
 ok(!w.document.querySelector('[data-location-choice="target"].active'),'bar is not preselected');
 $('#saveCurrentLocation').click();await tick();ok($('#locationDialogStatus').textContent.includes('エリア'),'cannot save without selecting area');
 await poll();ok($('#locationDialog').open && $('#orderState').hidden,'poll preserves mandatory destination screen');
 const cancelled=new w.Event('cancel',{cancelable:true});$('#locationDialog').dispatchEvent(cancelled);ok(cancelled.defaultPrevented,'escape cannot skip initial location');
 $('[data-location-choice="target"][data-location-value="tournament"]').click();
 $('#saveCurrentLocation').click();await tick();ok($('#locationDialog').open,'table and seat required');
 $('[data-location-choice="tableNo"][data-location-value="B"]').click();
 $('[data-location-choice="seatNo"][data-location-value="3"]').click();
 $('#saveCurrentLocation').click();await tick();ok(!$('#orderState').hidden && !$('#locationDialog').open,'saved destination opens authenticated order screen');
 await poll();ok(!$('#orderState').hidden && !$('#locationDialog').open,'confirmed session is not prompted again');
 ok($('#activePlanName').textContent==='Warmup飲み放題','Warmup plan label');ok($('#remainingTime').textContent.includes('本日23:59まで'),'expiry label');
 ok($('#currentLocationLabel').textContent.includes('B') && $('#currentLocationLabel').textContent.includes('3'),'selected destination always shown');
 const drink=$('#menuSections [data-item-id]');ok(drink&&!drink.disabled,'shared live menu usable');drink.click();await tick();
 for(const group of w.document.querySelectorAll('#itemOptions .option-group[data-required="true"]')){const option=group.querySelector('input[value]:not([value=""])');if(option)option.checked=true;}
 $('#addToCart').click();$('#openCart').click();ok($('#cartItems').textContent.includes('1杯'),'single cup cart');$('#submitOrder').click();await tick();ok(orders.length===1,'order button submits');
 await poll();ok($('#openCart').disabled,'pending cup locks cart');
 orders[0].status='served';await poll();ok(!$('#menuSections [data-item-id]').disabled,'served unlocks menu');
 stopped=true;await poll();ok($('#orderState').hidden && $('#warmupMessage').textContent.includes('停止中'),'stop hides ordering');
 stopped=false;session=null;reason='weekend';await poll();ok($('#warmupForm').hidden && $('#warmupMessage').textContent.includes('平日のみ'),'weekend no order controls');
 reason='weekday';await poll();ok(!$('#warmupForm').hidden,'midnight returns to code');
 fail=true;const logError=w.console.error;w.console.error=()=>{};await poll();w.console.error=logError;ok(!$('#errorState').hidden,'network failure stops ordering');
 // Parse all JS and Edge TypeScript, without importing network modules.
 for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.js')))new (require('node:vm').Script)(fs.readFileSync(file,'utf8'),{filename:file});
 const edge=ts.transpileModule(fs.readFileSync('supabase/functions/warmup/index.ts','utf8'),{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 assert.equal(edge.diagnostics.length,0);ok(true,'JavaScript and Edge TypeScript syntax');
 dom.window.close();console.log(`${count} UI/syntax checks passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
