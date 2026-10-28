import {useEffect,useMemo,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {supabase} from "../../../supabase";
import {displayJsplDate} from "@/utils/jspl-input";
import {jsplColors,jsplSpacing,jsplRadii} from "@/constants/jspl-design";
const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type DLine={document_id:number;document_date:string;delivery_note:string;delivery_note_date:string|null;supplier_name:string;owner_code:string;item_code:string;item_name:string;base_unit:string;line_id:number;quantity:number;order_id?:number|null};
type POLine={owner_code:string;order_id:number;order_number:string;supplier_name:string;item_code:string;item_name:string;base_unit:string;ordered_quantity:number;received_quantity:number;ordered_unit_price:number|null;status:string;order_line_id:number};
type Chosen={kind:"DN"|"PO";key:string;item_code:string;quantity:string;price:string;source:number;max:number;orderLineId?:number};
const dateISO=(v:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());if(!m)return null;const iso=m[3]+"-"+m[2]+"-"+m[1];const d=new Date(iso+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;};
const money=(n:number)=>Number.isFinite(n)?n.toFixed(2):"0.00";
export default function GRVOutstanding(){
 const [dn,setDn]=useState<DLine[]>([]),[po,setPo]=useState<POLine[]>([]);
 const [owner,setOwner]=useState(""),[supplier,setSupplier]=useState(""),[type,setType]=useState<""|"dnote"|"grv">("");
 const [date,setDate]=useState(new Date().toLocaleDateString("en-GB")),[number,setNumber]=useState("");
 const [chosen,setChosen]=useState<Record<string,Chosen>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=async()=>{setBusy(true);setError("");try{
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
  const headers={authorization:"Bearer "+session.access_token};
  const [a,b]=await Promise.all([fetch(endpoint+"?outstanding_dnotes=1",{headers}),fetch(endpoint,{headers})]);
  const [x,y]=await Promise.all([a.json(),b.json()]);
  if(!a.ok||!b.ok)throw Error(x.error||y.error||"Unable to load supplier lines");
  setDn(x.rows??[]);setPo(y.orders??[]);
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 const owners=useMemo(()=>[...new Set([...dn.map(x=>x.owner_code),...po.map(x=>x.owner_code)])].sort(),[dn,po]);
 const suppliers=useMemo(()=>[...new Set([...dn,...po].filter(x=>x.owner_code===owner).map(x=>x.supplier_name))].sort(),[dn,po,owner]);
 const outstandingDN=dn.filter(x=>x.owner_code===owner&&x.supplier_name===supplier);
 const supplierPO=po.filter(x=>x.owner_code===owner&&x.supplier_name===supplier&&x.status==="approved");
 const outstandingPO=supplierPO.filter(x=>x.ordered_quantity>x.received_quantity);
 const receivedPending=outstandingDN.reduce((a,x)=>a+Number(x.quantity||0),0);
 const pick=(row:Chosen)=>setChosen(old=>old[row.key]?Object.fromEntries(Object.entries(old).filter(([k])=>k!==row.key)):{...old,[row.key]:row});
 const edit=(key:string,field:"quantity"|"price",value:string)=>setChosen(old=>old[key]?{...old,[key]:{...old[key],[field]:value}}:old);
 const lines=Object.values(chosen);
 const valid=!!owner&&!!supplier&&!!type&&!!dateISO(date)&&!!number.trim()&&lines.length>0&&lines.every(x=>(type==="dnote"||Number.isFinite(Number(x.price))&&Number(x.price)>0)&&(x.kind==="DN"||Number.isFinite(Number(x.quantity))&&Number(x.quantity)>0&&Number(x.quantity)<=x.max))&&(type!=="dnote"||(lines.every(x=>x.kind==="PO")&&new Set(lines.map(x=>x.source)).size===1));
 const submitCombined=async()=>{if(!valid||busy||type!=="grv")return;setBusy(true);setError("");setSuccess("");try{
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
  const grouped=new Map<string,{item_code:string;invoice_quantity:number;unit_price:number}>();
  const receipts=new Map<string,{item_code:string;quantity:number}>();
  for(const line of lines){const prior=grouped.get(line.item_code),price=Number(line.price),quantity=Number(line.quantity);
   if(prior&&prior.unit_price!==price)throw Error("Use separate GRVs for different prices of the same product.");
   grouped.set(line.item_code,{item_code:line.item_code,invoice_quantity:(prior?.invoice_quantity??0)+quantity,unit_price:price});
   if(line.kind==="PO"){const v=receipts.get(line.item_code);receipts.set(line.item_code,{item_code:line.item_code,quantity:(v?.quantity??0)+quantity});}
  }
  const requestId="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,v=>{const n=Math.floor(Math.random()*16);return(v==="x"?n:(n&3)|8).toString(16)});
  const payload={owner_code:owner,supplier,invoice_number:number.trim(),invoice_date:dateISO(date),receipt_date:dateISO(date),
   invoice_lines:[...grouped.values()],allocations:lines.filter(x=>x.kind==="DN").map(x=>({line_id:Number(x.key.slice(3)),quantity:Number(x.quantity)})),
   new_receipts:[...receipts.values()],
   po_allocations:lines.filter(x=>x.kind==="PO").map(x=>({order_line_id:x.orderLineId,item_code:x.item_code,quantity:Number(x.quantity)}))};
  const response=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+session.access_token,"content-type":"application/json"},body:JSON.stringify({action:"combined_grv",request_id:requestId,payload})});
  const result=await response.json();if(!response.ok)throw Error(result.error||"GRV posting failed");
  setChosen({});setNumber("");setSuccess("Combined GRV saved and valued. Existing D-Note quantities were not posted again.");await load();
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const submitDNote=async()=>{if(!valid||busy||type!=="dnote")return;
  const selected=lines.filter(x=>x.kind==="PO"),poIds=[...new Set(selected.map(x=>x.source))];
  if(selected.length!==lines.length||poIds.length!==1){setError("A delivery note must use lines from one outstanding PO.");return;}
  setBusy(true);setError("");setSuccess("");
  try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
   const id="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,v=>{const n=Math.floor(Math.random()*16);return(v==="x"?n:(n&3)|8).toString(16)});
   const payload={owner_code:owner,supplier,order_id:poIds[0],receipt_mode:"dnote",delivery_note:number.trim(),receipt_date:dateISO(date),lines:selected.map(x=>({item_code:x.item_code,quantity:Number(x.quantity)}))};
   const response=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+session.access_token,"content-type":"application/json"},body:JSON.stringify({action:"grv",request_id:id,payload})});
   const result=await response.json();if(!response.ok)throw Error(result.error||"D-Note posting failed");
   setChosen({});setNumber("");setSuccess("D-Note received into stock. Unit prices remain pending GRV.");await load();
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const selection=(id:string,text:string,selected:boolean,onPress:()=>void)=><Pressable key={id} onPress={onPress} style={[s.option,selected&&s.active]}><ThemedText style={selected?s.activeText:undefined}>{text}</ThemedText></Pressable>;
 return <ThemedView style={s.root}><ScrollView contentContainerStyle={s.page}>
  <JsplModuleHeader title="Stock Receiving" backLabel="Stock Dashboard" backHref="/stock-test" showMain />
  {busy?<ActivityIndicator/>:null}{error?<ThemedText style={s.warning}>{error}</ThemedText>:null}{success?<ThemedText>{success}</ThemedText>:null}
  <View style={s.panel}><ThemedText style={s.label}>Stock Owner</ThemedText><View style={s.wrap}>{owners.map(x=>selection(x,x,x===owner,()=>{setOwner(x);setSupplier("");setType("");setChosen({})}))}</View></View>
  {!!owner?<View style={s.panel}><ThemedText style={s.label}>Supplier</ThemedText><View style={s.wrap}>{suppliers.map(x=>selection(x,x,x===supplier,()=>{setSupplier(x);setType("");setChosen({})}))}</View></View>:null}
  {!!supplier?<View style={s.panel}><ThemedText style={s.label}>Document Type</ThemedText><View style={s.wrap}>{selection("dnote","Delivery Note",type==="dnote",()=>{setType("dnote");setChosen({})})}{selection("grv","GRV — Final Valuation",type==="grv",()=>{setType("grv");setChosen({})})}</View></View>:null}
  {!!type?<View style={s.panel}><ThemedText style={s.label}>Date (DD/MM/YYYY)</ThemedText><TextInput style={s.input} value={date} onChangeText={setDate} placeholder="DD/MM/YYYY"/></View>:null}
  {!!type&&!!dateISO(date)?<View style={s.panel}><ThemedText style={s.label}>{type==="grv"?"Supplier Invoice / Delivery Reference":"Delivery Note Number"}</ThemedText><TextInput style={s.input} value={number} onChangeText={setNumber} placeholder="Enter document number"/></View>:null}
  {!!type&&!!dateISO(date)&&!!number.trim()?<View style={s.panel}>
   <ThemedText style={s.label}>{type==="grv"?"Received D-Notes awaiting prices, and undelivered PO lines":"Outstanding Purchase Order lines"}</ThemedText>
   <ThemedText style={s.muted}>Supplier summary: {outstandingDN.length} unpriced D-Note lines ({receivedPending} units across products) · {outstandingPO.length} PO lines not fully delivered.</ThemedText>
   <ThemedText style={s.muted}>{type==="dnote"?"Select the PO products physically delivered. Enter received quantity only; pricing is NOT required.":"Select the supplier lines to include. D-Note quantities are locked and require final prices; direct PO receipts require quantity and price."}</ThemedText>
   {type==="grv"?outstandingDN.map(x=>{const key="DN:"+x.line_id,entry=chosen[key];return <View key={key} style={s.line}>
    {selection(key,(entry?"☑ ":"□ ")+x.delivery_note+" · "+displayJsplDate(x.delivery_note_date||x.document_date)+" · "+x.item_name+" ("+x.base_unit+")",!!entry,()=>pick({kind:"DN",key,item_code:x.item_code,quantity:String(x.quantity),price:"0",source:x.document_id,max:x.quantity}))}
    <ThemedText>Delivered: {x.quantity} {x.base_unit} · Locked</ThemedText>
    {entry?<View><ThemedText style={s.label}>Required unit price</ThemedText><TextInput style={[s.input,s.required]} keyboardType="decimal-pad" value={entry.price} onChangeText={v=>edit(key,"price",v)}/></View>:null}
   </View>}):null}
   {type==="dnote"?<ThemedText style={s.muted}>One D-Note may contain several products from the same PO. Select another PO for a separate D-Note; the current receipt endpoint does not support combining POs safely.</ThemedText>:null}
   {outstandingPO.map(x=>{const key="PO:"+x.order_line_id,entry=chosen[key],remaining=Math.max(0,x.ordered_quantity-x.received_quantity);return <View key={key} style={s.line}>
    {selection(key,(entry?"☑ ":"□ ")+x.order_number+" · "+x.item_name+" ("+x.base_unit+")",!!entry,()=>pick({kind:"PO",key,item_code:x.item_code,quantity:"0",price:"0",source:x.order_id,max:remaining,orderLineId:x.order_line_id}))}
    <ThemedText>Ordered: {x.ordered_quantity} · Physically received: {x.received_quantity} · Not yet delivered: {remaining} {x.base_unit}</ThemedText>
    {entry?<View style={s.wrap}><View style={s.field}><ThemedText style={s.label}>Required qty (max {remaining})</ThemedText><TextInput style={[s.input,s.required]} keyboardType="decimal-pad" value={entry.quantity} onChangeText={v=>edit(key,"quantity",v)}/></View>{type==="grv"?<View style={s.field}><ThemedText style={s.label}>Required unit price</ThemedText><TextInput style={[s.input,s.required]} keyboardType="decimal-pad" value={entry.price} onChangeText={v=>edit(key,"price",v)}/></View>:null}</View>:null}
   </View>})}
   {type==="grv"&&supplierPO.some(x=>x.received_quantity>0)?<ThemedText style={s.muted}>Received quantities awaiting valuation are listed above as D-Note lines. Do not select a PO line again for quantities already received.</ThemedText>:null}
   {(type==="grv"?!outstandingDN.length&&!outstandingPO.length:!outstandingPO.length)?<ThemedText>No outstanding lines for this supplier.</ThemedText>:null}
   <ThemedText style={s.label}>Selected: {lines.length} lines {type==="grv"?" · Total value: USD "+money(lines.reduce((a,x)=>a+Number(x.quantity)*Number(x.price),0)):""}</ThemedText>
   {type==="dnote"?<Pressable disabled={!valid||busy} onPress={()=>void submitDNote()} style={[s.submit,(!valid||busy)&&s.disabled]}><ThemedText style={s.submitText}>Receive D-Note into Stock</ThemedText></Pressable>:null}

   {type==="grv"?<Pressable disabled={!valid||busy} onPress={()=>void submitCombined()} style={[s.submit,(!valid||busy)&&s.disabled]}><ThemedText style={s.submitText}>Save Combined GRV</ThemedText></Pressable>:null}
  </View>:null}
 </ScrollView></ThemedView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},heading:{fontSize:22,fontWeight:"700",color:jsplColors.primaryDark},panel:{backgroundColor:"#fff",padding:14,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,gap:9},label:{fontWeight:"700"},muted:{color:jsplColors.textSecondary},warning:{color:jsplColors.danger},wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},option:{borderWidth:1,borderColor:jsplColors.border,padding:11,borderRadius:6},active:{backgroundColor:jsplColors.primary},activeText:{color:"#fff",fontWeight:"700"},line:{paddingVertical:11,borderBottomWidth:1,borderColor:jsplColors.border,gap:7},field:{minWidth:170,flex:1},input:{borderWidth:1,borderColor:jsplColors.border,backgroundColor:"#fff",padding:10,borderRadius:5,minHeight:42,color:jsplColors.text},required:{borderColor:"#e5a700",borderWidth:2,backgroundColor:"#fff4cb"},submit:{backgroundColor:jsplColors.primary,padding:14,borderRadius:6,alignSelf:"flex-start"},submitText:{color:"#fff",fontWeight:"700"},disabled:{opacity:0.5}});
