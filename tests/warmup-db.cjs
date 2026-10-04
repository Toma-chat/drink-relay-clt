const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(path.join(process.env.TEMP,'warmup-validation/node_modules/@electric-sql/pglite'));
async function main() {
 const db = new PGlite();
 // PGlite lacks pgcrypto/pg_cron: substitute test-only crypto and scheduler stubs.
 // Production SQL keeps Supabase's real cryptographic extension and clock.
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema extensions; create schema auth; create schema cron;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create function extensions.gen_random_bytes(n int) returns bytea language sql as $$select decode(string_agg(md5(random()::text),''),'hex') from generate_series(1,n)$$;
 create function extensions.digest(t text,algorithm text) returns bytea language sql as $$select decode(md5(t),'hex')$$;
 create function cron.schedule(text,text,text) returns int language sql as $$select 1$$;
 create table public.test_clock(at timestamptz); insert into public.test_clock values('2026-10-05 01:00:00+00');
 create function public.test_now() returns timestamptz language sql as $$select at from public.test_clock$$;
 set request.jwt.claims='{"role":"service_role"}';`);
 let base=fs.readFileSync('supabase-schema.sql','utf8').split('alter table public.drink_orders\r\n  drop constraint')[0];
 base=base.split('alter table public.drink_orders\n  drop constraint')[0];
 await db.exec(base);
 let sql=fs.readFileSync('supabase/warmup.sql','utf8').replace(/create extension[^;]+;/g,'').replaceAll('now()','public.test_now()');
 await db.exec(sql);
 await db.exec(fs.readFileSync('supabase/warmup-bootstrap.sql','utf8'));
 const vm=require('node:vm'); const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('initial-settings.js','utf8'),context);
 await db.query(`insert into public.drink_app_settings(id,menu) values('main',$1)`,[JSON.stringify(context.window.DRINK_RELAY_INITIAL_SETTINGS.menu)]);
 const st=(await db.query('select * from warmup_private.stores')).rows[0];
 const user='11111111-1111-4111-8111-111111111111';
 await db.query('insert into auth.users values($1)',[user]); await db.query('insert into warmup_private.staff values($1,$2)',[st.id,user]);
 let params={store:st.id,qr:st.qr,device:'123456789012345678901234567890123456',token:''};let count=0;
 async function call(action,extra={}) { return (await db.query('select public.warmup_api($1,$2,$3) as value',[JSON.stringify({...params,action,...extra}),action.startsWith('staff')?user:null,'203.0.113.5'])).rows[0].value; }
 function ok(value,label) {assert.ok(value,label); console.log('PASS '+label);count++;}
 let status=await call('staff-status');ok(status.reason==='weekday','Monday available');
 let wrong=status.code==='0000'?'0001':'0000';
 for(let i=0;i<5;i++) ok((await call('activate',{code:wrong})).error==='コードが違います','wrong code '+i);
 ok((await call('activate',{code:status.code})).error.includes('試行制限'),'rate limit including correct code');
 await db.exec("update public.test_clock set at=at+interval '16 minutes'");
 let auth=await call('activate',{code:status.code}); params.token=auth.token;ok(auth.session,'correct code authenticates');
 ok((await call('status')).session.sessionId===auth.session.sessionId,'reload uses token');
 const item=st.profile.includeItemIds[0];
 let order=await call('order',{item,quantity:1,options:[]});ok(order.order.quantity===1,'first cup created');
 await assert.rejects(call('order',{item,quantity:1}),/提供済み/);ok(true,'second cup rejected');
 await assert.rejects(call('order',{item,quantity:2}),/数量/);ok(true,'quantity tampering rejected');
 await call('location',{location:{target:'tournament',tableNo:'B',seatNo:'3'}});
 ok((await call('status')).orders[0].table_no==='B','pending order location updated');
 await call('staff-stop');await assert.rejects(call('order',{item,quantity:1}),/停止中/);ok(true,'stop blocks authenticated device');
 await call('staff-resume');await db.query("update public.drink_orders set status='served' where id=$1",[order.order.id]);
 ok((await call('order',{item,quantity:1})).order,'resume and served allow next cup');
 const before=(await call('status')).session.sessionId;await call('staff-regenerate',{revoke:false});ok((await call('status')).session.sessionId===before,'regeneration keeps sessions');
 await call('staff-regenerate',{revoke:true});ok(!(await call('status')).session,'regeneration revokes sessions');
 params.token='';status=await call('staff-status');auth=await call('activate',{code:status.code});params.token=auth.token;
 ok((await call('status')).orders.length===2,'reauth preserves pending order');
 await db.exec("update public.test_clock set at='2026-10-05 15:00:00+00'");
 status=await call('status');ok(!status.session && status.reason==='weekday','midnight expires previous token');
 status=await call('staff-status');auth=await call('activate',{code:status.code});ok(auth.session,'next weekday new code');
 for(const [date,reason] of [['2026-10-10','weekend'],['2026-10-11','weekend'],['2026-10-12','holiday']]) {
  await db.query('update public.test_clock set at=$1',[date+' 01:00:00+00']);status=await call('staff-status');ok(status.reason===reason,date+' blocked');ok((await call('activate',{code:status.code})).error,'auth blocked '+date);
 }
 await db.exec("update public.test_clock set at='2026-10-13 01:00:00+00'");status=await call('staff-status');auth=await call('activate',{code:status.code});params.token=auth.token;
 await db.query(`update public.drink_app_settings set menu=jsonb_set(menu,'{0,items,0,name}','"Changed live menu"') where id='main'`);
 // Alter the actual eligible item name wherever it is, preserving a single menu source.
 const menu=context.window.DRINK_RELAY_INITIAL_SETTINGS.menu;for(const c of menu)for(const i of c.items||[])if(i.id===item)i.name='Changed standard drink';
 await db.query('update public.drink_app_settings set menu=$1 where id=\'main\'',[JSON.stringify(menu)]);
 ok((await call('order',{item,quantity:1})).order.drink_name==='Changed standard drink','live standard menu change reflected');
 await db.exec("update public.drink_orders set status='served' where warmup_session_id is not null");
 await assert.rejects(call('order',{item:'beer',quantity:1}),/対象外/);ok(true,'nonstandard item rejected');
 await assert.rejects(call('order',{item,quantity:1,options:['forged-choice']}),/オプション/);ok(true,'forged option rejected');
 const parallel=await Promise.allSettled([call('order',{item,quantity:1}),call('order',{item,quantity:1})]);
 ok(parallel.filter(x=>x.status==='fulfilled').length===1,'concurrent double submission creates one cup');
 const oldToken=params.token;
 params.token='forged-token';await assert.rejects(call('order',{item,quantity:1}),/認証/);ok(true,'forged token rejected');params.token=oldToken;
 params.device='another-device-12345678901234567890';await assert.rejects(call('order',{item,quantity:1}),/認証/);ok(true,'wrong device rejected');params.device='123456789012345678901234567890123456';
 await call('staff-stop');await db.exec("update public.test_clock set at='2026-10-14 01:00:00+00'");ok(!(await call('staff-status')).stopped,'new weekday resets stop');
 await db.exec("update public.test_clock set at='2028-01-04 01:00:00+00'");ok((await call('status')).reason==='calendar_missing','missing calendar fails closed');
 await db.exec("update public.test_clock set at='2026-10-13 01:00:00+00'");
 await db.exec(`set request.jwt.claims='{"role":"anon"}'; set role anon;`);
 await assert.rejects(call('status'),/permission denied/);ok(true,'anon cannot call service RPC');
 await db.exec('reset role;');
 await assert.rejects(db.exec("update public.drink_orders set status='served' where warmup_session_id is not null"),/スタッフ認証/);ok(true,'direct anonymous completion rejected');
 await db.exec(`set test.actor='${user}';`);
 await db.exec("update public.drink_orders set status='served' where warmup_session_id is not null");ok(true,'allowlisted staff bar completion');
 await db.exec(`insert into public.drink_orders(id,source,drink_name,quantity,target,payment_status,payment_method,status) values(gen_random_uuid(),'reception','Normal drink',3,'bar','paid','cash','ordered')`);ok(true,'ordinary order quantity unrestricted');
 console.log(`${count} checks passed`); await db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
