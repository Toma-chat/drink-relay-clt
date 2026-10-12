const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require(path.join(process.env.TEMP, 'warmup-validation/node_modules/jsdom'));

async function main() {
  const server = Date.parse('2026-10-08T10:00:00Z');
  for (const skew of [-16, 0, 16]) {
    let tick = 100;
    let device = server + skew * 3600000;
    let fails = false;
    const clockContext = { window: {}, performance: { now: () => tick }, Date: class extends Date { static now() { return device; } },
      AbortController, setTimeout, clearTimeout, console: { warn() {} }, fetch: async () => {
        tick += 100;
        return { ok: !fails, json: async () => new Date(server).toISOString() };
      } };
    vm.runInNewContext(fs.readFileSync('time-sync.js', 'utf8'), clockContext);
    const clock = clockContext.window.DrinkRelayClock;
    assert.equal(await clock.sync('https://example.test', 'public-key'), true);
    assert.equal(clock.now(), server + 50);
    device += 12 * 3600000;
    tick += 120000;
    assert.equal(clock.now(), server + 120050, 'device clock changes do not change elapsed time');
    fails = true;
    assert.equal(await clock.sync('https://example.test', 'public-key'), false);
    assert.equal(clock.now(), server + 120150, 'failed resync preserves server reference');

    const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { url: 'http://localhost/', runScripts: 'outside-only' });
    const w = dom.window;
    w.document.addEventListener = () => {};
    w.DRINK_RELAY_STORE_CONFIG = { instanceId: 'clock-test' };
    w.DrinkRelayClock = clock;
    w.Date.now = () => device;
    let script = fs.readFileSync('app.js', 'utf8');
    const end = script.lastIndexOf('})();');
    script = script.slice(0, end) + 'window.testClock = { elapsedLabel, createOrders, state, pruneCompletedHistory };' + script.slice(end);
    w.eval(script);
    assert.equal(w.testClock.elapsedLabel(new Date(server).toISOString()), '経過 2分');
    await w.testClock.createOrders([{ drink_name: 'テスト', quantity: 1, target: 'bar', source: 'reception' }]);
    assert.equal(Date.parse(w.testClock.state.orders[0].created_at), clock.now());
    w.testClock.state.orders.push({ id: 'completed', status: 'served', created_at: new Date(server).toISOString(), updated_at: new Date(server).toISOString() });
    w.testClock.pruneCompletedHistory();
    assert.ok(w.testClock.state.orders.some(order => order.id === 'completed'));
    dom.window.close();
  }
  console.log('PASS server clock, +/-16h device skew, clock changes, failed resync, order timestamps and history');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
