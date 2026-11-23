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
async function displayFixture(context,role){
  const user={id:'00000000-0000-4000-8000-000000000001',email:'screen@example.invalid',aud:'authenticated',user_metadata:{},app_metadata:{}};
  const session={user,access_token:'display-fixture-only',token_type:'bearer',refresh_token:'display-fixture-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600};
  const admin=role==='admin', buyer=admin||role==='buyer', stores=role==='stock', driver=role==='driver';
  const access={can_main:admin,is_admin:admin,is_stock:admin||stores,is_buyer:buyer,is_driver:driver};
  const cashEntry=(day,number)=>({id:'entry-'+number,entry_number:number,reference:'Test receipt '+number,entry_date:day,created_at:day+'T12:00:00Z',kind:'receipt',status:'confirmed',currency:'USD',account_id:'USD-account',amount:'5.00',narrative:'Test deposit '+number});
  const book={accounts:[],entries:[cashEntry('2026-11-10',1),cashEntry('2026-11-19',2)],notes:[],balances:[{currency:'USD',balance:'42.00'},{currency:'ZiG',balance:'5.00'}],
    trips:[],advances:[],tripInvoices:[],counterparties:[],expenses:[]};
  const lubricant={item_code:'LUBE',item_name:'Gear Oil',base_unit:'L',input_type:'Lubricants',input_category:'Lubricants',active:true,quantity:8,ao_quantity:0,owner_quantities:{JS:8,C73:3}};
  const petrol={...lubricant,item_code:'PET',item_name:'Petrol',input_type:'Fuel',input_category:'Fuel'};
  const mineral={...lubricant,item_code:'SPRAY',item_name:'Mineral spray oil',input_type:'Chemical',input_category:'Insecticide'};
  const oilLine={part_id:15,owner_code:'JS',item_code:'LUBE',item_name:'Gear Oil',quantity:5,unit:'L',unit_price:null,category_id:4,reserved:0,issued:0,available:8};
  const oilCard={id:'fixture-card',job_number:9,transaction_date:'2026-11-20',vehicle_name:'Screen test tractor',work_description:'Service oil',parts:[oilLine],purchase_orders:[]};
  const lookups={
    workflow_context:{access,documents:[],stocktakes:[],awaiting:0},supplier_list:{suppliers:[]},
    stock_setup:{owners:[{owner_code:'JS',owner_name:'JS',active:true}],contracts:[]},
    equipment_catalog:{rows:[{vehicle_id:2,vehicle_name:'Petrol bike',fuel_type:'PETROL'}]},chemical_actives:{rows:[]},
    snapshot:{issue_companies:[{owner_code:'JS',company_name:'JS Farm'},{owner_code:'C73',company_name:'Third company'}],items:[lubricant,petrol,mineral],sprays:[],documents:[],orders:[]},
    stock_access:{access},cash_book:book,
    cash_book_supplier_invoices:{invoices:[],creditOptions:[]},outstanding_issues:{counts:{},returned:[]},
    job_cards:{cards:[oilCard],suppliers:[{supplier_id:'61',supplier_name:'Screen supplier'},{supplier_id:'62',supplier_name:'Second supplier'}],can_create:buyer,can_buy:buyer||admin,can_main:admin,can_reserve:buyer||stores,
      vehicles:[{vehicle_id:11,vehicle_name:'Screen test tractor',vehicle_type_id:4,vehicle_type:'Tractor',type_code:'TRA',owner_name:'Screen owner',owner_code:'JS',catalogue_group:'vehicle'}],
      items:[{item_code:'FILTER-A',item_name:'Service filter',base_unit:'each',part_number:'F-12',category_ids:[3]},{...lubricant,stock_lubricant:true,part_number:null,category_ids:[4]},{...lubricant,item_code:'EMPTY',item_name:'Hydraulic oil',quantity:0,stock_lubricant:true,part_number:null,category_ids:[4]}],
      categories:[{category_id:3,catalogue_group:'vehicle',category_name:'Filters'},{category_id:4,catalogue_group:'vehicle',category_name:'Lubricants',stock_only:true},{category_id:5,catalogue_group:'vehicle',category_name:'Oils',stock_only:true}],traces:[]},
    job_asset_purchase_history:{rows:[{id:'1',item_code:'FILTER-A',item_name:'Service filter',part_number:'F-12',active:true,supplier_name:'Screen supplier',receipt:'GRV-1',document_date:'2026-11-20',unit_price:'12.00'}]},
    town_trips:{trips:[{id:'screen-trip',trip_number:1,trip_date:'2026-11-20',driver_name:'Test driver',orders:[],finalised_at:null}],drivers:[],orders:[],can_create:admin,can_report:driver,can_receive:!driver},
  };
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
    else if(req.method()==='POST'&&buyer&&u.pathname.endsWith('/stock-buying-development')&&
      ['create_job_card','edit_job_card','set_job_part_price'].includes(req.postDataJSON().action)){
      const {action,payload}=req.postDataJSON();
      const jobs=lookups.job_cards;
      const supplier=part=>{
        const record=jobs.suppliers.find(s=>s.supplier_id===part.price_supplier_id);
        assert(part.unit_price==null?!part.price_supplier_id:record);
        return record?.supplier_name??null;
      };
      if(action==='set_job_part_price'){
        const part=jobs.cards.flatMap(card=>card.parts).find(p=>p.part_id===payload.part_id);
        Object.assign(part,{unit_price:payload.unit_price,price_supplier_id:payload.price_supplier_id,price_supplier_name:supplier(payload)});
        response={success:true,result:{id:part.part_id}};
      }else{
        const card=action==='edit_job_card'?jobs.cards.find(c=>c.id===payload.id):{id:'priced-card',job_number:10,purchase_orders:[]};
        Object.assign(card,payload,{vehicle_name:'Screen test tractor',revision:'2',parts:payload.parts.map((part,i)=>({...part,part_id:21+i,item_name:'Service filter',unit:'each',reserved:0,issued:0,price_supplier_name:supplier(part)}))});
        if(action==='create_job_card')jobs.cards.push(card);
        response={success:true,result:{id:card.id,job_number:card.job_number}};
      }
    }
    else if(req.method()==='POST'&&stores&&u.pathname.endsWith('/stock-buying-development')){
      const body=req.postDataJSON();
      assert.equal(body.part_id,oilLine.part_id);
      if(body.action==='reserve_job_part'){oilLine.reserved+=body.quantity_delta;oilLine.available-=body.quantity_delta;}
      else if(body.action==='issue_job_part'){oilLine.issued+=body.quantity;oilLine.reserved-=body.quantity;}
      else throw Error('Unexpected Stores action '+body.action);
      response={success:true,result:{part_id:oilLine.part_id}};
    }
    else if(req.method()==='POST'&&u.pathname.endsWith('/stock-buying-development')&&admin){
      const {action,payload}=req.postDataJSON();
      if(action==='cash_book_quick_note'){
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
  await page.getByRole('button').filter({has:page.getByText(name,{exact:true})}).last().click({timeout:20000});
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
  page.on('pageerror', error => faults.push(error.message));
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
      await Promise.all([page.waitForResponse(r=>r.url().includes('outstanding_issues=')&&r.ok()),click(page,'Outstanding Issues')]);
      await click(page,'← Stock');
    }
    if(role!=='driver'){
      await click(page,'Job Cards');
      await click(page,'Historical Job Cards');
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
          await click(page,'← Historical Job Cards');
        }
        await click(page,'← Job Cards');
      }
      await click(page,'← Stock');
    }
    await click(page,'Town Trips');
    if(role==='driver')assert.equal(await page.getByText('Add New Trip',{exact:true}).count(),0);
    await click(page,'View Historical Trips');
    if(fixture)await page.getByText(/Trip 1.+Outstanding/).waitFor();
    if(fixture&&role==='stock'){
      await page.goto(site+'/stock-test?operation=Direct%20Issue');
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
      await click(page,'Job Card 9 · Screen test tractor');
      await click(page,'Manage reservation');
      const qty=page.getByRole('textbox',{name:'Quantity',exact:true});
      await qty.fill('5');await click(page,'Reserve');
      await page.getByText('5 L reserved · 0 L issued',{exact:true}).waitFor();
      await click(page,'Manage reservation');
      await qty.fill('3');await click(page,'Issue reserved stock');
      await page.getByText('2 L reserved · 3 L issued',{exact:true}).waitFor();
    }
    for(const key of readings[role])assert(received.has(key),role+' did not load '+key);
    await page.waitForLoadState('networkidle');
    assert.deepEqual(faults,[]);
    console.log('PASS',fixture?'display only':'authenticated',role,width+'px');
  } finally {await context.close();}
}

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BUYING_TEST_BROWSER||undefined,headless:true});
  try{for(const role of ['admin','buyer','stock','driver'])for(const width of [1366,390])await check(browser,role,width);}
  finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
