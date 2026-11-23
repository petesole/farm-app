// Verify physical row and column positions in the rendered development web build.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {displayFixture, click} = require('./buying-development-browser.cjs');

const site = process.env.BUYING_TEST_URL || 'https://jspl-farmingmain--development.expo.app';
const input = (page, label, index=0) => page.getByRole('textbox',{name:label,exact:true}).nth(index);
const button = (page, label, index=0) => page.getByRole('button',{name:label,exact:true}).nth(index);
const title = (page, label) => page.getByText(label,{exact:true}).first();
async function bounds(locator) {
  await locator.waitFor({state:'attached'});
  const box=await locator.boundingBox();
  assert(box,'Expected a rendered control');
  return box;
}
function near(actual,expected,description) {
  assert(Math.abs(actual-expected)<=2,description+' was '+actual+', expected '+expected);
}
async function sameRow(controls,label) {
  const boxes=await Promise.all(controls.map(bounds));
  for(const box of boxes)near(box.y,boxes[0].y,label+' top');
  return boxes;
}
async function checkLines(page,labels,first,second) {
  const a=await sameRow(first,'first '+labels[0]+' line');
  const b=await sameRow(second,'second '+labels[0]+' line');
  assert(b[0].y>a[0].y);
  for(let i=0;i<a.length;i++){
    near(b[i].x,a[i].x,labels[0]+' column '+i);
    if(labels[i])near((await bounds(title(page,labels[i]))).x,a[i].x,labels[i]+' heading');
  }
  // Locate the common horizontal scroll surface and check both rows move with the headings.
  const scroll=await first[0].evaluateHandle(el=>{
    for(let p=el.parentElement;p;p=p.parentElement)
      if(/auto|scroll/.test(getComputedStyle(p).overflowX))return p;
    throw Error('Missing horizontal line table');
  });
  const {moved,maxScroll}=await scroll.evaluate(el=>{const start=el.scrollLeft;el.scrollLeft=el.scrollWidth;return {moved:el.scrollLeft-start,maxScroll:el.scrollLeft};});
  if(page.viewportSize().width===390)assert(maxScroll>0,'Phone must allow access to later columns');
  for(const row of [first,second])near((await bounds(row[0])).x,a[0].x-moved,'scrolled line');
  near((await bounds(title(page,labels[0]))).x,a[0].x-moved,'scrolled heading');
  await scroll.evaluate(el=>{el.scrollLeft=0;});await scroll.dispose();
}
async function checkReceiptGrid(page,header) {
  const row=title(page,header).locator('..');
  const data=row.locator('xpath=following-sibling::*[1]');
  const heads=row.locator(':scope > *'),cells=data.locator(':scope > *');
  assert.equal(await heads.count(),await cells.count());
  for(let i=0;i<await heads.count();i++){
    const [h,c]=await Promise.all([bounds(heads.nth(i)),bounds(cells.nth(i))]);
    near(c.x,h.x,header+' column '+i);near(c.width,h.width,header+' width '+i);
  }
}
const assets=new Map();
async function run(browser,width) {
  const context=await browser.newContext({viewport:{width,height:900}});
  await displayFixture(context,'admin');
  // Playwright disables the normal browser cache when the test intercepts API calls.
  // Reuse the exact versioned images, fonts and bundle fetched from this build.
  await context.route(url=>url.origin===new URL(site).origin&&/^(\/assets\/|\/_expo\/static\/)/.test(url.pathname),async route=>{
    const url=route.request().url();
    if(!assets.has(url))assets.set(url,(async()=>{
      const response=await route.fetch();
      const resource={status:response.status(),contentType:response.headers()['content-type'],body:await response.body()};
      await response.dispose();return resource;
    })().catch(error=>{assets.delete(url);throw error;}));
    const resource=await assets.get(url);
    if(resource.status!==200)assets.delete(url);
    await route.fulfill(resource);
  });
  const sheet={sheet_id:1,take_date:'2026-11-20',take_number:'S-1',groups:['chemical'],status:'draft',version:1};
  const sample={item_code:'COUNT-1',item_name:'Long stock product description',category:'Chemical',hs:12,ao:14};
  await context.route('**/stock-buying-development?combined_stocktake_*',route=>{
    const k=new URL(route.request().url()).searchParams;
    const data=k.has('combined_stocktake_groups')?{groups:[],is_admin:true,can_print:false}:
      k.has('combined_stocktake_lines')?{sheet,rows:[sample],is_admin:true,can_print:false}:{rows:[sheet]};
    return route.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},json:data});
  });
  await context.route('**/functions/v1/stock-v2-credits',route=>route.fulfill({
    headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},
    json:{returns:[{document_id:7,document_number:'RET-7',document_date:'2026-11-20',owner_code:'JS',supplier_name:'Credit supplier',
      lines:[{line_id:70,item_code:'PET',item_name:'Petrol',quantity:5,credited_quantity:0,agreed_price:3}]}]},
  }));
  const page=await context.newPage();page.setDefaultTimeout(30000);
  try {
    await page.goto(site+'/login');
    await page.getByPlaceholder('email@example.com').fill('screen@example.invalid');
    await page.getByPlaceholder('password',{exact:true}).fill('display-fixture-only');
    await title(page,'Sign In').click();
    await page.waitForURL(url=>!url.pathname.endsWith('/login'));
    await page.goto(site+'/stock-dashboard');
    const tiles=await Promise.all(['Stock Operations','Buying','Cash Book','Town Trips','Job Cards'].map(label=>bounds(page.getByRole('button').filter({has:title(page,label)}))));
    for(const a of tiles)for(const b of tiles){if(Math.abs(a.y-b.y)<2)near(a.height,b.height,'dashboard tile height');}
    await page.goto(site+'/job-cards');await click(page,'New Job Card');await click(page,'+ Add line');
    await input(page,'Unit price 1').fill('5');await input(page,'Unit price 2').fill('7');
    const parts=i=>[input(page,'Category '+i),input(page,'Part '+i),input(page,'Qty '+i),input(page,'Unit price '+i),
      input(page,'Supplier for price '+i),button(page,'Details',i-1),button(page,'Remove',i-1)];
    await checkLines(page,['Category','Part','Qty','Unit price','Supplier'],parts(1),parts(2));
    await input(page,'Category 1').click();await sameRow(parts(1),'open dropdown');await sameRow(parts(2),'next line');
    await page.goto(site+'/job-cards?view=outstanding&card=service-card');await click(page,'Edit unit price');
    await sameRow([input(page,'Unit price'),input(page,'Supplier for price'),button(page,'Save price'),button(page,'Cancel')],'Job Card saved price');
    await page.goto(site+'/home/stock-v2-credits');await input(page,'Supplier').click();await click(page,'Credit supplier');
    await title(page,'Credit Returned Stock').click();await title(page,'☐ RET-7 · Petrol').click();
    await sameRow([input(page,'Quantity'),input(page,'Actual credit $/unit'),button(page,'Remove')],'supplier credit');
    await page.goto(site+'/stock-v2-purchase-orders');await click(page,'New Purchase Order');await click(page,'Add product');
    const order=i=>[input(page,'Product '+i),input(page,'Quantity',i-1),input(page,'Unit price (optional)',i-1),button(page,'Remove line',i-1)];
    await checkLines(page,['Product','Quantity','Unit price (optional)'],order(1),order(2));
    await page.goto(site+'/cashbook');await click(page,'New Payment');await click(page,'Allocate to a Job Card');await click(page,'Allocate to a Job Card');
    const expense=i=>[input(page,'Job Card expense',i),input(page,'Allocated amount',i),button(page,'Remove',i)];
    await checkLines(page,['Job Card expense','Allocated amount'],expense(0),expense(1));
    await page.goto(site+'/cashbook?view=history');
    await sameRow([input(page,'Date from'),input(page,'Date to')],'Cash Book date range');
    await input(page,'Date from').fill('31/2');await input(page,'Date to').focus();
    await sameRow([input(page,'Date from'),input(page,'Date to')],'invalid date range');
    await page.goto(site+'/stock-v2-stocktake?sheetId=1&view=input');
    await input(page,'HS COUNT-1').waitFor();await checkReceiptGrid(page,'Pastel Code');
    const [hs,ao]=await sameRow([input(page,'HS COUNT-1'),input(page,'AO COUNT-1')],'stocktake count');
    assert(hs.x+hs.width<=ao.x,'HS entry overlaps AO');
    await page.goto(site+'/stock-v2-grv-outstanding');
    await input(page,'Stock owner').click();await click(page,'C73 (1)');
    await input(page,'Supplier — outstanding D-Notes').click();await click(page,'Delivered supplier');
    await page.getByPlaceholder('d/m (year optional)').fill('20/11/2026');await page.getByPlaceholder('Invoice number').fill('ALIGN');
    await checkReceiptGrid(page,'D Note #');
    await page.goto(site+'/stock-v2-po-receiving');await input(page,'Stock owner').click();await click(page,'C73 (0)');
    await input(page,'Supplier').click();await click(page,'Delivered supplier');await checkReceiptGrid(page,'Ordered / Received');
    await page.goto(site+'/stock-test');await page.getByRole('button',{name:/Stock Balances/}).click();
    await button(page,'Active Details Add Active').click();await title(page,'+ Add Another Active').click();
    const ingredient=i=>[input(page,'Unit '+i),input(page,'Active ingredient '+i),input(page,'Quantity (g) '+i)];
    const first=await sameRow(ingredient(1),'active ingredient'),second=await sameRow(ingredient(2),'second active ingredient');
    first.forEach((cell,i)=>near(cell.x,second[i].x,'active ingredient column '+i));
    await page.goto(site+'/stock-test');await click(page,'Direct Issue');
    await input(page,'Stock owner').click();await click(page,'Third company');
    await title(page,'Select product ▾').click();await page.getByText(/^Petrol \(L\).*Available/).first().click();
    const quantity=input(page,'Quantity to issue PET'),equipment=input(page,'Petrol — Equipment');
    await sameRow([input(page,'Input Type 1'),quantity,equipment],'Direct Issue');
    const remove=quantity.locator('../..').locator(':scope > :last-child');
    const before=await Promise.all([quantity,equipment,remove].map(bounds));await quantity.fill('999');await title(page,'Exceeds available stock').waitFor();
    const after=await Promise.all([quantity,equipment,remove].map(bounds));
    for(let i=1;i<after.length;i++)near(after[i].x-after[0].x,before[i].x-before[0].x,'column during validation');
    await sameRow([input(page,'Input Type 1'),quantity,equipment],'Direct Issue during validation');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Page overflow at '+width);
    console.log('PASS line alignment',width+'px');
  } catch(error){throw Error(width+'px on '+page.url()+': '+error.message,{cause:error});}
  finally {await context.close();}
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BUYING_TEST_BROWSER||undefined});
  try{for(const w of [390,768,1366])await run(browser,w);}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
