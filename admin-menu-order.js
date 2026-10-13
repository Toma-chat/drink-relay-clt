(function () {
  'use strict';
  const store=String(window.DRINK_RELAY_STORE_CONFIG?.instanceId||'standalone-store');
  const key=`drink-relay-${store}-admin-display-order-v1`;
  let preferences;
  try {preferences=JSON.parse(localStorage.getItem(key)||'{}');}catch{preferences={};}
  if(!preferences || typeof preferences!=='object' || Array.isArray(preferences))preferences={};
  function sorted(values, ids, id) {
    if(!Array.isArray(ids))return [...values];
    const ranks=new Map(ids.map((value,index)=>[value,index]));
    return values.map((value,index)=>({value,index})).sort((a,b)=>(ranks.get(id(a.value))??1e9)-(ranks.get(id(b.value))??1e9)||a.index-b.index).map(row=>row.value);
  }
  function apply(groups) {
    return sorted(groups,preferences.groups,g=>g.id).map(group=>({...group,
      items:sorted(group.items,preferences.items?.[group.id],entry=>entry.item.id)}));
  }
  function editor(root, getGroups, changed) {
    function render(){
      const expanded=new Set(Array.from(root.querySelectorAll('details[open]')).map(node=>node.dataset.group));
      root.replaceChildren();
      const note=document.createElement('p');note.textContent='この端末の管理画面だけに反映します。お客様のメニュー順は変わりません。変更は自動保存します。';root.append(note);
      const groups=getGroups();
      function buttons(container,index,count,move,label){
        for(const [delta,text] of [[-1,'↑'],[1,'↓']]){
          const button=document.createElement('button');button.type='button';button.className='button button-quiet';button.textContent=text;button.setAttribute('aria-label',`${label}を${delta<0?'上':'下'}へ`);button.disabled=index+delta<0||index+delta>=count;
          button.onclick=()=>{try{move(delta);localStorage.setItem(key,JSON.stringify(preferences));changed();render();}catch{note.textContent='この端末に並び順を保存できませんでした。';}};container.append(button);
        }
      }
      function swap(ids,index,delta){[ids[index],ids[index+delta]]=[ids[index+delta],ids[index]];return ids;}
      groups.forEach((group,index)=>{
        const details=document.createElement('details');details.style.cssText='padding:12px;border:1px solid #ddd;margin:10px 0;background:white';
        details.dataset.group=group.id;details.open=expanded.has(group.id);
        const summary=document.createElement('summary');summary.textContent=group.label;
        details.append(summary);
        const row=document.createElement('div');row.style.margin='10px 0';
        buttons(row,index,groups.length,delta=>{preferences.groups=swap(groups.map(g=>g.id),index,delta);},group.label);details.append(row);
        if(group.id==='popular'){const p=document.createElement('p');p.textContent='「よく出る」の商品順は注文数に応じて変わります。';details.append(p);}
        else group.items.forEach((entry,itemIndex)=>{
          const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;margin:8px 0';
          const name=document.createElement('span');name.textContent=entry.item.name;name.style.flex='1';row.append(name);
          buttons(row,itemIndex,group.items.length,delta=>{preferences.items ||= {};preferences.items[group.id]=swap(group.items.map(e=>e.item.id),itemIndex,delta);},entry.item.name);details.append(row);
        });root.append(details);
      });
      const reset=document.createElement('button');reset.type='button';reset.className='button button-quiet';reset.textContent='管理画面の順番を初期状態に戻す';reset.onclick=()=>{preferences={};localStorage.removeItem(key);changed();render();};root.append(reset);
    }
    render();
  }
  window.DrinkAdminMenuOrder={apply,editor};
})();
