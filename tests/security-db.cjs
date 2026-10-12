const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(path.join(process.env.TEMP, 'warmup-validation/node_modules/@electric-sql/pglite'));

async function main() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as
      $$select nullif(current_setting('test.actor', true), '')::uuid$$;
    create table public.drink_orders (
      id uuid primary key, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      source text not null, drink_name text not null, quantity integer not null, target text not null,
      table_no text, seat_no text, payment_status text not null, payment_method text not null,
      notes text, status text not null, made_at timestamptz, served_at timestamptz, paid_at timestamptz,
      events jsonb not null default '[]'::jsonb
    );
    create table public.drink_app_settings(id text primary key, updated_at timestamptz not null default now(), menu jsonb not null default '[]');
    alter table public.drink_orders enable row level security;
    alter table public.drink_app_settings enable row level security;
    grant all on public.drink_orders, public.drink_app_settings to anon, authenticated, service_role;
  `);
  await db.exec(fs.readFileSync('supabase/security-foundation.sql', 'utf8'));
  const staff = '11111111-1111-4111-8111-111111111111';
  const outsider = '22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users values($1),($2)', [staff, outsider]);
  await db.query("insert into drink_private.staff(user_id,label) values($1,'CLT staff')", [staff]);
  await db.exec(fs.readFileSync('supabase/security-lockdown.sql', 'utf8'));
  await db.exec(`
    insert into public.drink_app_settings(id,menu) values('main','[]');
    insert into public.drink_orders(id,source,drink_name,quantity,target,payment_status,payment_method,status)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','reception','水',1,'bar','paid','cash','ordered');
  `);

  await db.exec(`set test.actor='${outsider}'; set role authenticated;`);
  assert.equal((await db.query('select * from public.drink_orders')).rows.length, 0);
  await assert.rejects(
    db.exec("insert into public.drink_app_settings(id,menu) values('forged','[]')"),
    /row-level security|policy/i
  );
  await db.exec('reset role;');

  await db.exec(`set test.actor='${staff}'; set role authenticated;`);
  assert.equal((await db.query('select * from public.drink_orders')).rows.length, 1);
  await db.exec("update public.drink_orders set status='served'");
  assert.equal((await db.query('select status from public.drink_orders')).rows[0].status, 'served');
  await db.exec('reset role;');

  await db.exec('set role anon;');
  await assert.rejects(db.query('select * from public.drink_orders'), /permission denied/i);
  await assert.rejects(db.query('select public.is_drink_staff()'), /permission denied/i);
  await db.exec('reset role;');

  console.log('PASS anonymous table access denied, outsider denied, allowlisted staff read/update allowed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

