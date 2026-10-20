import { JsplDashboardButton } from "@/components/jspl/JsplDashboardButton";
import { JsplTable } from "@/components/jspl/JsplTable";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { jsplColors, jsplDashboardTheme, jsplRadii, jsplSpacing } from "@/constants/jspl-design";
import { parseJsplDateInput } from "@/utils/jspl-input";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { supabase } from "../../../supabase";

const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Item={item_code:string;item_name:string;base_unit:string;quantity:number;ao_quantity:number;input_type:string|null;input_category:string|null;active_ingredient:string|null;last_purchase_price:number|null;weighted_average_price:number|null;last_purchase_supplier:string|null};
type OrderLine={owner_code:string;contract_id:number|null;order_id:number;order_number:string;supplier_name:string;item_code:string;item_name:string;base_unit:string;ordered_quantity:number;received_quantity:number;ordered_unit_price:number|null;status:string};
type SprayLine={job_id:number;external_tracecode_id:number;tracecode_name:string;item_code:string;item_name:string;area_ha:number;rate_per_ha:number;planned_quantity:number;issued_quantity:number;status:string};
type Doc={document_id:number;document_type:string;document_number:string;item_name:string;quantity:number;tracecode_name:string|null};
type Snapshot={items:Item[];orders:OrderLine[];sprays:SprayLine[];documents:Doc[];pending_invoice_count?:number;sprayers?:{setup_name:string;water_litres_per_ha:number}[]};
type Trace={tracecode_id:number;tracecode_name:string;tracecode_size:number;crop_id:number|null};
type Crop={crop_id:number;crop_name:string};
type Line={id:number;item_code:string;quantity:string;unit_price:string;rate_per_ha:string;mix_instruction:string};
const emptyLine=(id:number,item_code=""):Line=>({id,item_code,quantity:"",unit_price:"",rate_per_ha:"",mix_instruction:""});
const uuid=()=>"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==="x"?r:(r&3)|8).toString(16)});
const number=(x:string)=>Number(x);
const currency=(n:number)=>Number.isFinite(n)?n.toFixed(2):"—";
const tabs=["Purchase Orders","POs Outstanding","GRV","Stock Balances","Spray Planning","Stock Transfer","Direct Issue"] as const;
type Tab=typeof tabs[number];
function Field({label,value,onChange,numeric=false}:{label:string;value:string;onChange:(v:string)=>void;numeric?:boolean}){
 return <View style={styles.field}><ThemedText style={styles.label}>{label}</ThemedText><TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={numeric?"decimal-pad":"default"}/></View>;
}
export default function StockV2Workflow(){
 const router=useRouter();
 const {width,height}=useWindowDimensions();
 const watermarkSize=Math.min(650,Math.max(240,width-48),Math.max(240,height-48));
 const [tab,setTab]=useState<Tab|null>(null),[snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [traces,setTraces]=useState<Trace[]>([]),[crops,setCrops]=useState<Crop[]>([]);
 const [owners,setOwners]=useState<{owner_code:string;owner_name:string;active:boolean;po_requires_contract:boolean;allow_direct_grv:boolean;po_required_for_grv:boolean;default_contract_id:number|null}[]>([]);
 const [contracts,setContracts]=useState<{contract_id:number;contract_code:string;active:boolean}[]>([]);
 const [suppliers,setSuppliers]=useState<{supplier_id:number;supplier_name:string;active:boolean}[]>([]);
 const [ownerCode,setOwnerCode]=useState(""),[contractId,setContractId]=useState<number|null>(null);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [latestIssueDocument,setLatestIssueDocument]=useState<number|null>(null);
 const [lines,setLines]=useState<Line[]>([emptyLine(1)]),[nextLine,setNextLine]=useState(2);
 const [typeFilter,setTypeFilter]=useState(""),[categoryFilter,setCategoryFilter]=useState("");
 const [supplier,setSupplier]=useState(""),[orderDate,setOrderDate]=useState(()=>new Date().toLocaleDateString("en-GB")),[orderId,setOrderId]=useState<number|null>(null);
 const [jobId,setJobId]=useState<number|null>(null),[traceId,setTraceId]=useState<number|null>(null),[cropId,setCropId]=useState<number|null>(null);
 const [receiptMode,setReceiptMode]=useState<"dnote"|"invoice">("dnote"),[invoiceNumber,setInvoiceNumber]=useState(""),[receiptDate,setReceiptDate]=useState(()=>new Date().toLocaleDateString("en-GB"));
 const [area,setArea]=useState(""),[water,setWater]=useState(""),[part,setPart]=useState(""),[sprayType,setSprayType]=useState(""),[deliveryNote,setDeliveryNote]=useState("");
 const [dropdown,setDropdown]=useState<string|null>(null),[search,setSearch]=useState("");
 const [pickerLine,setPickerLine]=useState<number|null>(null),[pickerSearch,setPickerSearch]=useState("");
 const [request,setRequest]=useState<{action:string;payload:any;id:string}|null>(null);
 const token=async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");return session.access_token};
 const refresh=async(show=true)=>{if(show)setBusy(true);try{
  const supplierResult=await fetch(endpoint+"?supplier_list=1",{headers:{authorization:"Bearer "+await token()}});
  const supplierData=await supplierResult.json();if(!supplierResult.ok)throw Error(supplierData.error||"Unable to load suppliers");
  setSuppliers(supplierData.suppliers??[]);
  const setup=await fetch(endpoint+"?stock_setup=1",{headers:{authorization:"Bearer "+await token()}});
  const config=await setup.json();if(!setup.ok)throw Error(config.error||"Unable to load owners and contracts");
  setOwners(config.owners??[]);setContracts(config.contracts??[]);
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
 const owner=owners.find(o=>o.owner_code===ownerCode);
 const effectiveContract=owner?.default_contract_id??contractId;
 const directGrv=tab==="POs Outstanding"&&!!owner?.allow_direct_grv&&!owner.po_required_for_grv;
 const ownerReady=!!owner?.active;
 const contractReady=!!effectiveContract&&contracts.some(c=>c.contract_id===effectiveContract&&(c.active||tab==="POs Outstanding"));
 const selectOwner=(code:string)=>{setOwnerCode(code);setContractId(null);setOrderId(null);setSupplier("");setLines([emptyLine(nextLine)]);setNextLine(x=>x+1);resetEdit()};
 const changeLine=(id:number,key:keyof Line,value:string)=>{setLines(old=>old.map(l=>l.id===id?{...l,[key]:value}:l));resetEdit()};
 const addLine=()=>{setLines(old=>[...old,emptyLine(nextLine)]);setNextLine(n=>n+1);resetEdit()};
 const removeLine=(id:number)=>{setLines(old=>old.filter(l=>l.id!==id));resetEdit()};
 const switchTab=(v:Tab|null)=>{if(v==="GRV"){router.push("/stock-v2-grv-outstanding");return;}if(v==="Stock Transfer"){router.push("/stock-v2-owner-transactions");return;}setTab(v);if(v==="POs Outstanding"||v==="Planned Issue")void refresh(false);setLines([emptyLine(nextLine)]);setNextLine(n=>n+1);setOrderId(null);setJobId(null);setDropdown(null);setStatus("");setReceiptMode("dnote");setInvoiceNumber("");setDeliveryNote("");resetEdit()};
 const products=snapshot?.items??[];
 const inputTypes=[...new Set(products.map(x=>x.input_type).filter((x):x is string=>!!x))].sort();
 const inputCategories=[...new Set(products.map(x=>x.input_category).filter((x):x is string=>!!x))].sort();
 const balanceRows=products.filter(p=>(!typeFilter||p.input_type===typeFilter)&&(!categoryFilter||p.input_category===categoryFilter));
 const orders=useMemo(()=>{
  const map=new Map<number,OrderLine[]>();
  for(const o of snapshot?.orders??[]){if(o.owner_code!==ownerCode)continue;if(!map.has(o.order_id))map.set(o.order_id,[]);map.get(o.order_id)!.push(o)}
  return [...map.entries()].map(([id,lines])=>({id,lines,supplier:lines[0].supplier_name,number:lines[0].order_number,contract_id:lines[0].contract_id,remaining:lines.reduce((s,x)=>s+Math.max(0,x.ordered_quantity-x.received_quantity),0)})).filter(x=>x.remaining>0);
 },[snapshot,ownerCode]);
 const selectedPO=orders.find(x=>x.id===orderId);
 const jobs=useMemo(()=>{
  const map=new Map<number,SprayLine[]>();for(const j of snapshot?.sprays??[]){if(j.status!=="planned")continue;if(!map.has(j.job_id))map.set(j.job_id,[]);map.get(j.job_id)!.push(j)}
  return [...map.entries()].map(([id,lines])=>({id,lines,trace:lines[0].tracecode_name,remaining:lines.reduce((s,x)=>s+Math.max(0,x.planned_quantity-x.issued_quantity),0)})).filter(x=>x.remaining>0);
 },[snapshot]);
 const selectedJob=jobs.find(x=>x.id===jobId);
 const activeTraces=traces.filter(t=>(cropId===null||t.crop_id===cropId)&&crops.some(c=>c.crop_id===t.crop_id)&&t.tracecode_name.toLowerCase().startsWith(search.trim().toLowerCase()));
 const choosePO=(po:typeof orders[number])=>{setOrderId(po.id);setContractId(po.contract_id);setSupplier(po.supplier);setLines(po.lines.filter(x=>x.received_quantity<x.ordered_quantity).map((x,i)=>({...emptyLine(nextLine+i,x.item_code),quantity:String(x.ordered_quantity-x.received_quantity),unit_price:String(x.ordered_unit_price??"")})));setNextLine(n=>n+po.lines.length);setDropdown(null);resetEdit()};
 const chooseJob=(job:typeof jobs[number])=>{setJobId(job.id);setTraceId(job.lines[0].external_tracecode_id);setLines(job.lines.filter(x=>x.planned_quantity>x.issued_quantity).map((x,i)=>({...emptyLine(nextLine+i,x.item_code),quantity:String(Number((x.planned_quantity-x.issued_quantity).toFixed(4))),rate_per_ha:String(x.rate_per_ha)})));setNextLine(n=>n+job.lines.length);setDropdown(null);resetEdit()};
 const menu=(id:string,title:string,choices:{label:string;value:string;onSelect:()=>void}[],searchable=false)=> <View style={styles.dropdown}>
  <Pressable style={styles.selector} onPress={()=>{setDropdown(dropdown===id?null:id);setSearch("")}}><ThemedText>{title}  ▾</ThemedText></Pressable>
  {dropdown===id?<View style={[styles.choices,id==="orders"&&styles.poChoices]}>{searchable?<TextInput style={styles.input} placeholder="Search..." placeholderTextColor="#777" value={search} onChangeText={setSearch}/>:null}
   <ScrollView style={{maxHeight:id==="orders"?140:190}} nestedScrollEnabled>{choices.filter(o=>!searchable||o.label.toLowerCase().startsWith(search.trim().toLowerCase())).map(o=><Pressable key={o.value} style={styles.choice} onPress={()=>{o.onSelect();setDropdown(null);setSearch("");resetEdit()}}><ThemedText>{o.label}</ThemedText></Pressable>)}</ScrollView>
  </View>:null}
 </View>;
 const lineCells=(l:Line,locked=false)=>{
  const product=products.find(p=>p.item_code===l.item_code);
  const reference=tab==="POs Outstanding"&&!directGrv?selectedPO?.lines.find(x=>x.item_code===l.item_code):tab==="Planned Issue"?selectedJob?.lines.find(x=>x.item_code===l.item_code):null;
  const max=tab==="POs Outstanding"&&!directGrv&&reference?(reference as OrderLine).ordered_quantity-(reference as OrderLine).received_quantity:tab==="Planned Issue"&&reference?(reference as SprayLine).planned_quantity-(reference as SprayLine).issued_quantity:null;
  return <View key={l.id} style={styles.line}>
   <View style={styles.productColumn}>
    {locked?<ThemedText>{product?.item_name??l.item_code}</ThemedText>:<Pressable style={styles.selector} onPress={()=>{setPickerLine(l.id);setPickerSearch("")}}><ThemedText numberOfLines={2}>{product?.item_name??"Select product"} ▾</ThemedText></Pressable>}
    <ThemedText style={styles.muted}>{product?.base_unit??""}</ThemedText>
   </View>
   {tab==="POs Outstanding"&&!directGrv?<><View style={styles.numberColumn}><ThemedText>{(reference as OrderLine)?.ordered_quantity??"—"}</ThemedText></View><View style={styles.numberColumn}><ThemedText>{(reference as OrderLine)?.received_quantity??"—"}</ThemedText></View><View style={styles.numberColumn}><ThemedText>{currency((reference as OrderLine)?.ordered_unit_price??NaN)}</ThemedText></View></>:null}
   {tab==="Planned Issue"?<View style={styles.numberColumn}><ThemedText>{max?.toFixed(2)??"—"}</ThemedText></View>:null}
   <View style={styles.numberColumn}><TextInput style={[styles.tableInput,{textAlign:"right",fontVariant:["tabular-nums"]}]} keyboardType="decimal-pad" value={l.quantity} onChangeText={v=>changeLine(l.id,"quantity",v)} placeholder="Quantity" placeholderTextColor="#777"/></View>
   {tab==="Purchase Orders"||tab==="POs Outstanding"?<><View style={styles.numberColumn}><TextInput style={styles.tableInput} keyboardType="decimal-pad" value={l.unit_price} onChangeText={v=>changeLine(l.id,"unit_price",v)} placeholder="Unit price" placeholderTextColor="#777"/></View><View style={styles.numberColumn}><ThemedText>{currency(number(l.quantity)*number(l.unit_price))}</ThemedText></View></>:null}
   {tab==="Direct Issue"?<View style={[styles.numberColumn,{width:210}]}><TextInput style={styles.tableInput} value={l.mix_instruction} onChangeText={v=>changeLine(l.id,"mix_instruction",v)} placeholder="e.g. 1 L / 16 L knapsack" /></View>:null}
   {max!==null&&max!==undefined&&number(l.quantity)>max?<ThemedText style={styles.alert}>Over outstanding</ThemedText>:null}
   {!locked?<Pressable style={[styles.remove,styles.removeColumn]} onPress={()=>removeLine(l.id)}><ThemedText style={styles.alert}>×</ThemedText></Pressable>:null}
  </View>;
 };
 const action=tab==="Purchase Orders"?"order":tab==="POs Outstanding"?(directGrv?"direct_grv":"grv"):tab==="Planned Issue"?"planned_issue":"direct_issue";
 const normalizedLines=lines.map(l=>({item_code:l.item_code,quantity:number(l.quantity),...(["Purchase Orders","POs Outstanding"].includes(tab ?? "")?{unit_price:l.unit_price.trim()?number(l.unit_price):null}:{}),...(tab==="Direct Issue"?{mix_instruction:l.mix_instruction.trim()||null}:{})}));
 const payload={owner_code:ownerCode,contract_id:effectiveContract,supplier,order_date:parseJsplDateInput(orderDate),order_id:orderId,job_id:jobId,tracecode_id:traceId,area_ha:part.trim()?number(part):number(area),part_label:part.trim()?"Part "+part.trim()+" ha":"Whole tracecode",spray_type:sprayType,water_rate:number(water),delivery_note:deliveryNote,invoice_number:invoiceNumber,receipt_mode:receiptMode,receipt_date:parseJsplDateInput(receiptDate),lines:normalizedLines};
 const valid=(tab!=="POs Outstanding"||(!!parseJsplDateInput(receiptDate)&&(receiptMode==="dnote"?!!deliveryNote.trim():!!invoiceNumber.trim())&&(receiptMode==="dnote"||lines.every(l=>l.unit_price.trim()!==""&&Number(l.unit_price)>0))))&&!!snapshot&&(tab!=="Purchase Orders"&&tab!=="POs Outstanding"||ownerReady)&&
 (tab!=="Purchase Orders"||(contractReady&&!!supplier.trim()))&&
 (tab!=="POs Outstanding"||!directGrv||(contractReady&&!!supplier.trim()))&&(tab!=="Purchase Orders"||!!parseJsplDateInput(orderDate))&&lines.length>0&&lines.length<=30&&new Set(lines.map(l=>l.item_code)).size===lines.length&&lines.every(l=>{
  if(!products.some(p=>p.item_code===l.item_code))return false;
  const n=number(l.quantity);
  if(!Number.isFinite(n)||n<=0)return false;
  if(["Purchase Orders","POs Outstanding"].includes(tab ?? "")&&l.unit_price.trim()!==""&&(!Number.isFinite(number(l.unit_price))||number(l.unit_price)<0))return false;
  const ref=tab==="POs Outstanding"?selectedPO?.lines.find(x=>x.item_code===l.item_code):tab==="Planned Issue"?selectedJob?.lines.find(x=>x.item_code===l.item_code):null;
  if(tab==="POs Outstanding"&&!directGrv&&(!ref||n>(ref as OrderLine).ordered_quantity-(ref as OrderLine).received_quantity))return false;
  if(tab==="Planned Issue"&&(!ref||n>(ref as SprayLine).planned_quantity-(ref as SprayLine).issued_quantity))return false;
  return true;
 })&&(tab!=="POs Outstanding"||directGrv||!!selectedPO)&&(tab!=="Planned Issue"||!!selectedJob)&&(tab!=="Direct Issue"||!!traceId);
 const submit=async()=>{if(!valid||!confirmed||busy)return;setBusy(true);setStatus("");
  const req=request&&request.action===action&&JSON.stringify(request.payload)===JSON.stringify(payload)?request:{action,payload,id:uuid()};setRequest(req);
  try{
   if(!Array.isArray(req.payload.lines)||req.payload.lines.length===0)throw Error("Cannot post an order without products");
   const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+await token()},body:JSON.stringify({action,request_id:req.id,payload:req.payload})});const d=await r.json();if(!r.ok)throw Error(d.error||("Posting failed (HTTP "+r.status+")"));if(action==="order"&&(!d.result?.order_id||!Array.isArray(d.result.lines)||d.result.lines.length!==req.payload.lines.length))throw Error("Order not confirmed with all product lines");
   if((action==="direct_issue"||action==="planned_issue")&&d.result?.document_id)setLatestIssueDocument(Number(d.result.document_id));
   setStatus("Posted "+tab+" successfully. "+(d.result?.order_id?"PO #"+d.result.order_id:d.result?.document_id?"Document #"+d.result.document_id:d.result?.job_id?"Job #"+d.result.job_id:"")+" — returned to Stock Home.");setConfirmed(false);setRequest(null);await refresh(false);setTab(null);
   if(tab==="POs Outstanding")setOrderId(null);if(tab==="Planned Issue")setJobId(null);
   setLines([emptyLine(nextLine)]);setNextLine(n=>n+1);
  }catch(e){setStatus("NOT POSTED: "+(e instanceof Error?e.message:String(e)))}finally{setBusy(false)}
 };
 const header=(title:string,details:string[])=><View style={styles.documentHead}><ThemedText style={styles.heading}>{title}</ThemedText><View style={styles.headerDetails}>{details.map((x,i)=><ThemedText key={i} style={styles.detail}>{x}</ThemedText>)}</View></View>;
 const currentTrace=traces.find(t=>t.tracecode_id===traceId);
 const gridHead=(cols:string[])=><View style={styles.gridHead}>{cols.map((h,i)=><ThemedText key={i} style={[styles.gridHeading,{flex:i===0?2.4:1}]}>{h}</ThemedText>)}</View>;
 return <ThemedView style={styles.root}>
  <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.watermarkLayer}>
   <Image source={require("../../../assets/images/jspl_farm_watermark.png")} resizeMode="contain" style={[styles.watermark,{width:watermarkSize,height:watermarkSize}]}/>
  </View>
  <ScrollView style={styles.foreground} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
  <View style={styles.brandHeader}><View style={styles.brandHeading}>
   <ThemedText style={styles.brandName}>JOHN SOLE (PVT) LTD</ThemedText>
  <ThemedText style={styles.title}>Stock Control — V2 Test</ThemedText>
  </View><Image source={require("../../../assets/images/jspl_farm_logo.png")} accessibilityLabel="John Sole (Pvt) Ltd" resizeMode="contain" style={styles.logo}/></View>
  <ThemedText style={styles.muted}>Isolated demo records only • TEST_JS • TEST_WH • No live Access changes</ThemedText>
  {tab===null?<View style={styles.home}>
    <ThemedText style={styles.homeTitle}>Stock Home</ThemedText>
    <ThemedText style={styles.muted}>Choose a stock operation</ThemedText>
    <View style={styles.navActions}>

     <Pressable style={styles.back} onPress={()=>router.push("/stock-v2-setup")}><ThemedText style={styles.backText}>Manage Owners & Contracts</ThemedText></Pressable>
     <Pressable style={styles.back} onPress={()=>router.push("/stock-v2-suppliers")}><ThemedText style={styles.backText}>Manage Suppliers</ThemedText></Pressable>
    </View>
    <View style={styles.homeGrid}>{tabs.map(x=><View key={x} style={styles.dashboardCard}>
      <JsplDashboardButton title={x}
       count={x==="POs Outstanding"?new Set((snapshot?.orders??[]).filter(o=>o.ordered_quantity>o.received_quantity).map(o=>o.order_id)).size:x==="GRV"?snapshot?.pending_invoice_count:undefined}
       onPress={()=>x==="Spray Planning"?router.push("/stock-v2-spray-planning"):switchTab(x)}/>
     </View>)}</View>
   </View>:null}
  <View style={styles.navActions}>
   {tab!==null?<Pressable style={styles.back} onPress={()=>switchTab(null)}><ThemedText style={styles.backText}>← Back to Stock Home</ThemedText></Pressable>:null}
   <Pressable style={styles.refresh} onPress={()=>refresh()}><ThemedText>↻ Refresh records</ThemedText></Pressable>
  </View>
  {busy?<ActivityIndicator/>:null}
  {status?<View style={styles.notice}><ThemedText>{status}</ThemedText></View>:null}
  {latestIssueDocument&&tab===null?<Pressable style={styles.submit} onPress={()=>router.push({pathname:"/stock-v2-issue-slip",params:{documentId:String(latestIssueDocument)}})}><ThemedText style={styles.submitText}>Print Issue Slip #{latestIssueDocument}</ThemedText></Pressable>:null}
  {tab===null?null:tab==="Stock Balances"?<View style={styles.sheet}>
   {header("STOCK BALANCES",["Stock Owners: JS / AO","Warehouse: TEST_WH"])}
   <View style={styles.filters}>
    {menu("balanceType",typeFilter||"All input types",[{label:"All input types",value:"all",onSelect:()=>setTypeFilter("")},...inputTypes.map(t=>({label:t,value:t,onSelect:()=>setTypeFilter(t)}))],true)}
    {menu("balanceCategory",categoryFilter||"All input categories",[{label:"All input categories",value:"all",onSelect:()=>setCategoryFilter("")},...inputCategories.map(x=>({label:x,value:x,onSelect:()=>setCategoryFilter(x)}))],true)}
   </View>
   <ThemedText style={styles.muted}>{balanceRows.length} products · Prices are shown only where actual receipt pricing is available.</ThemedText>
   <JsplTable rows={balanceRows} rowKey={x=>x.item_code}
    columns={[
      {key:"item",title:"Product",width:240,value:x=>x.item_name},
      {key:"ai",title:"Active Ingredient",width:210,value:x=>x.active_ingredient||"—"},
      {key:"js_qty",title:"JS On Hand",kind:"number",width:110,value:x=>x.quantity},
      {key:"js_mov",title:"JS Movements",width:116,value:()=>"Movements",onPress:x=>router.push({pathname:"/stock-v2-movements",params:{item_code:x.item_code,owner:"JS"}})},
      {key:"ao_qty",title:"AO On Hand",kind:"number",width:110,value:x=>x.ao_quantity},
      {key:"ao_mov",title:"AO Movements",width:116,value:()=>"Movements",onPress:x=>router.push({pathname:"/stock-v2-movements",params:{item_code:x.item_code,owner:"AO"}})},
      {key:"unit",title:"Unit",width:75,value:x=>x.base_unit},
      {key:"last",title:"JS Last Purchase Price",kind:"number",width:160,value:x=>x.last_purchase_price},
      {key:"supplier",title:"JS Last Purchase Supplier",width:210,value:x=>x.last_purchase_supplier||"—"},
      {key:"avg",title:"JS Weighted Avg Price*",kind:"number",width:170,value:x=>x.weighted_average_price}
     ]}/>
   <ThemedText style={styles.muted}>* Weighted receipt price is a provisional indicator, not a verified perpetual inventory cost. Missing opening stock costs and issue valuations are shown as unavailable.</ThemedText>
  </View>:<View style={styles.sheet}>
   {header(tab.toUpperCase(),["Owner: TEST_JS","Warehouse: TEST_WH","Date: "+new Date().toLocaleDateString("en-GB")])}
   {(tab==="Purchase Orders"||tab==="POs Outstanding")?<View style={{gap:10,paddingBottom:14}}>
     <ThemedText style={styles.label}>1. Stock Owner</ThemedText>
     {menu("owner",owner?owner.owner_name:"Choose Stock Owner",owners.filter(o=>o.active).map(o=>({label:o.owner_name,value:o.owner_code,onSelect:()=>selectOwner(o.owner_code)})))}
     {ownerReady?<><ThemedText style={styles.label}>2. Contract</ThemedText>
     {owner?.default_contract_id?<ThemedText style={styles.readOnly}>{contracts.find(c=>c.contract_id===owner.default_contract_id)?.contract_code||"Owner Default"}</ThemedText>:
       tab==="POs Outstanding"&&!directGrv?<ThemedText style={styles.muted}>Contract inherited from the selected PO</ThemedText>:
       menu("contract",contracts.find(c=>c.contract_id===effectiveContract)?.contract_code||"Choose Contract",contracts.filter(c=>c.active).map(c=>({label:c.contract_code,value:String(c.contract_id),onSelect:()=>{setContractId(c.contract_id);resetEdit()}})))}
     </>:null}
    </View>:null}
   {tab==="Purchase Orders"&&ownerReady&&contractReady?<View style={styles.poHeaderFields}>
     <View style={styles.poSupplier}>
      <ThemedText style={styles.label}>3. Supplier</ThemedText>
      {menu("supplier",supplier||"Choose Supplier",suppliers.filter(x=>x.active).map(x=>({label:x.supplier_name,value:String(x.supplier_id),onSelect:()=>{setSupplier(x.supplier_name);resetEdit()}})),true)}
     </View>
     <View style={styles.poDate}><Field label="Purchase Order Date (DD/MM/YYYY)" value={orderDate} onChange={v=>{setOrderDate(v);resetEdit()}}/>
       {!parseJsplDateInput(orderDate)?<ThemedText style={styles.alert}>Enter a valid date, e.g. 19/10/2026</ThemedText>:null}
     </View>
   </View>:null}
   {tab==="POs Outstanding"&&ownerReady&& (directGrv?contractReady:true)?<>
     <View style={styles.filters}><Pressable style={[styles.refresh,receiptMode==="dnote"&&styles.navActive]} onPress={()=>{setReceiptMode("dnote");resetEdit()}}><ThemedText style={receiptMode==="dnote"?styles.navActiveText:undefined}>DNote</ThemedText></Pressable><Pressable style={[styles.refresh,receiptMode==="invoice"&&styles.navActive]} onPress={()=>{setReceiptMode("invoice");resetEdit()}}><ThemedText style={receiptMode==="invoice"?styles.navActiveText:undefined}>Invoice GRV</ThemedText></Pressable></View>
     <Field label={receiptMode==="dnote"?"Delivery Note Date (DD/MM/YYYY)":"Invoice Date (DD/MM/YYYY)"} value={receiptDate} onChange={v=>{setReceiptDate(v);resetEdit()}}/>
     {receiptMode==="invoice"?<Field label="Supplier Invoice Number" value={invoiceNumber} onChange={v=>{setInvoiceNumber(v);resetEdit()}}/>:null}
     {receiptMode==="dnote"?<Field label="Delivery Note Number" value={deliveryNote} onChange={v=>{setDeliveryNote(v);resetEdit()}}/>:null}
    {!directGrv?<Pressable style={styles.refresh} onPress={()=>refresh()}><ThemedText>↻ Reload outstanding purchase orders</ThemedText></Pressable>:null}
    {!directGrv&&orders.length===0?<ThemedText style={styles.alert}>No outstanding DEMO POs returned. Only successfully posted and unreceived orders are listed.</ThemedText>:null}
    {!directGrv?menu("orders",selectedPO?"PO #"+selectedPO.id+" — "+selectedPO.supplier:"Choose outstanding purchase order",orders.map(o=>({label:"PO #"+o.id+" · "+o.supplier+" · "+o.lines.length+" products",value:String(o.id),onSelect:()=>choosePO(o)})),true):null}
    {directGrv?<View style={styles.poHeaderFields}>
      <View style={styles.poSupplier}><ThemedText style={styles.label}>3. Supplier / Source</ThemedText>
      {menu("supplier",supplier||"Choose Supplier",suppliers.filter(x=>x.active).map(x=>({label:x.supplier_name,value:String(x.supplier_id),onSelect:()=>{setSupplier(x.supplier_name);resetEdit()}})),true)}</View>
    </View>:null}
    {!directGrv&&selectedPO?<><ThemedText>Original PO: {selectedPO.number}</ThemedText><ThemedText>Supplier: {selectedPO.supplier}</ThemedText></>:directGrv||dropdown==="orders"?null:<View style={styles.grvHelp}><ThemedText style={styles.muted}>Choose a purchase order above to load its outstanding lines.</ThemedText></View>}
   </>:null}
   {tab==="Planned Issue"?<>{menu("jobs",selectedJob?"Spray job #"+selectedJob.id+" — "+selectedJob.trace:"Choose outstanding spray programme",jobs.map(j=>({label:"Job #"+j.id+" · "+j.trace+" · "+j.lines.length+" products",value:String(j.id),onSelect:()=>chooseJob(j)})),true)}</>:null}
   {tab==="Direct Issue"?<View style={styles.filters}>
    {menu("crops",crops.find(c=>c.crop_id===cropId)?.crop_name??"All crops",[{label:"All crops",value:"all",onSelect:()=>{setCropId(null);setTraceId(null)}},...crops.map(c=>({label:c.crop_name,value:String(c.crop_id),onSelect:()=>{setCropId(c.crop_id);setTraceId(null)}}))])}
    {menu("traces",currentTrace?.tracecode_name??"Choose active tracecode",activeTraces.map(t=>({label:t.tracecode_name,value:String(t.tracecode_id),onSelect:()=>{setTraceId(t.tracecode_id);setArea(String(t.tracecode_size??""));setPart("");}})),true)}
   </View>:null}
   {((tab!=="Purchase Orders"&&tab!=="POs Outstanding")||(ownerReady&&contractReady&&(tab!=="POs Outstanding"||directGrv||!!selectedPO)))?<><View style={styles.productSectionHeading}><ThemedText style={styles.section}>Product lines</ThemedText></View>
   <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{minWidth:tab==="POs Outstanding"&&!directGrv?1130:tab==="Purchase Orders"?790:tab==="Planned Issue"?710:650}}>
    <View style={{flex:1}}>
     <View style={styles.lineHeader}>
      {(tab==="POs Outstanding"&&!directGrv?["Product","Ordered","Prev. rec.","PO price","Qty received","Actual price","Line total"]:tab==="Planned Issue"?["Product","Outstanding","Qty issue"]:tab==="Purchase Orders"?["Product","Qty ordered","Unit price","Line total"]:directGrv?["Product","Qty received","Actual price","Line total"]:["Product","Qty issue","Mix Rate (optional)"]).map((x,i)=><View key={i} style={i===0?styles.productColumn:styles.numberColumn}><ThemedText style={styles.gridHeading}>{x}</ThemedText></View>)}
      {(directGrv||!["POs Outstanding","Planned Issue"].includes(tab ?? ""))?<View style={styles.removeColumn}/>:null}
     </View>
     {lines.map(l=>lineCells(l,(tab==="POs Outstanding"&&!directGrv)||tab==="Planned Issue"))}
    </View>
   </ScrollView>
   {pickerLine!==null?<View style={styles.pickerPanel}>
    <View style={styles.pickerTop}><ThemedText style={styles.section}>Choose product</ThemedText><Pressable onPress={()=>setPickerLine(null)}><ThemedText>Close</ThemedText></Pressable></View>
    <TextInput style={styles.input} placeholder="Find product" value={pickerSearch} onChangeText={setPickerSearch}/>
    {products.filter(p=>p.item_name.toLowerCase().startsWith(pickerSearch.trim().toLowerCase())&&!lines.some(x=>x.id!==pickerLine&&x.item_code===p.item_code)).map(p=><Pressable key={p.item_code} style={styles.choice} onPress={()=>{changeLine(pickerLine,"item_code",p.item_code);setPickerLine(null)}}><ThemedText>{p.item_name} ({p.base_unit})</ThemedText></Pressable>)}
   </View>:null}
   {(directGrv||!["POs Outstanding","Planned Issue"].includes(tab ?? ""))?<Pressable style={styles.add} onPress={addLine}><ThemedText>＋ Add product line</ThemedText></Pressable>:null}
   {["Purchase Orders","POs Outstanding"].includes(tab ?? "")?<ThemedText style={styles.total}>Document total: {currency(lines.reduce((s,l)=>s+number(l.quantity)*number(l.unit_price||"0"),0))}</ThemedText>:null}
   <ThemedText style={styles.label}>Products on this document: {lines.filter(l=>products.some(p=>p.item_code===l.item_code)&&Number(l.quantity)>0).length} / {lines.length}</ThemedText>
   {status.startsWith("NOT POSTED")?<View style={styles.errorPanel}><ThemedText style={styles.errorText}>{status}</ThemedText></View>:null}
  <View style={styles.footer}><Pressable onPress={()=>setConfirmed(x=>!x)} style={styles.confirm}><ThemedText>{confirmed?"☑":"☐"} Confirm TEST transaction</ThemedText></Pressable><Pressable disabled={!valid||!confirmed||busy} onPress={submit} style={[styles.submit,(!valid||!confirmed||busy)&&styles.off]}><ThemedText style={styles.submitText}>{busy?"Posting…":"Post "+tab}</ThemedText></Pressable></View>
   {!valid?<ThemedText style={styles.alert}>Complete the required fields, product and positive quantities before posting.</ThemedText>:null}</>:<ThemedText style={styles.muted}>Select Stock Owner and Contract first, then supplier or outstanding PO.</ThemedText>}
  </View>}
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({
 watermarkLayer:{...StyleSheet.absoluteFillObject,zIndex:0,alignItems:"center",justifyContent:"center"},watermark:{opacity:0.08},foreground:{flex:1,zIndex:1,backgroundColor:"transparent"},brandHeader:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:jsplSpacing.lg},brandHeading:{flex:1,minWidth:0,gap:jsplSpacing.sm},brandName:{fontSize:12,fontWeight:"700",letterSpacing:1,color:jsplColors.primary},logo:{width:80,height:80,flexShrink:0},
grvHelp:{marginTop:jsplSpacing.lg,paddingVertical:jsplSpacing.sm,paddingHorizontal:jsplSpacing.md,backgroundColor:jsplColors.background,borderRadius:jsplRadii.sm},poHeaderFields:{flexDirection:"row",flexWrap:"wrap",alignItems:"flex-start",gap:24,paddingBottom:20,marginBottom:12,borderBottomWidth:1,borderBottomColor:jsplColors.border},poSupplier:{flex:2,minWidth:270},poDate:{flex:1,minWidth:235},productSectionHeading:{paddingTop:14,paddingBottom:12,marginTop:12},sprayFields:{flexDirection:"row",flexWrap:"wrap",alignItems:"flex-end",gap:12},readOnly:{padding:12,backgroundColor:"#e7edf2",borderWidth:1,borderColor:"#b0bfcb",borderRadius:4,minHeight:43},errorPanel:{backgroundColor:"#fff0ed",borderWidth:1,borderColor:"#bf4436",padding:12,borderRadius:5},errorText:{color:"#8a241a",fontWeight:"700"},
 home:{gap:jsplDashboardTheme.sectionGap,paddingVertical:jsplSpacing.lg},homeTitle:{fontSize:jsplDashboardTheme.headingSize,fontWeight:"700",color:jsplDashboardTheme.heading},homeGrid:{flexDirection:"row",flexWrap:"wrap",gap:jsplDashboardTheme.cardGap},dashboardCard:{flexGrow:1,flexBasis:jsplDashboardTheme.cardPreferredWidth,minWidth:jsplDashboardTheme.cardMinWidth},homeButton:{flexGrow:1,flexBasis:230,minWidth:210,minHeight:100,borderWidth:1,borderColor:"#9cb0c0",borderRadius:8,backgroundColor:"#edf3f8",padding:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},homeButtonText:{fontSize:18,fontWeight:"700",color:"#244d69"},homeArrow:{fontSize:30,color:"#537a96"},back:{alignSelf:"flex-start",backgroundColor:jsplColors.successTint,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,paddingVertical:10,paddingHorizontal:16},backText:{fontWeight:"700",color:jsplColors.primaryDark},
 pickerPanel:{padding:12,borderWidth:1,borderColor:"#9babb8",borderRadius:5,gap:8,maxWidth:540},pickerTop:{flexDirection:"row",justifyContent:"space-between"},productColumn:{width:260,paddingHorizontal:6,justifyContent:"center"},numberColumn:{width:135,paddingHorizontal:6,justifyContent:"center"},removeColumn:{width:44},root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.xl,gap:jsplSpacing.lg,paddingBottom:50,backgroundColor:"transparent"},title:{fontSize:23,fontWeight:"700",color:jsplColors.primaryDark},muted:{fontSize:12,color:"#82888f"},nav:{flexDirection:"row",flexWrap:"wrap",borderBottomWidth:2,borderColor:"#486986"},navTab:{backgroundColor:"#e7ebf0",paddingVertical:11,paddingHorizontal:16,borderTopLeftRadius:4,borderTopRightRadius:4},navActive:{backgroundColor:"#345f81"},navActiveText:{color:"white",fontWeight:"700"},navActions:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:12},poChoices:{backgroundColor:"#fff",maxHeight:210,overflow:"hidden",marginBottom:12},refresh:{alignSelf:"flex-start",padding:9,borderWidth:1,borderColor:"#a5b1bd",borderRadius:5},notice:{borderWidth:1,borderColor:"#a3b4c1",padding:10,borderRadius:5},sheet:{padding:jsplSpacing.lg,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,gap:jsplSpacing.md,backgroundColor:"rgba(255,255,255,0.65)"},documentHead:{gap:6,borderBottomWidth:1,borderColor:"#b5bfc9",paddingBottom:10},heading:{fontSize:17,fontWeight:"700"},headerDetails:{flexDirection:"row",flexWrap:"wrap",gap:16},detail:{fontSize:12,color:"#697b87"},field:{flex:1,gap:5,minWidth:150},label:{fontWeight:"600",fontSize:13},input:{minHeight:44,paddingHorizontal:jsplSpacing.md,paddingVertical:9,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,color:"#222",backgroundColor:"#fff"},filters:{flexDirection:"row",flexWrap:"wrap",gap:12},dropdown:{flex:1,minWidth:210,maxWidth:500,gap:4},selector:{padding:10,borderWidth:1,borderColor:"#9aabb7",borderRadius:4},choices:{padding:6,borderWidth:1,borderColor:"#bbc3cb",borderRadius:4,gap:4},choice:{padding:10,borderBottomWidth:1,borderColor:"#e6e7e9"},section:{fontSize:14,fontWeight:"700",marginTop:6},lineHeader:{flexDirection:"row",paddingVertical:10,backgroundColor:jsplColors.successTint},gridHeading:{fontSize:12,fontWeight:"700",paddingHorizontal:5},line:{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderColor:"#d9dfe4",paddingVertical:6},cell:{paddingHorizontal:4},tableInput:{minHeight:44,padding:9,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,backgroundColor:"#fff",color:"#111"},remove:{paddingHorizontal:8},alert:{color:"#a93525"},add:{borderWidth:1,borderColor:"#a7b8c4",padding:10,alignSelf:"flex-start",borderRadius:5},total:{fontWeight:"700",textAlign:"right"},footer:{flexDirection:"row",flexWrap:"wrap",justifyContent:"flex-end",gap:15,alignItems:"center"},confirm:{padding:12,borderWidth:1,borderColor:"#9babb9",borderRadius:4},submit:{backgroundColor:jsplColors.primary,paddingVertical:13,paddingHorizontal:25,borderRadius:5},submitText:{color:"white",fontWeight:"700"},off:{backgroundColor:"#a9adb0"},gridHead:{flexDirection:"row",backgroundColor:jsplColors.successTint,paddingVertical:8},registerRow:{flexDirection:"row",paddingVertical:8,borderBottomWidth:1,borderColor:"#e2e6e8",gap:5}
});