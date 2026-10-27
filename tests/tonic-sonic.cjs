const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require(path.join(process.env.TEMP, 'warmup-validation/node_modules/@electric-sql/pglite'));

(async () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync('initial-settings.js', 'utf8'), { window });
  vm.runInNewContext(fs.readFileSync('unlimited-config.js', 'utf8'), { window });
  const menu = JSON.parse(JSON.stringify(window.DRINK_RELAY_INITIAL_SETTINGS.menu));
  const juice = menu.find(category => category.id === 'juice');
  juice.items = juice.items.filter(item => item.id !== 'tonic');
  juice.items.find(item => item.id === 'sonic').name = 'トニック';

  const db = new PGlite();
  await db.exec('create table public.drink_app_settings(id text primary key, menu jsonb, updated_at timestamptz)');
  await db.query("insert into public.drink_app_settings(id, menu) values('main', $1)", [JSON.stringify(menu)]);
  const migration = fs.readFileSync('supabase/separate-tonic-sonic-20261027.sql', 'utf8');
  await db.exec(migration);
  const saved = (await db.query("select menu from public.drink_app_settings where id='main'")).rows[0].menu;
  const drinks = saved.find(category => category.id === 'juice').items;
  const sonic = drinks.find(item => item.id === 'sonic');
  const tonic = drinks.find(item => item.id === 'tonic');
  assert.equal(sonic.name, 'ソニック');
  assert.equal(tonic.name, 'トニック');
  assert.equal(sonic.price, 600);
  assert.equal(tonic.price, 600);
  assert.deepEqual(tonic.optionGroups, sonic.optionGroups);
  assert.equal(drinks.findIndex(item => item.id === 'tonic'), drinks.findIndex(item => item.id === 'sonic') + 1);
  for (const plan of window.DRINK_RELAY_UNLIMITED_CONFIG.planCatalog) {
    const ids = window.DRINK_RELAY_UNLIMITED_CONFIG.planRules[plan.id].includeItemIds;
    assert(ids.includes('sonic') && ids.includes('tonic'), `${plan.id} includes both drinks`);
  }
  await db.exec(migration);
  assert.deepEqual((await db.query("select menu from public.drink_app_settings where id='main'")).rows[0].menu, saved);
  await db.close();
  console.log('PASS Sonic and tonic are distinct drinks in the menu and every active plan');
})().catch(error => { console.error(error); process.exitCode = 1; });
