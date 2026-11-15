const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();let passed=0;
 try{
  await db.exec("create table public.crop(crop_id bigint primary key,crop_name text);insert into public.crop values(30,'Potatoes'),(15,'Wheat'),(1,'Maize');create table public.wb_scale_transaction(transaction_id int generated always as identity,status text,owner_type text,crop_id bigint,moisture_pct numeric)");
  await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/20261115072137_wb_potato_moisture_exemption.sql'),'utf8'));
  await db.exec('create trigger wb_scale_moisture_required before insert or update of status,moisture_pct on public.wb_scale_transaction for each row execute function public.wb_require_completed_moisture()');
  const insert=(crop,moisture,owner='own',status='completed')=>db.query('insert into public.wb_scale_transaction(status,owner_type,crop_id,moisture_pct) values($1,$2,$3,$4) returning transaction_id',[status,owner,crop,moisture]);
  const yes=async(fn,label)=>{await fn();passed++;console.log('PASS '+label)};
  const no=async(fn,pattern,label)=>{await assert.rejects(fn,pattern);passed++;console.log('PASS '+label)};
  const potato=await insert(30,null);passed++;console.log('PASS Completed own potatoes upload without moisture');
  await no(()=>insert(15,null),/Moisture percentage is required/,'Own wheat still requires moisture');
  await no(()=>insert(1,null),/Moisture percentage is required/,'Own maize still requires moisture');
  await no(()=>insert(null,null),/Moisture percentage is required/,'Missing crop cannot bypass moisture check');
  await yes(()=>insert(15,12.5),'Measured grain moisture remains accepted');
  await yes(()=>insert(15,null,'third_party'),'Existing third-party exception remains');
  await no(()=>insert(30,-1),/between 0 and 100/,'Invalid supplied potato moisture remains rejected');
  await no(()=>insert(30,101),/between 0 and 100/,'Out-of-range supplied potato moisture remains rejected');
  await yes(()=>insert(15,null,'own','open'),'Incomplete weighing is not blocked');
  await yes(()=>db.query('update public.wb_scale_transaction set moisture_pct=null where transaction_id=$1',[potato.rows[0].transaction_id]),'Potato resync/update accepts absent moisture');
  const wheat=await insert(15,13);
  await no(()=>db.query('update public.wb_scale_transaction set moisture_pct=null where transaction_id=$1',[wheat.rows[0].transaction_id]),/Moisture percentage is required/,'Grain moisture cannot be cleared after completion');
  console.log(passed+' moisture regression checks passed');
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exit(1)});
