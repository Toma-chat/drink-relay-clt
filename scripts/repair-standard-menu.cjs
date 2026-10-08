// Add only missing standard-profile products from the shared initial menu.
// Existing products, prices, recipes and options are preserved. No Warmup copies.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function merge(live, initial, rule) {
 const menu=structuredClone(live), added=[];
 const ids=new Set(menu.flatMap(c=>(c.items||[]).map(i=>i.id)));
 for(const source of initial) for(const item of source.items||[]) {
  if(!rule.includeItemIds.includes(item.id)||rule.excludeItemIds.includes(item.id)||ids.has(item.id))continue;
  if(menu.some(c=>(c.items||[]).some(i=>i.name===item.name)))throw Error(`同名別IDの商品があります: ${item.name}`);
  const category=menu.find(c=>c.id===source.id);if(!category)throw Error(`カテゴリがありません: ${source.id}`);
  if(item.subcategory_id && !(category.subcategories||[]).some(s=>s.id===item.subcategory_id)) {
   const sub=(source.subcategories||[]).find(s=>s.id===item.subcategory_id);
   if(!sub)throw Error(`分類がありません: ${item.name}`);
   (category.subcategories ||= []).push(structuredClone(sub));
  }
  (category.items ||= []).push(structuredClone(item));ids.add(item.id);added.push(item.name);
 }
 return {menu,added};
}
async function main(){
 const c={window:{}};vm.createContext(c);
 for(const f of ['store-config.js','initial-settings.js','unlimited-config.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
 const config=c.window.DRINK_RELAY_STORE_CONFIG;
 const headers={apikey:config.supabaseAnonKey,Authorization:`Bearer ${config.supabaseAnonKey}`,'Content-Type':'application/json'};
 const endpoint=config.supabaseUrl+'/rest/v1/drink_app_settings';
 const response=await fetch(endpoint+'?id=eq.main&select=menu,updated_at',{headers});if(!response.ok)throw Error('読込失敗: '+response.status);
 const [row]=await response.json();if(!Array.isArray(row?.menu))throw Error('共有メニューがありません');
 const {menu,added}=merge(row.menu,c.window.DRINK_RELAY_INITIAL_SETTINGS.menu,c.window.DRINK_RELAY_UNLIMITED_CONFIG.planRules['unlimited-alcohol-all-day']);
 console.log('追加対象: '+(added.join('、')||'なし'));
 if(!added.length||!process.argv.includes('--apply'))return;
 const backup=path.join(process.env.TEMP||process.cwd(),`drink-menu-before-repair-${Date.now()}.json`);
 fs.writeFileSync(backup,JSON.stringify(row,null,2));
 const patched=await fetch(endpoint+'?id=eq.main&updated_at=eq.'+encodeURIComponent(row.updated_at),{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({menu,updated_at:new Date().toISOString()})});
 if(!patched.ok)throw Error('保存失敗: '+patched.status);
 if((await patched.json()).length!==1)throw Error('メニューが同時編集されました。再実行してください');
 const check=await fetch(endpoint+'?id=eq.main&select=menu',{headers});if(!check.ok)throw Error('保存確認失敗');
 const [saved]=await check.json();if(JSON.stringify(saved.menu)!==JSON.stringify(menu))throw Error('保存内容が異なります');
 console.log('保存・再読込確認成功。バックアップ: '+backup);
}
module.exports={merge};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
