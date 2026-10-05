const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(path.join(process.env.TEMP,'warmup-validation/node_modules/jsdom'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
async function main(){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.DRINK_RELAY_STORE_CONFIG={instanceId:'audio-test'};
 const add=w.document.addEventListener.bind(w.document);w.document.addEventListener=(event,...args)=>{if(event!=='DOMContentLoaded')add(event,...args);};
 w.setInterval=()=>1;w.matchMedia=()=>({matches:false});
 w.Audio=class{constructor(){this.readyState=4;}load(){}addEventListener(){}pause(){}play(){return Promise.reject(new Error('gesture required'));}};
 let started=0,resumed=0;
 const context={state:'running',currentTime:0,destination:{},resume:async function(){resumed++;this.state='running';},
  createBufferSource(){return{connect(){return this;},start(){started++;}};},
  createGain(){return{gain:{setValueAtTime(){}},connect(){return this;}};}};
 let script=fs.readFileSync('app.js','utf8');const end=script.lastIndexOf('})();');script=script.slice(0,end)+'window.audioTest={state,playChime,playBufferedNotificationAudio,setupAudioUnlock,handleRealtimePayload,notifyNewOrder};'+script.slice(end);
 w.eval(script);const t=w.audioTest;const choice=t.state.soundChoices.soft || Object.values(t.state.soundChoices)[0];
 t.state.audioContext=context;t.state.notificationBuffers.set(choice,{});t.state.soundEnabled=true;
 for(const value of Object.values(t.state.soundChoices))t.state.notificationBuffers.set(value,{});
 context.state='interrupted';assert.equal(t.playBufferedNotificationAudio(choice),false);assert.equal(started,0);console.log('PASS interrupted context is not falsely reported as played');
 assert.equal(await t.playChime(choice),true);assert.equal(resumed,1);assert.equal(started,1);console.log('PASS iPad interrupted context resumes and plays received-order sound');
 context.state='suspended';assert.equal(await t.playChime(choice),true);assert.equal(started,2);console.log('PASS suspended context resumes');
 t.setupAudioUnlock();t.state.view='reception';context.state='interrupted';w.document.dispatchEvent(new w.Event('pointerdown'));await tick();assert.equal(context.state,'running');
 context.state='interrupted';w.document.dispatchEvent(new w.Event('pointerdown'));await tick();assert.equal(context.state,'running');console.log('PASS later taps rearm audio, including reception settings');
 context.state='interrupted';w.dispatchEvent(new w.Event('pageshow'));await tick();assert.equal(context.state,'running');console.log('PASS returning to page resumes interrupted audio');
 t.state.view='bar';t.state.booted=true;
 for(const value of Object.values(t.state.soundChoices))t.state.notificationBuffers.set(value,{});
 const before=started;const order={id:'new-order',source:'table',drink_name:'ウーロン茶',quantity:1,target:'bar',status:'ordered',created_at:new Date().toISOString(),events:[]};
 context.state='interrupted';t.handleRealtimePayload({eventType:'INSERT',new:order});await tick();assert.equal(started,before+1);console.log('PASS realtime order actually invokes resumed audio');
 t.handleRealtimePayload({eventType:'UPDATE',new:order});await tick();assert.equal(started,before+1);console.log('PASS same order does not chime twice');
 context.state='interrupted';context.resume=async()=>{};
 t.notifyNewOrder({...order,id:'blocked-audio'});await tick();assert.equal(t.state.soundPreviewed,false);assert.ok(w.document.querySelector('#headerSoundPreviewButton').classList.contains('is-unpreviewed'));console.log('PASS failed playback prompts bell reactivation');
 dom.window.close();console.log('8 notification checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
