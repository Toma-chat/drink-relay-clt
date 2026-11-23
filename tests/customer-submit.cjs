const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(process.env.JSDOM_MODULE || path.join(process.env.TEMP,'warmup-validation/node_modules/jsdom'));
(async()=>{
 const dom=new JSDOM(fs.readFileSync('unlimited-customer.html','utf8'),{url:'https://example.test/unlimited-customer.html',runScripts:'outside-only'}),w=dom.window;
 w.document.addEventListener=()=>{};w.setTimeout=()=>1;
 for(const f of ['initial-settings.js','unlimited-config.js','unlimited-shared.js'])w.eval(fs.readFileSync(f,'utf8'));
 let src=fs.readFileSync('unlimited-customer.js','utf8'),end=src.lastIndexOf('})();');
 src=src.slice(0,end)+'window.subject={state,submitOrder};renderMenu=()=>{};renderOrderAvailability=()=>{};toast=()=>{};'+src.slice(end);w.eval(src);
 const {state,submitOrder}=w.subject;
 state.session={sessionId:'active-session',status:'active',expiresAt:new Date(Date.now()+3600000).toISOString(),currentLocation:{target:'bar',tableNo:'',seatNo:''}};
 state.sessionId=state.session.sessionId;state.plan={id:'unlimited-soft-2h',name:'Soft'};state.orderStatusLoading=false;
 state.cart=[{name:'Tea',itemId:'green-tea',options:[]}];let ids=[],fail=true;
 state.gateway={now:()=>Date.now(),getSession:()=>{throw Error('unnecessary preflight')},loadCards:()=>{throw Error('unnecessary preflight')},createUnlimitedOrder:async row=>{ids.push(row.requestId);if(fail)throw Error('offline');return{id:'one',status:'served'}}};
 await submitOrder();assert.equal(state.cart.length,1,'uncertain result keeps basket');assert.equal(state.submitting,false);
 fail=false;await submitOrder();assert.equal(ids.length,2);assert.ok(ids[0]);assert.equal(ids[0],ids[1],'manual retry retains request identity');assert.equal(state.pendingOrder,null,'already served replay does not block next cup');assert.equal(state.cart.length,0);
 console.log('PASS direct server validation, retained basket on failure, stable manual retry and served-response handling');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
