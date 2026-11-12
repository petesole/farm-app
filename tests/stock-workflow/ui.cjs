const fs=require('fs'),Module=require('module'),assert=require('node:assert/strict');
const root=require('path').resolve(__dirname,'../..');
async function testUI(db,admin,stock){
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost'});
 global.window=dom.window;global.document=dom.window.document;Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.HTMLElement=dom.window.HTMLElement;global.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require(root+'/node_modules/react'),{createRoot}=require(root+'/node_modules/react-dom/client');const ts=require(root+'/node_modules/typescript');const oldLoad=Module._load;let actor=stock,routeParams={};const navigate=x=>{routing.push(x);routeParams=typeof x==='object'?x.params??{}:{}};
 const {edge}=require('./edge-harness.cjs');const storage=new Map();const routing=[];
 const native={StyleSheet:{create:x=>x},useWindowDimensions:()=>({width:1200,height:900}),Platform:{OS:'web'}};
 const Tabs=({children,initialRouteName})=>React.createElement('div',{'data-initial-route':initialRouteName},children);Tabs.Screen=({name,options})=>React.createElement('span',{'data-tab':name,'data-href':options?.href??''});
 for(const name of ['View','ScrollView','Text','Image','ActivityIndicator','Modal','Pressable','TextInput'])native[name]=({children,style,contentContainerStyle,onPress,onChangeText,onFocus,onBlur,accessibilityLabel,accessibilityRole,accessibilityState,keyboardType,editable,visible,disabled,...props})=>{
  if(name==='Modal'&&!visible)return null;
  if(name==='TextInput')return React.createElement('input',{value:props.value??'',placeholder:props.placeholder,'aria-label':accessibilityLabel,onChange:e=>onChangeText?.(e.target.value),onFocus,onBlur,disabled:editable===false});
  if(name==='Pressable')return React.createElement('button',{onClick:onPress,disabled,'aria-label':accessibilityLabel,role:accessibilityRole,'aria-checked':accessibilityState?.checked},children);
  if(name==='Image')return null;return React.createElement(name==='Text'?'span':'div',null,children);
 };
 Module._load=function(name,parent,isMain){
  if(name==='react-native')return native;
  if(name==='expo-router')return {useLocalSearchParams:()=>routeParams,Tabs,Redirect:({href})=>React.createElement('div',{'data-redirect':href}),useRouter:()=>({push:navigate,replace:navigate}),router:{push:navigate,replace:navigate},useFocusEffect:cb=>React.useEffect(cb,[cb])};
  if(name==='@/components/themed-text')return {ThemedText:native.Text};
  if(name==='@/components/themed-view')return {ThemedView:native.View};
  if(name==='@react-native-async-storage/async-storage')return {getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)};
  if(name==='@/supabase'||name==='../../../supabase'||name==='../../supabase')return {supabase:{rpc:async()=>({data:(await db.query('select role_name from public.app_user_role where user_id=$1',[actor])).rows.map(r=>r.role_name)}),auth:{signInWithPassword:async()=>({data:{user:{id:actor,email:'stock@test'}}}),signOut:async()=>{},getUser:async()=>({data:{user:{id:actor}}}),getSession:async()=>({data:{session:{access_token:'local',user:{id:actor}}}})}}};
  if(name.endsWith('.png'))return 1;
  if(name.startsWith('@/'))name=root+'/'+name.slice(2);
  return oldLoad.call(this,name,parent,isMain);
 };
 for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
 global.fetch=async(url,options={})=>{const name=String(url).includes('stock-v2-credits')?'stock-v2-credits':'stock-v2-demo-workflow';const query=String(url).includes('?')?'?'+String(url).split('?')[1]:'';const r=await edge(db,name,actor)(query,options.body?JSON.parse(options.body):undefined);return new Response(JSON.stringify(r.body),{status:r.status})};
 const mount=createRoot(document.getElementById('root'));const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const settle=async(fn)=>{await React.act(async()=>{fn?.();await sleep(80)});};
 const until=async(fn,label)=>{for(let n=0;n<50;n++){if(fn())return;await settle();}throw Error(label+'\n'+document.body.textContent)};
 const button=(label)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
 const click=async label=>{const b=button(label);assert(b,'Button '+label);await settle(()=>b.click());};
 const combo=async(label,choice)=>{const input=document.querySelector('input[aria-label="'+label+'"]');assert(input,'Combo '+label);await settle(()=>{input.blur();input.focus()});await click(choice);};
 const fill=async(label,value)=>{const input=document.querySelector('input[aria-label="'+label+'"]');assert(input,'Field '+label);await settle(()=>{const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});};
 const render=async name=>{const C=require(root+'/app/(tabs)/home/'+name+'.tsx').default;await settle(()=>mount.render(React.createElement(C)));};
 await render('stock-v2-purchase-orders');await until(()=>button('New Purchase Order')&&!button('New Purchase Order').disabled,'Stock context loaded');await click('New Purchase Order');
 await combo('Stock owner','JS · JS');await combo('Supplier','Supplier A');await combo('Product 1','Test input · kg');await fill('Quantity','7');await fill('Unit price (optional)','15');await click('Submit for Approval');
 await until(()=>document.body.textContent.includes('PO submitted for Admin approval'),'PO visible after submit');assert(!document.querySelector('input[aria-label="Quantity"]'),'PO editor closes after confirmed save');
 console.log('PASS UI Stock enters and submits PO, closes and refreshes list');
 actor=admin;await render('stock-v2-approvals');await until(()=>document.body.textContent.includes('awaiting approval'),'Approval queue loaded');await combo('Document type','Purchase orders');await click('Review');await click('Edit PO');assert(routing.at(-1).params.edit,'Direct edit route includes PO reference');await render('stock-v2-purchase-orders');await until(()=>document.querySelector('input[aria-label="Quantity"]'),'PO editor loaded from approval queue');await fill('Quantity','8');await click('Save Changes');await until(()=>routing.at(-1)==='/stock-v2-approvals','Edited PO returns to approvals');console.log('PASS Approval queue opens PO editor and saves back to pending queue');
 await render('stock-v2-approvals');await until(()=>button('Review'),'Pending PO refreshed');await click('Review');await click('Approve PO');await until(()=>button('View Approved POs'),'Admin approval confirmed');console.log('PASS UI Admin reviews and approves PO');await click('View Approved POs');assert.equal(routing.at(-1).params.status,'approved');console.log('PASS Approval handoff links directly to approved orders');
 actor=stock;await render('stock-v2-purchase-orders');await until(()=>button('Finalise Order'),'Approved PO visible for Stock');await click('Finalise Order');await until(()=>document.body.textContent.includes('PO finalised'),'Finalised PO refreshed');assert(!button('Finalise Order'),'Finalise button removed after completion');console.log('PASS UI Stock finalises approved PO and refreshes list');
 const latest=(await db.query(`select a.* from stock_v2.approval_document a where a.kind='po' order by request_number desc limit 1`)).rows[0];assert.equal(latest.status,'applied');assert(latest.target_order_id);

 const receiving=await edge(db,'stock-v2-demo-workflow',stock)();assert.equal(receiving.status,200);assert(receiving.body.orders.some(o=>Number(o.order_id)===Number(latest.target_order_id)),'Finalised PO available to receiving');console.log('PASS Finalised PO appears in existing receiving feed');
 const {stockMutation,recoverStockSave,stockUUID}=require(root+'/utils/stock-workflow.ts');
 const retryPayload={action:'workflow_command',command:'submit',data:{id:stockUUID(),kind:'po',payload:{owner_code:'JS',supplier:'Supplier A',order_date:'2026-11-12',lines:[{item_code:'ITEM1',quantity:3,unit_price:15}]}}};
 const normalFetch=global.fetch;let lost=true;global.fetch=async(...args)=>{const result=await normalFetch(...args);if(lost&&args[1]?.method==='POST'){lost=false;throw Error('Simulated response lost after commit')}return result};
 await assert.rejects(()=>stockMutation('lost-response',retryPayload),/response lost/);const countBefore=(await db.query('select count(*) as n from stock_v2.approval_document')).rows[0].n;
 const recovered=await recoverStockSave('lost-response');assert.equal(recovered.result.status,'pending');assert.equal((await db.query('select count(*) as n from stock_v2.approval_document')).rows[0].n,countBefore);console.log('PASS Lost response is verified without duplicate posting');
 global.fetch=normalFetch;
 const poLine=receiving.body.orders.find(o=>Number(o.order_id)===Number(latest.target_order_id));
 const receivingBody={action:'multi_po_dnote',payload:{owner_code:'JS',supplier:'Supplier A',delivery_note:'DN-UI-RECEIVE',receipt_date:'2026-11-12',lines:[{order_line_id:poLine.order_line_id,quantity:3,unit_price:15}]}};
 const received=await stockMutation('receiving-test',receivingBody);assert(received.result.document_id,'Finalised PO receives through existing D-Note routine');console.log('PASS Existing D-Note receiving routine accepts a finalised PO');

 actor=stock;routeParams={};await render('stock-v2-owner-transactions');await until(()=>document.querySelector('input[aria-label="From stock owner"]')?.value.includes('JS'),'Transfer owners loaded');
 await combo('From stock owner','AO · AO');assert.equal(document.querySelector('input[aria-label="To stock owner"]').value,'JS · JS');
 await combo('From stock owner','JS · JS');assert.equal(document.querySelector('input[aria-label="To stock owner"]').value,'AO · AO');
 const ownerData=await edge(db,'stock-v2-demo-workflow',stock)('?owner_workflow=1');const transferItem=ownerData.body.balances.find(b=>b.owner_code==='JS'&&b.item_code==='ITEM1');assert(transferItem&&Number(transferItem.quantity)>0);
 await combo('Product 1','Test input · '+Number(transferItem.quantity).toLocaleString('en-GB')+' kg');await fill('Quantity','1');await click('Confirm transfer');await click('Save Stock Transfer');await until(()=>document.body.textContent.includes('Both owner balances have been updated'),'Transfer saved');console.log('PASS Transfer combos exclude same owner and post non-demo catalogue stock');
 await db.exec("update stock_v2.item set input_type='Chemical',input_category='Herbicide',category='91' where item_code='ITEM1';update stock_v2.item set input_type='Fertilizer',input_category='Nutrient',category='86' where item_code='ITEM2'");
 await render('stock-v2-stocktake');await until(()=>document.querySelector('[aria-label="Stock group: Chemical"]'),'Stocktake groups loaded');
 await settle(()=>document.querySelector('[aria-label="Stock group: Chemical"]').click());await settle(()=>document.querySelector('[aria-label="Stock group: Fertilizer"]').click());
 assert.equal(document.querySelector('[aria-label="Count Test input"]').getAttribute('aria-checked'),'true');assert.equal(document.querySelector('[aria-label="Count Unpriced companion"]').getAttribute('aria-checked'),'true');
 await settle(()=>document.querySelector('[aria-label="Count Unpriced companion"]').click());assert.equal(document.querySelector('[aria-label="Count Unpriced companion"]').getAttribute('aria-checked'),'false');await settle(()=>document.querySelector('[aria-label="Count Unpriced companion"]').click());
 await click('Save & Preview Stock Sheet (2)');await until(()=>button('Print Stock Sheet'),'Saved sheet preview loaded');
 const html=document.querySelector('iframe[title="Stock sheet preview"]').getAttribute('srcdoc'),sheetDOM=new JSDOM(html);const sheetRows=[...sheetDOM.window.document.querySelectorAll('tbody tr')];assert.equal(sheetRows.length,2);assert.deepEqual(sheetRows.map(r=>r.children[2].textContent),['Herbicide','Nutrient']);assert(sheetRows.every(r=>r.children[5].textContent===''));sheetDOM.window.close();console.log('PASS Stocktake group/item checkboxes produce category-sorted blind count sheet');
 let prints=0;const oldAppend=document.body.appendChild.bind(document.body);document.body.appendChild=function(node){const r=oldAppend(node);if(node.tagName==='IFRAME'){node.contentWindow.focus=()=>{};node.contentWindow.print=()=>{prints++};}return r};
 window.open=()=>{throw Error('Pop-ups must not be used')};await click('Print Stock Sheet');const printFrame=document.querySelector('iframe[title="Stock sheet print document"]');assert(printFrame);if(!prints)await settle(()=>printFrame.dispatchEvent(new window.Event('load')));assert.equal(prints,1);await settle(()=>printFrame.contentWindow.dispatchEvent(new window.Event('afterprint')));assert(!document.querySelector('iframe[title="Stock sheet print document"]'));document.body.appendChild=oldAppend;
 await click('Close Preview');assert.equal(document.querySelector('[aria-label="Stock group: Chemical"]').getAttribute('aria-checked'),'true');assert.equal(document.querySelector('[aria-label="Stock group: Fertilizer"]').getAttribute('aria-checked'),'true');console.log('PASS Stock sheet prints without pop-ups and Close Preview preserves selections');
 const Login=require(root+'/app/login.tsx').default;await settle(()=>mount.render(React.createElement(Login)));
 for(const [placeholder,text] of [['email@example.com','stock@test'],['password','test-only']]){const input=document.querySelector('input[placeholder="'+placeholder+'"]');await settle(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new window.Event('input',{bubbles:true}));});}
 await click('Sign In');assert.equal(routing.at(-1),'/(tabs)/stock-test');console.log('PASS Stock-only account reaches Stock after sign-in');
 const Layout=require(root+'/app/(tabs)/_layout.tsx').default;await settle(()=>mount.render(React.createElement(Layout)));await until(()=>document.querySelector('[data-initial-route]'),'Stock tabs admitted');assert.equal(document.querySelector('[data-initial-route]').getAttribute('data-initial-route'),'stock-test');assert.equal(document.querySelector('[data-tab="fuel"]').getAttribute('data-href'),'');assert.equal(document.querySelector('[data-tab="main-dashboard"]').getAttribute('data-href'),'');console.log('PASS Stock-only tabs admission does not grant Fuel or Main');
 actor=admin;await settle(()=>mount.render(React.createElement('div')));await settle(()=>mount.render(React.createElement(Layout)));await until(()=>document.querySelector('[data-initial-route]'),'Admin tabs admitted');assert.equal(document.querySelector('[data-initial-route]').getAttribute('data-initial-route'),'main-dashboard');console.log('PASS Existing Admin landing remains unchanged');
 await settle(()=>mount.unmount());Module._load=oldLoad;dom.window.close();return 14;
}
module.exports={testUI};
