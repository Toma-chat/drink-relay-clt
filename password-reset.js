(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', async () => {
    const $ = selector => document.querySelector(selector);
    const status = $('#resetStatus');
    const config = window.DRINK_RELAY_STORE_CONFIG || {};
    try {
      if (!window.supabase || !config.supabaseUrl || !config.supabaseAnonKey) throw new Error('接続設定を読み込めません。再読み込みしてください。');
      const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      let busy = false;
      function showSession(session) {
        $('#requestReset').hidden = Boolean(session);
        $('#savePassword').hidden = !session;
        status.textContent = session ? '新しいパスワードを入力してください。' : '登録したスタッフメールを入力してください。';
      }
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') showSession(session);
      });
      const {data, error} = await client.auth.getSession();
      if (error) throw error;
      showSession(data.session);
      const hash = new URLSearchParams(location.hash.slice(1));
      if (hash.get('error_description')) status.textContent = '再設定リンクが無効か期限切れです。新しいメールを送ってください。';
      $('#requestReset').onsubmit = async event => {
        event.preventDefault(); if(busy) return; busy=true;
        const button=event.target.querySelector('button');button.disabled=true;
        try {
          const redirect = new URL('password-reset.html', location.href).href;
          const {error} = await client.auth.resetPasswordForEmail(new FormData(event.target).get('email').trim(), {redirectTo:redirect});
          if(error) throw error;
          status.textContent='登録されたアドレスであれば再設定メールが届きます。最新のメールのリンクを開いてください。';
        } catch(error) { status.textContent=error.message; }
        finally {busy=false;button.disabled=false;}
      };
      $('#savePassword').onsubmit = async event => {
        event.preventDefault();if(busy)return;
        const values=new FormData(event.target), password=values.get('password');
        if(password!==values.get('confirmation')){status.textContent='2つのパスワードが一致していません。';return;}
        busy=true;const button=event.target.querySelector('button');button.disabled=true;
        try {
          const {error} = await client.auth.updateUser({password});if(error)throw error;
          event.target.reset();await client.auth.signOut();
          history.replaceState(null,'',location.pathname);
          $('#savePassword').hidden=true;
          status.textContent='パスワードを変更しました。「注文アプリへ戻る」から新しいパスワードでログインしてください。';
        } catch(error) {status.textContent=error.message;}
        finally{busy=false;button.disabled=false;}
      };
    } catch(error) {status.textContent=error.message;}
  });
})();
