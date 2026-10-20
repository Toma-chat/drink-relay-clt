const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/jsdom'));
const tick=()=>new Promise(r=>setTimeout(r,40));
(async()=>{
 let session={sessionId:'existing-session',status:'active',deviceBinding:'legacy-device',planId:'unlimited-soft-2h',expiresAt:new Date(Date.now()+3600000).toISOString(),startedAt:new Date().toISOString(),locationConfirmed:true,currentLocation:{target:'bar',tableNo:'',seatNo:''}};
 let orders=[],saves=0;
 async function browser(){
  const dom=new JSDOM(fs.readFileSync('unlimited-customer.html','utf8'),{url:'https://example.test/unlimited-customer.html?card=existing-fixed-card&plan=unlimited-soft-2h',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;Object.defineProperty(w,'TextEncoder',{value:TextEncoder});Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
  Object.defineProperty(w,'localStorage',{get(){throw new Error('storage blocked');}});
  Object.defineProperty(w.document,'cookie',{get(){throw new Error('cookies blocked');},set(){throw new Error('cookies blocked');}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLElement.prototype.scrollTo=function(){};
  let poll;w.setInterval=(fn,ms)=>{if(ms===3000)poll=fn;return 1;};w.clearInterval=()=>{};
  const load=p=>w.eval(fs.readFileSync(p,'utf8'));for(const p of ['store-config.js','initial-settings.js','unlimited-config.js','unlimited-shared.js'])load(p);
  const G=w.DrinkRelayUnlimited.Gateway.prototype;
  G.init=async function(){return this;};G.ensureServerClock=async()=>{};
  G.getSession=async()=>JSON.parse(JSON.stringify(session));  // Initial settings is the actual full menu used by this app.
  let initial;const sandbox={window:{}};require('node:vm').runInNewContext(fs.readFileSync('initial-settings.js','utf8'),sandbox);
  initial=Object.values(sandbox.window).find(x=>x?.menu)?.menu;assert.ok(initial);G.loadMenu=async()=>JSON.parse(JSON.stringify(initial));
  G.loadCards=async()=>[{token:'existing-fixed-card',planId:session.planId,status:'active'}];
  G.getUnlimitedOrderState=async()=>({orders,pendingOrder:orders.find(x=>x.status==='ordered')||null});
  G.saveSession=async()=>{saves++;return session;};
  let code=fs.readFileSync('unlimited-customer.js','utf8');code=code.replace(/\}\)\(\);\s*$/, 'window.cardTest={state,checkSession,submitOrder,saveCurrentLocation};})();');w.eval(code);await tick();
  return {dom,w,$:s=>w.document.querySelector(s),poll:()=>poll()};
 }
 const one=await browser(),two=await browser();
 assert.equal(one.$('#orderState').hidden,false);assert.equal(two.$('#orderState').hidden,false);assert.equal(saves,0,'no activation write for fresh browser');
 assert.equal(one.$('#locationDialog').open,false);assert.equal(two.$('#locationDialog').open,false);
 const expires=session.expiresAt;await one.poll();await two.poll();assert.equal(session.expiresAt,expires);
 session.currentLocation={target:'ring',tableNo:'C',seatNo:'4'};orders=[{id:'shared-order',status:'ordered'}];await one.poll();await two.poll();
 for(const b of [one,two]){assert.ok(b.$('#currentLocationLabel').textContent.includes('C'));assert.ok(b.$('#openCart').disabled);assert.equal(b.w.cardTest.state.pendingOrder.id,'shared-order');}
 session={...session,sessionId:'next-customer',locationConfirmed:false,currentLocation:{target:'bar',tableNo:'',seatNo:''}};
 await one.poll();assert.equal(one.$('#endedState').hidden,false);assert.equal(one.w.cardTest.state.sessionId,'existing-session','old page stays pinned');
 const three=await browser();assert.equal(three.$('#orderState').hidden,true);assert.equal(three.$('#locationDialog').open,true);assert.equal(three.$('[data-location-choice="target"].active'),null);
 for(const b of [one,two,three])b.dom.window.close();
 console.log('PASS 3 isolated browser contexts with blocked storage/cookies: active QR opens, no activation/time extension, shared pending/location, no repeated confirmation, old screen ends on reuse, first location required');
})().catch(e=>{console.error(e);process.exitCode=1;});
