const fs = require('node:fs');
const assert = require('node:assert/strict');

const read = name => fs.readFileSync(name, 'utf8');
const index = read('index.html');
const app = read('app.js');
const auth = read('staff-auth.js');
const shared = read('unlimited-shared.js');
const customer = read('unlimited-customer.js');
const location = read('unlimited-location.js');
const edge = read('supabase/functions/unlimited/index.ts');
const foundation = read('supabase/security-foundation.sql');
const lockdown = read('supabase/security-lockdown.sql');
const schema = read('supabase-schema.sql');

assert.match(index, /id="staffAuthGate"/);
assert.match(index, /id="staffApplication" class="app-shell" hidden/);
assert.ok(index.indexOf('staff-auth.js') < index.indexOf('app.js'));
assert.match(app, /DrinkRelayStaffAuth\.requireStaff/);
assert.match(auth, /rpc\("is_drink_staff"\)/);
assert.match(auth, /店舗管理画面の利用権限/);

assert.match(foundation, /create schema if not exists drink_private/i);
assert.match(foundation, /create table if not exists drink_private\.staff/i);
assert.match(foundation, /security definer/i);
assert.match(lockdown, /revoke all on table public\.drink_orders from anon/i);
assert.match(lockdown, /revoke all on table public\.drink_app_settings from anon/i);
assert.doesNotMatch(lockdown, /using\s*\(\s*true\s*\)/i);
assert.doesNotMatch(schema, /using\s*\(\s*true\s*\)/i);
assert.doesNotMatch(schema, /with check\s*\(\s*true\s*\)/i);

assert.match(shared, /functions\/v1\/unlimited/);
assert.match(shared, /configureCustomer/);
assert.match(shared, /edgeApi\("order"/);
assert.match(customer, /configureCustomer\(\{ cardToken, deviceBinding: state\.deviceBinding, planId \}\)/);
assert.doesNotMatch(location, /gateway\.listSessions\(\)/);
assert.doesNotMatch(location, /gateway\.loadCards\(\)/);

assert.match(edge, /requireStaff\(req\)/);
assert.match(edge, /drink_staff_allowed/);
assert.match(edge, /assertActiveSession/);
assert.match(edge, /UNLIMITED_ORDER_PENDING/);
assert.match(edge, /PLAN_RULES\[active\.planId\]\?\.items\.has\(itemId\)/);
assert.match(edge, /quantity:\s*1/);
assert.match(edge, /Cache-Control": "no-store/);

assert.match(index, /Content-Security-Policy/);
assert.doesNotMatch(index, /supabase-js@2"/);
assert.doesNotMatch(index, /lucide@latest/);

console.log('PASS staff auth gate, deny-by-default SQL, secured unlimited gateway, server validation, and browser hardening');

