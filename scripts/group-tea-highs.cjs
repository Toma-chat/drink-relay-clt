// Shared-menu category only: preserve prices, options and item IDs.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ids=new Set(['item-1783053258647','item-1783053270509','item-1783053301898','item-1783053313814']);
function group(menu){
 const result=structuredClone(menu),category=result.find(c=>c.id==='alcohol');
 if(!category)throw Error('アルコールカテゴリがありません');
 const drinks=category.items.filter(i=>ids.has(i.id));
 if(drinks.length!==4)throw Error('お茶ハイ4商品の確認が必要です');
 category.subcategories ||= [];
 if(!category.subcategories.some(c=>c.id==='tea-highs')) {
  const index=category.subcategories.findIndex(c=>c.id==='sour');
  category.subcategories.splice(index<0?category.subcategories.length:index+1,0,{id:'tea-highs',label:'お茶ハイ'});
 }
 for(const item of drinks)item.subcategory_id='tea-highs';
 return result;
}
async function main(){
 const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync('store-config.js','utf8'),c);
 const s=c.window.DRINK_RELAY_STORE_CONFIG,headers={apikey:s.supabaseAnonKey,Authorization:`Bearer ${s.supabaseAnonKey}`,'Content-Type':'application/json'};
 const endpoint=s.supabaseUrl+'/rest/v1/drink_app_settings';
 const response=await fetch(endpoint+'?id=eq.main&select=menu,updated_at',{headers});if(!response.ok)throw Error('読込失敗');
 const [row]=await response.json();const menu=group(row.menu);
 if(JSON.stringify(menu)===JSON.stringify(row.menu)){console.log('お茶ハイ分類は適用済み');return;}
 fs.writeFileSync(path.join(process.env.TEMP,`tea-high-category-backup-${Date.now()}.json`),JSON.stringify(row));
 const saved=await fetch(endpoint+'?id=eq.main&updated_at=eq.'+encodeURIComponent(row.updated_at),{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({menu,updated_at:new Date().toISOString()})});
 if(!saved.ok||(await saved.json()).length!==1)throw Error('保存失敗・同時編集を確認してください');
 const checked=await fetch(endpoint+'?id=eq.main&select=menu',{headers});if(!checked.ok)throw Error('再読込失敗');
 const [actual]=await checked.json();const tea=actual.menu.find(c=>c.id==='alcohol').items.filter(i=>ids.has(i.id));
 if(tea.length!==4||tea.some(i=>i.subcategory_id!=='tea-highs'))throw Error('保存確認失敗');
 console.log('お茶ハイ4種の分類を保存・再読込確認しました');
}
module.exports={group};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
