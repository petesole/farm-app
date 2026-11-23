// Render the related Stock and Cash Book web pages using display-only records.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {displayFixture} = require('./buying-development-browser.cjs');
const site = process.env.BUYING_TEST_URL || 'https://jspl-farmingmain--development.expo.app';
const day = '2026-11-20';
const product = {item_code:'PET',item_name:'Petrol',base_unit:'L',quantity:8,owner_code:'JS'};
const receipt = {...product,display_no:7,document_id:7,receipt_line_id:70,document_number:'GRV-7',
  document_date:day,received_quantity:8,previously_returned:0,original_unit_price:2};
const sheet = {sheet_id:1,take_number:'S-1',take_date:day,groups:['chemical'],version:1,status:'draft'};
const adjustment = {...sheet,...product,owner_code:'HS',required_quantity:2};
const grv = {...receipt,grv_line_id:71,invoice_quantity:8,physical_quantity:8,unit_price:2,invoice_number:'INV-7',supplier_name:'Screen supplier',invoice_date:day};
const trip = {id:'screen-trip',trip_number:1,trip_date:day,driver_name:'Test driver'};
const invoice = {id:'inv',town_trip_id:trip.id,invoice_number:'INV-7',supplier_name:'Screen supplier',available:'10',payment_currency:'USD',invoice_amount:'10',paid:'0',drafted:'0',credited:'0'};
function fixture(data) {
  const owners=['JS','AO'].map((code,i)=>({owner_id:i+1,owner_code:code,owner_name:code+' Farm',active:true}));
  const contracts=['Active contract','Inactive contract'].map((name,i)=>({contract_id:i+1,contract_code:'C'+i,contract_name:name,active:!i}));
  const spray={job_id:7,external_tracecode_id:10,tracecode_name:'QA Field',planned_week_start:'2026-11-23',area_ha:5,
    owner_code:'JS',owner_name:'JS Farm',issue_enabled:true,status:'planned',spray_type:'Field spray',
    water_litres_per_ha:100,sprayer_asset_code:'Sprayer A',item_code:'SPRAY',item_name:'Mineral spray oil',base_unit:'L',rate_per_ha:1,planned_quantity:5,issued_quantity:0};
  data.snapshot.sprays=[spray,{...spray,job_id:8,status:'completed',issued_quantity:5,completed_date:day}];
  data.workflow_context.access.can_adjustments=true;
  data.receipt_verification.receipts.push({...data.my_receipts.receipts[0],status:'pending'});
  data.supplier_list.suppliers.forEach((s,i)=>{s.supplier_id=i+1;s.active=!i;});
  Object.assign(data,{
    product_catalog:{items:data.snapshot.items.map(i=>({...i,actives:[],version:1})),can_edit:true,can_create:true},
    stock_setup:{owners,contracts,traces:[]},owner_workflow:{owners,balances:[product]},
    supplier_returns:{rows:[]},supplier_return_suppliers:{rows:[{name:'Screen supplier',owner_code:'JS'}]},supplier_return_sources:{rows:[receipt]},
    stock_staff:{rows:[{id:'user',email:'Stores user',role_name:'clerk',active:true}]},
    movement_item:{item:product,current_stock:8,movements:[{...receipt,trans_id:1,transaction_date:day,description:'Opening quantity',stock_in:8,stock_out:0,stock_pos:8}]},
    issue_slip:{header:{...receipt,company_name:'JS Farm',document_number:'ISS-7',tracecode_name:'QA Field',water_rate:100},lines:[product]},
    correction_dnotes:{rows:[false,true].map((locked,i)=>({...receipt,document_id:7+i,display_no:7+i,delivery_note:'DN-'+i,supplier_name:'Screen supplier',line_count:1,locked}))},
    correction_dnote_lines:{rows:[{...receipt,line_id:70,invoiced_quantity:0,reduced_quantity:0}]},
    grv_corrections:{invoices:[grv],receipts:[grv],history:[],physical_history:[]},
    combined_stocktake_groups:{groups:['chemical'],is_admin:true,can_print:true},combined_stocktake_list:{rows:[sheet]},
    combined_stocktake_lines:{sheet,rows:[{...product,category:'chemical',hs:8,ao:0}],is_admin:true,can_print:true},
    stock_adjustment_report:{is_admin:true,rows:[adjustment],history:[{...receipt,adjustment_date:day}]},
    stock_adjustment_history_lines:{rows:[receipt]},adjustment_stock:{rows:[{...product,owner_code:'TEST_JS'}]},adjustment_history:{rows:[]},
    stocktake_list:{rows:[{...sheet,owner_code:'TEST_JS',take_id:1,location_code:'MAIN'}]},stocktake_lines:{rows:[product]},
    spray_admin:{is_admin:true},spray_types:{spray_types:[{access_spray_type_id:1,spray_type_name:'Field spray',spray_tank_size:600,spray_rate_per_ha:100}]},budget_templates:{budgets:[]},budget_reference:{budget:[]},
    spray_history:{rows:[]},spray_assignments:{rows:[]},spray_return_issues:{rows:[{...receipt,...spray,source_line_id:10,available_to_return:3}]},
    cash_book_labour:{rows:[{source_type:'labour',source_id:'42',tracecode_name:'QA Field',activity_name:'Weeding',amount:'10'}]},
    cash_book_supplier_invoices:{invoices:[invoice],creditOptions:[]},
  });
  Object.assign(data.cash_book,{accounts:[{id:'USD-account',name:'Pete',currency:'USD',balance:'42',active:true}],trips:[trip],tripInvoices:[invoice],
    advances:[{id:'advance',trip_id:trip.id,account_id:'USD-account',amount:'20',currency:'USD',outstanding:'20',invoices:[]}]});
}
const text=(page,name)=>page.getByText(name,{exact:true}).filter({visible:true}).last();
const field=(page,label)=>page.getByRole('textbox',{name:label,exact:true}).first();
const tap=name=>async page=>{await text(page,name).click();};
const select=(label,choice)=>async page=>{await field(page,label).click();await text(page,choice).click();};
async function columns(page,headings,rows) {
  const headers=await Promise.all(headings.map(name=>text(page,name).boundingBox()));
  for(const cells of rows){
    const boxes=await Promise.all(cells.map(cell=>cell.boundingBox()));
    boxes.forEach((b,i)=>{
      assert(b&&headers[i]&&Math.abs(b.x-headers[i].x)<3,'Column under '+headings[i]);
      assert(Math.abs(b.y-boxes[0].y)<3,'Row at '+headings[i]);
    });
  }
}
async function transfer(page){
  await tap('Add product')(page);
  for(const i of [0,1])await columns(page,['Product','Quantity'],[[field(page,'Product '+(i+1)),page.getByRole('textbox',{name:'Quantity',exact:true}).nth(i)]]);
  const removals=page.getByRole('button',{name:'Remove line',exact:true});
  for(const i of [0,1])assert(Math.abs((await removals.nth(i).boundingBox()).y-(await field(page,'Product '+(i+1)).boundingBox()).y)<3);
}
async function returnRows(page,codes){
  await columns(page,['Return qty','Est. credit $/unit'],codes.map(code=>[field(page,'Return qty '+code),field(page,'Est. credit '+code)]));
}
async function editsAligned(page){
  const edits=page.getByText('Edit',{exact:true}).filter({visible:true});
  await edits.nth(1).waitFor();
  assert.equal(await edits.count(),2);
  assert(Math.abs((await edits.nth(0).boundingBox()).x-(await edits.nth(1).boundingBox()).x)<2,'Edit actions align');
}
const cash='/cashbook',ops='/stock-test',prefix='/stock-v2-';
const cases=[];
function check(path,marker,...steps){cases.push({path,marker,steps});}
check('/stock-dashboard','Stock Operations');
check('/buying','Approve Purchase Orders');
check('/outstanding-issues','Correct receipt 72');
check('/job-cards','Historical Job Cards');
check('/job-cards','Save Job Card',tap('New Job Card'));
check('/job-cards?view=outstanding','Job Card 11 · Screen test tractor');
check('/job-cards?view=history','Job Card 8 · Screen test tractor');
check('/job-cards?view=outstanding&card=service-card','Edit unit price');
check('/town-trips','View Historical Trips');
check('/town-trips','Assign trip',tap('Add New Trip'));
check('/town-trips','Open Trip 1',tap('View Historical Trips'));
check('/town-trips','Edit trip',tap('View Historical Trips'),tap('Open Trip 1'));
check(cash,'Labour payments');
for(const [menu,marker] of [['New Payment','Save draft'],['New Receipt','Save draft'],['Quick Cash','Save Quick Cash'],['Transaction History','Date from'],['Accounts','Create account'],['Trip advances','Record advance'],['Labour payments','Load labour records'],['Supplier invoices','Save supplier payment draft']])check(cash,marker,tap(menu));
check(cash,'Reconcile advance',tap('Trip advances'),tap('Open reconciliation'));
check(ops,'Manage Suppliers');
check(ops+'?operation=Stock%20Balances','Stock Balances');
check(ops+'?operation=Direct%20Issue','Post Direct Issue');
check(ops+'?operation=Planned%20Issue','Post Planned Issue');
function stock(path,marker,...steps){check(prefix+path,marker,...steps);}
stock('purchase-orders','New Purchase Order');
stock('approvals','Awaiting Approval');
stock('approvals?view=po','Approve Purchase Orders');
stock('approvals?view=receipt','Verify Receipts');
stock('po-receiving','POs Outstanding — Receiving');
stock('grv-outstanding','GRV — Outstanding D Notes');
check('/home/stock-v2-credits','Supplier Credit Notes');
stock('supplier-returns','New Supplier Return');
stock('supplier-returns','Find product',select('Return type','General return to supplier'),p=>returnRows(p,['LUBE','PET']));
stock('supplier-returns','Original GRV Products',select('Supplier','Screen supplier'),tap('Load GRVs for Selected Supplier'),select('Original GRV','GRV 7 · 20/11/2026'),p=>returnRows(p,['PET']));
stock('owner-transactions','Save Stock Transfer',transfer);
stock('suppliers','Search suppliers',editsAligned);
stock('suppliers','Save Supplier',tap('Edit'));
stock('setup','Stock Owners');
stock('setup','Contracts',tap('Contracts'),editsAligned);
stock('staff','Stock Staff Access');
stock('movements?item_code=PET&owner=JS','Stock Movement Report');
stock('issue-slip?documentId=7','Petrol');
stock('corrections','D-Note 7 · Screen supplier');
stock('corrections','D-Note Number',tap('D-Note 7 · Screen supplier'));
stock('corrections','Open Supplier Returns',tap('D-Note 8 · Screen supplier'));
stock('grv-corrections','Save Linked Invoice Correction',select('Invoiced GRV and product','INV-7 · Screen supplier · Petrol'));
stock('grv-corrections','Post Linked Stock Adjustment',select('Correction type','Physical receipt quantity'),select('Physical receipt and product','INV-7 · Screen supplier · Petrol'));
stock('stocktake','Input Stock Take');
stock('stocktake?view=history','Earlier Stock Sheets');
stock('stocktake?sheetId=1&view=input','Save Stock Take');
stock('stocktake-legacy','Earlier Stock Sheets');
stock('adjustments','Save Adjustments');
stock('adjustments','Adjustment Number',tap('Adjustment History'));
stock('adjustments','Save Individual Adjustment',tap('Individual Adjustment'));
stock('spray-planning','Weekly Spray Planning');
stock('spray-entry','New Spray Plan');
stock('spray-entry?editJobId=7','Edit Spray Mix');
stock('application?jobId=7','Mineral spray oil',async page=>{
  const line=page.getByTestId('application-print-row').first();
  await line.waitFor();
  const cells=line.locator(':scope > *');
  await columns(page,['Input Name','Rate/Ha','Required','Full Tank Mix','Part Tank Mix'],[Array.from({length:5},(_,i)=>cells.nth(i))]);
  const numeric=await cells.nth(3).boundingBox();
  assert(numeric.width>=75,'Tank mix column remains legible');
});
stock('spray-transaction?jobId=7&mode=issue','Spray Transfer / Issue');
stock('spray-transaction?jobId=8&mode=return','Spray Stock Return',select('Original issue','GRV-7'),async page=>{
  const quantity=field(page,'Return quantity 10');await quantity.waitFor();
  const heading=await text(page,'Return quantity').boundingBox(),value=await quantity.boundingBox();
  assert(Math.abs(heading.x-value.x)<3,'Spray return quantity under its heading');
});
stock('sprayer-completions','Sprayed Date');
stock('sprayer-completions','Save Correction',tap('Edit'));

check(cash,'Save labour payment draft',tap('Labour payments'),async p=>{await field(p,'Labour date (dd/mm/yyyy)').fill('20/11/2026');},tap('Load labour records'),tap('Select'));
check(cash,'Reconcile advance',tap('Trip advances'),tap('Open reconciliation'),select('Add an invoice paid from this advance','INV-7 · Screen supplier · 10 available'));
check(ops+'?operation=Stock%20Balances','Save Product',tap('Edit Product'));
stock('movements?item_code=PET&owner=JS','Print Report',tap('Print'));
stock('stocktake?sheetId=1&view=input','Close Preview',tap('Print Stock Sheet'));
stock('stocktake-legacy','Stocktake Document',async p=>{await p.getByText(/^S-1 · JS/).first().click();});
stock('adjustments','GRV-7',tap('Adjustment History'),tap('Open'));
stock('setup','Save Owner',tap('Edit'));
stock('setup','Save Contract',tap('Contracts'),tap('Edit'));
stock('approvals?view=po','Approve Purchase Order',tap('Review & Approve'));
stock('approvals?view=receipt','Verify and post receipt',tap('Review receipt'));
stock('purchase-orders','Save Product',tap('New Purchase Order'),tap('+ New Product for line 1'));
check('/home/stock-v2-credits','Reason for price-only credit',select('Supplier','Screen supplier'),tap('Price-only Credit'));
check('/home/stock-v2-credits','Supplier Credit Note',tap('CN-7 · Screen supplier'));
check('/sprayer','Sync Options');
check('/sprayer','Input Name',tap('Historical'));
check('/sprayer','Completed Date',tap('QA Field'));
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
function api(route,json){return route.fulfill({headers,json});}
async function checkView(page,view,width){
  const errors=[];
  const error=e=>errors.push(e.message);
  const response=r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url().split('supabase.co').pop());};
  page.on('pageerror',error);page.on('response',response);
  try{
    await page.goto(site+view.path,{waitUntil:'domcontentloaded'});
    for(const step of view.steps)await step(page);
    await text(page,view.marker).or(page.getByPlaceholder(view.marker,{exact:true})).first().waitFor();
    await page.waitForLoadState('networkidle');
    await page.evaluate(()=>document.fonts.ready);
    const layout=await page.evaluate(()=>{
      const clipped=[];
      for(const input of document.querySelectorAll('input,textarea')){
        const rect=input.getBoundingClientRect();
        if(!rect.width||!rect.height||input.closest('[aria-hidden="true"]'))continue;
        for(let p=input.parentElement;p;p=p.parentElement){
          const clip=getComputedStyle(p).overflowX;
          if(clip==='auto'||clip==='scroll')break;
          const b=p.getBoundingClientRect();
          if(clip==='hidden'&&(rect.right>b.right+2||rect.left<b.left-2)){
            clipped.push(input.getAttribute('aria-label')||input.placeholder||input.type);break;
          }
        }
      }
      const grids=[];
      // Report and line-entry grids have consecutive horizontal rows inside a horizontal scroll view.
      for(const scroll of document.querySelectorAll('div')){
        if(!/auto|scroll/.test(getComputedStyle(scroll).overflowX))continue;
        for(const group of scroll.querySelectorAll('div')){
          const rows=[...group.children];
          if(rows.length<2||!rows.every(row=>getComputedStyle(row).flexDirection==='row'))continue;
          const reference=[...rows[0].children];
          if(reference.length<2||!reference.every(cell=>getComputedStyle(cell).flexBasis.endsWith('px')||cell.style.width.endsWith('px')))continue;
          for(const row of rows.slice(1)){
            if(row.children.length!==reference.length)continue;
            reference.forEach((cell,i)=>{
              const a=cell.getBoundingClientRect(),b=row.children[i].getBoundingClientRect();
              if(a.width&&b.width&&(Math.abs(a.x-b.x)>2||Math.abs(a.width-b.width)>2))grids.push(cell.textContent.slice(0,40));
            });
          }
        }
      }
      return {width:document.documentElement.scrollWidth,clipped,grids};
    });
    assert(layout.width<=width+1,'Page width '+layout.width+' at '+width);
    assert.deepEqual(layout.grids,[],'Grid columns '+layout.grids.join(', '));
    assert.deepEqual(layout.clipped,[],'Clipped controls '+layout.clipped.join(', '));
    assert.deepEqual(errors,[],errors.join(', '));
    console.log('PASS',width,view.path,view.marker);
  }catch(err){
    console.log('FAIL',width,view.path,view.marker,err.message.split('\n')[0],errors.join(', '),
      (await page.locator('body').innerText().catch(()=>'' )).replace(/\s+/g,' ').slice(-350));
    return false;
  }finally{page.off('pageerror',error);page.off('response',response);}
  return true;
}
async function run(browser,width){
  const context=await browser.newContext({viewport:{width,height:900}});
  await displayFixture(context,'admin',fixture);
  const legacy={spray_admin:{is_admin:true},stocktake_list:{rows:[{...sheet,take_id:1,owner_code:'TEST_JS',location_code:'MAIN',lines:1}]},adjustment_stock:{rows:[product]},adjustment_history:{rows:[]},stocktake_lines:{rows:[product]}};
  await context.route('**/functions/v1/stock-v2-demo-workflow?*',r=>{const key=[...new URL(r.request().url()).searchParams.keys()][0];return legacy[key]?api(r,legacy[key]):r.fallback();});
  await context.route('**/rest/v1/tracecode?*',r=>api(r,[{tracecode_id:10,tracecode_name:'QA Field',crop_id:1,start_date:day,end_date:null,area_ha:5}]));
  await context.route('**/rest/v1/crop?*',r=>api(r,[{crop_id:1,crop_name:'Maize'}]));
  await context.route('**/functions/v1/stock-v2-credits',r=>api(r,{
    returns:[{...receipt,document_number:'RET-7',supplier_name:'Screen supplier',lines:[{...product,line_id:70,credited_quantity:0,agreed_price:2}]}],
    credits:[{credit_id:7,credit_note_number:'CN-7',credit_note_date:day,supplier_name:'Screen supplier',owner_code:'JS',total_amount:2,credit_kind:'return',notes:'',allocations:[]}],
  }));
  await context.route('**/functions/v1/stock-v2-sprayer?admin_list=1',r=>api(r,{rows:[{job_id:7,trace:'QA Field',spray_type:'Field spray',completed_date:day}]}));
  await context.route('**/functions/v1/stock-v2-sprayer?access=1',r=>api(r,{user_id:'phone',name:'Screen operator'}));
  await context.addInitScript(()=>{
    if(location.pathname!=='/sprayer')return;
    localStorage.setItem('jspl.sprayer.offline-access',JSON.stringify({id:'phone',name:'Screen operator'}));
    const job={id:'7',trace:'QA Field',week:'2026-11-23',area:5,spray_type:'Field spray',water_rate:100,tank_capacity:600,fully_issued:true,lines:[{code:'SPRAY',name:'Mineral spray oil',unit:'L',rate:1}]};
    localStorage.setItem('jspl-sprayer:phone',JSON.stringify({ready:true,jobs:[job,{...job,id:'8',completed_date:'2026-11-20'}],tanks:{},outbox:[]}));
  });
  try{
    const login=await context.newPage();await login.goto(site+'/login');
    await login.getByPlaceholder('email@example.com').fill('screen@example.invalid');
    await login.getByPlaceholder('password',{exact:true}).fill('display-fixture-only');
    await text(login,'Sign In').click();await login.waitForURL(u=>!u.pathname.endsWith('/login'));await login.close();
    const selected=cases.filter(c=>!process.env.LAYOUT_FILTER||new RegExp(process.env.LAYOUT_FILTER).test(c.path+' '+c.marker));
    let failures=0;
    const work=[...selected];
    async function worker(){const page=await context.newPage();page.setDefaultTimeout(6500);
      while(work.length){const view=work.shift();if(!await checkView(page,view,width))failures++;}
      await page.close();
    }
    await Promise.all(Array.from({length:3},worker));
    console.log(width+'px: '+(selected.length-failures)+'/'+selected.length+' views passed');
    return failures;
  }finally{await context.close();}
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BUYING_TEST_BROWSER||undefined});
  try{for(const width of (process.env.LAYOUT_WIDTHS||'390,768,1366').split(',').map(Number))if(await run(browser,width))process.exitCode=1;}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
