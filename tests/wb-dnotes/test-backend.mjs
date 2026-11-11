import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
process.on('uncaughtException',e=>{console.error('FAIL:',e.message,e.where||'');process.exit(1);});
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key); create table app_user_role(user_id uuid,role_name text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create function public.wb_admin_allowed() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.app_user_role where user_id=auth.uid() and role_name='admin')$$;
 create table report_fixture(source text,source_id text,report_date date,dnote text,wb_slip text,crop_name text,movement_kind text,registration_text text,load_kg numeric,tracecode_id bigint,tracecode_name text,allocation_kg numeric,season_id bigint);
 create view wb_daily_dnote_season_v as select * from report_fixture;
 grant select on wb_daily_dnote_season_v to authenticated;
 insert into auth.users values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
 insert into app_user_role values('10000000-0000-0000-0000-000000000001','admin');
 insert into report_fixture values('WB Computer','truck1','2026-11-10','02/012','84','Wheat','HARVEST_IN','ABC-1234',30000,1,'Field A',20000,19),
 ('WB Computer','truck1','2026-11-10','02/012','84','Wheat','HARVEST_IN','ABC-1234',30000,2,'Field B',10000,19),
 ('Manual','historical','2026-11-09','Old legacy note','M-1','Wheat','HARVEST_IN','ABC-9876',5000,null,null,null,19);`);
await db.exec(readFileSync(new URL('../../docs/weighbridge/field-dnote-register.sql',import.meta.url),'utf8'));
let checks=0;
async function user(id){await db.exec(`reset role;select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-00000000000${id}',false);set role authenticated;`);}
async function reject(fn,re){let caught=false;try{await fn();}catch(e){caught=true;assert.match(e.message,re);}assert.ok(caught,'Expected rejection');checks++;}
const submit=(id,date,ranges)=>(db.query('select wb_add_dnote_ranges($1,$2,$3::jsonb) as saved',[id,date,JSON.stringify(ranges)]));
const id='20000000-0000-0000-0000-000000000001',ranges=[{start:'2/12',end:'2/22'},{start:'3/1',end:'3/8'}];
await user(2);await reject(()=>submit(id,'2026-11-10',ranges),/Only a WB Admin/);
assert.equal((await db.query('select * from wb_daily_dnote_register_v')).rows.length,0);checks++;
await db.exec('reset role;set role anon');await reject(()=>db.query('select * from wb_daily_dnote_register_v'),/permission denied/);
await user(1);
let saved=(await submit(id,'2026-11-10',ranges)).rows[0].saved;
assert.equal(saved.notes_added,19);checks++;
saved=(await submit(id,'2026-11-10',ranges)).rows[0].saved;assert.equal(saved.already_saved,true);checks++;
assert.equal((await db.query('select count(*) as n from wb_field_dnote')).rows[0].n,19);checks++;
await reject(()=>submit(id,'2026-11-09',ranges),/different D-Note/);
const rows=(await db.query('select * from wb_daily_dnote_register_v')).rows;
assert.equal(new Set(rows.filter(r=>r.missing).map(r=>r.expected_id)).size,18);checks++;
assert.equal(rows.filter(r=>r.dnote==='2/12').length,2);checks++;
assert.equal(rows.filter(r=>r.dnote==='2/12'&&r.missing).length,0);checks++;
assert.equal(rows.filter(r=>r.source_id==='historical').length,1);checks++;
await reject(()=>db.query('insert into wb_field_dnote(request_id,note_date,book_number,note_number) values($1,$2,5,1)',[id,'2026-11-10']),/permission denied/);
await reject(()=>submit('20000000-0000-0000-0000-000000000002','2026-11-10',[{start:'2/22',end:'2/25'}]),/already registered/);
await reject(()=>submit('20000000-0000-0000-0000-000000000003','2026-11-10',[{start:'4/1',end:'4/4'},{start:'4/4',end:'4/5'}]),/already registered/);
assert.equal((await db.query("select count(*) as n from wb_field_dnote where book_number=4")).rows[0].n,0);checks++;
await reject(()=>submit('20000000-0000-0000-0000-000000000004','2026-11-10',[{start:'4/1',end:'5/8'}]),/one book/);
await reject(()=>submit('20000000-0000-0000-0000-000000000005','2026-11-10',[{start:'4/5',end:'4/1'}]),/End note/);
await reject(()=>submit('20000000-0000-0000-0000-000000000006','2026-11-10',[{start:'4/0',end:'4/5'}]),/book\/note/);
await reject(()=>submit('20000000-0000-0000-0000-000000000007','2026-11-10',[{start:'4/1',end:'4/999999'}]),/maximum 2000/);
// A late WB sync must match the expected day without changing that day.
await db.exec(`reset role;insert into report_fixture values('WB Computer','late','2026-11-11','2/13','85','Wheat','HARVEST_IN','ABC-1234',1000,null,null,null,null);`);
await user(1);
const late=(await db.query("select * from wb_daily_dnote_register_v where dnote='2/13'")).rows[0];
assert.equal(late.report_date.toISOString().slice(0,10),'2026-11-10');assert.equal(late.missing,false);checks++;
// A second truck is a duplicate match, not a second expected D-Note.
await db.exec(`reset role;insert into report_fixture values('Manual','duplicate','2026-11-10','2/12','M-2','Wheat','HARVEST_IN','ABC-4321',1000,null,null,null,19);`);
await user(1);assert.equal((await db.query("select max(wb_match_count) as n from wb_daily_dnote_register_v where dnote='2/12'")).rows[0].n,2);checks++;
console.log(`PASS: ${checks} local backend checks: book changes, missing/late/duplicate WB matches, legacy details, permissions, idempotency and atomic overlap rejection.`);
await db.close();

