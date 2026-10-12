const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

function load(window = {}) {
  const context = { window, Date, localStorage: { getItem() { return null; } },
    location: { origin: 'http://localhost' } };
  window.addEventListener = () => {};
  vm.runInNewContext(fs.readFileSync('unlimited-config.js', 'utf8'), context);
  window.DRINK_RELAY_STORE_CONFIG = { instanceId: 'test', supabaseUrl: 'https://example.test', supabaseAnonKey: 'public' };
  vm.runInNewContext(fs.readFileSync('unlimited-shared.js', 'utf8'), context);
  return window.DrinkRelayUnlimited;
}

if (process.argv.includes('--timezone')) {
  const U = load();
  const started = Date.parse('2026-10-08T10:00:00Z'); // 19:00 JST
  assert.equal(U.calculateExpiry(started, 'unlimited-alcohol-all-day'), Date.parse('2026-10-08T13:30:00Z'));
  const timed = Object.entries(U.CONFIG.planRules).find(([, rule]) => Number.isFinite(rule.durationMinutes));
  assert.ok(timed);
  assert.equal(U.calculateExpiry(Date.parse('2026-10-08T13:15:00Z'), timed[0]), Date.parse('2026-10-08T13:30:00Z'));
  assert.ok(U.calculateExpiry(Date.parse('2026-10-08T14:00:00Z'), 'unlimited-alcohol-all-day') < Date.parse('2026-10-08T14:00:00Z'));
  console.log(`PASS Japan closing time in ${process.env.TZ}`);
} else {
  (async () => {
    for (const timezone of ['Asia/Tokyo', 'America/Los_Angeles', 'UTC']) {
      process.stdout.write(execFileSync(process.execPath, [__filename, '--timezone'], { env: { ...process.env, TZ: timezone } }));
    }
    for (const skew of [-16, 16]) {
      const server = Date.parse('2026-10-08T10:00:00Z');
      let ready = false;
      let canSync = true;
      let calls = 0;
      const window = { DrinkRelayClock: { now: () => ready ? server : server + skew * 3600000,
        isSynchronized: () => ready, sync: async () => { calls++; ready = canSync; return ready; } } };
      const U = load(window);
      const gateway = new U.Gateway();
      gateway.mode = 'supabase';
      await gateway.ensureServerClock();
      assert.equal(gateway.now(), server);
      await gateway.ensureServerClock();
      assert.equal(calls, 1, 'reuse synchronized time');
      ready = false; canSync = false;
      await assert.rejects(gateway.ensureServerClock(), /サーバー時刻を確認できません/);
      gateway.mode = 'local';
      await gateway.ensureServerClock();
    }
    console.log('PASS activation clock guard with +/-16h skew, sync failure, and local demo');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
