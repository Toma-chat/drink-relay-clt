const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {JSDOM}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/jsdom'));
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;let initialize,visible=false,connections=0,menus=0,catalogs=0;
 const add=w.document.addEventListener.bind(w.document);w.document.addEventListener=(event,fn,...args)=>event==='DOMContentLoaded'?initialize=fn:add(event,fn,...args);
 w.setInterval=()=>1;const timeout=w.setTimeout.bind(w);w.setTimeout=(fn)=>timeout(fn,0);
 w.document.querySelector('#unlimitedSessionList').getClientRects=()=>visible?[1]:[];
 w.DrinkRelayStaffAuth={requireStaff:async()=>true};
 class Gateway{async init(options){connections++;assert.equal(options.orders,false);return this}async loadMenu(){menus++;return []}async loadCards(){catalogs++;return []}onChange(){}now(){return Date.now()}async listSessions(){return []}}
 w.DrinkRelayUnlimited={Gateway,CONFIG:{planCatalog:[],planRules:{}},normalizeCardCatalog:x=>x};w.eval(fs.readFileSync('unlimited-admin.js','utf8'));await initialize();assert.equal(connections,0);assert.equal(menus,0);assert.equal(catalogs,0);
 visible=true;w.document.dispatchEvent(new w.CustomEvent('drink-management-changed'));await new Promise(r=>setTimeout(r,40));assert.equal(connections,1);assert.equal(menus,1);assert.equal(catalogs,1);
 visible=false;w.document.dispatchEvent(new w.CustomEvent('drink-management-changed'));await new Promise(r=>setTimeout(r,20));assert.equal(catalogs,1);
 console.log('PASS hidden QR management makes no connection/menu/catalog request, first open initializes once, hidden event stays idle');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
