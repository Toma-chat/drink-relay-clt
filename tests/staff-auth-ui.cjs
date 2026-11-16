const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require(path.join(process.env.TEMP, 'warmup-validation/node_modules/jsdom'));
const tick = () => new Promise(resolve => setTimeout(resolve, 30));

async function scenario(allowed, options = {}) {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
    url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const window = dom.window;
  const auth = {
    onAuthStateChange() {},
    async getSession() { return { data: { session: null }, error: options.restoreError || null }; },
    async signInWithPassword() {
      if (options.thrown) throw options.thrown;
      if (options.loginError) return { data: { session: null }, error: options.loginError };
      if (options.emptySession) return { data: { session: null }, error: null };
      return { data: { session: { access_token: 'test-jwt', user: { email: 'staff@example.test' } } }, error: null };
    },
    async signOut() { return { error: null }; },
  };
  window.DRINK_RELAY_STORE_CONFIG = { supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'publishable' };
  window.supabase = { createClient: () => ({ auth, rpc: async () => ({ data: allowed, error: options.rpcError || null }) }) };
  window.eval(fs.readFileSync('staff-auth.js', 'utf8'));
  await tick();
  assert.equal(window.document.querySelector('#staffApplication').hidden, true);
  if (options.restoreError) {
    assert.match(window.document.querySelector('#staffAuthStatus').textContent, options.expected);
    dom.window.close(); return;
  }
  const form = window.document.querySelector('#staffLoginForm');
  form.elements.email.value = 'staff@example.test';
  form.elements.password.value = 'password';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(window.document.querySelector('#staffApplication').hidden, !allowed);
  assert.equal(window.document.querySelector('#staffAuthGate').hidden, allowed);
  if (!allowed) {
    const status = window.document.querySelector('#staffAuthStatus').textContent;
    assert.match(status, options.expected || /利用権限/);
    assert.ok(!status.includes('INTERNAL_SECRET'), 'raw server details must not be displayed');
    assert.equal(window.document.querySelector('#staffLoginButton').disabled, false);
  }
  dom.window.close();
}

(async () => {
  await scenario(true);
  console.log('PASS allowlisted staff opens the application');
  await scenario(false);
  console.log('PASS non-allowlisted account remains blocked');
  const cases = [
    {loginError:{status:400,code:'invalid_credentials'},expected:/メールアドレスまたはパスワード/},
    {loginError:{status:402,message:'Payment Required'},expected:/利用枠・課金/},
    {loginError:{status:429},expected:/試行回数/},
    {loginError:{status:503,message:'invalid login credentials'},expected:/サーバーで障害/},
    {loginError:{status:400,code:'email_not_confirmed'},expected:/確認メール/},
    {loginError:{status:403,code:'user_banned'},expected:/利用停止中/},
    {loginError:{status:400,code:'refresh_token_not_found'},expected:/有効期限/},
    {thrown:new TypeError('Failed to fetch'),expected:/インターネット接続/},
    {thrown:{name:'AbortError',message:'aborted'},expected:/時間内/},
    {loginError:{status:400,message:'INTERNAL_SECRET'},expected:/ログインできませんでした/},
    {rpcError:{code:'PGRST202'},expected:/未適用/},
    {rpcError:{status:402,message:'Service restricted'},expected:/利用枠・課金/},
    {rpcError:{name:'TypeError',message:'is_drink_staff network failed'},expected:/インターネット接続/},
    {emptySession:true,expected:/ログイン情報を取得できません/},
    {restoreError:{status:402},expected:/利用枠・課金/},
    {restoreError:{name:'AuthRetryableFetchError',message:'Failed to fetch'},expected:/インターネット接続/},
  ];
  for(const options of cases) await scenario(false,options);
  console.log('PASS 16 login/restore error cases: credentials, quota, rate limit, outage, email confirmation, account block, expiry, network, timeout, RPC and safe unknown fallback');

})().catch(error => { console.error(error); process.exitCode = 1; });

