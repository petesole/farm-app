import {useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
const url="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Item={item_code:string;item_name:string;base_unit:string;quantity:number};
type Order={order_id:number;order_number:string;item_code:string;supplier_name:string;ordered_quantity:number;received_quantity:number};
type Spray={job_id:number;tracecode_name:string;item_code:string;area_ha:number;rate_per_ha:number;planned_quantity:number;issued_quantity:number;status:string};
type Doc={document_id:number;document_type:string;document_number:string;item_name:string;quantity:number;tracecode_name:string|null};
type Data={items:Item[];orders:Order[];sprays:Spray[];documents:Doc[]};
type Trace={tracecode_id:number;tracecode_name:string};
const makeId=()=> "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==="x"?r:(r&3)|8).toString(16)});
export default function StockV2Workflow(){
 const [data,setData]=useState<Data|null>(null),[traces,setTraces]=useState<Trace[]>([]);
 const [tab,setTab]=useState("Order"),[item,setItem]=useState("DEMO_MOSQUITO"),[trace,setTrace]=useState<number|null>(null);
 const [qty,setQty]=useState("1"),[supplier,setSupplier]=useState("Demo Supplier"),[purpose,setPurpose]=useState("Test job");
 const [orderId,setOrderId]=useState<number|null>(null),[jobId,setJobId]=useState<number|null>(null);
 const [area,setArea]=useState("19"),[rate,setRate]=useState("0.5"),[water,setWater]=useState("200");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[confirm,setConfirm]=useState(false),[pending,setPending]=useState<{id:string;action:string;payload:any}|null>(null);
 const getToken=async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("Sign in to Supabase to use the test stock system");return session.access_token};
 const load=async()=>{setBusy(true);try{const token=await getToken();const res=await fetch(url,{headers:{authorization:"Bearer "+token}});const d=await res.json();if(!res.ok)throw new Error(d.error||"Cannot load stock");setData(d);setMessage("")}catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{load();supabase.from("tracecode").select("tracecode_id,tracecode_name").order("tracecode_name").then(({data})=>{const all=(data??[]) as Trace[];setTraces(all);setTrace(all.find(x=>x.tracecode_name.toUpperCase()==="DOMESTICHS")?.tracecode_id??all[0]?.tracecode_id??null)})},[]);
 const post=async(action:string,payload:any)=>{if(busy)return;setBusy(true);setMessage("");const op=pending&&pending.action===action&&JSON.stringify(pending.payload)===JSON.stringify(payload)?pending:{id:makeId(),action,payload};setPending(op);
  try{const token=await getToken();const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({request_id:op.id,action,payload})});const result=await r.json();if(!r.ok)throw new Error(result.error||"Transaction failed");setPending(null);setConfirm(false);setMessage("Posted successfully: "+JSON.stringify(result.result));const fresh=await fetch(url,{headers:{authorization:"Bearer "+token}});if(fresh.ok)setData(await fresh.json())}
  catch(e){setMessage("Not confirmed: "+(e instanceof Error?e.message:String(e)))}finally{setBusy(false)}
 };
 const itemOptions=data?.items??[];
 const matchingOrders=(data?.orders??[]).filter(o=>o.item_code===item&&o.received_quantity<o.ordered_quantity);
 const matchingJobs=(data?.sprays??[]).filter(j=>j.item_code===item&&j.status==="planned"&&j.issued_quantity<j.planned_quantity);
 const chosenItem=itemOptions.find(i=>i.item_code===item);
 const simpleField=(label:string,value:string,change:(v:string)=>void,keyboardType:"default"|"decimal-pad"="default")=><View style={{flex:1,minWidth:130,gap:3}}><ThemedText style={styles.label}>{label}</ThemedText><TextInput style={styles.input} value={value} onChangeText={v=>{change(v);setConfirm(false)}} keyboardType={keyboardType}/></View>;
 const option=(text:string,selected:boolean,fn:()=>void)=><Pressable key={text} onPress={()=>{fn();setConfirm(false)}} style={[styles.option,selected&&styles.selected]}><ThemedText>{text}</ThemedText></Pressable>;
 const controls=()=>{
  const num=Number(qty),ar=Number(area),rt=Number(rate);
  const validNum=Number.isFinite(num)&&num>0;
  let action="",payload:any={},valid=true;
  if(tab==="Order"){action="order";payload={item_code:item,quantity:num,supplier};valid=validNum}
  if(tab==="GRV"){action="grv";payload={item_code:item,quantity:num,order_id:orderId};valid=validNum&&matchingOrders.some(x=>x.order_id===orderId)}
  if(tab==="Spray Programme"){action="spray";payload={item_code:item,tracecode_id:trace,area_ha:ar,rate_per_ha:rt,water_rate:water};valid=!!trace&&ar>0&&rt>0}
  if(tab==="Planned Issue"){action="planned_issue";payload={item_code:item,job_id:jobId,quantity:num};valid=validNum&&matchingJobs.some(j=>j.job_id===jobId)}
  if(tab==="Direct Issue"){action="direct_issue";payload={item_code:item,tracecode_id:trace,quantity:num};valid=validNum&&!!trace}
  return <View style={styles.panel}>
   <ThemedText style={styles.head}>{tab}</ThemedText>
   <ThemedText style={styles.label}>Product (TEST_JS warehouse)</ThemedText>
   <View style={styles.wrap}>{itemOptions.map(i=>option(i.item_name+" ("+i.base_unit+")",item===i.item_code,()=>{setItem(i.item_code);setOrderId(null);setJobId(null)}))}</View>
   <ThemedText>Available: {chosenItem?.quantity??"—"} {chosenItem?.base_unit??""}</ThemedText>
   {tab==="Order"?simpleField("Supplier",supplier,setSupplier):null}
   {tab==="GRV"?<><ThemedText style={styles.label}>Choose outstanding order</ThemedText><View style={styles.wrap}>{matchingOrders.map(o=>option("PO #"+o.order_id+" remaining "+(o.ordered_quantity-o.received_quantity),orderId===o.order_id,()=>setOrderId(o.order_id)))}</View></>:null}
   {tab==="Planned Issue"?<><ThemedText style={styles.label}>Choose outstanding spray job</ThemedText><View style={styles.wrap}>{matchingJobs.map(j=>option("Job #"+j.job_id+" "+j.tracecode_name+" remaining "+(j.planned_quantity-j.issued_quantity).toFixed(2),jobId===j.job_id,()=>setJobId(j.job_id)))}</View></>:null}
   {["Spray Programme","Direct Issue"].includes(tab)?<><ThemedText style={styles.label}>Allocate to tracecode</ThemedText>
    <ScrollView horizontal style={{maxHeight:56}}>{traces.map(t=>option(t.tracecode_name,trace===t.tracecode_id,()=>setTrace(t.tracecode_id)))}</ScrollView></>:null}
   <View style={styles.wrap}>
    {tab==="Spray Programme"?<>{simpleField("Field area (ha)",area,setArea,"decimal-pad")}{simpleField("Product rate/ha",rate,setRate,"decimal-pad")}{simpleField("Water rate L/ha",water,setWater,"decimal-pad")}</>:simpleField("Quantity ("+(chosenItem?.base_unit??"units")+")",qty,setQty,"decimal-pad")}
   </View>
   {tab==="Spray Programme"?<ThemedText>Planned input: {(ar*rt).toFixed(2)} {chosenItem?.base_unit??""}</ThemedText>:null}
   <Pressable style={styles.option} onPress={()=>setConfirm(v=>!v)}><ThemedText>{confirm?"☑ Confirm this DEMO transaction":"☐ Confirm this DEMO transaction"}</ThemedText></Pressable>
   <Pressable disabled={!valid||!confirm||busy} style={[styles.action,(!valid||!confirm||busy)&&styles.disabled]} onPress={()=>post(action,payload)}><ThemedText style={styles.actionText}>{busy?"Working...":"Post "+tab}</ThemedText></Pressable>
   {!valid?<ThemedText style={styles.warn}>Select an appropriate order / job / tracecode and enter a valid quantity.</ThemedText>:null}
  </View>
 };
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <ThemedText type="title">Stock V2 · Complete Test Workflow</ThemedText>
  <ThemedText style={styles.warn}>TEST_JS · TEST_WH · DEMO products only. No Access or live inventory changes.</ThemedText>
  <View style={styles.wrap}>{["Order","GRV","Balances","Spray Programme","Planned Issue","Direct Issue"].map(x=>option(x,tab===x,()=>{setTab(x);setOrderId(null);setJobId(null)}))}</View>
  <Pressable style={styles.option} onPress={load}><ThemedText>↻ Refresh stock and transactions</ThemedText></Pressable>
  {busy?<ActivityIndicator/>:null}
  {message?<ThemedText style={styles.warn}>{message}</ThemedText>:null}
  {tab==="Balances"?<View style={styles.panel}><ThemedText style={styles.head}>Current warehouse stock</ThemedText>{itemOptions.map(i=><View key={i.item_code} style={styles.record}><ThemedText>{i.item_name}</ThemedText><ThemedText style={styles.head}>{i.quantity} {i.base_unit}</ThemedText></View>)}</View>:controls()}
  <View style={styles.panel}><ThemedText style={styles.head}>Outstanding purchase orders</ThemedText>{(data?.orders??[]).slice(0,15).map(o=><ThemedText key={o.order_id}>{o.order_number}: {o.item_code} — {o.received_quantity}/{o.ordered_quantity} received</ThemedText>)}</View>
  <View style={styles.panel}><ThemedText style={styles.head}>Spray programme</ThemedText>{(data?.sprays??[]).slice(0,15).map(j=><ThemedText key={j.job_id}>#{j.job_id} {j.tracecode_name} {j.item_code} — issued {j.issued_quantity}/{j.planned_quantity} · {j.status}</ThemedText>)}</View>
  <View style={styles.panel}><ThemedText style={styles.head}>Recent posted GRVs and issues</ThemedText>{(data?.documents??[]).slice(0,15).map(d=><ThemedText key={d.document_id}>#{d.document_id} {d.document_type.toUpperCase()} · {d.item_name} {d.quantity} · {d.tracecode_name??"warehouse"}</ThemedText>)}</View>
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({root:{flex:1},page:{padding:16,gap:12,paddingBottom:50},wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},panel:{borderWidth:1,borderColor:"#aaa",borderRadius:12,padding:14,gap:12},head:{fontSize:16,fontWeight:"700"},label:{fontWeight:"600"},option:{padding:10,borderWidth:1,borderColor:"#999",borderRadius:8},selected:{backgroundColor:"#b6e2c9"},input:{borderWidth:1,borderColor:"#888",backgroundColor:"#fff",padding:10,borderRadius:8,color:"#222",minWidth:110},action:{padding:14,backgroundColor:"#1f8251",alignItems:"center",borderRadius:9},disabled:{backgroundColor:"#bbb"},actionText:{color:"white",fontWeight:"800"},warn:{color:"#9c691b"},record:{flexDirection:"row",justifyContent:"space-between",padding:9,borderBottomWidth:1,borderColor:"#ddd"}});