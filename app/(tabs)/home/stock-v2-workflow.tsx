import {useEffect,useState} from "react";
import type {ReactNode} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
const url="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Item={item_code:string;item_name:string;base_unit:string;quantity:number};
type Order={order_id:number;order_number:string;item_code:string;supplier_name:string;ordered_quantity:number;received_quantity:number;ordered_unit_price?:number|null};
type Spray={job_id:number;tracecode_name:string;item_code:string;area_ha:number;rate_per_ha:number;planned_quantity:number;issued_quantity:number;status:string};
type Doc={document_id:number;document_type:string;document_number:string;item_name:string;quantity:number;tracecode_name:string|null};
type Data={items:Item[];orders:Order[];sprays:Spray[];documents:Doc[]};
type Trace={tracecode_id:number;tracecode_name:string;crop_id:number|null};
type Crop={crop_id:number;crop_name:string};
const makeId=()=> "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==="x"?r:(r&3)|8).toString(16)});
export default function StockV2Workflow(){
 const [data,setData]=useState<Data|null>(null),[traces,setTraces]=useState<Trace[]>([]),[crops,setCrops]=useState<Crop[]>([]);
 const [tab,setTab]=useState("Order"),[item,setItem]=useState("DEMO_MOSQUITO"),[trace,setTrace]=useState<number|null>(null);
 const [qty,setQty]=useState("1"),[supplier,setSupplier]=useState("Demo Supplier"),[purpose,setPurpose]=useState("Test job");
 const [orderId,setOrderId]=useState<number|null>(null),[jobId,setJobId]=useState<number|null>(null);
 const [area,setArea]=useState("19"),[rate,setRate]=useState("0.5"),[water,setWater]=useState("200");
 const [cropId,setCropId]=useState<number|null>(null),[cropOpen,setCropOpen]=useState(false),[traceSearch,setTraceSearch]=useState(""),[traceOpen,setTraceOpen]=useState(false),[productSearch,setProductSearch]=useState(""),[productOpen,setProductOpen]=useState(false),[orderOpen,setOrderOpen]=useState(false),[unitPrice,setUnitPrice]=useState("7.50");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[confirm,setConfirm]=useState(false),[pending,setPending]=useState<{id:string;action:string;payload:any}|null>(null);
 const getToken=async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("Sign in to Supabase to use the test stock system");return session.access_token};
 const load=async()=>{setBusy(true);try{const token=await getToken();const res=await fetch(url,{headers:{authorization:"Bearer "+token}});const d=await res.json();if(!res.ok)throw new Error(d.error||"Cannot load stock");setData(d);setMessage("")}catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{load();(async()=>{const [t,c]=await Promise.all([
supabase.from("tracecode").select("tracecode_id,tracecode_name,crop_id,end_date").or("end_date.is.null,end_date.gte."+new Date().toISOString().slice(0,10)).order("tracecode_name"),
supabase.from("crop").select("crop_id,crop_name").eq("active",true).order("crop_name")]);
setTraces((t.data??[]) as Trace[]);setCrops((c.data??[]) as Crop[]);
setTrace((t.data??[]).find(x=>x.tracecode_name?.toUpperCase()==="DOMESTICHS")?.tracecode_id??null);})();},[]);
 const post=async(action:string,payload:any)=>{if(busy)return;setBusy(true);setMessage("");const op=pending&&pending.action===action&&JSON.stringify(pending.payload)===JSON.stringify(payload)?pending:{id:makeId(),action,payload};setPending(op);
  try{const token=await getToken();const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({request_id:op.id,action,payload})});const result=await r.json();if(!r.ok)throw new Error(result.error||"Transaction failed");setPending(null);setConfirm(false);setMessage("Posted successfully: "+JSON.stringify(result.result));const fresh=await fetch(url,{headers:{authorization:"Bearer "+token}});if(fresh.ok)setData(await fresh.json())}
  catch(e){setMessage("Not confirmed: "+(e instanceof Error?e.message:String(e)))}finally{setBusy(false)}
 };
 const itemOptions=data?.items??[];
 const matchingOrders=(data?.orders??[]).filter(o=>o.received_quantity<o.ordered_quantity);
 const selectedOrder=matchingOrders.find(o=>o.order_id===orderId);
 const visibleTraces=traces.filter(t=>(cropId===null||t.crop_id===cropId)&&t.tracecode_name.toLowerCase().includes(traceSearch.toLowerCase()));
 const matchingJobs=(data?.sprays??[]).filter(j=>j.item_code===item&&j.status==="planned"&&j.issued_quantity<j.planned_quantity);
 const chosenItem=itemOptions.find(i=>i.item_code===item);
 const simpleField=(label:string,value:string,change:(v:string)=>void,keyboardType:"default"|"decimal-pad"="default")=><View style={{flex:1,minWidth:130,gap:3}}><ThemedText style={styles.label}>{label}</ThemedText><TextInput style={styles.input} value={value} onChangeText={v=>{change(v);setConfirm(false)}} keyboardType={keyboardType}/></View>;
 const option=(text:string,selected:boolean,fn:()=>void)=><Pressable key={text} onPress={()=>{fn();setConfirm(false)}} style={[styles.option,selected&&styles.selected]}><ThemedText>{text}</ThemedText></Pressable>;
 const gridHeader=(cells:string[])=><View style={styles.gridHead}>{cells.map((x,i)=><ThemedText key={i} style={[styles.gridCell,styles.gridHeadText]}>{x}</ThemedText>)}</View>;
 const gridRow=(cells:ReactNode[])=><View style={styles.gridRow}>{cells.map((x,i)=><View key={i} style={styles.gridCell}>{typeof x==="string"||typeof x==="number"?<ThemedText>{x}</ThemedText>:x}</View>)}</View>;
 const controls=()=>{
  const num=Number(qty),ar=Number(area),rt=Number(rate);
  const validNum=Number.isFinite(num)&&num>0;
  let action="",payload:any={},valid=true;
  if(tab==="Order"){action="order";payload={item_code:item,quantity:num,supplier,unit_price:Number(unitPrice)};valid=validNum}
  if(tab==="GRV"){action="grv";payload={item_code:selectedOrder?.item_code,quantity:num,order_id:orderId,unit_price:Number(unitPrice)};valid=validNum&&!!selectedOrder&&num<=selectedOrder.ordered_quantity-selectedOrder.received_quantity}
  if(tab==="Spray Programme"){action="spray";payload={item_code:item,tracecode_id:trace,area_ha:ar,rate_per_ha:rt,water_rate:water};valid=!!trace&&ar>0&&rt>0}
  if(tab==="Planned Issue"){action="planned_issue";payload={item_code:item,job_id:jobId,quantity:num};valid=validNum&&matchingJobs.some(j=>j.job_id===jobId)}
  if(tab==="Direct Issue"){action="direct_issue";payload={item_code:item,tracecode_id:trace,quantity:num};valid=validNum&&!!trace}
  return <View style={styles.panel}>
   <ThemedText style={styles.head}>{tab==="Order"?"PURCHASE ORDER":tab==="GRV"?"GOODS RECEIVED VOUCHER":tab.toUpperCase()}</ThemedText>
   <View style={styles.documentHeader}><ThemedText>Owner: TEST_JS</ThemedText><ThemedText>Warehouse: TEST_WH</ThemedText><ThemedText>Document: DEMO / New</ThemedText><ThemedText>Date: {new Date().toLocaleDateString("en-GB")}</ThemedText></View>
   {tab==="GRV"?<>
    <ThemedText style={styles.label}>Outstanding purchase order</ThemedText>
    <Pressable style={styles.option} onPress={()=>setOrderOpen(v=>!v)}><ThemedText>{selectedOrder?"PO #"+selectedOrder.order_id+" · "+selectedOrder.supplier_name:"Choose outstanding PO"} ▼</ThemedText></Pressable>
    {orderOpen?<View style={styles.panel}>{matchingOrders.length===0?<ThemedText>No outstanding orders.</ThemedText>:matchingOrders.map(o=>option("PO #"+o.order_id+" · "+o.item_code+" · remaining "+(o.ordered_quantity-o.received_quantity),orderId===o.order_id,()=>{setOrderId(o.order_id);setItem(o.item_code);setQty(String(o.ordered_quantity-o.received_quantity));setUnitPrice(String(o.ordered_unit_price??""));setOrderOpen(false)}))}</View>:null}
    {selectedOrder?<View style={styles.sheet}>
      <ThemedText style={styles.label}>Supplier: {selectedOrder.supplier_name}</ThemedText>
      <ThemedText style={styles.label}>Purchase order: {selectedOrder.order_number}</ThemedText>
      {gridHeader(["Product","Ordered","Received","Outstanding","PO price"])}
      {gridRow([selectedOrder.item_code,String(selectedOrder.ordered_quantity),String(selectedOrder.received_quantity),String(selectedOrder.ordered_quantity-selectedOrder.received_quantity),selectedOrder.ordered_unit_price===null||selectedOrder.ordered_unit_price===undefined?"—":String(selectedOrder.ordered_unit_price)])}
      <ThemedText style={styles.label}>This delivery</ThemedText>
      <View style={styles.wrap}>{simpleField("Quantity received",qty,setQty,"decimal-pad")}{simpleField("Actual unit price",unitPrice,setUnitPrice,"decimal-pad")}</View>
      <ThemedText>Delivery value: {(Number(qty)*Number(unitPrice)||0).toFixed(2)} · Remaining after receipt: {selectedOrder.ordered_quantity-selectedOrder.received_quantity-Number(qty)}</ThemedText>
    </View>:null}
   </>:<>
    <ThemedText style={styles.label}>Product</ThemedText>
    <Pressable style={styles.option} onPress={()=>setProductOpen(v=>!v)}><ThemedText>{chosenItem?.item_name??"Choose product"} ▼</ThemedText></Pressable>
    {productOpen?<View style={styles.panel}><TextInput placeholder="Search products" placeholderTextColor="#777" style={styles.input} value={productSearch} onChangeText={setProductSearch}/>
    {itemOptions.filter(i=>i.item_name.toLowerCase().includes(productSearch.toLowerCase())).map(i=>option(i.item_name+" ("+i.base_unit+")",item===i.item_code,()=>{setItem(i.item_code);setProductOpen(false);setJobId(null)}))}</View>:null}
    <ThemedText>Available: {chosenItem?.quantity??"—"} {chosenItem?.base_unit??""}</ThemedText>
    {tab==="Order"?<View style={styles.wrap}>{simpleField("Supplier",supplier,setSupplier)}{simpleField("Ordered unit price",unitPrice,setUnitPrice,"decimal-pad")}</View>:null}
   </>}
   {tab==="Planned Issue"?<><ThemedText style={styles.label}>Choose outstanding spray job</ThemedText><View style={styles.wrap}>{matchingJobs.map(j=>option("Job #"+j.job_id+" "+j.tracecode_name+" remaining "+(j.planned_quantity-j.issued_quantity).toFixed(2),jobId===j.job_id,()=>setJobId(j.job_id)))}</View></>:null}
   {["Spray Programme","Direct Issue"].includes(tab)?<>
    <ThemedText style={styles.label}>Crop filter</ThemedText>
    <Pressable style={styles.option} onPress={()=>setCropOpen(v=>!v)}><ThemedText>{crops.find(x=>x.crop_id===cropId)?.crop_name??"All crops"} ▼</ThemedText></Pressable>
    {cropOpen?<View style={styles.panel}>
      {option("All crops",cropId===null,()=>{setCropId(null);setCropOpen(false);setTrace(null)})}
      {crops.map(x=>option(x.crop_name,cropId===x.crop_id,()=>{setCropId(x.crop_id);setCropOpen(false);setTrace(null)}))}
    </View>:null}
    <ThemedText style={styles.label}>Active tracecode</ThemedText>
    <Pressable style={styles.option} onPress={()=>setTraceOpen(v=>!v)}><ThemedText>{traces.find(t=>t.tracecode_id===trace)?.tracecode_name??"Choose active tracecode"} ▼</ThemedText></Pressable>
    {traceOpen?<View style={styles.panel}><TextInput style={styles.input} placeholder="Search tracecodes" placeholderTextColor="#777" value={traceSearch} onChangeText={setTraceSearch}/>
    <ScrollView style={{maxHeight:220}}>{visibleTraces.map(t=>option(t.tracecode_name,trace===t.tracecode_id,()=>{setTrace(t.tracecode_id);setTraceOpen(false)}))}</ScrollView></View>:null}
   </>:null}
   {tab!=="GRV"?<View style={styles.wrap}>
    {tab==="Spray Programme"?<>{simpleField("Field area (ha)",area,setArea,"decimal-pad")}{simpleField("Product rate/ha",rate,setRate,"decimal-pad")}{simpleField("Water rate L/ha",water,setWater,"decimal-pad")}</>:simpleField("Quantity ("+(chosenItem?.base_unit??"units")+")",qty,setQty,"decimal-pad")}
   </View>:null}
   {tab==="Order"?<View style={styles.sheet}>
     {gridHeader(["Product","Unit","Quantity","Unit price","Line total"])}
     {gridRow([chosenItem?.item_name??"",chosenItem?.base_unit??"",qty,unitPrice,(Number(qty)*Number(unitPrice)||0).toFixed(2)])}
     <ThemedText style={styles.label}>Order total: {(Number(qty)*Number(unitPrice)||0).toFixed(2)}</ThemedText>
     <ThemedText style={styles.warn}>Test workflow currently saves one product per order. Multi-line posting will be added separately.</ThemedText>
    </View>:null}
   {tab==="Spray Programme"?<ThemedText>Planned input: {(ar*rt).toFixed(2)} {chosenItem?.base_unit??""}</ThemedText>:null}
   <Pressable style={styles.option} onPress={()=>setConfirm(v=>!v)}><ThemedText>{confirm?"☑ Confirm this DEMO transaction":"☐ Confirm this DEMO transaction"}</ThemedText></Pressable>
   <Pressable disabled={!valid||!confirm||busy} style={[styles.action,(!valid||!confirm||busy)&&styles.disabled]} onPress={()=>post(action,payload)}><ThemedText style={styles.actionText}>{busy?"Working...":"Post "+tab}</ThemedText></Pressable>
   {!valid?<ThemedText style={styles.warn}>Select an appropriate order / job / tracecode and enter a valid quantity.</ThemedText>:null}
  </View>
 };
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <ThemedText type="title">Stock V2 · Complete Test Workflow</ThemedText>
  <ThemedText style={styles.warn}>TEST_JS · TEST_WH · DEMO products only. No Access or live inventory changes.</ThemedText>
  <View style={styles.nav}>{["Order","GRV","Balances","Spray Programme","Planned Issue","Direct Issue"].map(x=><Pressable key={x} style={[styles.navItem,tab===x&&styles.navSelected]} onPress={()=>{setTab(x);setOrderId(null);setJobId(null);setConfirm(false)}}><ThemedText style={tab===x?styles.navTextSelected:undefined}>{x}</ThemedText></Pressable>)}</View>
  <Pressable style={styles.option} onPress={load}><ThemedText>↻ Refresh stock and transactions</ThemedText></Pressable>
  {busy?<ActivityIndicator/>:null}
  {message?<ThemedText style={styles.warn}>{message}</ThemedText>:null}
  {tab==="Balances"?<View style={styles.sheet}><ThemedText style={styles.head}>STOCK ON HAND — TEST_WH</ThemedText>{gridHeader(["Product","Warehouse","Owner","On hand"])}{itemOptions.map(i=><View key={i.item_code}>{gridRow([i.item_name,"TEST_WH","TEST_JS",i.quantity+" "+i.base_unit])}</View>)}</View>:controls()}
  <View style={styles.sheet}><ThemedText style={styles.head}>PURCHASE ORDER REGISTER</ThemedText>{gridHeader(["PO","Product","Ordered","Received","Outstanding"])}{(data?.orders??[]).slice(0,15).map(o=><View key={o.order_id}>{gridRow(["#"+o.order_id,o.item_code,String(o.ordered_quantity),String(o.received_quantity),String(o.ordered_quantity-o.received_quantity)])}</View>)}</View>
  <View style={styles.sheet}><ThemedText style={styles.head}>SPRAY PROGRAMME REGISTER</ThemedText>{gridHeader(["Job","Tracecode","Product","Required","Issued"])}{(data?.sprays??[]).slice(0,15).map(j=><View key={j.job_id}>{gridRow(["#"+j.job_id,j.tracecode_name??"",j.item_code,j.planned_quantity.toFixed(2),j.issued_quantity.toFixed(2)])}</View>)}</View>
  <View style={styles.panel}><ThemedText style={styles.head}>Recent posted GRVs and issues</ThemedText>{(data?.documents??[]).slice(0,15).map(d=><ThemedText key={d.document_id}>#{d.document_id} {d.document_type.toUpperCase()} · {d.item_name} {d.quantity} · {d.tracecode_name??"warehouse"}</ThemedText>)}</View>
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({nav:{flexDirection:"row",flexWrap:"wrap",borderBottomWidth:2,borderColor:"#556473",gap:3,paddingBottom:4},navItem:{paddingVertical:10,paddingHorizontal:14,borderTopLeftRadius:6,borderTopRightRadius:6,backgroundColor:"#e5eaf0"},navSelected:{backgroundColor:"#315e81"},navTextSelected:{color:"white",fontWeight:"700"},documentHeader:{flexDirection:"row",flexWrap:"wrap",gap:20,padding:12,backgroundColor:"#e7eff5",borderRadius:5},sheet:{gap:10,borderWidth:1,borderColor:"#a9b4bf",padding:12,borderRadius:4},gridHead:{flexDirection:"row",backgroundColor:"#dbe7f0",paddingVertical:9,borderBottomWidth:1,borderColor:"#9ca9b3"},gridHeadText:{fontWeight:"700",fontSize:12},gridRow:{flexDirection:"row",borderBottomWidth:1,borderColor:"#e4e9ed",paddingVertical:8},gridCell:{flex:1,minWidth:0,paddingHorizontal:4},root:{flex:1},page:{padding:16,gap:12,paddingBottom:50},wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},panel:{borderWidth:1,borderColor:"#aaa",borderRadius:12,padding:14,gap:12},head:{fontSize:16,fontWeight:"700"},label:{fontWeight:"600"},option:{padding:10,borderWidth:1,borderColor:"#999",borderRadius:8},selected:{backgroundColor:"#b6e2c9"},input:{borderWidth:1,borderColor:"#888",backgroundColor:"#fff",padding:10,borderRadius:8,color:"#222",minWidth:110},action:{padding:14,backgroundColor:"#1f8251",alignItems:"center",borderRadius:9},disabled:{backgroundColor:"#bbb"},actionText:{color:"white",fontWeight:"800"},warn:{color:"#9c691b"},record:{flexDirection:"row",justifyContent:"space-between",padding:9,borderBottomWidth:1,borderColor:"#ddd"}});