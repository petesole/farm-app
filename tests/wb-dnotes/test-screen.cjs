const fs=require('node:fs'),Module=require('node:module'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost',pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
global.HTMLElement=dom.window.HTMLElement;global.Node=dom.window.Node;global.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);global.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);global.IS_REACT_ACT_ENVIRONMENT=true;
global.ShadowRoot=dom.window.ShadowRoot;global.Element=dom.window.Element;global.HTMLInputElement=dom.window.HTMLInputElement;
window.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
const repo=require('node:path').resolve(__dirname,'../..');
const requireRepo=Module.createRequire(repo+'/package.json');
const ts=requireRepo('typescript'),React=requireRepo('react'),{act}=React,{createRoot}=requireRepo('react-dom/client');
let rows=[],requests=new Map(),failure=null,saveCalls=0,latestRequest=null;
const raw=(id,dnote,wb=null)=>({expected_id:id,report_date:'2026-11-10',dnote,source:wb?'WB Computer':null,source_id:wb?'truck-'+wb:null,wb_slip:wb,crop_name:wb?'Wheat':null,movement_kind:wb?'HARVEST_IN':null,registration_text:wb?'ABC-1234':null,load_kg:wb?30000:null,tracecode_id:null,tracecode_name:null,allocation_kg:null,season_id:wb?19:null,wb_date:wb?'2026-11-10':null,missing:!wb,wb_match_count:wb?1:0});
rows=[raw(1,'2/1','84'),raw(2,'2/2')];
const mock={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},rpc:async(name,args)=>{
 if(name==='wb_admin_allowed')return {data:true,error:null};
 if(name==='wb_add_dnote_ranges'){
  saveCalls++;latestRequest=args;
  if(failure==='definitive')return {error:{code:'P0001',message:'D-Note 2/2 is already registered. Ranges must not overlap'},data:null};
  if(!requests.has(args.p_request_id)){
   requests.set(args.p_request_id,{request_id:args.p_request_id,note_date:args.p_date,ranges:args.p_ranges.map(r=>({end:r.end,start:r.start}))});
   for(const r of args.p_ranges){const [book,start]=r.start.split('/').map(Number),end=+r.end.split('/')[1];for(let i=start;i<=end;i++)rows.push({...raw(rows.length+1,`${book}/${i}`),report_date:args.p_date});}
  }
  if(failure==='timeoutCommitted')return {data:null,error:{message:'Network timeout'}};
  return {data:{request_id:args.p_request_id},error:null};
 }
 throw Error(name);
},from(table){
 const b={select(){return b},order(){return b},eq(key,value){b.id=value;return b},async range(){return {data:rows,error:null}},async maybeSingle(){return {data:requests.get(b.id)||null,error:null}},then(resolve,reject){return Promise.resolve({data:table==='season'?[{season_id:19,season_name:'Summer26'}]:[],error:null}).then(resolve,reject)}};return b;
}};
const original=Module._load;
Module._load=function(request,parent,isMain){
 if(request==='react-native')return requireRepo('react-native-web');
 if(request.endsWith('/supabase'))return {supabase:mock};
 if(request.includes('WbModuleHeader'))return {WbModuleHeader:()=>React.createElement('h1',null,'Daily DNotes')};
 if(request.includes('WbLastSync'))return {WbLastSync:()=>null};
 if(request.includes('WbAdminSignIn'))return {WbAdminSignIn:()=>null};
 return original.apply(this,arguments);
};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(module,filename)=>{module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);};
require.extensions['.png']=(module)=>{module.exports={uri:'data:image/png;base64,iVBORw0KGgo='};};
const Page=require(repo+'/app/weighbridge-daily-dnotes.tsx').default;
const root=createRoot(document.getElementById('root'));let checks=0;
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
async function click(text){const element=[...document.querySelectorAll('[role="button"],[role="tab"],button')].find(el=>el.textContent===text);assert.ok(element,'Button not found: '+text);await act(async()=>element.click());await flush();}
async function fill(label,value){const el=document.querySelector(`[aria-label="${label}"]`);assert.ok(el,'Input missing '+label);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}));});}
async function main(){
 await act(async()=>root.render(React.createElement(Page)));await flush();
 assert.ok(document.body.textContent.includes('2/2'));assert.ok(!document.body.textContent.includes('ABC-1234'));checks++;
 await click('Not missing');assert.ok(document.body.textContent.includes('ABC-1234'));checks++;
 await click('Add DNotes');await fill('D-Note date','10/11/2026');await fill('Line 1 D-Note start','2/3');await fill('Line 1 D-Note end','2/4');
 await click('+ Add line');await fill('Line 2 D-Note start','3/1');await fill('Line 2 D-Note end','3/2');
 await click('Save');assert.equal(saveCalls,1);assert.equal(latestRequest.p_ranges.length,2);assert.equal(document.querySelector('[aria-label="D-Note date"]'),null);checks++;
 await click('Missing');assert.ok(document.body.textContent.includes('2/3'));assert.ok(document.body.textContent.includes('3/2'));checks++;
 await click('Add DNotes');await fill('D-Note date','31/2/2026');await fill('Line 1 D-Note start','4/1');await fill('Line 1 D-Note end','4/2');await click('Save');assert.equal(saveCalls,1);assert.ok(document.querySelector('[aria-label="D-Note date"]'));checks++;
 await fill('D-Note date','10/11/2026');failure='definitive';await click('Save');assert.ok(document.body.textContent.includes('already registered'));assert.equal(document.querySelector('[aria-label="Line 1 D-Note start"]').value,'4/1');checks++;
 failure='timeoutCommitted';await click('Save');assert.equal(document.querySelector('[aria-label="D-Note date"]'),null);assert.ok(rows.some(r=>r.dnote==='4/1'));checks++;
 await act(async()=>root.unmount());console.log(`PASS: ${checks} rendered-screen checks: toggle, multi-book entry, saved modal closes/table refreshes, invalid date, preserved error input, committed-timeout verification.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{dom.window.close();});

