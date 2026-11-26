// Run against the development site with dedicated, assigned test sign-ins.
// This checks the screens and their real backend reads without posting transactions.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const site = process.env.BUYING_TEST_URL || 'https://jspl-farmingmain--development.expo.app';
const readings = {
  admin: ['stock_access', 'cash_book', 'cash_book_supplier_invoices', 'outstanding_issues', 'job_cards', 'town_trips'],
  buyer: ['stock_access', 'job_cards', 'town_trips'],
  driver: ['stock_access', 'town_trips'],
  stock: ['stock_access','job_cards','town_trips'],
};

// Optional display-only fixtures. Every Supabase request from this context is
// intercepted, including Auth. No fixture session or write reaches the project.
async function displayFixture(context,role,configure){
  const user={id:'00000000-0000-4000-8000-000000000001',email:'screen@example.invalid',aud:'authenticated',user_metadata:{},app_metadata:{}};
  const session={user,access_token:'display-fixture-only',token_type:'bearer',refresh_token:'display-fixture-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600};
  const admin=role==='admin', buyer=admin||role==='buyer', stores=role==='stock', driver=role==='driver';
  const access={can_main:admin,is_admin:admin,is_stock:admin||stores,is_buyer:buyer,is_driver:driver};
  const cashEntry=(day,number)=>({id:'entry-'+number,entry_number:number,reference:'Test receipt '+number,entry_date:day,created_at:day+'T12:00:00Z',kind:'receipt',status:'confirmed',currency:'USD',account_id:'USD-account',amount:'5.00',narrative:'Test deposit '+number});
  const book={accounts:[],entries:[cashEntry('2026-11-10',1),cashEntry('2026-11-19',2)],notes:[],balances:[{currency:'USD',balance:'42.00'},{currency:'ZiG',balance:'5.00'}],
    trips:[],advances:[],tripInvoices:[],counterparties:[],expenses:[{id:'stationery',job_number:12,item_name:'Stationery',tracecode_name:'Admin'}]};
  const lubricant={item_code:'LUBE',item_name:'Gear Oil',base_unit:'L',input_type:'Lubricants',input_category:'Lubricants',active:true,quantity:8,ao_quantity:0,owner_quantities:{JS:8,C73:3}};
  const petrol={...lubricant,item_code:'PET',item_name:'Petrol',input_type:'Fuel',input_category:'Fuel'};
  const mineral={...lubricant,item_code:'SPRAY',item_name:'Mineral spray oil',input_type:'Chemical',input_category:'Insecticide'};
  const oilLine={part_id:15,owner_code:'JS',item_code:'LUBE',item_name:'Gear Oil',quantity:5,unit:'L',unit_price:null,category_id:4,reserved:0,issued:0,available:8};
  const oilCard={clearance_reason:'Issue the outstanding Job Card items.',id:'fixture-card',job_number:9,transaction_date:'2026-11-20',vehicle_name:'Screen test tractor',work_description:'Service oil',parts:[oilLine],purchase_orders:[]};
  const serviceFilter={item_code:'FILTER-A',item_name:'Service filter',base_unit:'each',active:true,standalone_po:false};
  const poItems=[
    {...mineral,standalone_po:true},{...petrol,standalone_po:true},{...lubricant,standalone_po:true},
    {item_code:'FERT',item_name:'Urea',base_unit:'kg',active:true,standalone_po:true},
    {item_code:'SEED',item_name:'Maize seed',base_unit:'kg',active:true,standalone_po:true},
    {item_code:'WELFARE',item_name:'Salt',base_unit:'kg',active:true,standalone_po:true},
    serviceFilter,{...petrol,item_code:'FUEL-OTHER',item_name:'Tractor hire',standalone_po:false},
  ];
  const serviceCard={...oilCard,id:'service-card',job_number:11,parts:[{...oilLine,part_id:31,item_code:'FILTER-A',item_name:'Service filter',unit:'each',unit_price:'18.50',price_supplier_name:'Screen supplier'}]};
  const clearedCard={...oilCard,id:'cleared-card',job_number:8,closed_at:'2026-11-20T12:00:00Z'};
  const delivery={document_id:72,line_id:721,owner_code:'C73',supplier_name:'Delivered supplier',delivery_note:'DN-AUDIT',document_date:'2026-11-20',item_code:'FILTER-A',item_name:'Service filter',base_unit:'each',quantity:2};
  const returned={id:'receipt-returned',request_number:72,status:'returned',decision_reason:'Correct invoice reference',receipt_action:'combined_grv',payload:{owner_code:'C73',supplier:'Delivered supplier',invoice_number:'OLD-72',receipt_date:'2026-11-20',source_credit_id:54,credit_link_reason:'Original supplier credit',allocations:[{line_id:721,quantity:2}],invoice_lines:[{item_code:'FILTER-A',invoice_quantity:2,unit_price:12}]}};
  const lookups={
    purchasing_feed:{items:poItems,orders:[]},linked_credit_options:{rows:[]},outstanding_dnotes:{rows:[delivery]},my_receipts:{receipts:[returned]},receipt_verification:{receipts:[]},
    workflow_context:{access,documents:['pending','applied'].map((status,i)=>({id:'po-'+status,request_number:21+i,kind:'po',status,version:1,received:status==='applied',payload:{owner_code:'JS',supplier:'Screen supplier',order_date:'2026-11-20',lines:[{item_code:'PET',quantity:2,unit_price:1}]}})),stocktakes:[],awaiting:1},supplier_list:{suppliers:[{supplier_name:'Screen supplier',active:true},{supplier_name:'Second supplier',active:true}]},
    stock_setup:{owners:[{owner_code:'JS',owner_name:'JS',active:true}],contracts:[]},
    equipment_catalog:{rows:[{vehicle_id:2,vehicle_name:'Petrol bike',fuel_type:'PETROL'}]},chemical_actives:{rows:[]},
    snapshot:{issue_companies:[{owner_code:'JS',company_name:'JS Farm'},{owner_code:'C73',company_name:'Third company'}],items:[lubricant,petrol,mineral],sprays:[],documents:[],orders:[]},
    stock_access:{access},cash_book:book,
    cash_book_supplier_invoices:{invoices:[],creditOptions:[]},outstanding_issues:{counts:{outstanding_parts:1,po_approvals:1,pending_collections:1,cash_drafts:1,unreconciled_advances:1,returned_receipts:2},returned:[{...returned,reference:'OLD-72',assigned_to:'Screen admin',can_correct:true},{id:'different-user',request_number:71,reference:'OTHER-71',assigned_to:'Other submitter',decision_reason:'Check quantity',can_correct:false}]},
    job_cards:{cards:[oilCard,serviceCard,clearedCard],suppliers:[{supplier_id:'61',supplier_name:'Screen supplier'},{supplier_id:'62',supplier_name:'Second supplier'}],can_create:buyer,can_buy:buyer||admin,can_main:admin,can_reserve:buyer||stores,
      vehicles:[{vehicle_id:11,vehicle_name:'Screen test tractor',vehicle_type_id:4,vehicle_type:'Tractor',type_code:'TRA',owner_name:'Screen owner',owner_code:'JS',catalogue_group:'vehicle'}],
      items:[{item_code:'FILTER-A',item_name:'Service filter',base_unit:'each',part_number:'F-12',category_ids:[3]},{...lubricant,stock_lubricant:true,part_number:null,category_ids:[4]},{...lubricant,item_code:'EMPTY',item_name:'Hydraulic oil',quantity:0,stock_lubricant:true,part_number:null,category_ids:[4]}],
      categories:[{category_id:3,catalogue_group:'vehicle',category_name:'Filters'},{category_id:4,catalogue_group:'vehicle',category_name:'Lubricants',stock_only:true},{category_id:5,catalogue_group:'vehicle',category_name:'Oils',stock_only:true}],traces:[]},
    job_asset_purchase_history:{rows:[{id:'1',item_code:'FILTER-A',item_name:'Service filter',part_number:'F-12',active:true,supplier_name:'Screen supplier',receipt:'GRV-1',document_date:'2026-11-20',unit_price:'12.00'}]},
    town_trips:{trips:[{id:'screen-trip',trip_number:1,trip_date:'2026-11-20',driver_name:'Test driver',orders:[{order_id:22,order_number:'PO-22',owner:'JS',supplier:'Screen supplier',outcome:'collected',can_receive:true,items:[]}],finalised_at:null}],drivers:[{id:'audit-driver',email:'Assigned driver'}],orders:[{order_id:24,order_number:'PO-24',supplier_name:'Screen supplier',payment_terms:'Cash on collection'}],can_create:admin,can_report:driver,can_receive:!driver},
  };
  if(configure)configure(lookups);
  const driverOrder={order_id:24,order_number:'PO-24',supplier:'Screen supplier',owner:'JS',outcome:'pending',payment_terms:'Cash on collection',items:[]};
  if(driver)lookups.town_trips.trips.push({id:'assigned-trip',trip_number:3,trip_date:'2026-11-20',driver_id:'audit-driver',can_report:true,orders:[{...driverOrder}],finalised_at:null});
  await context.route('https://*.supabase.co/**',async route=>{
    const req=route.request(),u=new URL(req.url());
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    let response;
    if(u.pathname==='/auth/v1/token')response=session;
    else if(u.pathname==='/auth/v1/user')response=user;
    else if(u.pathname==='/rest/v1/rpc/my_farm_app_roles')response=[role];
    else if(u.pathname==='/rest/v1/tracecode'||u.pathname==='/rest/v1/crop')response=[];
    else if(req.method()==='GET'&&u.pathname.endsWith('/stock-buying-development'))response=lookups[[...u.searchParams.keys()][0]||'snapshot'];
    else if(req.method()==='POST'&&u.pathname.endsWith('/stock-buying-development')&&['create_town_trip','edit_town_trip','report_town_trip_order','finalise_town_trip'].includes(req.postDataJSON().action)){
      const body=req.postDataJSON(),trips=lookups.town_trips.trips;
      let trip=trips.find(trip=>trip.id===body.trip_id);
      if(body.action==='report_town_trip_order'){
        assert(driver&&trip.can_report);assert.equal(body.outcome,'unavailable');assert(body.note.trim());
        Object.assign(trip.orders[0],{outcome:body.outcome,driver_note:body.note});
      }else{
        assert(admin);
        if(body.action==='finalise_town_trip'){assert(trip.orders.every(o=>o.outcome!=='pending'));trip.finalised_at='2026-11-21T12:00:00Z';}
        else{
          assert.equal(body.driver_id,'audit-driver');assert.deepEqual(body.order_ids,[24]);
          if(!trip){trip={id:'audit-trip',trip_number:2,driver_name:'Assigned driver',orders:[{...driverOrder}],finalised_at:null,can_report:false};trips.push(trip);}
          Object.assign(trip,{driver_id:body.driver_id,trip_date:body.trip_date});
        }
      }
      response={success:true,result:{id:trip.id,trip_number:trip.trip_number}};
    }
    else if(req.method()==='POST'&&buyer&&u.pathname.endsWith('/stock-buying-development')&&
      ['create_job_card','edit_job_card','set_job_part_price','finalise_job_card','cancel_job_part_balance'].includes(req.postDataJSON().action)){
      const {action,payload}=req.postDataJSON();
      const jobs=lookups.job_cards;
      const supplier=part=>{
        const record=jobs.suppliers.find(s=>s.supplier_id===part.price_supplier_id);
        assert(part.unit_price==null?!part.price_supplier_id:record);
        return record?.supplier_name??null;
      };
      if(action==='cancel_job_part_balance'){
        const body=req.postDataJSON(),card=jobs.cards.find(c=>c.parts.some(p=>p.part_id===body.part_id));
        const part=card.parts.find(p=>p.part_id===body.part_id);
        assert.equal(part.reserved,0);assert.equal(part.quantity,5);assert.equal(part.issued,3);
        assert.equal(body.quantity,2);assert.equal(body.reason,'Only three required');
        Object.assign(part,{cancelled_quantity:body.quantity,cancellation_reason:body.reason,remaining_quantity:0});
        card.clearance_reason=null;response={success:true,result:{part_id:part.part_id,cancelled_quantity:body.quantity}};
      }else if(action==='finalise_job_card'){
        const {id,revision}=req.postDataJSON();
        const card=jobs.cards.find(c=>c.id===id);
        assert(card&&!card.closed_at&&!card.clearance_reason&&card.revision===revision);
        card.closed_at=new Date().toISOString();
        response={success:true,result:{id,job_number:card.job_number}};
      }else if(action==='set_job_part_price'){
        const part=jobs.cards.flatMap(card=>card.parts).find(p=>p.part_id===payload.part_id);
        Object.assign(part,{unit_price:payload.unit_price,price_supplier_id:payload.price_supplier_id,price_supplier_name:supplier(payload)});
        response={success:true,result:{id:part.part_id}};
      }else{
        const card=action==='edit_job_card'?jobs.cards.find(c=>c.id===payload.id):{id:'priced-card',job_number:10,purchase_orders:[]};
        Object.assign(card,payload,{vehicle_name:'Screen test tractor',clearance_reason:'Issue the outstanding Job Card items.',revision:'2',parts:payload.parts.map((part,i)=>({...part,part_id:21+i,owner_code:'JS',available:10,item_name:'Service filter',unit:'each',reserved:0,issued:0,price_supplier_name:supplier(part)}))});
        if(action==='create_job_card')jobs.cards.push(card);
        response={success:true,result:{id:card.id,job_number:card.job_number}};
      }
    }
    else if(req.method()==='POST'&&buyer&&u.pathname.endsWith('/stock-buying-development')&&req.postDataJSON().action==='workflow_command'){
      const {command,data}=req.postDataJSON();
      if(command==='authorise_po'){
        assert(admin);const doc=lookups.workflow_context.documents.find(d=>d.id===data.id);
        assert.equal(doc.status,'pending');assert(data.payment_terms.trim());assert.equal(data.payment_basis,'Account');assert.equal(data.version,doc.version);
        doc.status='applied';doc.payload.payment_terms=data.payment_terms;doc.target_order_id=500+doc.request_number;
        lookups.outstanding_issues.counts.po_approvals--;
        for(const [i,line] of doc.payload.lines.entries())lookups.purchasing_feed.orders.push({order_id:doc.target_order_id,order_line_id:doc.target_order_id*10+i,owner_code:doc.payload.owner_code,supplier_name:doc.payload.supplier,status:'approved',order_date:doc.payload.order_date,item_code:line.item_code,item_name:'Screen item',ordered_quantity:line.quantity,received_quantity:0,ordered_unit_price:line.unit_price});
        return route.fulfill({headers,json:{success:true,result:{id:doc.id,target_order_id:doc.target_order_id}}});
      }
      assert(['save','submit'].includes(command));assert.equal(data.payload.source_job_card_id,serviceCard.id);
      const status=command==='save'?'draft':'pending';
      const doc={id:data.id,version:1,kind:'po',received:false,status,request_number:30,payload:data.payload};
      const index=lookups.workflow_context.documents.findIndex(d=>d.id===doc.id);
      if(index<0)lookups.workflow_context.documents.push(doc);else lookups.workflow_context.documents[index]=doc;
      lookups.outstanding_issues.counts.po_approvals=lookups.workflow_context.documents.filter(d=>d.status==='pending'&&d.kind==='po').length;
      serviceCard.purchase_orders=[{request_number:30,owner_code:'JS',status}];
      response={success:true,result:{id:data.id}};
    }
    else if(req.method()==='POST'&&(buyer||stores)&&u.pathname.endsWith('/stock-buying-development')&&['reserve_job_part','issue_job_part'].includes(req.postDataJSON().action)){
      const body=req.postDataJSON();
      const card=lookups.job_cards.cards.find(c=>c.parts.some(p=>p.part_id===body.part_id));
      const part=card.parts.find(p=>p.part_id===body.part_id);
      if(body.action==='reserve_job_part'){part.reserved+=body.quantity_delta;part.available-=body.quantity_delta;}
      else {part.issued+=body.quantity;part.reserved-=body.quantity;}
      card.clearance_reason=part.reserved?'Issue or release the reserved stock.':part.issued<part.quantity?'Issue the outstanding Job Card items.':null;
      response={success:true,result:{part_id:part.part_id}};
    }
    else if(req.method()==='POST'&&u.pathname.endsWith('/stock-buying-development')&&admin){
      const {action,payload}=req.postDataJSON();
      if(action==='combined_grv'){
        assert.equal(payload.supplier,'Delivered supplier');assert.equal(payload.owner_code,'C73');
        assert.deepEqual(payload.allocations,[{line_id:721,quantity:2}]);assert.equal(payload.invoice_lines[0].unit_price,12);
        if(req.postDataJSON().replaces_id){
          assert.equal(req.postDataJSON().replaces_id,returned.id);
          assert.equal(payload.source_credit_id,54);assert.equal(payload.credit_link_reason,'Original supplier credit');
        }
        lookups.receipt_verification.receipts.push({id:'audit-'+payload.invoice_number,request_number:73,receipt_action:action,payload});
        response={success:true,result:{request_number:73,status:'pending'}};
      }else if(action==='decide_receipt'){
        assert.equal(req.postDataJSON().decision,'verify');
        const index=lookups.receipt_verification.receipts.findIndex(r=>r.id===req.postDataJSON().receipt_id);
        assert(index>=0);lookups.receipt_verification.receipts.splice(index,1);
        response={success:true,result:{status:'posted'}};
      }else if(action==='cash_book_quick_note'){
        assert.deepEqual(Object.keys(payload).sort(),['date','description']);
        book.notes.push({id:'new-note',note_number:1,note_date:payload.date,description:payload.description,created_at:payload.date+'T13:00:00Z',reconciled:false});
        response={success:true,result:{note_number:1}};
      } else if(action==='cash_book_match_note'){
        assert.equal(payload.note_id,'new-note');
        const entry=book.entries.find(e=>e.id===payload.entry_id);
        assert(entry);
        Object.assign(book.notes[0],{entry_id:entry.id,matched_reference:entry.reference,reconciled:true});
        response={success:true,result:{note_number:1}};
      }
    }
    if(response===undefined)return route.fulfill({status:403,headers,json:{error:'Outside the read-only screen fixture'}});
    return route.fulfill({headers,json:response});
  });
}

async function click(page, name) {
  try{
    await page.getByRole('button').filter({has:page.getByText(name,{exact:true})}).last().click({timeout:20000});
  }catch(error){
    throw Error(name+' on '+page.url()+': '+error.message);
  }
}

async function check(browser, role, width) {
  const fixture=process.env.BUYING_TEST_DISPLAY_ONLY==='true';
  const email = fixture?'screen@example.invalid':process.env['BUYING_TEST_'+role.toUpperCase()+'_EMAIL'];
  const password = fixture?'display-fixture-only':process.env['BUYING_TEST_'+role.toUpperCase()+'_PASSWORD'];
  assert(email && password, 'Missing dedicated '+role+' test sign-in');
  const context = await browser.newContext({viewport:{width,height:850}});
  if(fixture)await displayFixture(context,role);
  const page = await context.newPage();
  const received = new Set();
  const faults = [];
  page.on('pageerror', error => faults.push(page.url()+' '+error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (!url.pathname.endsWith('/stock-buying-development')) return;
    if (response.status() >= 400) faults.push(url.search+' HTTP '+response.status());
    else for (const key of url.searchParams.keys()) received.add(key);
  });
  try {
    await page.goto(site+'/login');
    await page.getByPlaceholder('email@example.com').fill(email);
    await page.getByPlaceholder('password', {exact:true}).fill(password);
    await page.getByText('Sign In',{exact:true}).click();
    await page.waitForURL(url => !url.pathname.endsWith('/login'), {timeout:40000});
    if(role==='admin')await click(page,'Stock');
    if(fixture){
      const approvals=page.getByRole('button',{name:/Approve Purchase Orders/});
      if(role==='admin'){
        await approvals.click();await click(page,'Review & Approve');
        assert(await page.getByRole('button',{name:'Approve Purchase Order',exact:true}).isDisabled());
        await click(page,'← Stock');await click(page,'Buying');await click(page,'Approve Purchase Orders');
        await page.getByText('1 purchase order awaiting approval',{exact:true}).filter({visible:true}).waitFor();
        await click(page,'← Buying');await click(page,'Purchase Orders');await click(page,'Review & Approve');
        await page.getByRole('textbox',{name:'Payment terms / due date details',exact:true}).waitFor();
        await click(page,'← Purchase Orders');await click(page,'← Buying');await click(page,'← Stock');
      }else{
        await page.getByRole('button',{name:/Town Trips/}).waitFor();assert.equal(await approvals.count(),0);
      }
    }
    if(role==='admin'){
      const help=page.getByRole('button',{name:'Open walkthrough assistant',exact:true});
      await help.waitFor();
      assert.equal(await page.getByText('Walkthrough assistant',{exact:true}).isVisible(),false);
      const bounds=await help.boundingBox();
      assert(bounds&&bounds.x>=width-75&&bounds.x+bounds.width<=width);
      await help.click();
      const choice=page.getByRole('textbox',{name:'Choose a walkthrough',exact:true});
      await choice.waitFor();
      await click(page,'Next');
      await choice.click();
      await click(page,'Cash Book');
      const question=page.getByRole('textbox',{name:'Workflow question',exact:true});
      await question.fill('How do I use Quick Cash?');
      await click(page,'Ask');
      await page.getByText(/Select Quick Cash, enter the date and description/).waitFor();
      await click(page,'Close');
      await help.waitFor();
      await click(page,'Cash Book');
      await click(page,'Quick Cash');
      const field=name=>page.getByRole('textbox',{name,exact:true});
      await field('Description').waitFor();
      assert.equal(await page.getByRole('textbox').count(),2);
      assert.match(await field('Date').inputValue(),/^\d{2}\/\d{2}\/\d{4}$/);
      if(fixture){
        await field('Date').fill('20/11/2026');
        await field('Description').fill('Collect garage receipt');
        await click(page,'Save Quick Cash');
        await page.getByText('Quick Cash 1 saved for reconciliation.').waitFor();
      }else{
        await click(page,'← Cash Book');
        await click(page,'Transaction History');
      }
      await page.getByText('Current balance',{exact:true}).waitFor();
      if(fixture){
        await page.getByText('USD 42.00',{exact:true}).waitFor();
        await page.getByText('ZiG 5.00',{exact:true}).waitFor();
        const history=page.getByRole('button',{name:/^(Quick Cash 1|Test receipt [12])$/});
        assert.deepEqual(await history.evaluateAll(nodes=>nodes.map(x=>x.getAttribute('aria-label'))),['Quick Cash 1','Test receipt 2','Test receipt 1']);
        await field('Date from').fill('19/11/2026');
        await field('Date to').fill('19/11/2026');
        await field('Date to').press('Tab');
        assert.equal(await history.count(),1);
        assert.equal(await history.first().getAttribute('aria-label'),'Test receipt 2');
        await page.getByText('USD 42.00',{exact:true}).waitFor();
        await field('Date from').fill('20/11/2026');
        await page.getByText('Date from must be on or before Date to.').waitFor();
        await field('Date from').fill('');
        await field('Date to').fill('');
        await page.getByRole('button',{name:'Quick Cash 1',exact:true}).click();
        await field('Confirmed transaction').click();
        await page.getByRole('button',{name:/19\/11\/2026.*Test receipt 2/}).click();
        await click(page,'Reconcile note');
        await page.getByText('Matched to Test receipt 2',{exact:true}).waitFor();
        await page.getByText('USD 42.00',{exact:true}).waitFor();
      }
      await click(page,'← Cash Book');
      assert.equal(await page.getByText('New Transfer',{exact:true}).count(),0);
      await click(page,'New Receipt');
      await page.getByRole('textbox',{name:'Payer',exact:true}).click();
      await page.getByRole('textbox',{name:'Payer',exact:true}).fill('Screen payer');
      await page.getByText(/Add payer/i).first().waitFor();
      await click(page,'← Cash Book');
      await click(page,'← Stock');
      await Promise.all([page.waitForResponse(r=>r.url().includes('outstanding_issues=')&&r.ok()),page.getByRole('button',{name:/Outstanding Issues/}).click()]);
      if(fixture){
        await click(page,'Open Outstanding Job Cards');
        await page.getByText('Outstanding Job Cards (2)',{exact:true}).waitFor();
        await click(page,'← Outstanding Issues');
        for(const [button,title] of [['Review Cash Book history','Transaction History'],['Reconcile trip advances','Trip Advances']]){
          await click(page,button);await page.getByText(title,{exact:true}).first().waitFor();
          await click(page,'← Outstanding Issues');
        }
        await click(page,'Review purchase orders');
        await click(page,'Review & Approve');await click(page,'Edit PO');
        await page.getByRole('textbox',{name:'Reason for correction / cancellation',exact:true}).waitFor();
        await click(page,'← Approvals');
        await page.getByRole('textbox',{name:'Payment method',exact:true}).click();await click(page,'Account');
        await page.getByRole('textbox',{name:'Payment terms / due date details',exact:true}).fill('30 days');
        await click(page,'Approve Purchase Order');await page.getByText('PO-521 approved and available for receiving.',{exact:true}).waitFor();await click(page,'View Authorised POs');
        await click(page,'Open PO Receiving');await page.reload();
        await page.getByRole('textbox',{name:'Stock owner',exact:true}).click();await click(page,'JS (1)');
        await page.getByRole('textbox',{name:'Supplier',exact:true}).click();await click(page,'Screen supplier');
        await page.getByText('PO-521',{exact:true}).filter({visible:true}).waitFor();
        await click(page,'← Purchase Orders');await click(page,'← Approvals');
        await page.getByText('No purchase orders awaiting approval.',{exact:true}).filter({visible:true}).waitFor();
        await click(page,'← Outstanding Issues');
        await click(page,'View Town Trips');await click(page,'Open Trip 1');
        await click(page,'Receive order');await page.reload();
        await page.getByText('Town Trip · PO-22',{exact:true}).waitFor();
        await click(page,'← Town Trip');await page.getByText('Town Trip 1',{exact:true}).waitFor();
        await click(page,'← Historical Trips');await click(page,'← Outstanding Issues');
      }
      await click(page,'← Stock');
    }
    if(role!=='driver'){
      await click(page,'Job Cards');
      if(fixture){
        await click(page,'Outstanding Job Cards (2)');
        await page.getByRole('button',{name:'Job Card 9 · Screen test tractor',exact:true}).waitFor();
        await page.getByRole('button',{name:'Job Card 11 · Screen test tractor',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Job Card 8 · Screen test tractor',exact:true}).count(),0);
        await click(page,'← Job Cards');
      }
      await click(page,'Historical Job Cards');
      if(fixture){
        await click(page,'Job Card 8 · Screen test tractor');
        assert.equal(await page.getByRole('button',{name:'Edit Job Card',exact:true}).count(),0);
        await click(page,'← Historical Job Cards');
        assert.equal(await page.getByRole('button',{name:'Job Card 9 · Screen test tractor',exact:true}).count(),0);
      }
      await click(page,'← Job Cards');
      if(role==='buyer'||role==='admin'){
        await click(page,'New Job Card');
        await page.getByText('Vehicle Type',{exact:true}).first().waitFor();
        await page.getByText('Transaction date',{exact:true}).first().waitFor();
        await page.getByText('Unit price',{exact:true}).first().waitFor();
        const date=page.getByRole('textbox',{name:'Transaction date',exact:true});
        await date.fill('2/2');
        await date.press('Tab');
        assert.match(await date.inputValue(),/^02\/02\/\d{4}$/);
        if (fixture) {
          await page.getByRole('textbox',{name:'Vehicle Type',exact:true}).click();
          await click(page,'Tractor');
          await page.getByRole('textbox',{name:'Vehicle or implement',exact:true}).click();
          await click(page,'Screen test tractor');
          await page.getByText(/Screen supplier.+12.00/).waitFor();
          await click(page,'+');
          await page.getByText('On card',{exact:true}).waitFor();
          assert.equal(await page.getByRole('textbox',{name:'Qty 1',exact:true}).inputValue(),'1');
          assert.equal(await page.getByRole('textbox',{name:'Unit price 1',exact:true}).inputValue(),'');
          const category=page.getByRole('textbox',{name:'Category 1',exact:true});
          await category.click();
          assert.equal(await page.getByRole('button',{name:'Oils',exact:true}).count(),0);
          await click(page,'Lubricants');
          const stockInput=page.getByRole('textbox',{name:'Stock Input 1',exact:true});
          await stockInput.click();
          await page.getByRole('button',{name:'Gear Oil · LUBE',exact:true}).waitFor();
          assert.equal(await page.getByRole('button',{name:/Add part/}).count(),0);
          await stockInput.fill('Unregistered lubricant');
          await page.getByText('No matching results',{exact:true}).waitFor();
          assert.equal(await page.getByRole('button',{name:/Add part/}).count(),0);
          await stockInput.fill('Hydraulic');
          await click(page,'Hydraulic oil · EMPTY');
          assert.equal(await stockInput.inputValue(),'Hydraulic oil · EMPTY');
          await category.click();
          await click(page,'Filters');
          const other=page.getByRole('textbox',{name:'Part 1',exact:true});
          await other.click();
          await other.fill('Missing filter');
          await page.getByRole('button',{name:/Add part/}).waitFor();
          await other.fill('F-12');await click(page,'F-12 · Service filter');
          await page.getByRole('textbox',{name:'Problem description',exact:true}).fill('Service tractor');
          await page.getByRole('textbox',{name:'Qty 1',exact:true}).fill('5');
          const saveCard=page.getByRole('button',{name:'Save Job Card',exact:true});
          assert(await saveCard.isEnabled());
          await page.getByRole('textbox',{name:'Unit price 1',exact:true}).fill('0');
          assert(await saveCard.isDisabled());
          await page.getByRole('textbox',{name:'Supplier for price 1',exact:true}).click();
          await click(page,'Screen supplier');await click(page,'Save Job Card');
          await page.getByText('Unit price · 0.00 · Screen supplier',{exact:true}).waitFor();
          await click(page,'Edit Job Card');
          const lineSupplier=page.getByRole('textbox',{name:'Supplier for price 1',exact:true});
          assert.equal(await lineSupplier.inputValue(),'Screen supplier');
          await page.getByRole('button',{name:'Clear Supplier for price 1',exact:true}).click();
          assert(await saveCard.isDisabled());
          await lineSupplier.click();await click(page,'Second supplier');
          await click(page,'Save Job Card');
          await page.getByText('Unit price · 0.00 · Second supplier',{exact:true}).waitFor();
          await click(page,'Edit unit price');
          const editPrice=page.getByRole('textbox',{name:'Unit price',exact:true});
          await editPrice.fill('18.50');
          await page.getByRole('button',{name:'Clear Supplier for price',exact:true}).click();
          assert(await page.getByRole('button',{name:'Save price',exact:true}).isDisabled());
          await page.getByRole('textbox',{name:'Supplier for price',exact:true}).click();
          await click(page,'Screen supplier');await click(page,'Save price');
          await page.getByText('Unit price · 18.50 · Screen supplier',{exact:true}).waitFor();
          await click(page,'Edit unit price');await editPrice.fill('');await click(page,'Save price');
          await page.getByText('Unit price pending',{exact:true}).waitFor();
          await click(page,'← Outstanding Job Cards');
          await page.getByText('Outstanding Job Cards (3)',{exact:true}).waitFor();
          await click(page,'Job Card 10 · Screen test tractor');
          const finalise=page.getByRole('button',{name:'Finalise Job Card',exact:true});
          assert(await finalise.isDisabled());
          await page.getByText('Issue the outstanding Job Card items.',{exact:true}).waitFor();
          await click(page,'Manage reservation');
          const reserveQty=page.getByRole('textbox',{name:'Quantity',exact:true});
          await reserveQty.fill('5');await click(page,'Reserve');
          await page.getByText('Issue or release the reserved stock.',{exact:true}).waitFor();
          assert(await finalise.isDisabled());
          await click(page,'Manage reservation');await reserveQty.fill('3');await click(page,'Issue reserved stock');
          await page.getByText('2 each reserved · 3 each issued',{exact:true}).waitFor();
          assert(await page.getByRole('button',{name:'Cancel remaining quantity',exact:true}).isDisabled());
          await click(page,'Manage reservation');await reserveQty.fill('2');await click(page,'Release');
          await click(page,'Cancel remaining quantity');
          assert(await page.getByRole('button',{name:'Confirm cancellation',exact:true}).isDisabled());
          await page.getByRole('textbox',{name:'Cancellation reason',exact:true}).fill('Only three required');await click(page,'Confirm cancellation');
          await page.getByText('2 each cancelled · Only three required',{exact:true}).waitFor();
          assert.equal(await page.getByRole('button',{name:'Manage reservation',exact:true}).count(),0);
          await click(page,'Finalise Job Card');
          await click(page,'Confirm finalisation');
          await page.getByText('Outstanding Job Cards (2)',{exact:true}).waitFor();
          assert.equal(await page.getByRole('button',{name:'Job Card 10 · Screen test tractor',exact:true}).count(),0);
          await click(page,'← Job Cards');
          await click(page,'Historical Job Cards');
          await page.getByRole('button',{name:'Job Card 10 · Screen test tractor',exact:true}).waitFor();
        }
        await click(page,'← Job Cards');
      }
      await click(page,'← Stock');
    }
    if(fixture&&(role==='buyer'||role==='admin')){
      await click(page,'Buying');await click(page,'Job Cards');await click(page,'Outstanding Job Cards (2)');
      await click(page,'Job Card 11 · Screen test tractor');await page.reload();
      for(const action of ['← Job Card','Save Draft','Submit for Approval']){
        // Previously saved single-card POs and individual supplier quote links still open this editor.
        await page.goto(site+'/stock-v2-purchase-orders?from=job-card&job=service-card&owner=JS&returnTo='+encodeURIComponent(JSON.stringify({path:'/job-cards',params:{view:'outstanding',card:'service-card',from:'buying'}})));
        await page.getByText('Job Card 11',{exact:true}).waitFor();
        if(action==='← Job Card'){
          await page.reload();
          await page.getByRole('button',{name:'Save Draft',exact:true}).waitFor();
        }
        if(action==='Save Draft'){
          const supplier=page.getByRole('textbox',{name:'Supplier',exact:true});
          const price=page.getByRole('textbox',{name:'Unit price (optional)',exact:true});
          assert.equal(await supplier.inputValue(),'Screen supplier');
          assert.equal(await price.inputValue(),'18.50');
          await supplier.click();await click(page,'Second supplier');assert.equal(await price.inputValue(),'');
          await supplier.click();await click(page,'Screen supplier');assert.equal(await price.inputValue(),'18.50');
        }
        await click(page,action);await page.getByRole('button',{name:'Review Job Card requirements',exact:true}).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('card'),'service-card');
      }
      if(role==='admin'){
        await click(page,'Review & Approve PO 30');await page.getByRole('textbox',{name:'Payment terms / due date details',exact:true}).waitFor();
        await click(page,'← Job Card');await page.getByRole('button',{name:'Review & Approve PO 30',exact:true}).waitFor();
      }else assert.equal(await page.getByRole('button',{name:'Review & Approve PO 30',exact:true}).count(),0);
      await click(page,'← Outstanding Job Cards');await click(page,'← Job Cards');await click(page,'← Buying');
      await click(page,'Purchase Orders');
      await page.getByRole('textbox',{name:'Status',exact:true}).click();await click(page,'pending');
      await click(page,'Open PO Receiving');await click(page,'← Purchase Orders');
      assert.equal(await page.getByRole('textbox',{name:'Status',exact:true}).inputValue(),'pending');
      await click(page,'← Buying');await click(page,'← Stock');
    }
    await click(page,'Town Trips');
    if(role==='driver')assert.equal(await page.getByText('Add New Trip',{exact:true}).count(),0);
    await click(page,'View Historical Trips');
    if(fixture)await page.getByText(/Trip 1.+Outstanding/).waitFor();
    if(fixture&&role==='stock'){
      await click(page,'← Town Trips');await click(page,'← Stock');await click(page,'Stock Operations');await click(page,'Direct Issue');
      const owner=page.getByRole('textbox',{name:'Stock owner',exact:true});
      await owner.click();await click(page,'Third company');
      const type=page.getByRole('textbox',{name:'Input Type 1',exact:true});
      assert.equal(await type.inputValue(),'All input types');
      await page.getByText('Select product ▾',{exact:true}).click();
      await page.getByText(/^Petrol \(L\).*Available/).first().waitFor();
      await page.getByText(/^Mineral spray oil \(L\).*Available/).first().waitFor();
      assert.equal(await page.getByText(/^Gear Oil \(L\).*Available/).count(),0);
      await type.click();await click(page,'Chemical');
      await page.getByText('Select product ▾',{exact:true}).click();
      await page.getByText(/^Mineral spray oil \(L\).*3\.000 L/).waitFor();
      assert.equal(await page.getByText(/^Petrol \(L\).*Available/).count(),0);
      await type.click();await click(page,'Fuel');
      await page.getByText('Select product ▾',{exact:true}).click();
      assert.equal(await page.getByText(/^Mineral spray oil \(L\).*Available/).count(),0);
      await page.getByText(/^Petrol \(L\).*3\.000 L/).click();
      await page.getByRole('textbox',{name:'Petrol — Equipment',exact:true}).waitFor();
      await page.getByText('＋ Add product line',{exact:true}).click();
      const secondType=page.getByRole('textbox',{name:'Input Type 2',exact:true});
      assert.equal(await secondType.inputValue(),'All input types');
      await secondType.click();await click(page,'Chemical');
      await type.click();await click(page,'All input types');
      assert.equal(await secondType.inputValue(),'Chemical');
      await page.getByRole('textbox',{name:'Petrol — Equipment',exact:true}).waitFor();
      await click(page,'Issue lubricants from a Job Card');
      await page.getByText('Outstanding Job Cards (2)',{exact:true}).waitFor();
      await click(page,'Job Card 9 · Screen test tractor');
      assert.equal(await page.getByRole('button',{name:'Cancel remaining quantity',exact:true}).count(),0);
      await click(page,'Manage reservation');
      const qty=page.getByRole('textbox',{name:'Quantity',exact:true});
      await qty.fill('5');await click(page,'Reserve');
      await page.getByText('5 L reserved · 0 L issued',{exact:true}).waitFor();
      await click(page,'Manage reservation');
      await qty.fill('3');await click(page,'Issue reserved stock');
      await page.getByText('2 L reserved · 3 L issued',{exact:true}).waitFor();
      await click(page,'← Outstanding Job Cards');await click(page,'← Direct Issue');
      await page.getByRole('textbox',{name:'Input Type 1',exact:true}).waitFor();
      await click(page,'← Stock Operations');
      await page.waitForURL(url=>url.pathname==='/stock-test'&&!url.searchParams.get('operation'));
      await page.reload();
      await page.getByRole('button').filter({has:page.getByText('Direct Issue',{exact:true})}).waitFor();await click(page,'← Stock');
      await page.getByRole('button',{name:/Stock Operations/}).waitFor();
    }
    if(fixture&&role!=='driver'){
      await page.goto(site+'/stock-v2-purchase-orders');
      await click(page,'New Purchase Order');
      const product=page.getByRole('textbox',{name:'Product 1',exact:true});
      await product.click();
      for(const name of ['Urea · kg','Mineral spray oil · L','Maize seed · kg','Gear Oil · L','Petrol · L','Salt · kg'])
        await page.getByRole('button',{name,exact:true}).waitFor();
      for(const name of ['Service filter · each','Tractor hire · L'])
        assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
      if(role==='buyer'||role==='admin'){
        await page.goto(site+'/stock-v2-purchase-orders?from=job-card&job=service-card&owner=JS');
        await page.getByText('Job Card 11',{exact:true}).waitFor();
        await product.click();
        await page.getByRole('button',{name:'Service filter · each',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Urea · kg',exact:true}).count(),0);
        assert.equal(await page.getByRole('button',{name:/New Product for line/}).count(),0);
      }
    }
    if(fixture&&role==='driver'){
      await page.goto(site+'/town-trips?view=history');await click(page,'Open Trip 3');await click(page,'Update collection');
      const unavailable=page.getByRole('button',{name:'Could not collect',exact:true});assert(await unavailable.isDisabled());
      await page.getByRole('textbox',{name:'Collection note',exact:true}).fill('Supplier was closed');await unavailable.click();
      await page.getByText('Collection status saved.',{exact:true}).waitFor();await page.getByText('Supplier was closed',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Finalise trip',exact:true}).count(),0);
    }
    if(fixture&&role==='admin'){
      await page.goto(site+'/town-trips');await click(page,'Add New Trip');
      const tripDate=page.getByRole('textbox',{name:'Trip date (dd/mm/yyyy)',exact:true});
      await tripDate.fill('20/11/2026');await page.getByRole('textbox',{name:'Driver',exact:true}).click();await click(page,'Assigned driver');
      await page.getByRole('textbox',{name:'Add purchase order',exact:true}).click();await click(page,'PO-24 · Screen supplier · Cash on collection');
      await click(page,'Assign trip');await page.getByText('Town Trip 2 saved.',{exact:true}).waitFor();
      assert(await page.getByRole('button',{name:'Finalise trip',exact:true}).isDisabled());
      assert.equal(await page.getByRole('button',{name:'Update collection',exact:true}).count(),0);
      await click(page,'Edit trip');await tripDate.fill('21/11/2026');await click(page,'Save changes');
      await page.getByText('Trip 2 · 21/11/2026',{exact:true}).waitFor();
      await click(page,'← Historical Trips');await click(page,'Open Trip 1');await click(page,'Finalise trip');await click(page,'Confirm finalisation');
      await page.getByText('Town Trip 1 finalised.',{exact:true}).waitFor();
      await page.goto(site+'/stock-v2-po-receiving');
      await page.getByRole('textbox',{name:'Stock owner',exact:true}).click();await click(page,'C73 (0)');
      await page.getByRole('textbox',{name:'Supplier',exact:true}).click();await click(page,'Delivered supplier');
      assert.equal(await page.getByRole('textbox',{name:'Document type',exact:true}).inputValue(),'Invoice GRV');
      await page.goto(site+'/outstanding-issues');await click(page,'Correct receipt 72');
      await page.getByText('This invoice retains its linked supplier credit.',{exact:true}).waitFor();
      assert.equal(await page.getByPlaceholder('Enter document number').inputValue(),'OLD-72');
      await page.getByPlaceholder('Enter document number').fill('CORRECTED-72');
      await page.getByText('Submit invoice for verification',{exact:true}).click();
      await page.getByText('GRV submitted for admin verification.',{exact:true}).waitFor();
      await page.goto(site+'/buying');await click(page,'Verify Receipts');await click(page,'Review receipt');
      await page.getByText('FILTER-A · 2 invoiced × 12',{exact:true}).waitFor();
      await click(page,'Verify and post receipt');
      await page.getByText('Receipt verified and posted.',{exact:true}).waitFor();
      await page.getByText('No receipts awaiting verification.',{exact:true}).waitFor();
      await page.goto(site+'/stock-v2-grv-outstanding');
      await page.getByRole('textbox',{name:'Stock owner',exact:true}).click();await click(page,'C73 (1)');
      await page.getByRole('textbox',{name:'Supplier — outstanding D-Notes',exact:true}).click();await click(page,'Delivered supplier');
      await page.getByPlaceholder('d/m (year optional)').fill('20/11/2026');
      await page.getByPlaceholder('Invoice number').fill('AUDIT-73');await page.getByText('☐',{exact:true}).click();
      await page.getByPlaceholder('Required',{exact:true}).fill('12');
      await page.getByText('Submit invoice for verification',{exact:true}).click();
      await page.getByText('Receipt 73 submitted for Admin verification.',{exact:true}).waitFor();
      await page.route('**/stock-buying-development?job_cards=1',route=>route.fulfill({
        headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},json:{cards:[],can_create:true,can_main:true},
      }));
      await page.goto(site+'/job-cards?view=history');
      await page.getByText('No historical job cards.',{exact:true}).waitFor();
      await click(page,'← Job Cards');
      await click(page,'Outstanding Job Cards (0)');
      await page.getByText('No outstanding job cards.',{exact:true}).waitFor();
    }
    for(const key of readings[role])assert(received.has(key),role+' did not load '+key);
    await page.waitForLoadState('networkidle');
    assert.deepEqual(faults,[]);
    console.log('PASS',fixture?'display only':'authenticated',role,width+'px');
  } catch(error){
    throw Error(role+' '+width+'px at '+page.url()+': '+error.message);
  } finally {await context.close();}
}

module.exports={displayFixture,click};

if(require.main===module)(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BUYING_TEST_BROWSER||undefined,headless:true});
  try{for(const role of ['admin','buyer','stock','driver'])for(const width of [1366,390])await check(browser,role,width);}
  finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
