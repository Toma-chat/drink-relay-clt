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
  const alcohol = menu.find(category => category.id === 'alcohol');
  alcohol.items = alcohol.items.filter(item => item.id !== 'amaretto');
  const before = JSON.stringify(menu);

  const db = new PGlite();
  await db.exec('create table public.drink_app_settings(id text primary key, menu jsonb, updated_at timestamptz)');
  await db.query("insert into public.drink_app_settings(id, menu) values('main', $1)", [before]);
  const migration = fs.readFileSync('supabase/add-amaretto-20261127.sql', 'utf8');
  await db.exec(migration);
  const saved = (await db.query("select menu from public.drink_app_settings where id='main'")).rows[0].menu;
  const drinks = saved.find(category => category.id === 'alcohol').items;
  const amaretto = drinks.find(item => item.id === 'amaretto');
  assert.equal(amaretto.name, 'アマレット');
  assert.equal(amaretto.price, 800);
  assert.equal(amaretto.subcategory_id, 'cocktail');
  assert.deepEqual(amaretto.optionGroups[0], {
    id: 'amaretto-mix', label: '割り方',
    choices: ['ミルク', 'ジンジャーエール', 'コーラ', '烏龍茶'], required: true,
  });
  assert.equal(drinks.findIndex(item => item.id === 'amaretto'),
    drinks.findIndex(item => item.id === 'item-1783053374220') + 1);
  assert.deepEqual(saved.filter(category => category.id !== 'alcohol'),
    menu.filter(category => category.id !== 'alcohol'));

  const config = window.DRINK_RELAY_UNLIMITED_CONFIG;
  for (const plan of config.planCatalog) {
    const rule = config.planRules[plan.id];
    assert.equal(rule.includeItemIds.includes('amaretto'), plan.profile === 'アルコールSP', plan.id);
    if (plan.profile === 'アルコールSP') {
      assert.deepEqual(JSON.parse(JSON.stringify(rule.optionChoiceRules.amaretto['amaretto-mix'])),
        ['ミルク', 'ジンジャーエール', 'コーラ', '烏龍茶']);
    }
  }
  await db.exec(migration);
  assert.deepEqual((await db.query("select menu from public.drink_app_settings where id='main'")).rows[0].menu, saved);
  await db.close();
  console.log('PASS Amaretto menu and Alcohol SP scope; migration is idempotent');
})().catch(error => { console.error(error); process.exitCode = 1; });
