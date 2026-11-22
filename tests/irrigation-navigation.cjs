const fs=require("fs"),path=require("path"),assert=require("node:assert/strict"),Module=require("module");
const root=path.resolve(__dirname,".."),ts=require(root+"/node_modules/typescript"),original=Module._load;
for(const ext of [".ts",".tsx"])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const {JSDOM}=require("./stock-workflow/node_modules/jsdom");
const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"});
global.window=dom.window;global.document=dom.window.document;
Object.defineProperty(global,"navigator",{value:dom.window.navigator,configurable:true});
global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require(root+"/node_modules/react"),{createRoot}=require(root+"/node_modules/react-dom/client");
let roles=["admin"],signedIn=true,queryError=false,roleError=false,width=1000,params={},routes=[];
const traces=[
 {tracecode_id:1,tracecode_name:"HSCP1",crop_id:10,crop:{crop_name:"Maize"},end_date:null},
 {tracecode_id:2,tracecode_name:"SP3",crop_id:20,crop:{crop_name:"Potatoes"},end_date:null},
 {tracecode_id:3,tracecode_name:"DLW1",crop_id:10,crop:{crop_name:"Maize"},end_date:null},
 {tracecode_id:4,tracecode_name:"Closed",crop_id:10,crop:{crop_name:"Maize"},end_date:"2026-10-01"},
 {tracecode_id:5,tracecode_name:"NoCrop",crop_id:null,crop:null,end_date:null},
];
const cached=[{tracecode_id:1,last_irrigation_date:"2026-11-16",daily_req:6,acc_req:17,net_mm:12,next_app:null,next_app_mm:null}];
const applied=[{irrigation_applied_id:11,tracecode_id:1,applied_date:"2026-11-16",mm_applied:20}];
const pans=[{irrigation_pan_id:1,irrigation_pan_date:"2026-11-17",irrigation_pan_reading:7},{irrigation_pan_id:2,irrigation_pan_date:"2026-11-18",irrigation_pan_reading:8}];
const client={
 auth:{getUser:async()=>({data:{user:signedIn?{id:"test"}:null},error:null})},
 rpc:async name=>{assert.equal(name,"my_farm_app_roles");return {data:roles,error:roleError?{message:"Denied"}:null};},
 from:table=>{
  let filters=[],single=false;
  const q={
   select:()=>q,
   not:(key,operator,value)=>{if(operator==="is"&&value===null)filters.push(x=>x[key]!=null);return q;},
   is:(key,value)=>{filters.push(x=>x[key]===value);return q;},
   eq:(key,value)=>{filters.push(x=>String(x[key])===String(value));return q;},
   in:(key,values)=>{filters.push(x=>values.map(String).includes(String(x[key])));return q;},
   order:()=>q,limit:()=>q,single:()=>{single=true;return q;},
   insert:()=>Promise.resolve({error:null}),
   then:(yes,no)=>{const data=(table==="tracecode"?traces:table==="irrigation_dashboard_cache"?cached:
     table==="irrigation_applied"?applied:table==="irrigation_pan"?pans:[]);
     const found=data.filter(x=>filters.every(f=>f(x)));
     return Promise.resolve({data:single?found[0]:found,error:queryError?{message:"Irrigation unavailable"}:null}).then(yes,no);
   },
  };
  return q;
 }
};
const native={StyleSheet:{create:x=>x},useWindowDimensions:()=>({width,height:900}),Alert:{alert(){}}};
for(const name of ["View","ScrollView","Text","Pressable","TextInput","Image","ActivityIndicator","RefreshControl"]){
 native[name]=({children,onPress,onChangeText,value,disabled,placeholder,...props})=>
  name==="TextInput"?React.createElement("input",{value:value??"",onChange:e=>onChangeText(e.target.value),placeholder,disabled}):
  name==="Pressable"?React.createElement("button",{onClick:onPress,disabled},children):
  name==="Image"?React.createElement("img",{alt:"JSPL Logo"}):
  React.createElement(name==="Text"?"span":"div",{},children);
}
native.FlatList=({data,renderItem,ListHeaderComponent,ListEmptyComponent})=>
 React.createElement("div",{},ListHeaderComponent,...data.map((item,index)=>
  React.createElement(React.Fragment,{key:index},renderItem({item,index}))),data.length?null:ListEmptyComponent);
const Picker=({selectedValue,onValueChange,children})=>React.createElement("select",{value:selectedValue,onChange:e=>onValueChange(e.target.value)},children);
Picker.Item=({label,value})=>React.createElement("option",{value},label);
const navigate=route=>{routes.push(route);if(typeof route==="object")params=route.params??{}};
Module._load=function(n,p,m){
 if(n==="react-native")return native;
 if(n==="@react-native-picker/picker")return {Picker};
 if(n==="@/supabase")return {supabase:client};
 if(n==="@react-navigation/native")return {useFocusEffect:cb=>React.useEffect(cb,[cb])};
 if(n==="expo-router")return {router:{push:navigate,replace:navigate},useLocalSearchParams:()=>params,
   usePathname:()=>"/irrigation_main_dashboard",Redirect:({href})=>React.createElement("div",{"data-redirect":href})};
 if(n==="@react-native-async-storage/async-storage")return {getItem:async()=>null};
 if(n.endsWith(".png"))return 1;
 return original.call(this,n.startsWith("@/")?root+"/"+n.slice(2):n,p,m);
};
let passed=0;
function check(ok,label){assert(ok,label);passed++;console.log("PASS "+label);}
const mount=createRoot(document.getElementById("root"));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const settle=async fn=>React.act(async()=>{fn?.();await sleep(40);});
async function until(fn,msg){for(let i=0;i<80;i++){if(fn())return;await settle();}throw Error(msg+"\n"+document.body.textContent);}
const button=s=>[...document.querySelectorAll("button")].find(b=>b.textContent===s);
const click=async s=>{check(!!button(s),"Button exists: "+s);await settle(()=>button(s).click());};
async function render(filename){await settle(()=>mount.render(null));const C=require(root+"/"+filename+".tsx").default;await settle(()=>mount.render(React.createElement(C)));}
(async()=>{try{
 const access=require(root+"/utils/irrigation-access.ts");
 check(access.irrigationRole(await access.verifiedIrrigationRoles(client))==="admin","Admin verified");
 signedIn=false;
 check((await access.verifiedIrrigationRoles(client)).length===0,"No cached role access if signed out");
 signedIn=true;
 await render("app/(tabs)/irrigation_main_dashboard");
 await until(()=>button("Open")&&button("View Pan Readings"),"Dashboard loads");
 check(document.body.textContent.includes("HSCP1")&&document.body.textContent.includes("SP3")&&document.body.textContent.includes("DLW1"),"All open crop traces appear");
 check(!document.body.textContent.includes("Closed")&&!document.body.textContent.includes("NoCrop"),"No-ended crop rule excludes closed/uncropped");
 check(document.querySelectorAll("select").length===2,"Crop and Trace dropdowns");
 check(!button("Save Pan"),"No inline pan entry on dashboard");
 const selects=[...document.querySelectorAll("select")];
 await settle(()=>{selects[0].value="20";selects[0].dispatchEvent(new window.Event("change",{bubbles:true}));});
 check(document.body.textContent.includes("SP3")&&!document.body.textContent.includes("HSCP1"),"Crop selection filters trace list");
 check([...document.querySelectorAll("select")][1].options.length===2,"Trace options depend on crop");
 await click("View Pan Readings");
 check(routes.at(-1)==="/(tabs)/home/irrigation/pan-readings","Pan history is separate route");
 await render("app/(tabs)/home/irrigation/pan-readings");
 await until(()=>button("Add Pan Reading"),"Pan history loads");
 check(document.body.textContent.includes("Pan reading (mm)"),"Pan history table has dated readings");
 await click("Add Pan Reading");
 check(routes.at(-1)==="/(tabs)/home/irrigation/pan-reading-add","Add pan is dedicated route");
 await render("app/(tabs)/home/irrigation/pan-reading-add");
 await until(()=>button("Save Pan Reading"),"Pan entry loads");
 check(!!button("Back to Pan Readings"),"Pan add returns to history");
 roles=["irrigation"];
 await render("app/(tabs)/irrigation_main_dashboard");
 await until(()=>button("View Pan Readings"),"Irrigator dashboard");
 check(!button("Back to Main"),"Irrigator cannot use Main");
 roles=["viewer"];
 await render("app/(tabs)/home/irrigation/pan-readings");
 await until(()=>document.body.textContent.includes("access is not assigned"),"Unassigned user denied");
 check(!button("Add Pan Reading"),"Unassigned role cannot add pan");
 console.log(passed+" irrigation navigation checks passed");
 }finally{await settle(()=>mount.unmount());Module._load=original;dom.window.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
