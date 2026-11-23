const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const crypto = require('node:crypto').webcrypto;
(async () => {
  let calls = [], behavior;
  const window = { DRINK_RELAY_STORE_CONFIG: { instanceId: 'test', supabaseUrl: 'https://example.test', supabaseAnonKey: 'test' },
    addEventListener() {}, setTimeout: (fn, ms) => ms < 12000 ? setTimeout(fn, 0) : setTimeout(fn, ms), clearTimeout };
  vm.runInNewContext(fs.readFileSync('unlimited-shared.js', 'utf8'), {window, Date, crypto, AbortController,
    localStorage: {getItem: () => null}, location: {origin: 'https://example.test'},
    fetch: async (url, options) => { calls.push(JSON.parse(options.body)); return behavior(calls.length, options); }});
  const g = new window.DrinkRelayUnlimited.Gateway(); g.mode = 'supabase'; g.customerContext = {card: 'fixture'};
  const row = {sessionId: 'current', requestId: 'request-fixture-123'};
  behavior = n => { if (n < 3) throw new TypeError('network lost'); return new Response(JSON.stringify({order: {id: 'one', status: 'ordered'}})); };
  assert.equal((await g.createUnlimitedOrder(row)).id, 'one'); assert.equal(calls.length, 3);
  assert.ok(calls.every(x => x.item.requestId === row.requestId), 'automatic retries keep the same request');
  calls = []; behavior = () => new Response(JSON.stringify({error: 'expired', code: 'SESSION_ENDED'}), {status: 403});
  await assert.rejects(g.createUnlimitedOrder(row), e => e.code === 'SESSION_ENDED'); assert.equal(calls.length, 1, 'business failures never retry');
  calls = []; behavior = () => new Response('<html>gateway</html>', {status: 503});
  await assert.rejects(g.createUnlimitedOrder(row)); assert.equal(calls.length, 3, 'transient gateway errors retry with a cap');
  calls = []; behavior = () => new Response('{}');
  await assert.rejects(g.createUnlimitedOrder(row)); assert.equal(calls.length, 3, 'empty successful response never clears an order as successful');
  console.log('PASS mobile network retry, stable request identity, business-error exclusion, capped gateway retry and invalid response handling');
})().catch(e => {console.error(e); process.exitCode = 1;});
