// Run against the development site with dedicated, assigned test sign-ins.
// This checks the screens and their real backend reads without posting transactions.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const site = process.env.BUYING_TEST_URL || 'https://jspl-farmingmain--development.expo.app';
const readings = {
  admin: ['stock_access', 'cash_book', 'cash_book_supplier_invoices', 'outstanding_issues', 'job_cards', 'town_trips'],
  buyer: ['stock_access', 'job_cards', 'town_trips'],
  driver: ['stock_access', 'town_trips'],
};

async function click(page, name) {
  await page.getByRole('button').filter({has:page.getByText(name,{exact:true})}).last().click({timeout:20000});
}

async function check(browser, role, width) {
  const email = process.env['BUYING_TEST_'+role.toUpperCase()+'_EMAIL'];
  const password = process.env['BUYING_TEST_'+role.toUpperCase()+'_PASSWORD'];
  assert(email && password, 'Missing dedicated '+role+' test sign-in');
  const context = await browser.newContext({viewport:{width,height:850}});
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
    await click(page,'Sign In');
    await page.waitForURL(url => !url.pathname.endsWith('/login'), {timeout:40000});
    await page.goto(site+'/stock-dashboard');
    if(role==='admin'){
      await click(page,'Cash Book');
      await click(page,'Quick Cash Out');
      await page.getByText('Payee',{exact:true}).first().waitFor();
      await page.goto(site+'/stock-dashboard');
      await Promise.all([page.waitForResponse(r=>r.url().includes('outstanding_issues=')&&r.ok()),click(page,'Outstanding Issues')]);
    }
    if(role!=='driver'){
      await page.goto(site+'/stock-dashboard');
      await click(page,'Job Cards');
      await click(page,'Historical Job Cards');
      if(role==='buyer'){
        await page.goto(site+'/job-cards');
        await click(page,'New Job Card');
        await page.getByText('Vehicle Type',{exact:true}).first().waitFor();
        await page.getByText('Transaction date',{exact:true}).first().waitFor();
        await page.getByText('Unit price',{exact:true}).first().waitFor();
      }
    }
    await page.goto(site+'/stock-dashboard');
    await click(page,'Town Trips');
    if(role==='driver')assert.equal(await page.getByText('Add New Trip',{exact:true}).count(),0);
    await click(page,'View Historical Trips');
    for(const key of readings[role])assert(received.has(key),role+' did not load '+key);
    assert.deepEqual(faults,[]);
    console.log('PASS',role,width+'px');
  } finally {await context.close();}
}

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BUYING_TEST_BROWSER||undefined,headless:true});
  try{for(const role of ['admin','buyer','driver'])for(const width of [1366,390])await check(browser,role,width);}
  finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
