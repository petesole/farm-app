// Exercise the development Edge handler with a Buyer request from a cached Job Card screen.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {edge}=require('./edge-harness.cjs');

async function main(){
  const actor=randomUUID();
  const db={
    transaction:fn=>fn(db),
    async query(sql,params){
      if(sql.includes('workflow_access('))return {rows:[{value:{is_admin:false,is_stock:false,can_main:false},is_buyer:true}]};
      if(sql.includes('pg_advisory_xact_lock')||sql.includes('stock_v2.approval_operation'))return {rows:[]};
      if(sql.includes('from stock_v2.buying_category where category_id='))return {rows:[{category_id:4,catalogue_group:'vehicle',category_name:'Lubricants',stock_only:true}]};
      if(sql.includes('from stock_v2.job_lubricant_inputs where item_code='))return {rows:params[0]==='GEAR'?[{item_code:'GEAR'}]:[]};
      throw Error('Unexpected query in the stock-only path: '+sql);
    }
  };
  const send=edge(db,'stock-v2-demo-workflow',actor);
  const save=payload=>send('',{action:'save_job_catalogue_part',operation_id:randomUUID(),payload:{category_id:4,...payload}});
  for(const payload of [{name:'Hand-typed oil',unit:'L'},{name:'Gear Oil',part_number:'GEAR',unit:'L'},{item_code:'PETROL'},{item_code:'MISSING'}]){
    const result=await save(payload);
    assert.equal(result.status,400);
    assert.match(result.body.error,/existing lubricant Stock Input/);
  }
  const selected=await save({item_code:'GEAR'});
  assert.equal(selected.status,200);
  assert.equal(selected.body.result.item_code,'GEAR');
  console.log('PASS cached Job Card requests require an existing lubricant stock code');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
