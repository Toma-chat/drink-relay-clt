(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const yen = n => `¥${Number(n || 0).toLocaleString('ja-JP')}`;
  const PAGE_SIZE = 10;
  const JUICE_PAGE_SIZE = 15;
  const AUTO_OPEN_CUSTOM_ITEM_IDS = new Set(['item-1783049570152']);
  const TARGETS = {ring:'リング',tournament:'トナメ',casino:'カジノ',bar:'バーカウンター'};
  class FixedOrder {
    constructor(form, api) {
      this.form = form; this.api = api; this.active = 'popular'; this.page = 0;
      this.categoryPage = 0; this.cartPage = 0; this.popular = []; this.loading = false;
      this.status = ''; this.busy = false; this.batch = null; this.undo = [];
      form.classList.add('fixed-order-form');
      const destination = form.querySelector('.first-group');
      const oldActions = form.querySelector('.form-actions'); oldActions.hidden = true;
      this.panel = document.createElement('aside'); this.panel.className = 'fixed-cart';
      this.panel.setAttribute('aria-label', '現在の注文内容');
      this.panel.innerHTML = `<h2>現在の注文 <span data-fixed-count aria-live="polite">0杯</span></h2>
        <div data-fixed-cart class="fixed-cart-items"></div><div data-fixed-cart-pages class="fixed-pages"></div>
        <div class="fixed-delivery"></div>
        <div class="fixed-location"><label>テーブル<select name="fixedTable"><option value="">未選択</option></select></label>
          <label>席番号<select name="fixedSeat"><option value="">指定なし</option>${api.seats.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label></div>
        <div class="fixed-payment"><label>会計<select name="fixedPayment"><option value="paid">徴収済み</option><option value="uncollected">未徴収</option></select></label>
          <label>支払方法<select name="fixedMethod">${Object.entries(api.paymentLabels).map(([id,label])=>`<option value="${esc(id)}">${esc(label)}</option>`).join('')}</select></label></div>
        <div class="fixed-total" data-fixed-total>合計 ${yen(0)}</div>
        <p data-fixed-status role="status" aria-live="polite"></p>
        <button type="button" data-fixed-undo>直前の商品を取り消す</button>
        <button type="submit" data-fixed-send>注文送信</button>`;
      form.append(this.panel);
      destination.classList.add('fixed-legacy-destination');
      const delivery=this.panel.querySelector('.fixed-delivery');
      delivery.innerHTML=`<label>追加する杯の届け先<select name="fixedTarget">${Object.entries(TARGETS).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>`;
      delivery.innerHTML+='<select name="fixedTable" hidden><option value="">指定なし</option></select><input name="fixedSeat" type="hidden" value="">';
      this.panel.querySelector('.fixed-location').remove();
      this.panel.append(destination);
      this.form.elements.fixedTarget.value=TARGETS[this.form.elements.target.value]?this.form.elements.target.value:'ring';
      const toggle = document.getElementById('fixedActivationToggle');
      if (toggle && !toggle.dataset.bound) {
        toggle.dataset.bound = 'true'; toggle.addEventListener('click', () => {
          const open = toggle.getAttribute('aria-expanded') !== 'true';
          toggle.setAttribute('aria-expanded',String(open));
          document.getElementById('view-reception').classList.toggle('fixed-management-open',open);
          toggle.textContent = open ? '注文入力へ戻る' : '飲み放題・Warmup・QR管理を開く';
        });
      }
      form.addEventListener('click', e => this.click(e));
      form.addEventListener('change', e => this.change(e));
      window.addEventListener('focus',()=>this.refreshPopular());
      window.addEventListener('resize',()=>this.render());
      this.timer = window.setInterval(()=>this.refreshPopular(),60000);
      this.render(); this.refreshPopular();
    }
    categories() {
      const menu = this.api.menu(); const list = [{id:'popular',label:'よく出る',items:[]}];
      for (const c of menu) {
        if (c.id === 'alcohol') {
          for (const s of c.subcategories || []) if(c.items.some(i=>i.subcategory_id===s.id)) list.push({id:`${c.id}::${s.id}`,label:s.label,
            items:c.items.filter(i=>i.subcategory_id===s.id).map(item=>({item,category:c.id}))});
          const known = new Set((c.subcategories || []).map(s=>s.id));
          const extra = c.items.filter(i=>!known.has(i.subcategory_id));
          if (extra.length) list.push({id:c.id,label:c.label,items:extra.map(item=>({item,category:c.id}))});
        } else list.push({id:c.id,label:c.label,items:c.items.map(item=>({item,category:c.id}))});
      }
      const priority=['popular','alcohol::beer','alcohol::highball','alcohol::sour','alcohol::cocktail','water-tea','juice','red-bull'];
      const groups=list.sort((a,b)=>(priority.includes(a.id)?priority.indexOf(a.id):100)-(priority.includes(b.id)?priority.indexOf(b.id):100));
      return this.api.orderGroups ? this.api.orderGroups(groups) : groups;
    }
    find(id) {
      const matches=this.api.menu().flatMap(c=>c.items.filter(i=>i.id===id).map(item=>({item,category:c.id})));
      return matches.length===1 ? matches[0] : null;
    }
    async refreshPopular() {
      const client=this.api.client(); if (!client || this.loading) return;
      this.loading=true;
      try {
        const {data,error}=await client.rpc('drink_popular_items',{p_store:this.api.store,p_limit:10});
        if(error) throw error;
        this.popular=(data.items || []).map(x=>x.itemId);
        this.popularError=false; this.popularReady=true;
      } catch(error) { console.error('人気商品の取得失敗',error); this.popularError=true; }
      finally {this.loading=false; this.render();}
    }
    pages(kind,page,total) {
      return `<button type="button" data-fixed-page="${kind}" data-step="-1" ${page<=0?'disabled':''}>前へ</button>
        <span>${page+1} / ${Math.max(1,total)}</span><button type="button" data-fixed-page="${kind}" data-step="1" ${page>=total-1?'disabled':''}>次へ</button>`;
    }
    render() {
      const categories=this.categories(); if(!categories.some(c=>c.id===this.active)) this.active='popular';
      const category=categories.find(c=>c.id===this.active);
      const picker=this.form.querySelector('[data-drink-picker]'); picker.className='control-group drink-choice-panel fixed-picker';
      picker.dataset.fixedCategory=this.active;
      const categoryNav=picker.querySelector('[data-menu-categories]'),scrollTop=categoryNav.scrollTop;
      categoryNav.innerHTML=categories.map(c=>
        `<button type="button" data-fixed-category="${esc(c.id)}" aria-pressed="${c.id===this.active}" class="${c.id===this.active?'active':''}">${esc(c.label)}</button>`).join('');
      categoryNav.scrollTop=scrollTop;
      const items=this.active==='popular'?this.popular.map(id=>this.find(id)).filter(Boolean):category.items;
      const pageSize=this.active==='juice'?JUICE_PAGE_SIZE:PAGE_SIZE;
      const total=Math.ceil(items.length/pageSize); this.page=Math.min(this.page,Math.max(0,total-1));
      picker.querySelector('[data-drink-buttons]').innerHTML=`<div class="fixed-product-heading"><h2>${esc(category.label)}</h2>
        ${this.active==='popular'?'<span>直近30日を優先・最大10商品</span>':''}</div>
        <div class="fixed-products">${items.slice(this.page*pageSize,(this.page+1)*pageSize).map(({item,category})=>{
          const count=this.api.cart().filter(x=>x.menu_item_id===item.id).reduce((n,x)=>n+x.quantity,0);
          return `<button type="button" data-fixed-item="${esc(item.id)}" data-menu-item-id="${esc(item.id)}" data-menu-category-id="${esc(category)}" class="${count?'in-cart':''}">
            <span class="fixed-product-name">${esc(item.name)}</span><span>${yen(item.price)}${count?` · ${count}杯`:''}</span>
            ${item.optionGroups.some(g=>g.required)?'<small>必須カスタムあり</small>':''}</button>`;
        }).join('') || `<p>${this.popularError?'人気商品を取得できません。下の再読込、または別カテゴリーを選んでください。':this.active==='popular'?'人気商品を読み込み中…':'商品未設定'}</p>`}</div>
        <div class="fixed-pages">${total>1?this.pages('product',this.page,total):''}${this.active==='popular'?'<button type="button" data-fixed-refresh>再読込</button>':''}</div>`;
      this.renderCart();
      if (!this.popularReady && !this.popularError && !this.loading && this.api.client()) this.refreshPopular();
    }
    renderCart() {
      const cart=this.api.cart(); const total=Math.ceil(cart.length/2); this.cartPage=Math.min(this.cartPage,Math.max(0,total-1));
      this.panel.querySelector('[data-fixed-cart]').innerHTML=cart.slice(this.cartPage*2,this.cartPage*2+2).map(x=>{
        const product=this.find(x.menu_item_id)?.item;
        const missing=(product?.optionGroups || []).some(g=>g.required && !x.fixedOptions?.[g.id]);
        return `<section class="fixed-cart-row"><div><strong>${esc(x.drink_name)}</strong><span>${x.quantity}杯 · ${yen(x.price*x.quantity)}</span></div>
          <div class="fixed-row-actions"><button type="button" data-fixed-qty="${esc(x.id)}" data-step="-1" aria-label="${esc(x.drink_name)}を減らす">−</button>
          <button type="button" data-fixed-qty="${esc(x.id)}" data-step="1" aria-label="${esc(x.drink_name)}を増やす" ${x.quantity>=20?'disabled':''}>＋</button>
          <button type="button" data-fixed-custom="${esc(x.id)}">${missing?'必須を選択':'カスタム'}</button></div>
          <div class="fixed-cup-delivery">${Array.from({length:x.quantity},(_,index)=>{
            const loc=x.locations?.[index] || {target:x.target,tableNo:'',seatNo:''};
            return `<div class="fixed-cup"><span>${index+1}杯目</span><label>届け先<select data-cup-field="target" data-entry="${esc(x.id)}" data-cup="${index}">${Object.entries(TARGETS).map(([id,label])=>`<option value="${id}" ${loc.target===id?'selected':''}>${label}</option>`).join('')}</select></label><label>卓（任意）<select data-cup-field="tableNo" data-entry="${esc(x.id)}" data-cup="${index}"><option value="">指定なし</option>${this.api.tables(loc.target).map(t=>`<option ${loc.tableNo===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label><label>席（任意）<input data-cup-field="seatNo" data-entry="${esc(x.id)}" data-cup="${index}" value="${esc(loc.seatNo)}" inputmode="numeric" maxlength="12" placeholder="任意"></label></div>`;
          }).join('')}</div><small>${esc(x.selected_options.join(' / ') || '通常')}</small></section>`;
      }).join('') || '<p class="fixed-empty">中央の商品をタップして追加</p>';
      this.panel.querySelector('[data-fixed-cart-pages]').innerHTML=total>1?this.pages('cart',this.cartPage,total):'';
      this.panel.querySelector('[data-fixed-count]').textContent=`${cart.reduce((n,x)=>n+x.quantity,0)}杯`;
      this.panel.querySelector('[data-fixed-total]').textContent=`合計 ${yen(cart.reduce((n,x)=>n+x.quantity*x.price,0))}`;
      this.panel.querySelector('[data-fixed-send]').disabled=!cart.length || this.busy || this.status==='complete';
      this.panel.querySelector('[data-fixed-send]').textContent=this.busy?'送信中…':this.status==='complete'?'送信しました':this.batch?'同じ注文を再送信':'注文送信';
      this.panel.querySelector('[data-fixed-undo]').disabled=!this.undo.length || !!this.batch;
      this.panel.dataset.state=this.status;
      this.panel.querySelector('[data-fixed-status]').textContent=this.status==='failed'?'送信結果を確認できません。同じ注文を再送信できます（重複しません）。':this.status==='complete'?'送信しました':this.busy?'送信中…':'';
      this.updateDelivery();
    }
    updateDelivery() {
      this.panel.querySelectorAll('input,select').forEach(x=>{x.disabled=!!this.batch;});
      const target=this.form.elements.fixedTarget.value;
      const table=this.form.elements.fixedTable, old=table.value;
      table.innerHTML='<option value="">未選択</option>'+this.api.tables(target).map(x=>`<option>${esc(x)}</option>`).join(''); table.value=old;
      table.disabled=target==='bar'; this.form.elements.fixedSeat.disabled=['bar','cast'].includes(target);
      this.form.elements.fixedMethod.disabled=this.form.elements.fixedPayment.value==='paid';
      this.panel.querySelectorAll('input,select').forEach(x=>{if(this.batch)x.disabled=true;});
    }
    click(e) {
      const b=e.target.closest('button'); if(!b || b.disabled) return;
      if(b.hasAttribute('data-fixed-refresh')) {this.refreshPopular();return;}
      if(b.dataset.fixedCategory) {this.active=b.dataset.fixedCategory;this.page=0;this.render();return;}
      if(b.dataset.fixedPage) {const key={category:'categoryPage',product:'page',cart:'cartPage'}[b.dataset.fixedPage];this[key]+=Number(b.dataset.step);this.render();return;}
      if(this.batch || this.status==='complete') return;
      const cart=this.api.cart();
      if(b.dataset.fixedItem) {
        const found=this.find(b.dataset.fixedItem); if(!found)return;
        const {item,category}=found;
        const entry={id:crypto.randomUUID(),source:this.form.dataset.source,target:this.form.elements.fixedTarget.value,
          drink_name:item.name,price:item.price,quantity:1,selected_options:[],fixedOptions:{},locations:[],menu_item_id:item.id,menu_category_id:category};
        // Highball taps use the explicit, existing soda option; other choices stay editable.
        if(item.subcategory_id==='highball') {const g=item.optionGroups.find(g=>g.id==='whiskey-mix'&&g.choices.includes('炭酸'));if(g){entry.fixedOptions[g.id]='炭酸';entry.selected_options=[`${g.label}: 炭酸`];}}
        const existing=cart.find(x=>x.menu_item_id===entry.menu_item_id && x.target===entry.target && x.quantity<20 && JSON.stringify(x.selected_options)===JSON.stringify(entry.selected_options));
        const location={target:entry.target,tableNo:this.form.elements.fixedTable.value,seatNo:this.form.elements.fixedSeat.value};
        if(existing) {existing.quantity++;existing.locations.push(location);} else {entry.locations.push(location);cart.push(entry);}
        const added=existing || entry;
        this.undo.push(added.id);this.cartPage=Math.floor(cart.indexOf(added)/2);this.render();
        const fresh=this.form.querySelector(`[data-fixed-item="${CSS.escape(item.id)}"]`);
        fresh?.classList.add('just-added');setTimeout(()=>fresh?.classList.remove('just-added'),450);
        if(AUTO_OPEN_CUSTOM_ITEM_IDS.has(item.id))this.openCustom(added.id);
      } else if(b.hasAttribute('data-fixed-undo')) {
        const id=this.undo.pop(),index=cart.findIndex(x=>x.id===id);if(index>=0){if(cart[index].quantity>1){cart[index].quantity--;cart[index].locations.pop();}else cart.splice(index,1);}this.render();
      } else if(b.dataset.fixedQty) {
        const index=cart.findIndex(x=>x.id===b.dataset.fixedQty);if(index<0)return;
        const delta=Number(b.dataset.step);cart[index].quantity+=delta;
        if(delta>0)cart[index].locations.push({...cart[index].locations.at(-1)});else cart[index].locations.pop();
        if(delta>0)this.undo.push(cart[index].id);else {const i=this.undo.lastIndexOf(cart[index].id);if(i>=0)this.undo.splice(i,1);}
        if(cart[index].quantity<=0)cart.splice(index,1);this.render();
      } else if(b.dataset.fixedCustom) this.openCustom(b.dataset.fixedCustom);
    }
    openCustom(id) {
      const entry=this.api.cart().find(x=>x.id===id),item=this.find(entry?.menu_item_id)?.item;if(!item)return;
      let dialog=document.getElementById('fixedCustomDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='fixedCustomDialog';dialog.className='fixed-custom-dialog';document.body.append(dialog);}
      dialog.innerHTML=`<h2>${esc(item.name)}</h2>${item.optionGroups.map(g=>`<label>${esc(g.label)}${g.required?'（必須）':''}
        <select data-fixed-option="${esc(g.id)}"><option value="">${g.required?'選択してください':'通常'}</option>${g.choices.map(c=>`<option ${entry.fixedOptions?.[g.id]===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>`).join('') || '<p>カスタム項目なし</p>'}
        <button type="button" data-fixed-custom-close>注文へ戻る</button>`;
      dialog.querySelector('[data-fixed-custom-close]').onclick=()=>{dialog.close();this.render();};
      dialog.onchange=()=>{entry.fixedOptions={};entry.selected_options=[];dialog.querySelectorAll('select').forEach(s=>{if(s.value){const g=item.optionGroups.find(g=>g.id===s.dataset.fixedOption);entry.fixedOptions[g.id]=s.value;entry.selected_options.push(`${g.label}: ${s.value}`);}});this.renderCart();};
      dialog.showModal();
    }
    change(e) {
      if(e.target.dataset.cupField && !this.batch) {
        const entry=this.api.cart().find(x=>x.id===e.target.dataset.entry),index=Number(e.target.dataset.cup);
        if(entry){entry.locations[index][e.target.dataset.cupField]=e.target.value;}
      }
      this.updateDelivery();
    }
    async send() {
      if(this.busy || this.status==='complete' || !this.api.cart().length)return;
      if(!this.batch) {
        for(const entry of this.api.cart()) {
          const item=this.find(entry.menu_item_id)?.item;
          if(!item){this.api.notice('商品が変更されました。メニューを確認してください');return;}
          if(item.optionGroups.some(g=>g.required && !g.choices.includes(entry.fixedOptions?.[g.id]))) {
            this.api.notice(`${entry.drink_name}の必須カスタムを選択してください`);this.openCustom(entry.id);return;
          }
        }
        const payment=this.form.elements.fixedPayment.value,method=payment==='paid'?'cash':this.form.elements.fixedMethod.value;
        this.batch=this.api.cart().flatMap(x=>Array.from({length:x.quantity},(_,index)=>{const event=this.api.event(),location=x.locations[index],target=location.target;return {
          id:crypto.randomUUID(),created_at:event.at,updated_at:event.at,source:this.form.dataset.source,drink_name:x.drink_name,quantity:1,target,
          table_no:location.tableNo,seat_no:location.seatNo,payment_status:payment,payment_method:method,
          notes:x.selected_options.length?`オプション: ${x.selected_options.join(' / ')}`:'',status:'ordered',
          events:[{...event,itemId:x.menu_item_id,categoryId:x.menu_category_id}],
        };}));
      }
      this.busy=true;this.status='sending';this.render();
      try {
        await this.api.send(this.batch);this.api.clear();this.undo=[];this.batch=null;this.status='complete';this.refreshPopular();
        setTimeout(()=>{this.status='';this.render();},1800);
      } catch(error) {console.error(error);this.status='failed';}
      finally {this.busy=false;this.render();}
    }
  }
  window.DrinkFixedOrder=FixedOrder;
})();
