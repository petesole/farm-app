const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {click,displayFixture}=require('./buying-development-browser.cjs');
const site=process.env.BUYING_TEST_URL||'https://jspl-farmingmain--development.expo.app';
const field=(p,n)=>p.getByRole('textbox',{name:n,exact:true});
async function select(p,n,v){await field(p,n).click();await click(p,v);}
async function scenario(browser,width,role){
 const ctx=await browser.newContext({viewport:{width,height:920}});
 let trip,api,lastPost;
 const line={order_line_id:42,order_id:9,order_number:'PO-9',supplier_name:'Bearing Centre',item_name:'Axle bearing',ordered_quantity:5,ordered_unit_price:12.5,payment_terms:'Account · Net 30',payment_basis:'Account',terms_note:'Net 30',available:5};
 const other={...line,order_line_id:43,supplier_name:'Filter Shop',item_name:'Oil filter',order_number:'PO-10',order_id:10};
 const makeTrip=()=>({id:'town-17',trip_number:17,line_plan:true,plan_version:1,trip_date:'2026-11-25',driver_id:'d',driver_name:'Jack',orders:[],terms_history:[],corrections:[],receipts:[],can_report:role==='driver',plan_lines:[{...line,quantity:2,posted:0,pending:0,to_receive:2,payment_basis:'Cash',terms_note:'',visited_at:null}]});
 const req={key:'P2',job_id:'job1',job_number:23,card_type:'asset',destination:'Tractor',category_name:'Bearings',description:'Axle bearing'};
 await displayFixture(ctx,role,d=>{
  trip=makeTrip();api=d.town_trips={line_planning:true,can_create:role==='admin',can_receive_plan:role==='admin',can_report:role==='driver',drivers:[{id:'d',email:'Jack'}],available_lines:[line,other],orders:[],trips:role==='admin'?[]:[trip]};
  d.job_requirements={rows:[],owners:[],suppliers:[],access:{is_admin:true},progress:[{...req,stage:'Awaiting Order',qty:3,po:'PO-9',price:12.5,supplier:'Bearing Centre'},{...req,stage:'Town List',qty:2,po:'PO-9',trip:17,price:12.5,supplier:'Bearing Centre'},{...req,stage:'Received',qty:1,po:'PO-8',trip:12,receipt_date:'2026-11-22',invoice:'INV-22',price:12,supplier:'Bearing Centre'}]};
 });
 await ctx.route('**/functions/v1/stock-buying-development',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  const body=route.request().postDataJSON();if(body.action!=='trip_plan')return route.fallback();lastPost=body;
  if(body.command==='create')api.trips=[trip];
  if(body.command==='visit')trip.plan_lines[0].visited_at='2026-11-25T09:00:00Z';
  if(body.command==='confirm'){trip.plan_lines[0].posted=1;trip.plan_lines[0].to_receive=1;}
  return route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},json:{success:true,result:{id:trip.id,trip_number:17}}});
 });
 const p=await ctx.newPage();p.setDefaultTimeout(12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(site+'/login');await p.getByPlaceholder('email@example.com').fill('test@example.invalid');await p.getByPlaceholder('password',{exact:true}).fill('fixture');await p.getByText('Sign In',{exact:true}).last().click();await p.waitForURL(u=>!u.pathname.endsWith('/login'));
  await p.goto(site+'/town-trips');
  if(role==='admin'){
   await click(p,'Add New Trip');await field(p,'Trip date (dd/mm/yyyy)').fill('25/11/2026');await select(p,'Driver','Jack');
   await p.getByRole('checkbox',{name:'Select PO-9 Axle bearing'}).click();await field(p,'Planned quantity Axle bearing').fill('2');
   await click(p,'Change terms');await select(p,'Trip payment method','Cash');await field(p,'Trip payment details').fill('');await field(p,'Reason for change').fill('Cash for two today');await click(p,'Done');
   await p.getByText('Cash required · 25.00',{exact:true}).waitFor();await select(p,'Filter by supplier','Filter Shop');
   assert.equal(await p.getByRole('checkbox',{name:'Select PO-9 Axle bearing'}).count(),0);await click(p,'Assign trip');
   await click(p,'Receive PO-9');assert.equal(lastPost.payload.lines.length,1);assert.equal(lastPost.payload.lines[0].quantity,2);assert.equal(lastPost.payload.lines[0].basis,'Cash');
   await p.getByRole('checkbox',{name:'Receive Axle bearing'}).click();await field(p,'Actual quantity Axle bearing').fill('1');await field(p,'Supplier invoice number').fill('IN-7');await click(p,'Confirm receipt and post');
   await p.getByText('Receipt verified and posted.',{exact:true}).waitFor();assert.equal(lastPost.payload.lines[0].quantity,1);
   await p.goto(site+'/job-requirements');await select(p,'Line status','Town List');await p.getByText('TL-17',{exact:true}).last().waitFor();
   await select(p,'Show requirements','Received');await p.getByText('INV-22',{exact:true}).last().waitFor();assert.equal(await field(p,'Line status').count(),0);
  }else{
   await click(p,'View Historical Trips');await click(p,'Open Trip 17');await p.getByRole('checkbox',{name:'Visited Bearing Centre'}).click();await p.getByText('Supplier visit recorded.',{exact:true}).waitFor();assert.equal(lastPost.command,'visit');assert.deepEqual(Object.keys(lastPost.payload).sort(),['supplier','trip_id']);assert.equal(await p.getByRole('button',{name:'Receive PO-9'}).count(),0);
  }
  assert.deepEqual(errors,[]);console.log('PASS town list '+role+' '+width+'px');
 }catch(e){throw Error(role+' '+width+' '+p.url()+' '+e.message,{cause:e});}finally{await ctx.close();}
}
(async()=>{const b=await chromium.launch({executablePath:process.env.BUYING_TEST_BROWSER||undefined});try{for(const width of [390,1366])for(const role of ['admin','driver'])await scenario(b,width,role);}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
