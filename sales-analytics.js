(function () {
  'use strict';
  const labels = {single:'ワンドリンク',unlimited:'通常飲み放題',warmup:'Warmup'};
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const number = value => value == null ? '—' : Number(value).toLocaleString('ja-JP');
  function japanDay(now = Date.now()) {return new Date(now+9*3600000).toISOString().slice(0,10);}
  function shift(day,days) {return new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);}
  function period(kind,now) {
    const day=japanDay(now), weekday=new Date(day+'T00:00:00Z').getUTCDay();
    return {start:kind==='yesterday'?shift(day,-1):kind==='week'?shift(day,-((weekday+6)%7)):kind==='month'?day.slice(0,8)+'01':day,
      end:kind==='yesterday'?shift(day,-1):day};
  }
  function csvCell(value) {
    let text=String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }
  function csv(data) {
    return '\ufeff'+[['対象期間','ドリンク名','カテゴリ','注文種別','注文杯数','提供済み杯数','未提供杯数','集計日時','内部ID'],
      ...data.csv.map(r=>[data.start+'〜'+data.end,r.name,r.category,labels[r.kind]||r.kind,r.total,r.served,r.pending,data.generatedAt,r.key])]
      .map(row=>row.map(csvCell).join(',')).join('\r\n');
  }
  window.DrinkSalesHelpers={japanDay,shift,period,csv};
  let client, data=null, busy=false, visible=false, queued=false, timer, generation=0;
  const table=(headers,rows)=>'<table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+
    (rows.length?rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'">対象データがありません</td></tr>')+'</tbody></table>';
  function render(d) {
    const t=d.totals,r=d.revenue,unknown=r.unknownOrders+r.unknownPlans;
    const cards=[['総注文杯数',t.total,'杯'],['提供済み杯数',t.served,'杯'],['未提供杯数',t.pending,'杯'],
      ['ワンドリンク注文杯数',t.single,'杯'],['通常飲み放題の注文杯数',t.unlimited,'杯'],['Warmupの注文杯数',t.warmup,'杯'],
      ['通常飲み放題の利用人数',t.people,'人'],['1人あたり平均注文杯数',t.average,'杯'],
      [unknown?'金額判明分（総売上は金額不明）':'売上金額',r.known,'円']];
    $('salesCards').innerHTML=cards.map(([label,value,unit])=>'<article class="sales-card"><span>'+esc(label)+'</span><strong>'+number(value)+' <small>'+unit+'</small></strong></article>').join('');
    $('salesNotice').textContent=`表示対象：${d.start}〜${d.end}（日本時間）。金額不明：注文${r.unknownOrders}件、プラン${r.unknownPlans}件。履歴保存開始：${new Date(d.historySince).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}。保存開始前に削除・上書きされた履歴は復元できず、過去期間は不完全な場合があります。平均は注文した飲み放題セッション単位です。`+(d.unmatchedSessionCups?` 利用履歴不明の${d.unmatchedSessionCups}杯は杯数には含め、プラン人数・平均から除外しています。`:'');
    $('salesDrinks').innerHTML=table(['順位','ドリンク名','カテゴリ','注文杯数','提供済み','未提供','ワンドリンク','通常飲み放題','Warmup','割合'],d.drinks.map((x,i)=>[number(i+1),esc(x.name)+'<small>'+esc(x.key)+'</small>',esc(x.category),number(x.total),number(x.served),number(x.pending),number(x.single),number(x.unlimited),number(x.warmup),t.total?(100*x.total/t.total).toFixed(1)+'%':'0%']));
    $('salesCategories').innerHTML=d.categories.map(x=>'<div class="sales-category">'+esc(x.category)+'<strong>'+number(x.total)+'杯</strong></div>').join('')||'対象データがありません';
    $('salesPlans').innerHTML=table(['プラン名','アクティベート人数','総杯数','提供済み','平均杯数','現在利用中','利用終了'],d.plans.map(x=>[esc(x.name),number(x.people),number(x.total),number(x.served),number(x.average),number(x.active),number(x.ended)]));
  }
  function schedule() {clearTimeout(timer);if(visible) timer=setTimeout(refresh,700);}
  async function refresh() {
    if(!visible||!client) return;
    if(busy){queued=true;return;}
    const start=$('salesStart').value,end=$('salesEnd').value;
    if(!start||!end||end<start||Date.parse(end)-Date.parse(start)>365*86400000){$('salesStatus').textContent='開始日・終了日を確認してください（最大366日）。';return;}
    busy=true;const revision=++generation;
    $('salesStatus').textContent='集計を更新中…';$('salesStatus').dataset.error='false';$('salesRefresh').disabled=true;$('salesCsv').disabled=true;$('salesRetry').hidden=true;
    try {
      const {data:auth,error:authError}=await client.auth.getSession();
      if(authError||!auth.session) throw new Error('スタッフログインが必要です。');
      const {data:next,error}=await client.rpc('drink_sales_summary',{p_store:window.DRINK_RELAY_STORE_CONFIG.instanceId,p_start:start,p_end:end});
      if(error) throw new Error(error.code==='PGRST202'?'集計用SQLが未適用です。管理者へ連絡してください。':error.message);
      if(revision!==generation) return;
      data=next;render(data);$('salesStatus').textContent=`対象期間：${data.start}〜${data.end} · 更新：${new Date(data.generatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}`;
    } catch(error) {$('salesStatus').textContent='更新できませんでした。'+error.message+' 前回の値を保持しています。';$('salesStatus').dataset.error='true';$('salesRetry').hidden=false;}
    finally{busy=false;$('salesRefresh').disabled=false;$('salesCsv').disabled=!data;if(queued){queued=false;schedule();}}
  }
  async function initialize() {
    await window.DrinkRelayStaffAuth.requireStaff();client=window.DrinkRelayStaffAuth.client;
    function choose(kind) {
      document.querySelectorAll('[data-sales-period]').forEach(b=>{b.classList.toggle('active',b.dataset.salesPeriod===kind);b.setAttribute('aria-pressed',String(b.dataset.salesPeriod===kind));});
      if(kind==='custom'){$('salesStart').focus();return;}
      const value=period(kind,window.DrinkRelayClock?.now()||Date.now());$('salesStart').value=value.start;$('salesEnd').value=value.end;refresh();
    }
    choose('today');
    document.querySelectorAll('[data-sales-period]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.salesPeriod)));
    $('salesRange').addEventListener('submit',e=>{e.preventDefault();choose('custom');refresh();});
    $('salesRefresh').addEventListener('click',refresh);$('salesRetry').addEventListener('click',refresh);
    $('salesCsv').addEventListener('click',async()=>{
      const {data:session}=await client.auth.getSession();if(!session.session||!data) return;
      const {data:allowed,error}=await client.rpc('is_drink_staff');if(error||allowed!==true){$('salesStatus').textContent='スタッフ権限を確認できません。';return;}
      const url=URL.createObjectURL(new Blob([csv(data)],{type:'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download=`CLT集計_${data.start}_${data.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    document.addEventListener('drink-view-changed',e=>{visible=e.detail==='sales';if(visible)refresh();});
    client.channel('staff-sales-updates').on('postgres_changes',{event:'*',schema:'public',table:'drink_orders'},schedule)
      .on('postgres_changes',{event:'*',schema:'public',table:'drink_app_settings'},schedule).subscribe();
    setInterval(()=>{if(visible&&!document.hidden) refresh();},30000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('online',schedule);
  }
  document.addEventListener('DOMContentLoaded',initialize);
})();
