const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/jsdom'));
const {execFileSync}=require('node:child_process');
const tick=()=>new Promise(resolve=>setTimeout(resolve,60));
async function main(){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost/index.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.setInterval=()=>1;w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(fs.readFileSync('initial-settings.js','utf8'));w.DRINK_RELAY_STORE_CONFIG={instanceId:'regression',supabaseUrl:'',supabaseAnonKey:''};
 w.eval(fs.readFileSync('app.js','utf8'));await tick();
 assert.ok(w.document.querySelector('#view-reception').classList.contains('active'));console.log('PASS reception initializes');
 assert.ok(w.document.querySelector('[data-drink-picker] button'));console.log('PASS normal reception menu renders');
 w.document.querySelector('#headerBarButton').click();await tick();assert.ok(w.document.querySelector('#view-bar').classList.contains('active'));console.log('PASS bar switches');
 w.document.querySelector('#headerConfigButton').click();await tick();assert.ok(w.document.querySelector('#menuEditor').children.length);console.log('PASS menu settings render');
 const original=execFileSync('git',['show','HEAD:app.js'],{encoding:'utf8'}),current=fs.readFileSync('app.js','utf8');
 // Whole original completion routine, including the 1.6s delay, must stay byte-equivalent.
 const index=original.indexOf('}, 1600);');assert.ok(index>0);assert.ok(current.includes(original.slice(index-1400,index+30).replaceAll('\r\n','\n')));console.log('PASS bar completion routine unchanged');
 dom.window.close();
 const regular=new JSDOM(fs.readFileSync('unlimited-customer.html','utf8'),{url:'http://localhost/unlimited-customer.html?card=regular-card&plan=unlimited-alcohol-all-day',runScripts:'outside-only',pretendToBeVisual:true});
 const r=regular.window;Object.defineProperty(r,'crypto',{value:require('node:crypto').webcrypto});r.TextEncoder=TextEncoder;r.setInterval=()=>1;
 r.HTMLDialogElement.prototype.showModal=function(){this.open=true;};r.HTMLDialogElement.prototype.close=function(){this.open=false;};
 r.DRINK_RELAY_STORE_CONFIG={instanceId:'regression',supabaseUrl:'',supabaseAnonKey:''};
 for(const file of ['initial-settings.js','unlimited-config.js','unlimited-shared.js','warmup-client.js','unlimited-customer.js'])r.eval(fs.readFileSync(file,'utf8'));
 await tick();assert.ok(!r.document.querySelector('#activationState').hidden);assert.match(r.document.querySelector('#activationCode').textContent,/^\d{4}$/);assert.ok(r.document.querySelector('#warmupActivation').hidden);console.log('PASS existing unlimited activation retained');regular.window.close();
 console.log('6 regression checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
