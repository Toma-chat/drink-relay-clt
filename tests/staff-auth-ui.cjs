const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require(path.join(process.env.TEMP, 'warmup-validation/node_modules/jsdom'));
const tick = () => new Promise(resolve => setTimeout(resolve, 30));

async function scenario(allowed) {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
    url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const window = dom.window;
  const auth = {
    onAuthStateChange() {},
    async getSession() { return { data: { session: null }, error: null }; },
    async signInWithPassword() {
      return { data: { session: { access_token: 'test-jwt', user: { email: 'staff@example.test' } } }, error: null };
    },
    async signOut() { return { error: null }; },
  };
  window.DRINK_RELAY_STORE_CONFIG = { supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'publishable' };
  window.supabase = { createClient: () => ({ auth, rpc: async () => ({ data: allowed, error: null }) }) };
  window.eval(fs.readFileSync('staff-auth.js', 'utf8'));
  await tick();
  assert.equal(window.document.querySelector('#staffApplication').hidden, true);
  const form = window.document.querySelector('#staffLoginForm');
  form.elements.email.value = 'staff@example.test';
  form.elements.password.value = 'password';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(window.document.querySelector('#staffApplication').hidden, !allowed);
  assert.equal(window.document.querySelector('#staffAuthGate').hidden, allowed);
  if (!allowed) assert.match(window.document.querySelector('#staffAuthStatus').textContent, /利用権限/);
  dom.window.close();
}

(async () => {
  await scenario(true);
  console.log('PASS allowlisted staff opens the application');
  await scenario(false);
  console.log('PASS non-allowlisted account remains blocked');
})().catch(error => { console.error(error); process.exitCode = 1; });

