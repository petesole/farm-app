const fs=require('fs'),Module=require('module'),assert=require('node:assert/strict');
const root=require('path').resolve(__dirname,'../..');
async function testUI(db,admin,stock){
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost'});
 global.window=dom.window;global.document=dom.window.document;Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.HTMLElement=dom.window.HTMLElement;global.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require(root+'/node_modules/react'),{createRoot}=require(root+'/node_modules/react-dom/client');const ts=require(root+'/node_modules/typescript');const oldLoad=Module._load;let actor=stock;
 const {edge}=require('./edge-harness.cjs');const storage=new Map();const routing=[];
 const native={StyleSheet:{create:x=>x},useWindowDimensions:()=>({width:1200,height:900}),Platform:{OS:'web'}};
 for(const name of ['View','ScrollView','Text','Image','ActivityIndicator','Modal','Pressable','TextInput'])native[name]=({children,style,contentContainerStyle,onPress,onChangeText,onFocus,onBlur,accessibilityLabel,accessibilityRole,keyboardType,editable,visible,disabled,...props})=>{
  if(name==='Modal'&&!visible)return null;
  if(name==='TextInput')return React.createElement('input',{value:props.value??'',placeholder:props.placeholder,'aria-label':accessibilityLabel,onChange:e=>onChangeText?.(e.target.value),onFocus,onBlur,disabled:editable===false});
  if(name==='Pressable')return React.createElement('button',{onClick:onPress,disabled,'aria-label':accessibilityLabel},children);
  if(name==='Image')return null;return React.createElement(name==='Text'?'span':'div',null,children);
 };
 Module._load=function(name,parent,isMain){
  if(name==='react-native')return native;
  if(name==='expo-router')return {useRouter:()=>({push:x=>routing.push(x),replace:x=>routing.push(x)}),router:{push:x=>routing.push(x),replace:x=>routing.push(x)},useFocusEffect:cb=>React.useEffect(cb,[cb])};
  if(name==='@react-native-async-storage/async-storage')return {getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)};
  if(name==='@/supabase'||name==='../../../supabase')return {supabase:{auth:{getSession:async()=>({data:{session:{access_token:'local',user:{id:actor}}}})}}};
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
 const combo=async(label,choice)=>{const input=document.querySelector('input[aria-label="'+label+'"]');assert(input,'Combo '+label);await settle(()=>input.focus());await click(choice);};
 const fill=async(label,value)=>{const input=document.querySelector('input[aria-label="'+label+'"]');assert(input,'Field '+label);await settle(()=>{const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});};
 const render=async name=>{const C=require(root+'/app/(tabs)/home/'+name+'.tsx').default;await settle(()=>mount.render(React.createElement(C)));};
 await render('stock-v2-purchase-orders');await until(()=>button('New Purchase Order')&&!button('New Purchase Order').disabled,'Stock context loaded');await click('New Purchase Order');
 await combo('Stock owner','JS · JS');await combo('Supplier','Supplier A');await combo('Product 1','Test input · kg');await fill('Quantity','7');await fill('Unit price (optional)','15');await click('Submit for Approval');
 await until(()=>document.body.textContent.includes('PO submitted for Admin approval'),'PO visible after submit');assert(!document.querySelector('input[aria-label="Quantity"]'),'PO editor closes after confirmed save');
 console.log('PASS UI Stock enters and submits PO, closes and refreshes list');
 actor=admin;await render('stock-v2-approvals');await until(()=>document.body.textContent.includes('awaiting approval'),'Approval queue loaded');await combo('Document type','Purchase orders');await click('Review');await click('Approve PO');await until(()=>document.body.textContent.includes('Approved. Credits'),'Admin approval confirmed');console.log('PASS UI Admin reviews and approves PO');
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
 await settle(()=>mount.unmount());Module._load=oldLoad;dom.window.close();return 6;
}
module.exports={testUI};
