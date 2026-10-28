import {StockV2Header} from "@/components/jspl/StockV2Header";
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
type POLine={order_date:string;owner_code:string;order_id:number;order_number:string;supplier_name:string;item_code:string;item_name:string;base_unit:string;ordered_quantity:number;received_quantity:number;ordered_unit_price:number|null;status:string;order_line_id:number};
type Product={item_code:string;item_name:string;base_unit:string};
type Chosen={kind:"DN"|"PO"|"DIRECT";key:string;item_code:string;quantity:string;price:string;source:number;max:number;orderLineId?:number};
const dateISO=(v:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());if(!m)return null;const iso=m[3]+"-"+m[2]+"-"+m[1];const d=new Date(iso+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;};
const money=(n:number)=>Number.isFinite(n)?n.toFixed(2):"0.00";
const shortPO=(value:string)=>{const s=String(value||"");return s.length>16?s.slice(-10):s;};
export default function GRVOutstanding(){
 const [dn,setDn]=useState<DLine[]>([]),[po,setPo]=useState<POLine[]>([]),[products,setProducts]=useState<Product[]>([]);
 const [noPO,setNoPO]=useState(false);
 const [owner,setOwner]=useState(""),[supplier,setSupplier]=useState(""),[type,setType]=useState<""|"dnote"|"grv">("");
 const [date,setDate]=useState(new Date().toLocaleDateString("en-GB")),[number,setNumber]=useState("");
 const [chosen,setChosen]=useState<Record<string,Chosen>>({});
 const setRowField=(row:Chosen,field:"quantity"|"price",value:string)=>setChosen(prev=>{const updated={...(prev[row.key]??row),[field]:value};const next={...prev};if(updated.kind==="PO"&&!updated.quantity.trim()&&!updated.price.trim()||updated.kind==="DN"&&!updated.price.trim())delete next[row.key];else next[row.key]=updated;return next;});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=async()=>{setBusy(true);setError("");try{
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
  const headers={authorization:"Bearer "+session.access_token};
  const [a,b]=await Promise.all([fetch(endpoint+"?outstanding_dnotes=1",{headers}),fetch(endpoint,{headers})]);
  const [x,y]=await Promise.all([a.json(),b.json()]);
  if(!a.ok||!b.ok)throw Error(x.error||y.error||"Unable to load supplier lines");
  setDn(x.rows??[]);setPo(y.orders??[]);setProducts((y.items??[]).map((i:Product)=>({item_code:i.item_code,item_name:i.item_name,base_unit:i.base_unit})));

 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 const owners=["JS","AO"];
 const ownerCount=(code:string)=>new Set(po.filter(x=>x.owner_code===code&&x.status==="approved"&&Number(x.ordered_quantity)>Number(x.received_quantity)).map(x=>x.order_id)).size;
 const suppliers=useMemo(()=>[...new Set(po.filter(x=>x.owner_code===owner&&x.status==="approved"&&Number(x.ordered_quantity)>Number(x.received_quantity)).map(x=>x.supplier_name).filter(x=>typeof x==="string"&&x.trim()!==""))].sort(),[po,owner]);
 const outstandingDN=dn.filter(x=>x.owner_code===owner&&x.supplier_name===supplier);
 const supplierPO=po.filter(x=>x.owner_code===owner&&x.supplier_name===supplier&&x.status==="approved");
 const outstandingPO=supplierPO.filter(x=>x.ordered_quantity>x.received_quantity).sort((a,b)=>String(a.order_date).localeCompare(String(b.order_date))||a.order_id-b.order_id||a.order_line_id-b.order_line_id);
 const receivedPending=outstandingDN.reduce((a,x)=>a+Number(x.quantity||0),0);
 const pick=(row:Chosen)=>setChosen(old=>old[row.key]?Object.fromEntries(Object.entries(old).filter(([k])=>k!==row.key)):{...old,[row.key]:row});
 const edit=(key:string,field:"quantity"|"price",value:string)=>setChosen(old=>old[key]?{...old,[key]:{...old[key],[field]:value}}:old);
 const lines=Object.values(chosen);
 const hasPO=outstandingPO.length>0;
 const includeRow=(row:Chosen)=>setChosen(prev=>({...prev,[row.key]:prev[row.key]??row}));
 const valid=!!owner&&!!supplier&&!!type&&!!dateISO(date)&&!!number.trim()&&lines.length>0&&lines.every(x=>(type==="dnote"?(x.price.trim()===""||(Number.isFinite(Number(x.price))&&Number(x.price)>0)):(x.price.trim()!==""&&Number.isFinite(Number(x.price))&&Number(x.price)>0))&&(x.kind==="DN"||(x.quantity.trim()!==""&&Number.isFinite(Number(x.quantity))&&Number(x.quantity)>0&&Number(x.quantity)<=x.max)))&&(type!=="dnote"||lines.every(x=>x.kind==="PO"));
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
  setChosen({});setNumber("");setSupplier("");setType("");setSuccess("Combined GRV saved and valued. Existing D-Note quantities were not posted again.");await load();
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const submitDNote=async()=>{if(!valid||busy||type!=="dnote")return;
  const selected=lines.filter(x=>x.kind==="PO"),poIds=[...new Set(selected.map(x=>x.source))];
  if(!noPO&&selected.length!==lines.length){setError("Select valid outstanding PO lines.");return;}
  if(noPO&&!lines.every(x=>x.kind==="DIRECT")){setError("Choose unplanned receipt products only.");return;}
  setBusy(true);setError("");setSuccess("");
  try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
   const id="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,v=>{const n=Math.floor(Math.random()*16);return(v==="x"?n:(n&3)|8).toString(16)});
   const payload={owner_code:owner,supplier,...(!noPO?{order_id:poIds[0]}:{}),receipt_mode:"dnote",delivery_note:number.trim(),receipt_date:dateISO(date),lines:(noPO?lines:selected).map(x=>({item_code:x.item_code,quantity:Number(x.quantity)}))};
   const multiPayload={owner_code:owner,supplier,delivery_note:number.trim(),receipt_date:dateISO(date),lines:selected.map(x=>({order_line_id:x.orderLineId,quantity:Number(x.quantity),...(x.price.trim()?{unit_price:Number(x.price)}:{})}))};
   const response=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+session.access_token,"content-type":"application/json"},body:JSON.stringify({action:noPO?"unplanned_dnote":"multi_po_dnote",request_id:id,payload:noPO?payload:multiPayload})});
   const result=await response.json();if(!response.ok)throw Error(result.error||"D-Note posting failed");
   setChosen({});setNumber("");setSupplier("");setType("");setSuccess("D-Note received into stock. Unit prices remain pending GRV.");await load();
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const selection=(id:string,text:string,selected:boolean,onPress:()=>void)=><Pressable key={id} onPress={onPress} style={[s.option,selected&&s.active]}><ThemedText style={selected?s.activeText:undefined}>{text}</ThemedText></Pressable>;
 return <ThemedView style={s.root}><ScrollView contentContainerStyle={s.page}>
   <StockV2Header title="POs Outstanding — Receiving" onRefresh={()=>void load()}/>

  {busy?<ActivityIndicator/>:null}{error?<ThemedText style={s.warning}>{error}</ThemedText>:null}{success?<ThemedText>{success}</ThemedText>:null}
  <View style={s.panel}><ThemedText style={s.label}>Stock Owner</ThemedText><View style={s.wrap}>{owners.map(x=>selection(x,x+" ("+ownerCount(x)+")",x===owner,()=>{setOwner(x);setSupplier("");setType("");setChosen({});setNoPO(false)}))}</View></View>
  {!!owner?<View style={s.panel}><ThemedText style={s.label}>Supplier</ThemedText><View style={s.wrap}>{suppliers.map(x=>selection(x,x,x===supplier,()=>{setSupplier(x);setType("");setChosen({})}))}</View></View>:null}
  {!!supplier?<View style={s.panel}><ThemedText style={s.label}>Document Type</ThemedText><View style={s.wrap}>{selection("dnote","Delivery Note",type==="dnote",()=>{setType("dnote");setChosen({});setNoPO(false)})}{selection("grv","Invoice GRV",type==="grv",()=>{setType("grv");setChosen({});setNoPO(false)})}</View></View>:null}
  {!!type?<View style={s.panel}><ThemedText style={s.label}>Date</ThemedText><TextInput style={[s.input,s.required]} value={date} onChangeText={setDate} placeholder="DD/MM/YYYY"/></View>:null}
  {!!type?<View style={s.panel}><ThemedText style={s.label}>{type==="grv"?"Invoice GRV Number":"Delivery Note Number"}</ThemedText><TextInput style={[s.input,s.required]} value={number} onChangeText={setNumber} placeholder="Enter document number"/></View>:null}
  {!!type?<View style={s.panel}>
  <ThemedText style={s.label}>Outstanding documents — enter figures in the yellow cells</ThemedText>
  <ScrollView horizontal><View style={{minWidth:1040}}>
   <View style={s.trow}>{["Document","Date","Product","Ordered / Received","PO Price","Actual Qty","Actual Price"].map((h,i)=><ThemedText key={h} style={[s.tcell,i===2&&s.wide,s.bold]}>{h}</ThemedText>)}</View>
   {type==="grv"?outstandingDN.map(x=>{const key="DN:"+x.line_id,e=chosen[key],r:Chosen={kind:"DN",key,item_code:x.item_code,quantity:String(x.quantity),price:"",source:x.document_id,max:x.quantity};return <View key={key} style={s.trow}>
     <ThemedText style={s.tcell}>{x.delivery_note}</ThemedText><ThemedText style={s.tcell}>{displayJsplDate(x.delivery_note_date||x.document_date)}</ThemedText>
     <ThemedText style={[s.tcell,s.wide]}>{x.item_name}</ThemedText><ThemedText style={s.tcell}>{x.quantity}</ThemedText>
     <ThemedText style={s.tcell}>—</ThemedText><ThemedText style={s.tcell}>{x.quantity} locked</ThemedText>
     <TextInput style={[s.tcell,s.required]} keyboardType="decimal-pad" placeholder="Required" value={e?.price??""} onChangeText={v=>setRowField(r,"price",v)}/>
    </View>}):null}
   {outstandingPO.map(x=>{const key="PO:"+x.order_line_id,e=chosen[key],max=Math.max(0,x.ordered_quantity-x.received_quantity),r:Chosen={kind:"PO",key,item_code:x.item_code,quantity:"",price:"",source:x.order_id,max,orderLineId:x.order_line_id};return <View key={key} style={s.trow}>
     <ThemedText style={s.tcell}>{shortPO(x.order_number)}</ThemedText><ThemedText style={s.tcell}>{displayJsplDate(x.order_date)}</ThemedText>
     <ThemedText style={[s.tcell,s.wide]}>{x.item_name}</ThemedText><ThemedText style={s.tcell}>{x.ordered_quantity} / {x.received_quantity}</ThemedText>
     <ThemedText style={s.tcell}>{x.ordered_unit_price??"—"}</ThemedText>
     <TextInput style={[s.tcell,s.required]} keyboardType="decimal-pad" placeholder={"Max "+max} value={e?.quantity??""} onChangeText={v=>setRowField(r,"quantity",v)}/>
     <TextInput style={[s.tcell,type==="grv"?s.required:s.optional]} keyboardType="decimal-pad" placeholder={type==="grv"?"Required":"Optional"} value={e?.price??""} onChangeText={v=>setRowField(r,"price",v)}/>
    </View>})}
  </View></ScrollView>
  <ThemedText style={s.muted}>{type==="grv"?"Delivery Note quantities are locked. Enter only price. For PO quantities, enter actual quantity and price.":"Enter actual quantities received from POs. Unit price is optional on Delivery Notes."}</ThemedText>
  <ThemedText>{lines.length} line(s) to save — rows with quantities or prices entered are included automatically.</ThemedText>
  {!hasPO&&!outstandingDN.length?<ThemedText>No outstanding documents for this supplier.</ThemedText>:null}
  <Pressable disabled={busy} onPress={()=>{setError("");if(!valid){setError(!dateISO(date)?"Enter a valid date.":!number.trim()?"Enter the document number.":!lines.length?"Enter a quantity or price in a yellow row.":"Complete all highlighted cells on the selected lines.");return;}if(type==="grv")void submitCombined();else void submitDNote()}} style={[s.submit,busy&&s.disabled]}>
  <ThemedText style={s.submitText}>{type==="grv"?"SAVE INVOICE GRV":"SAVE DELIVERY NOTE"}</ThemedText></Pressable>
  </View>:null}
 </ScrollView></ThemedView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},heading:{fontSize:22,fontWeight:"700",color:jsplColors.primaryDark},panel:{backgroundColor:"#fff",padding:14,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,gap:9},label:{fontWeight:"700"},muted:{color:jsplColors.textSecondary},warning:{color:jsplColors.danger},wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},option:{borderWidth:1,borderColor:jsplColors.border,padding:11,borderRadius:6},active:{backgroundColor:jsplColors.primary},activeText:{color:"#fff",fontWeight:"700"},line:{paddingVertical:11,borderBottomWidth:1,borderColor:jsplColors.border,gap:7},field:{minWidth:170,flex:1},input:{borderWidth:1,borderColor:jsplColors.border,backgroundColor:"#fff",padding:10,borderRadius:5,minHeight:42,color:jsplColors.text},required:{borderColor:"#e5a700",borderWidth:2,backgroundColor:"#fff4cb"},optional:{borderColor:"#b3b3b3",borderWidth:1,backgroundColor:"#fff4cb"},submit:{backgroundColor:jsplColors.primary,padding:14,borderRadius:6,alignSelf:"flex-start"},submitText:{color:"#fff",fontWeight:"700"},trow:{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderColor:"#ddd",minHeight:52},tcell:{width:125,padding:7,fontSize:12,color:"#222"},wide:{width:190},bold:{fontWeight:"700"},disabled:{opacity:0.5}});
