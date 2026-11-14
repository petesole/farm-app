const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
const {fixture}=require('./fixture.cjs'),{edge}=require('./edge-harness.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const db=await fixture();try{
  // Reproduce the hosted Stock backend without the separately staged phone feature.
  for(const name of ['drafts/stock_approval_workflow.sql','drafts/stock_audit_rectification.sql','drafts/combined_stocktake.sql','drafts/stocktake_print_permissions.sql','drafts/stock_operator_role.sql','migrations/20261113145707_stock_adjustment_report.sql','drafts/dated_adjustment_reconciliation.sql','migrations/20261114060000_item_active_ingredients.sql','migrations/20261114060001_spray_similar_actives.sql'])await db.exec(fs.readFileSync(root+'/supabase/'+name,'utf8'));
  const actor=randomUUID();await db.query("insert into auth.users(id,email) values($1,'deployment@test');",[actor]);await db.query("insert into public.app_user_role(user_id,role_name) values($1,'admin')",[actor]);
  await db.exec("insert into stock_v2.owner(owner_code,owner_name) values('TEST_JS','HS'),('TEST_AO','AO');insert into stock_v2.location(location_code,location_name) values('TEST_WH','Test store')");
  const api=edge(db,'stock-v2-demo-workflow',actor);
  const result=await api();assert.equal(result.status,200,JSON.stringify(result));assert(Array.isArray(result.body.sprays));
  assert.equal((await api('?chemical_actives=1')).status,200);
  assert.equal((await db.query("select to_regclass('stock_v2.sprayer_completion') as phone")).rows[0].phone,null);
  console.log('PASS Browser Stock snapshot and active register work without installing the staged Sprayer phone schema');
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exit(1)});
