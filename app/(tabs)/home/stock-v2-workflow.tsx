import {useEffect,useMemo,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View,useWindowDimensions} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {parseJsplDateInput,displayJsplDate} from "@/utils/jspl-input";
import {JsplDashboardButton} from "@/components/jspl/JsplDashboardButton";
import {jsplColors,jsplSpacing,jsplRadii,formatJsplNumber} from "@/constants/jspl-design";

const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Item={item_code:string;item_name:string;base_unit:string;quantity:number};
type OrderLine={order_id:number;order_number:string;supplier_name:string;item_code:string;item_name:string;base_unit:string;ordered_quantity:number;received_quantity:number;ordered_unit_price:number|null;status:string};
type SprayLine={job_id:number;external_tracecode_id:number;tracecode_name:string;item_code:string;item_name:string;area_ha:number;rate_per_ha:number;planned_quantity:number;issued_quantity:number;status:string};
type Doc={document_id:number;document_type:string;document_number:string;item_name:string;quantity:number;tracecode_name:string|null};
type Snapshot={items:Item[];orders:OrderLine[];sprays:SprayLine[];documents:Doc[];sprayers?:{setup_name:string;water_litres_per_ha:number}[]};
type Trace={tracecode_id:number;tracecode_name:string;tracecode_size:number;crop_id:number|null};
type Crop={crop_id:number;crop_name:string};
type Line={id:number;item_code:string;quantity:string;unit_price:string;rate_per_ha:string};
const emptyLine=(id:number,item_code=""):Line=>({id,item_code,quantity:"",unit_price:"",rate_per_ha:""});
const uuid=()=>"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==="x"?r:(r&3)|8).toString(16)});
const number=(x:string)=>Number(x);
const currency=(n:number)=>Number.isFinite(n)?n.toFixed(2):"—";
const tabs=["Purchase Orders","GRV","Stock Balances","Spray Programme","Planned Issue","Direct Issue"] as const;
type Tab=typeof tabs[number];
function Field({label,value,onChange,numeric=false}:{label:string;value:string;onChange:(v:string)=>void;numeric?:boolean}){
 return <View style={styles.field}><ThemedText style={styles.label}>{label}</ThemedText><TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={numeric?"decimal-pad":"default"}/></View>;
}
export default function StockV2Workflow(){
 const {width}=useWindowDimensions();
 const [tab,setTab]=useState<Tab|null>(null),[snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [traces,setTraces]=useState<Trace[]>([]),[crops,setCrops]=useState<Crop[]>([]);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [lines,setLines]=useState<Line[]>([emptyLine(1)]),[nextLine,setNextLine]=useState(2);
 const [supplier,setSupplier]=useState("DEMO Supplier"),[orderDate,setOrderDate]=useState(()=>new Date().toLocaleDateString("en-GB")),[orderId,setOrderId]=useState<number|null>(null);
 const [jobId,setJobId]=useState<number|null>(null),[traceId,setTraceId]=useState<number|null>(null),[cropId,setCropId]=useState<number|null>(null);
 const [area,setArea]=useState(""),[water,setWater]=useState(""),[part,setPart]=useState(""),[sprayType,setSprayType]=useState(""),[deliveryNote,setDeliveryNote]=useState("");
 const [dropdown,setDropdown]=useState<string|null>(null),[search,setSearch]=useState("");
 const [pickerLine,setPickerLine]=useState<number|null>(null),[pickerSearch,setPickerSearch]=useState("");
 const [request,setRequest]=useState<{action:string;payload:any;id:string}|null>(null);
 const token=async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");return session.access_token};
 const refresh=async(show=true)=>{if(show)setBusy(true);try{
  const r=await fetch(endpoint,{headers:{authorization:"Bearer "+await token()}});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to read Stock V2");setSnapshot(d);
 }catch(e){setStatus(e instanceof Error?e.message:String(e))}finally{if(show)setBusy(false)}};
 useEffect(()=>{refresh();(async()=>{
  const [t,c]=await Promise.all([
   supabase.from("tracecode").select("tracecode_id,tracecode_name,tracecode_size,crop_id,end_date").or("end_date.is.null,end_date.gte."+new Date().toISOString().slice(0,10)).order("tracecode_name"),
   supabase.from("crop").select("crop_id,crop_name").eq("active",true).order("crop_name")
  ]);
  setTraces((t.data??[]) as Trace[]);setCrops((c.data??[]) as Crop[]);
 })()},[]);
 const resetEdit=()=>{setConfirmed(false);setRequest(null)};
 const changeLine=(id:number,key:keyof Line,value:string)=>{setLines(old=>old.map(l=>l.id===id?{...l,[key]:value}:l));resetEdit()};
 const addLine=()=>{setLines(old=>[...old,emptyLine(nextLine)]);setNextLine(n=>n+1);resetEdit()};
 const removeLine=(id:number)=>{setLines(old=>old.filter(l=>l.id!==id));resetEdit()};
 const switchTab=(v:Tab|null)=>{setTab(v);if(v==="GRV"||v==="Planned Issue")void refresh(false);setLines([emptyLine(nextLine)]);setNextLine(n=>n+1);setOrderId(null);setJobId(null);setDropdown(null);setStatus("");resetEdit()};
 const products=snapshot?.items??[];
 const orders=useMemo(()=>{
  const map=new Map<number,OrderLine[]>();
  for(const o of snapshot?.orders??[]){if(!map.has(o.order_id))map.set(o.order_id,[]);map.get(o.order_id)!.push(o)}
  return [...map.entries()].map(([id,lines])=>({id,lines,supplier:lines[0].supplier_name,number:lines[0].order_number,remaining:lines.reduce((s,x)=>s+Math.max(0,x.ordered_quantity-x.received_quantity),0)})).filter(x=>x.remaining>0);
 },[snapshot]);
 const selectedPO=orders.find(x=>x.id===orderId);
 const jobs=useMemo(()=>{
  const map=new Map<number,SprayLine[]>();for(const j of snapshot?.sprays??[]){if(j.status!=="planned")continue;if(!map.has(j.job_id))map.set(j.job_id,[]);map.get(j.job_id)!.push(j)}
  return [...map.entries()].map(([id,lines])=>({id,lines,trace:lines[0].tracecode_name,remaining:lines.reduce((s,x)=>s+Math.max(0,x.planned_quantity-x.issued_quantity),0)})).filter(x=>x.remaining>0);
 },[snapshot]);
 const selectedJob=jobs.find(x=>x.id===jobId);
 const activeTraces=traces.filter(t=>(cropId===null||t.crop_id===cropId)&&crops.some(c=>c.crop_id===t.crop_id)&&t.tracecode_name.toLowerCase().startsWith(search.trim().toLowerCase()));
 const choosePO=(po:typeof orders[number])=>{setOrderId(po.id);setSupplier(po.supplier);setLines(po.lines.filter(x=>x.received_quantity<x.ordered_quantity).map((x,i)=>({...emptyLine(nextLine+i,x.item_code),quantity:String(x.ordered_quantity-x.received_quantity),unit_price:String(x.ordered_unit_price??"")})));setNextLine(n=>n+po.lines.length);setDropdown(null);resetEdit()};
 const chooseJob=(job:typeof jobs[number])=>{setJobId(job.id);setTraceId(job.lines[0].external_tracecode_id);setLines(job.lines.filter(x=>x.planned_quantity>x.issued_quantity).map((x,i)=>({...emptyLine(nextLine+i,x.item_code),quantity:String(Number((x.planned_quantity-x.issued_quantity).toFixed(4))),rate_per_ha:String(x.rate_per_ha)})));setNextLine(n=>n+job.lines.length);setDropdown(null);resetEdit()};
 const menu=(id:string,title:string,choices:{label:string;value:string;onSelect:()=>void}[],searchable=false)=> <View style={styles.dropdown}>
  <Pressable style={styles.selector} onPress={()=>{setDropdown(dropdown===id?null:id);setSearch("")}}><ThemedText>{title}  ▾</ThemedText></Pressable>
  {dropdown===id?<View style={styles.choices}>{searchable?<TextInput style={styles.input} placeholder="Search..." placeholderTextColor="#777" value={search} onChangeText={setSearch}/>:null}
   <ScrollView style={{maxHeight:190}} nestedScrollEnabled>{choices.filter(o=>!searchable||o.label.toLowerCase().startsWith(search.trim().toLowerCase())).map(o=><Pressable key={o.value} style={styles.choice} onPress={()=>{o.onSelect();setDropdown(null);setSearch("");resetEdit()}}><ThemedText>{o.label}</ThemedText></Pressable>)}</ScrollView>
  </View>:null}
 </View>;
 const lineCells=(l:Line,locked=false)=>{
  const product=products.find(p=>p.item_code===l.item_code);
  const reference=tab==="GRV"?selectedPO?.lines.find(x=>x.item_code===l.item_code):tab==="Planned Issue"?selectedJob?.lines.find(x=>x.item_code===l.item_code):null;
  const max=tab==="GRV"&&reference?(reference as OrderLine).ordered_quantity-(reference as OrderLine).received_quantity:tab==="Planned Issue"&&reference?(reference as SprayLine).planned_quantity-(reference as SprayLine).issued_quantity:null;
  return <View key={l.id} style={styles.line}>
   <View style={styles.productColumn}>
    {locked?<ThemedText>{product?.item_name??l.item_code}</ThemedText>:<Pressable style={styles.selector} onPress={()=>{setPickerLine(l.id);setPickerSearch("")}}><ThemedText numberOfLines={2}>{product?.item_name??"Select product"} ▾</ThemedText></Pressable>}
    <ThemedText style={styles.muted}>{product?.base_unit??""}</ThemedText>
   </View>
   {tab==="GRV"?<><View style={styles.numberColumn}><ThemedText>{(reference as OrderLine)?.ordered_quantity??"—"}</ThemedText></View><View style={styles.numberColumn}><ThemedText>{(reference as OrderLine)?.received_quantity??"—"}</ThemedText></View><View style={styles.numberColumn}><ThemedText>{currency((reference as OrderLine)?.ordered_unit_price??NaN)}</ThemedText></View></>:null}
   {tab==="Planned Issue"?<View style={styles.numberColumn}><ThemedText>{max?.toFixed(2)??"—"}</ThemedText></View>:null}
   <View style={styles.numberColumn}><TextInput style={[styles.tableInput,{textAlign:"right",fontVariant:["tabular-nums"]}]} keyboardType="decimal-pad" value={tab==="Spray Programme"?l.rate_per_ha:l.quantity} onChangeText={v=>changeLine(l.id,tab==="Spray Programme"?"rate_per_ha":"quantity",v)} placeholder={tab==="Spray Programme"?"Rate/ha":"Quantity"} placeholderTextColor="#777"/></View>
   {tab==="Purchase Orders"||tab==="GRV"?<><View style={styles.numberColumn}><TextInput style={styles.tableInput} keyboardType="decimal-pad" value={l.unit_price} onChangeText={v=>changeLine(l.id,"unit_price",v)} placeholder="Unit price" placeholderTextColor="#777"/></View><View style={styles.numberColumn}><ThemedText>{currency(number(l.quantity)*number(l.unit_price))}</ThemedText></View></>:null}
   {tab==="Spray Programme"?<View style={styles.numberColumn}><ThemedText>{currency(number(l.rate_per_ha)*(part.trim()?number(part):number(area)))} {product?.base_unit??""}</ThemedText></View>:null}
   {max!==null&&max!==undefined&&number(l.quantity)>max?<ThemedText style={styles.alert}>Over outstanding</ThemedText>:null}
   {!locked?<Pressable style={[styles.remove,styles.removeColumn]} onPress={()=>removeLine(l.id)}><ThemedText style={styles.alert}>×</ThemedText></Pressable>:null}
  </View>;
 };
 const action=tab==="Purchase Orders"?"order":tab==="GRV"?"grv":tab==="Spray Programme"?"spray":tab==="Planned Issue"?"planned_issue":"direct_issue";
 const normalizedLines=lines.map(l=>tab==="Spray Programme"?{item_code:l.item_code,rate_per_ha:number(l.rate_per_ha)}:{item_code:l.item_code,quantity:number(l.quantity),...(["Purchase Orders","GRV"].includes(tab)?{unit_price:l.unit_price.trim()?number(l.unit_price):null}:{})});
 const payload={supplier,order_date:parseJsplDateInput(orderDate),order_id:orderId,job_id:jobId,tracecode_id:traceId,area_ha:part.trim()?number(part):number(area),part_label:part.trim()?"Part "+part.trim()+" ha":"Whole tracecode",spray_type:sprayType,water_rate:number(water),delivery_note:deliveryNote,lines:normalizedLines};
 const valid=!!snapshot&&(tab!=="Purchase Orders"||!!parseJsplDateInput(orderDate))&&lines.length>0&&lines.length<=30&&new Set(lines.map(l=>l.item_code)).size===lines.length&&lines.every(l=>{
  if(!products.some(p=>p.item_code===l.item_code))return false;
  const n=number(tab==="Spray Programme"?l.rate_per_ha:l.quantity);
  if(!Number.isFinite(n)||n<=0)return false;
  if(["Purchase Orders","GRV"].includes(tab)&&l.unit_price.trim()!==""&&(!Number.isFinite(number(l.unit_price))||number(l.unit_price)<0))return false;
  const ref=tab==="GRV"?selectedPO?.lines.find(x=>x.item_code===l.item_code):tab==="Planned Issue"?selectedJob?.lines.find(x=>x.item_code===l.item_code):null;
  if(tab==="GRV"&&(!ref||n>(ref as OrderLine).ordered_quantity-(ref as OrderLine).received_quantity))return false;
  if(tab==="Planned Issue"&&(!ref||n>(ref as SprayLine).planned_quantity-(ref as SprayLine).issued_quantity))return false;
  return true;
 })&&(tab!=="GRV"||!!selectedPO)&&(tab!=="Planned Issue"||!!selectedJob)&&(!["Spray Programme","Direct Issue"].includes(tab)||!!traceId)&&(tab!=="Spray Programme"||(number(area)>0&&(!part.trim()||(number(part)>0&&number(part)<=number(area)))&&!!sprayType&&Number.isFinite(number(water))&&number(water)>0));
 const submit=async()=>{if(!valid||!confirmed||busy)return;setBusy(true);setStatus("");
  const req=request&&request.action===action&&JSON.stringify(request.payload)===JSON.stringify(payload)?request:{action,payload,id:uuid()};setRequest(req);
  try{
   if(!Array.isArray(req.payload.lines)||req.payload.lines.length===0)throw Error("Cannot post an order without products");
   const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+await token()},body:JSON.stringify({action,request_id:req.id,payload:req.payload})});const d=await r.json();if(!r.ok)throw Error(d.error||("Posting failed (HTTP "+r.status+")"));if(action==="order"&&(!d.result?.order_id||!Array.isArray(d.result.lines)||d.result.lines.length!==req.payload.lines.length))throw Error("Order not confirmed with all product lines");
   setStatus("Posted "+tab+" successfully. "+(d.result?.order_id?"PO #"+d.result.order_id:d.result?.document_id?"Document #"+d.result.document_id:d.result?.job_id?"Job #"+d.result.job_id:"")+" — returned to Stock Home.");setConfirmed(false);setRequest(null);await refresh(false);setTab(null);
   if(tab==="GRV")setOrderId(null);if(tab==="Planned Issue")setJobId(null);
   setLines([emptyLine(nextLine)]);setNextLine(n=>n+1);
  }catch(e){setStatus("NOT POSTED: "+(e instanceof Error?e.message:String(e)))}finally{setBusy(false)}
 };
 const header=(title:string,details:string[])=><View style={styles.documentHead}><ThemedText style={styles.heading}>{title}</ThemedText><View style={styles.headerDetails}>{details.map((x,i)=><ThemedText key={i} style={styles.detail}>{x}</ThemedText>)}</View></View>;
 const currentTrace=traces.find(t=>t.tracecode_id===traceId);
 const gridHead=(cols:string[])=><View style={styles.gridHead}>{cols.map((h,i)=><ThemedText key={i} style={[styles.gridHeading,{flex:i===0?2.4:1}]}>{h}</ThemedText>)}</View>;
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
  <ThemedText style={styles.title}>Stock Control — V2 Test</ThemedText>
  <ThemedText style={styles.muted}>Isolated demo records only • TEST_JS • TEST_WH • No live Access changes</ThemedText>
  {tab===null?<View style={styles.home}>
    <ThemedText style={styles.homeTitle}>Stock Home</ThemedText>
    <ThemedText style={styles.muted}>Choose a stock operation</ThemedText>
    <View style={styles.homeGrid}>{tabs.map(x=><View key={x} style={styles.dashboardCard}>
      <JsplDashboardButton title={x}
       description={x==="GRV"?(snapshot?`${orders.length} outstanding purchase order${orders.length===1?"":"s"}`:"Loading outstanding POs…"):x==="Planned Issue"?(snapshot?`${jobs.length} spray job${jobs.length===1?"":"s"} awaiting issue · ${jobs.reduce((sum,j)=>sum+j.lines.filter(l=>l.planned_quantity>l.issued_quantity).length,0)} input lines`:"Loading spray programmes…"):"Open screen ›"}
       onPress={()=>switchTab(x)}/>
     </View>)}</View>
   </View>:<Pressable style={styles.back} onPress={()=>switchTab(null)}><ThemedText style={styles.backText}>← Back to Stock Home</ThemedText></Pressable>}
  <Pressable style={styles.refresh} onPress={()=>refresh()}><ThemedText>↻ Refresh records</ThemedText></Pressable>
  {busy?<ActivityIndicator/>:null}
  {status?<View style={styles.notice}><ThemedText>{status}</ThemedText></View>:null}
  {tab===null?null:tab==="Stock Balances"?<View style={styles.sheet}>
   {header("STOCK BALANCES",["Owner: TEST_JS","Warehouse: TEST_WH"])}
   {gridHead(["Product","Unit","Available"])}
   {(snapshot?.items??[]).map(i=><View key={i.item_code} style={styles.registerRow}><ThemedText style={{flex:2.4}}>{i.item_name}</ThemedText><ThemedText style={{flex:1}}>{i.base_unit}</ThemedText><ThemedText style={{flex:1,textAlign:"right",fontVariant:["tabular-nums"]}}>{formatJsplNumber(i.quantity,2)}</ThemedText></View>)}
  </View>:<View style={styles.sheet}>
   {header(tab.toUpperCase(),["Owner: TEST_JS","Warehouse: TEST_WH","Date: "+new Date().toLocaleDateString("en-GB")])}
   {tab==="Purchase Orders"?<View style={styles.poHeaderFields}>
     <View style={styles.poSupplier}><Field label="Supplier" value={supplier} onChange={v=>{setSupplier(v);resetEdit()}}/></View>
     <View style={styles.poDate}><Field label="Purchase Order Date (DD/MM/YYYY)" value={orderDate} onChange={v=>{setOrderDate(v);resetEdit()}}/>
       {!parseJsplDateInput(orderDate)?<ThemedText style={styles.alert}>Enter a valid date, e.g. 19/10/2026</ThemedText>:null}
     </View>
   </View>:null}
   {tab==="GRV"?<>
    <Pressable style={styles.refresh} onPress={()=>refresh()}><ThemedText>↻ Reload outstanding purchase orders</ThemedText></Pressable>
    {orders.length===0?<ThemedText style={styles.alert}>No outstanding DEMO POs returned. Only successfully posted and unreceived orders are listed.</ThemedText>:null}
    {menu("orders",selectedPO?"PO #"+selectedPO.id+" — "+selectedPO.supplier:"Choose outstanding purchase order",orders.map(o=>({label:"PO #"+o.id+" · "+o.supplier+" · "+o.lines.length+" products",value:String(o.id),onSelect:()=>choosePO(o)})),true)}
    {selectedPO?<><ThemedText>Original PO: {selectedPO.number}</ThemedText><ThemedText>Supplier: {selectedPO.supplier}</ThemedText><Field label="Supplier delivery note" value={deliveryNote} onChange={v=>{setDeliveryNote(v);resetEdit()}}/></>:<ThemedText style={styles.muted}>Select a PO to load all outstanding product lines.</ThemedText>}
   </>:null}
   {tab==="Planned Issue"?<>{menu("jobs",selectedJob?"Spray job #"+selectedJob.id+" — "+selectedJob.trace:"Choose outstanding spray programme",jobs.map(j=>({label:"Job #"+j.id+" · "+j.trace+" · "+j.lines.length+" products",value:String(j.id),onSelect:()=>chooseJob(j)})),true)}</>:null}
   {["Spray Programme","Direct Issue"].includes(tab)?<View style={styles.filters}>
    {menu("crops",crops.find(c=>c.crop_id===cropId)?.crop_name??"All crops",[{label:"All crops",value:"all",onSelect:()=>{setCropId(null);setTraceId(null)}},...crops.map(c=>({label:c.crop_name,value:String(c.crop_id),onSelect:()=>{setCropId(c.crop_id);setTraceId(null)}}))])}
    {menu("traces",currentTrace?.tracecode_name??"Choose active tracecode",activeTraces.map(t=>({label:t.tracecode_name,value:String(t.tracecode_id),onSelect:()=>{setTraceId(t.tracecode_id);setArea(String(t.tracecode_size??""));setPart("");}})),true)}
   </View>:null}
   {tab==="Spray Programme"?<View style={styles.sprayFields}>
     <View style={styles.field}><ThemedText style={styles.label}>Tracecode Area (ha) — fixed</ThemedText><View style={styles.readOnly}><ThemedText>{currentTrace?String(currentTrace.tracecode_size):"Select a tracecode"}</ThemedText></View></View>
     <Field label="Part (ha) — blank = entire field" value={part} numeric onChange={v=>{setPart(v);resetEdit()}}/>
     <View style={styles.field}><ThemedText style={styles.label}>Spray Type</ThemedText>{menu("spraytypes",sprayType||"Choose spray type",(snapshot?.sprayers??[]).map(x=>({label:x.setup_name,value:x.setup_name,onSelect:()=>{setSprayType(x.setup_name);setWater(String(x.water_litres_per_ha));}})))}</View>
     <Field label="Water (L/ha) — editable" value={water} numeric onChange={v=>{setWater(v);resetEdit()}}/>
     <ThemedText style={styles.label}>Area to spray: {part.trim()?part:(area||"—")} ha</ThemedText>
   </View>:null}
   <View style={styles.productSectionHeading}><ThemedText style={styles.section}>Product lines</ThemedText></View>
   <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{minWidth:tab==="GRV"?1130:tab==="Purchase Orders"?790:tab==="Spray Programme"?710:tab==="Planned Issue"?710:650}}>
    <View style={{flex:1}}>
     <View style={styles.lineHeader}>
      {(tab==="GRV"?["Product","Ordered","Prev. rec.","PO price","Qty received","Actual price","Line total"]:tab==="Planned Issue"?["Product","Outstanding","Qty issue"]:tab==="Purchase Orders"?["Product","Qty ordered","Unit price","Line total"]:tab==="Spray Programme"?["Product","Rate/ha","Total input"]:["Product","Qty issue"]).map((x,i)=><View key={i} style={i===0?styles.productColumn:styles.numberColumn}><ThemedText style={styles.gridHeading}>{x}</ThemedText></View>)}
      {!["GRV","Planned Issue"].includes(tab)?<View style={styles.removeColumn}/>:null}
     </View>
     {lines.map(l=>lineCells(l,tab==="GRV"||tab==="Planned Issue"))}
    </View>
   </ScrollView>
   {pickerLine!==null?<View style={styles.pickerPanel}>
    <View style={styles.pickerTop}><ThemedText style={styles.section}>Choose product</ThemedText><Pressable onPress={()=>setPickerLine(null)}><ThemedText>Close</ThemedText></Pressable></View>
    <TextInput style={styles.input} placeholder="Find product" value={pickerSearch} onChangeText={setPickerSearch}/>
    {products.filter(p=>p.item_name.toLowerCase().startsWith(pickerSearch.trim().toLowerCase())&&!lines.some(x=>x.id!==pickerLine&&x.item_code===p.item_code)).map(p=><Pressable key={p.item_code} style={styles.choice} onPress={()=>{changeLine(pickerLine,"item_code",p.item_code);setPickerLine(null)}}><ThemedText>{p.item_name} ({p.base_unit})</ThemedText></Pressable>)}
   </View>:null}
   {!["GRV","Planned Issue"].includes(tab)?<Pressable style={styles.add} onPress={addLine}><ThemedText>＋ Add product line</ThemedText></Pressable>:null}
   {["Purchase Orders","GRV"].includes(tab)?<ThemedText style={styles.total}>Document total: {currency(lines.reduce((s,l)=>s+number(l.quantity)*number(l.unit_price||"0"),0))}</ThemedText>:null}
   <ThemedText style={styles.label}>Products on this document: {lines.filter(l=>products.some(p=>p.item_code===l.item_code)&&Number(tab==="Spray Programme"?l.rate_per_ha:l.quantity)>0).length} / {lines.length}</ThemedText>
   {status.startsWith("NOT POSTED")?<View style={styles.errorPanel}><ThemedText style={styles.errorText}>{status}</ThemedText></View>:null}
  <View style={styles.footer}><Pressable onPress={()=>setConfirmed(x=>!x)} style={styles.confirm}><ThemedText>{confirmed?"☑":"☐"} Confirm TEST transaction</ThemedText></Pressable><Pressable disabled={!valid||!confirmed||busy} onPress={submit} style={[styles.submit,(!valid||!confirmed||busy)&&styles.off]}><ThemedText style={styles.submitText}>{busy?"Posting…":"Post "+tab}</ThemedText></Pressable></View>
   {!valid?<ThemedText style={styles.alert}>Select a product on every line and enter a positive quantity (or spray rate). Empty documents cannot be posted.</ThemedText>:null}
  </View>}
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({poHeaderFields:{flexDirection:"row",flexWrap:"wrap",alignItems:"flex-start",gap:24,paddingBottom:20,marginBottom:12,borderBottomWidth:1,borderBottomColor:jsplColors.border},poSupplier:{flex:2,minWidth:270},poDate:{flex:1,minWidth:235},productSectionHeading:{paddingTop:14,paddingBottom:12,marginTop:12},sprayFields:{flexDirection:"row",flexWrap:"wrap",alignItems:"flex-end",gap:12},readOnly:{padding:12,backgroundColor:"#e7edf2",borderWidth:1,borderColor:"#b0bfcb",borderRadius:4,minHeight:43},errorPanel:{backgroundColor:"#fff0ed",borderWidth:1,borderColor:"#bf4436",padding:12,borderRadius:5},errorText:{color:"#8a241a",fontWeight:"700"},
 home:{gap:jsplSpacing.xl,paddingVertical:jsplSpacing.lg},homeTitle:{fontSize:24,fontWeight:"700",color:jsplColors.primaryDark},homeGrid:{flexDirection:"row",flexWrap:"wrap",gap:jsplSpacing.lg},dashboardCard:{flexGrow:1,flexBasis:240,minWidth:220},homeButton:{flexGrow:1,flexBasis:230,minWidth:210,minHeight:100,borderWidth:1,borderColor:"#9cb0c0",borderRadius:8,backgroundColor:"#edf3f8",padding:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},homeButtonText:{fontSize:18,fontWeight:"700",color:"#244d69"},homeArrow:{fontSize:30,color:"#537a96"},back:{alignSelf:"flex-start",backgroundColor:jsplColors.successTint,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,paddingVertical:10,paddingHorizontal:16},backText:{fontWeight:"700",color:jsplColors.primaryDark},
 pickerPanel:{padding:12,borderWidth:1,borderColor:"#9babb8",borderRadius:5,gap:8,maxWidth:540},pickerTop:{flexDirection:"row",justifyContent:"space-between"},productColumn:{width:260,paddingHorizontal:6,justifyContent:"center"},numberColumn:{width:135,paddingHorizontal:6,justifyContent:"center"},removeColumn:{width:44},root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.xl,gap:jsplSpacing.lg,paddingBottom:50,backgroundColor:jsplColors.background},title:{fontSize:23,fontWeight:"700"},muted:{fontSize:12,color:"#82888f"},nav:{flexDirection:"row",flexWrap:"wrap",borderBottomWidth:2,borderColor:"#486986"},navTab:{backgroundColor:"#e7ebf0",paddingVertical:11,paddingHorizontal:16,borderTopLeftRadius:4,borderTopRightRadius:4},navActive:{backgroundColor:"#345f81"},navActiveText:{color:"white",fontWeight:"700"},refresh:{alignSelf:"flex-start",padding:9,borderWidth:1,borderColor:"#a5b1bd",borderRadius:5},notice:{borderWidth:1,borderColor:"#a3b4c1",padding:10,borderRadius:5},sheet:{padding:jsplSpacing.lg,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,gap:jsplSpacing.md,backgroundColor:jsplColors.surface},documentHead:{gap:6,borderBottomWidth:1,borderColor:"#b5bfc9",paddingBottom:10},heading:{fontSize:17,fontWeight:"700"},headerDetails:{flexDirection:"row",flexWrap:"wrap",gap:16},detail:{fontSize:12,color:"#697b87"},field:{flex:1,gap:5,minWidth:150},label:{fontWeight:"600",fontSize:13},input:{minHeight:44,paddingHorizontal:jsplSpacing.md,paddingVertical:9,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,color:"#222",backgroundColor:"#fff"},filters:{flexDirection:"row",flexWrap:"wrap",gap:12},dropdown:{flex:1,minWidth:210,maxWidth:500,gap:4},selector:{padding:10,borderWidth:1,borderColor:"#9aabb7",borderRadius:4},choices:{padding:6,borderWidth:1,borderColor:"#bbc3cb",borderRadius:4,gap:4},choice:{padding:10,borderBottomWidth:1,borderColor:"#e6e7e9"},section:{fontSize:14,fontWeight:"700",marginTop:6},lineHeader:{flexDirection:"row",paddingVertical:10,backgroundColor:jsplColors.successTint},gridHeading:{fontSize:12,fontWeight:"700",paddingHorizontal:5},line:{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderColor:"#d9dfe4",paddingVertical:6},cell:{paddingHorizontal:4},tableInput:{minHeight:44,padding:9,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,backgroundColor:"#fff",color:"#111"},remove:{paddingHorizontal:8},alert:{color:"#a93525"},add:{borderWidth:1,borderColor:"#a7b8c4",padding:10,alignSelf:"flex-start",borderRadius:5},total:{fontWeight:"700",textAlign:"right"},footer:{flexDirection:"row",flexWrap:"wrap",justifyContent:"flex-end",gap:15,alignItems:"center"},confirm:{padding:12,borderWidth:1,borderColor:"#9babb9",borderRadius:4},submit:{backgroundColor:jsplColors.primary,paddingVertical:13,paddingHorizontal:25,borderRadius:5},submitText:{color:"white",fontWeight:"700"},off:{backgroundColor:"#a9adb0"},gridHead:{flexDirection:"row",backgroundColor:jsplColors.successTint,paddingVertical:8},registerRow:{flexDirection:"row",paddingVertical:8,borderBottomWidth:1,borderColor:"#e2e6e8",gap:5}
});