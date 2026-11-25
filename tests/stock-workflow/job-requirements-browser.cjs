const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {click,displayFixture}=require('./buying-development-browser.cjs');
const site=process.env.BUYING_TEST_URL||'https://jspl-farmingmain--development.expo.app';
const field=(p,name)=>p.getByRole('textbox',{name,exact:true});
async function pick(p,name,value){await field(p,name).click();await click(p,value);}
async function run(browser,width){
 const context=await browser.newContext({viewport:{width,height:900}});
 const supplier={id:'61',label:'Screen supplier'},other={id:'62',label:'Second supplier'};
 const base={key:'S1',kind:'sample',ref:'JC-11-S1',description:'Outer hub',job_id:'service-card',job_number:11,destination:'Screen test tractor',card_type:'asset',category_name:'Filters',quantity:1,remaining:1,unit_price:null,owner_code:'JS',supplier_id:'61',supplier_name:supplier.label,sent_on:'2026-11-23',verified_quantity:0};
 const rows=[base,{...base,key:'S2',kind:'repair',ref:'JC-12-R1',job_id:'fixture-card',job_number:12,description:'Starter motor',unit_price:75,quote_ref:'Q1',quote_work:'Rebuild starter'},{...base,key:'S3',ref:'JC-11-S2',description:'Inner hub',supplier_id:'62',supplier_name:other.label}];
 const deliveries=rows.slice(0,2).map((r,i)=>({...r,order_id:'7',order_number:'PO-7',order_line_id:String(71+i),outstanding:1,ordered_unit_price:r.unit_price}));
 const payloads=[],errors=[];
 await displayFixture(context,'admin',d=>{
  d.job_requirements={rows,suppliers:[supplier,other],owners:[{id:'JS',label:'JS Farm'}],orders:deliveries,returned:[{id:'returned-8',request_number:8,decision_reason:'Check the marking',payload:{order_id:7,receipt_date:'2026-11-16',invoice_date:'2026-11-15',invoice_number:'INV-8',lines:[{order_line_id:71,quantity:1,unit_price:8,marking:'FAINT'}]}}],access:{is_buyer:true,is_stock:true,is_admin:true}};
  d.purchasing_feed.can_receive_job_orders=true;
  d.receipt_verification.receipts=[{id:'r7',request_number:7,receipt_action:'job_delivery',payload:{invoice_number:'INV-7',receipt_date:'2026-11-24',owner_code:'JS',supplier:supplier.label,lines:[{order_line_id:71,ref:base.ref,kind:'sample',item_name:'Outer hub',quantity:1,unit_price:12,marking:'MARK-7'}]}}];
 });
 await context.route('**/functions/v1/stock-buying-development',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  const body=route.request().postDataJSON();
  if(!['job_requirement','job_delivery','create_job_card'].includes(body.action))return route.fallback();
  payloads.push(body);
  return route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},json:{success:true,result:{id:'service-card',job_number:11,requests:[67,68],request_number:7}}});
 });
 const p=await context.newPage();p.setDefaultTimeout(14000);p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(site+'/login');await p.getByPlaceholder('email@example.com').fill('screen@example.invalid');await p.getByPlaceholder('password',{exact:true}).fill('display-fixture-only');await p.getByText('Sign In',{exact:true}).last().click();await p.waitForURL(u=>!u.pathname.endsWith('/login'));
  await p.goto(site+'/job-cards');await click(p,'New Job Card');await pick(p,'Vehicle Type','Tractor');await pick(p,'Vehicle or implement','Screen test tractor');
  await field(p,'Problem description').fill('Service front axle');await pick(p,'Category 1','Filters');await pick(p,'Part 1','Match from sample');await field(p,'Sample description').fill('Outer hub');await pick(p,'Supplier 1','Screen supplier');
  await click(p,'+ Add line');await pick(p,'Category 2','Filters');await pick(p,'Part 2','Send for repair');await field(p,'Item and fault').fill('Starter motor');await click(p,'Save Job Card');
  await p.waitForFunction(()=>!document.body.innerText.includes('Save Job Card'));
  assert.deepEqual(payloads[0].payload.parts.map(x=>[x.kind,x.sample_details,x.unit_price]),[['sample','Outer hub',null],['repair','Starter motor',null]]);
  await p.goto(site+'/stock-v2-purchase-orders?from=buying');await click(p,'Job Card Requirements');await click(p,'← Purchase Orders');
  assert.equal(new URL(p.url()).pathname,'/stock-v2-purchase-orders');
  await p.goto(site+'/buying');await click(p,'Job Card Requirements');
  for(const r of rows)await p.getByRole('checkbox',{name:'Select '+r.ref+' for PO',exact:true}).click();
  await click(p,'Review selected lines (3)');await p.getByText('Screen supplier · JS',{exact:true}).waitFor();await p.getByText('Second supplier · JS',{exact:true}).waitFor();
  await click(p,'Send to Admin for authorisation');await p.getByText(/Sent to Admin/).waitFor();assert.equal(payloads.at(-1).payload.lines.length,3);
  await p.goto(site+'/stock-v2-po-receiving');await click(p,'Receive Job Card orders');await pick(p,'Approved purchase order','PO-7 · Screen supplier');
  await p.getByRole('checkbox',{name:'Receive JC-11-S1',exact:true}).click();await field(p,'Invoice unit price 71').fill('12');await field(p,'Observed marking 71').fill('MARK-7');await field(p,'Supplier invoice number').fill('INV-7');await click(p,'Submit receipt for verification');await p.getByText(/Receipt 7 sent for Admin/).waitFor();
  assert.equal(payloads.at(-1).payload.lines[0].marking,'MARK-7');
  await click(p,'Correct receipt');await field(p,'Observed marking 71').fill('CLEAR-8');await click(p,'Submit receipt for verification');await p.getByText(/Receipt 7 sent for Admin/).waitFor();
  const correction=payloads.at(-1).payload;
  assert.deepEqual([correction.replaces_id,correction.date,correction.invoice_date,correction.invoice_number],['returned-8','2026-11-16','2026-11-15','INV-8']);
  await p.goto(site+'/stock-v2-approvals?view=receipt');await click(p,'Review receipt');await field(p,'Confirm part number JC-11-S1').fill('6205-MATCH');
  await click(p,'Verify and post receipt');await p.getByText('Receipt verified and posted.',{exact:true}).waitFor();
  assert.equal(payloads.at(-1).payload.numbers['71'],'6205-MATCH');
  assert.deepEqual(errors,[]);console.log('PASS samples, repairs, supplier grouping, Stores receipt and Admin verification at '+width+'px');
 }catch(error){throw Error(width+'px '+p.url()+' '+error.message,{cause:error});}finally{await context.close();}
}
(async()=>{const b=await chromium.launch({executablePath:process.env.BUYING_TEST_BROWSER||undefined});try{for(const width of [390,1366])await run(b,width);}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
