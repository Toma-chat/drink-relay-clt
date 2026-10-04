(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', async () => {
    const root = document.querySelector('#warmupAdmin');
    const U = window.DrinkRelayUnlimited, W = window.DrinkRelayWarmup;
    const gateway = await new U.Gateway().init();
    if (!root) return;
    root.innerHTML = `<h2>Warmup管理</h2><form id="warmupLogin"><label>スタッフメール<input name="email" type="email" autocomplete="username" required></label><label>パスワード<input name="password" type="password" autocomplete="current-password" required></label><button class="button">ログイン</button></form><div id="warmupControls" hidden><p id="warmupSummary"></p><strong id="warmupDailyCode" style="font-size:40px"></strong><div id="warmupQr"></div><a id="warmupUrl" target="_blank" rel="noopener">Warmup注文画面を開く</a><p><button data-action="staff-stop">本日停止</button> <button data-action="staff-resume">本日再開</button> <button data-action="staff-regenerate">コードを再生成</button></p><label><input id="warmupRevoke" type="checkbox">再生成時に既存端末も無効化（未選択なら維持）</label><div id="warmupSessions"></div><button id="warmupLogout">ログアウト</button></div><p id="warmupStaffError" role="status"></p>`;
    const $ = selector => root.querySelector(selector);
    let busy = false;
    async function run(action = 'staff-status', extra = {}) {
      if (!gateway.supabase) throw new Error('Supabase設定が必要です');
      const { data } = await gateway.supabase.auth.getSession();
      if (!data.session) { $('#warmupControls').hidden = true; return; }
      const value = await W.api(action, extra, data.session.access_token);
      if (action === 'staff-location') return value;
      $('#warmupLogin').hidden = true; $('#warmupControls').hidden = false;
      $('#warmupSummary').textContent = `${value.day} / ${ { weekday:'平日',weekend:'土日',holiday:'祝日',closed:'店舗休業日',calendar_missing:'祝日カレンダー未設定' }[value.reason]} / ${value.stopped ? '本日停止中' : value.reason === 'weekday' ? '利用可能' : '利用不可'} / 認証端末 ${value.devices} / 注文 ${value.orders} / 最終停止・再開 ${value.changedAt ? new Date(value.changedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}) : 'なし'}`;
      $('#warmupDailyCode').textContent = value.code;
      const url = new URL('unlimited-customer.html', location.href); url.search = new URLSearchParams({warmup:'1',card:value.qr});
      if ($('#warmupUrl').href !== url.href) {
        $('#warmupUrl').href = url.href; $('#warmupQr').replaceChildren();
        if (window.QRCode) new QRCode($('#warmupQr'), {text:url.href,width:180,height:180});
      }
      if (!$('#warmupPrint')) {
        const print = document.createElement('button'); print.id='warmupPrint'; print.textContent='固定QRを印刷';
        print.onclick=()=>{
          const sheet=window.open('','_blank','width=600,height=700');
          if(!sheet) { $('#warmupStaffError').textContent='印刷するにはポップアップを許可してください'; return; }
          sheet.document.title='Warmup固定QR';
          const heading=sheet.document.createElement('h1');heading.textContent='Warmup飲み放題';
          const qr=sheet.document.importNode($('#warmupQr'),true);
          const text=sheet.document.createElement('p');text.textContent='月〜金（日本の祝日を除く） / 本日23:59まで';
          const link=sheet.document.createElement('p');link.textContent=$('#warmupUrl').href;link.style.wordBreak='break-all';
          sheet.document.body.append(heading,qr,text,link);
          // QRCode renders an image as well as canvas; prefer its portable image.
          if(qr.querySelector('img')?.src) { qr.querySelector('img').style.display='block'; qr.querySelector('canvas')?.remove(); }
          sheet.setTimeout(()=>sheet.print(),300);
        };
        $('#warmupQr').after(print);
      }
      $('#warmupSessions').replaceChildren();
      for (const session of value.sessions) {
        const row = document.createElement('p'); const button = document.createElement('button');
        button.textContent = `届け先変更: ${U.formatUnlimitedLocation(session.location)} (${session.id.slice(0,8)})`;
        button.addEventListener('click', async () => {
          const dialog = document.createElement('dialog');
          dialog.innerHTML = '<h3>届け先変更</h3><div class="warmup-locations"></div><button class="warmup-close">閉じる</button>';
          const choices = [{target:'bar',tableNo:'',seatNo:''}, ...['ring','tournament'].flatMap(target=>U.LOCATION_TABLES.flatMap(tableNo=>U.LOCATION_SEATS.map(seatNo=>({target,tableNo,seatNo}))))];
          for (const loc of choices) {
            const choice = document.createElement('button'); choice.textContent = U.formatUnlimitedLocation(loc); choice.style.cssText='padding:18px;margin:4px;font-size:18px';
            choice.onclick = async () => { try { await run('staff-location',{session:session.id,location:loc}); dialog.close(); dialog.remove(); await run(); } catch(e) { $('#warmupStaffError').textContent=e.message; } };
            dialog.querySelector('.warmup-locations').append(choice);
          }
          dialog.querySelector('.warmup-close').onclick=()=>{dialog.close();dialog.remove();}; document.body.append(dialog); dialog.showModal();
        }); row.append(button); $('#warmupSessions').append(row);
      }
    }
    async function safely(action, extra) { if(busy) return; busy=true; try { await run(action,extra); $('#warmupStaffError').textContent=''; } catch(e) { $('#warmupStaffError').textContent=e.message; } finally {busy=false;} }
    const resetLink = document.createElement('a');
    resetLink.href='./password-reset.html';resetLink.textContent='パスワードを忘れた場合';
    $('#warmupLogin').append(resetLink);
    $('#warmupLogin').onsubmit = async event => {
      event.preventDefault(); const form = new FormData(event.target);
      if (!gateway.supabase) { $('#warmupStaffError').textContent='Supabase設定が必要です'; return; }
      const {error} = await gateway.supabase.auth.signInWithPassword({email:form.get('email'),password:form.get('password')});
      if(error) $('#warmupStaffError').textContent=error.message; else { event.target.reset(); await safely(); }
    };
    root.addEventListener('click', event => { const button = event.target.closest('[data-action]'); if(button) safely(button.dataset.action,{revoke:$('#warmupRevoke').checked}); });
    $('#warmupLogout').onclick = async () => { await gateway.supabase.auth.signOut(); $('#warmupControls').hidden=true; $('#warmupDailyCode').textContent=''; $('#warmupLogin').hidden=false; };
    await safely(); window.setInterval(()=>safely(),15000);
  });
})();
