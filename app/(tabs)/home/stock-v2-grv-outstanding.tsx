import {useEffect,useMemo,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {displayJsplDate} from "@/utils/jspl-input";
import {jsplColors,jsplSpacing,jsplRadii} from "@/constants/jspl-design";
const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type DLine={document_id:number;document_date:string;delivery_note:string;delivery_note_date:string|null;supplier_name:string;owner_code:string;item_code:string;item_name:string;base_unit:string;line_id:number;quantity:number;order_id?:number|null};
type POLine={owner_code:string;order_id:number;order_number:string;supplier_name:string;item_code:string;item_name:string;base_unit:string;ordered_quantity:number;received_quantity:number;ordered_unit_price:number|null;status:string};
type Chosen={kind:"DN"|"PO";key:string;item_code:string;quantity:string;price:string;source:number;max:number};
const dateISO=(v:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());if(!m)return null;const iso=m[3]+"-"+m[2]+"-"+m[1];const d=new Date(iso+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;};
const money=(n:number)=>Number.isFinite(n)?n.toFixed(2):"0.00";
export default function GRVOutstanding(){
 const router=useRouter();
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
 const outstandingPO=po.filter(x=>x.owner_code===owner&&x.supplier_name===supplier&&x.ordered_quantity>x.received_quantity);
 const pick=(row:Chosen)=>setChosen(old=>old[row.key]?Object.fromEntries(Object.entries(old).filter(([k])=>k!==row.key)):{...old,[row.key]:row});
 const edit=(key:string,field:"quantity"|"price",value:string)=>setChosen(old=>old[key]?{...old,[key]:{...old[key],[field]:value}}:old);
 const lines=Object.values(chosen);
 const valid=!!owner&&!!supplier&&type==="grv"&&!!dateISO(date)&&!!number.trim()&&lines.length>0&&lines.every(x=>Number(x.price)>0&&Number.isFinite(Number(x.price))&&(x.kind==="DN"||Number(x.quantity)>0&&Number(x.quantity)<=x.max));
 const canLegacy=type==="grv"&&lines.length>0&&lines.every(x=>x.kind==="DN")&&new Set(lines.map(x=>x.source)).size===1&&lines.length===dn.filter(x=>x.document_id===lines[0]?.source).length;
 const submit=async()=>{if(!valid||!canLegacy||busy)return;setBusy(true);setError("");setSuccess("");try{
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
  const payload={document_id:lines[0].source,invoice_number:number.trim(),invoice_date:dateISO(date),lines:lines.map(x=>({line_id:Number(x.key.slice(3)),unit_price:Number(x.price)}))};
  const response=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+session.access_token,"content-type":"application/json"},body:JSON.stringify({action:"match_invoice",payload})});
  const result=await response.json();if(!response.ok)throw Error(result.error||"GRV posting failed");
  setChosen({});setNumber("");setSuccess("GRV priced successfully. Existing D-Note stock was not received again.");await load();
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const selection=(id:string,text:string,selected:boolean,onPress:()=>void)=><Pressable key={id} onPress={onPress} style={[s.option,selected&&s.active]}><ThemedText style={selected?s.activeText:undefined}>{text}</ThemedText></Pressable>;
 return <ThemedView style={s.root}><ScrollView contentContainerStyle={s.page}>
  <Pressable onPress={()=>router.replace("/stock-test")}><ThemedText>← Back to Stock Dashboard</ThemedText></Pressable>
  <ThemedText style={s.heading}>Stock Receiving · Progressive Entry</ThemedText>
  <ThemedText>Choose each field in order. D-Notes receive physical stock; GRVs assign final prices, or receive and price stock directly.</ThemedText>
  <Pressable onPress={()=>void load()} style={s.option}><ThemedText>↻ Refresh outstanding lines</ThemedText></Pressable>
  {busy?<ActivityIndicator/>:null}{error?<ThemedText style={s.warning}>{error}</ThemedText>:null}{success?<ThemedText>{success}</ThemedText>:null}
  <View style={s.panel}><ThemedText style={s.label}>1 · Stock Owner</ThemedText><View style={s.wrap}>{owners.map(x=>selection(x,x,x===owner,()=>{setOwner(x);setSupplier("");setType("");setChosen({})}))}</View></View>
  {!!owner?<View style={s.panel}><ThemedText style={s.label}>2 · Supplier</ThemedText><View style={s.wrap}>{suppliers.map(x=>selection(x,x,x===supplier,()=>{setSupplier(x);setType("");setChosen({})}))}</View></View>:null}
  {!!supplier?<View style={s.panel}><ThemedText style={s.label}>3 · Document Type</ThemedText><View style={s.wrap}>{selection("dnote","Delivery Note",type==="dnote",()=>{setType("dnote");setChosen({})})}{selection("grv","GRV — Final Valuation",type==="grv",()=>{setType("grv");setChosen({})})}</View></View>:null}
  {!!type?<View style={s.panel}><ThemedText style={s.label}>4 · Date (DD/MM/YYYY)</ThemedText><TextInput style={s.input} value={date} onChangeText={setDate} placeholder="DD/MM/YYYY"/></View>:null}
  {!!type&&!!dateISO(date)?<View style={s.panel}><ThemedText style={s.label}>5 · {type==="grv"?"Supplier Invoice / Delivery Reference":"Delivery Note Number"}</ThemedText><TextInput style={s.input} value={number} onChangeText={setNumber} placeholder="Enter document number"/></View>:null}
  {!!type&&!!dateISO(date)&&!!number.trim()?<View style={s.panel}>
   <ThemedText style={s.label}>6 · {type==="grv"?"Outstanding D-Note and PO lines":"Outstanding Purchase Order lines"}</ThemedText>
   <ThemedText style={s.muted}>Select lines to include. D-Note quantities are locked; enter a positive unit price on every GRV line. Direct PO GRV quantities and prices start at zero.</ThemedText>
   {type==="grv"?outstandingDN.map(x=>{const key="DN:"+x.line_id,entry=chosen[key];return <View key={key} style={s.line}>
    {selection(key,(entry?"☑ ":"□ ")+x.delivery_note+" · "+displayJsplDate(x.delivery_note_date||x.document_date)+" · "+x.item_name+" ("+x.base_unit+")",!!entry,()=>pick({kind:"DN",key,item_code:x.item_code,quantity:String(x.quantity),price:"0",source:x.document_id,max:x.quantity}))}
    <ThemedText>Delivered: {x.quantity} {x.base_unit} · Locked</ThemedText>
    {entry?<View><ThemedText style={s.label}>Required unit price</ThemedText><TextInput style={[s.input,s.required]} keyboardType="decimal-pad" value={entry.price} onChangeText={v=>edit(key,"price",v)}/></View>:null}
   </View>}):null}
   {outstandingPO.map(x=>{const key="PO:"+x.order_id+":"+x.item_code,entry=chosen[key],remaining=Math.max(0,x.ordered_quantity-x.received_quantity);return <View key={key} style={s.line}>
    {selection(key,(entry?"☑ ":"□ ")+x.order_number+" · "+x.item_name+" ("+x.base_unit+")",!!entry,()=>pick({kind:"PO",key,item_code:x.item_code,quantity:"0",price:"0",source:x.order_id,max:remaining}))}
    <ThemedText>Ordered {x.ordered_quantity} · Already received {x.received_quantity} · Available {remaining}</ThemedText>
    {entry?<View style={s.wrap}><View style={s.field}><ThemedText style={s.label}>Required qty (max {remaining})</ThemedText><TextInput style={[s.input,s.required]} keyboardType="decimal-pad" value={entry.quantity} onChangeText={v=>edit(key,"quantity",v)}/></View><View style={s.field}><ThemedText style={s.label}>Required unit price</ThemedText><TextInput style={[s.input,s.required]} keyboardType="decimal-pad" value={entry.price} onChangeText={v=>edit(key,"price",v)}/></View></View>:null}
   </View>})}
   {!outstandingDN.length&&!outstandingPO.length?<ThemedText>No outstanding lines for this supplier.</ThemedText>:null}
   <ThemedText style={s.label}>Selected: {lines.length} lines · Total value: USD {money(lines.reduce((a,x)=>a+Number(x.quantity)*Number(x.price),0))}</ThemedText>
   {type==="dnote"?<ThemedText style={s.warning}>D-Note entry is preview-only on this screen until the PO-line receiving action is connected. No stock will be posted here.</ThemedText>:null}
   {type==="grv"&&!canLegacy&&lines.length>0?<ThemedText style={s.warning}>Combined D-Note / direct PO GRV posting is awaiting verified atomic server support. Preview only; posting is disabled to prevent duplicate stock receipts.</ThemedText>:null}
   {type==="grv"&&canLegacy?<Pressable disabled={!valid||busy} onPress={()=>void submit()} style={[s.submit,(!valid||busy)&&s.disabled]}><ThemedText style={s.submitText}>Save fully priced GRV</ThemedText></Pressable>:null}
  </View>:null}
 </ScrollView></ThemedView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},heading:{fontSize:22,fontWeight:"700",color:jsplColors.primaryDark},panel:{backgroundColor:"#fff",padding:14,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,gap:9},label:{fontWeight:"700"},muted:{color:jsplColors.textSecondary},warning:{color:jsplColors.danger},wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},option:{borderWidth:1,borderColor:jsplColors.border,padding:11,borderRadius:6},active:{backgroundColor:jsplColors.primary},activeText:{color:"#fff",fontWeight:"700"},line:{paddingVertical:11,borderBottomWidth:1,borderColor:jsplColors.border,gap:7},field:{minWidth:170,flex:1},input:{borderWidth:1,borderColor:jsplColors.border,backgroundColor:"#fff",padding:10,borderRadius:5,minHeight:42,color:jsplColors.text},required:{borderColor:"#e5a700",borderWidth:2,backgroundColor:"#fff4cb"},submit:{backgroundColor:jsplColors.primary,padding:14,borderRadius:6,alignSelf:"flex-start"},submitText:{color:"#fff",fontWeight:"700"},disabled:{opacity:0.5}});
