import {useEffect,useMemo,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
const url="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Owner={owner_id:number;owner_code:string;owner_name:string;active:boolean;po_required_for_grv:boolean;po_requires_contract:boolean;default_contract_id:number|null;allow_direct_grv:boolean};
type Contract={contract_id:number;contract_code:string;contract_name:string;active:boolean};
type Item={item_code:string;item_name:string;base_unit:string};
type Order={order_id:number;order_number:string;supplier_name:string;owner_code:string;contract_id:number|null;item_code:string;item_name:string;base_unit:string;ordered_quantity:number;received_quantity:number;ordered_unit_price:number|null};
type Balance=Item&{owner_code:string;quantity:number};
type Data={owners:Owner[];contracts:Contract[];items:Item[];orders:Order[];balances:Balance[]};
type Line={id:number;item_code:string;quantity:string;unit_price:string};
const empty=(id:number):Line=>({id,item_code:"",quantity:"",unit_price:""});
const uuid=()=>"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,ch=>{const r=Math.floor(Math.random()*16);return(ch==="x"?r:(r&3)|8).toString(16)});
export default function OwnerTransactions(){
 const router=useRouter();
 const [tab,setTab]=useState<"order"|"grv"|"transfer">("order"),[data,setData]=useState<Data|null>(null);
 const [ownerCode,setOwnerCode]=useState("JS"),[toOwner,setToOwner]=useState("AO"),[contractId,setContractId]=useState<number|null>(null);
 const [supplier,setSupplier]=useState(""),[deliveryNote,setDeliveryNote]=useState(""),[orderId,setOrderId]=useState<number|null>(null);
 const [lines,setLines]=useState<Line[]>([empty(1)]),[seq,setSeq]=useState(2),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [request,setRequest]=useState<{key:string;id:string}|null>(null);
 const getToken=async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");return session.access_token};
 const refresh=async()=>{setBusy(true);try{const r=await fetch(url+"?owner_workflow=1",{headers:{authorization:"Bearer "+await getToken()}});const d=await r.json();if(!r.ok)throw Error(d.error||"Failed to load");setData(d)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{void refresh()},[]);
 const reset=()=>{setConfirmed(false);setRequest(null)};
 const changeTab=(v:typeof tab)=>{setTab(v);setLines([empty(seq)]);setSeq(x=>x+1);setOrderId(null);setSupplier("");setContractId(null);setNotice("");setError("");reset()};
 const owner=data?.owners.find(o=>o.owner_code===ownerCode);
 const defaultContract=owner?.default_contract_id??null;
 const selectedContract=defaultContract??contractId;
 const ownerOrders=useMemo(()=>{const map=new Map<number,Order[]>();for(const o of data?.orders??[]){if(o.owner_code!==ownerCode)continue;if(!map.has(o.order_id))map.set(o.order_id,[]);map.get(o.order_id)!.push(o)}return [...map.entries()].map(([id,rows])=>({id,rows,number:rows[0].order_number,supplier:rows[0].supplier_name,contract_id:rows[0].contract_id}))},[data,ownerCode]);
 const selectedOrder=ownerOrders.find(o=>o.id===orderId);
 const isDirect=tab==="grv"&&owner?.allow_direct_grv&&!owner?.po_required_for_grv;
 const action=tab==="order"?"order":tab==="transfer"?"ownership_transfer":isDirect?"direct_grv":"grv";
 const payload={owner_code:ownerCode,to_owner_code:toOwner,contract_id:selectedContract,order_id:orderId,supplier,delivery_note:deliveryNote,order_date:new Date().toISOString().slice(0,10),lines:lines.map(l=>({item_code:l.item_code,quantity:Number(l.quantity),unit_price:l.unit_price.trim()?Number(l.unit_price):null}))};
 const valid=!!data&&!!owner&&owner.active&&(tab!=="transfer"||toOwner!==ownerCode)&&
  (tab!=="order"||!!supplier.trim())&&(tab!=="order"||!owner.po_requires_contract||!!selectedContract)&&
  (tab!=="grv"||isDirect?tab!=="grv"||!!supplier.trim()||!isDirect:!!selectedOrder)&&
  lines.length>0&&new Set(lines.map(l=>l.item_code)).size===lines.length&&lines.every(l=>data.items.some(p=>p.item_code===l.item_code)&&Number(l.quantity)>0&&Number.isFinite(Number(l.quantity))&&(l.unit_price.trim()===""||(Number.isFinite(Number(l.unit_price))&&Number(l.unit_price)>=0))&&
  (tab!=="grv"||!selectedOrder||isDirect||Number(l.quantity)<=(selectedOrder.rows.find(p=>p.item_code===l.item_code)?.ordered_quantity??0)-(selectedOrder.rows.find(p=>p.item_code===l.item_code)?.received_quantity??0)))&&
  (tab!=="transfer"||lines.every(l=>(data.balances.find(b=>b.owner_code===ownerCode&&b.item_code===l.item_code)?.quantity??0)>=Number(l.quantity)));
 const chooseOwner=(code:string)=>{setOwnerCode(code);setOrderId(null);setContractId(null);setLines([empty(seq)]);setSeq(x=>x+1);reset()};
 const chooseOrder=(o:typeof ownerOrders[number])=>{setOrderId(o.id);setSupplier(o.supplier);setContractId(o.contract_id);setLines(o.rows.map((l,i)=>({id:seq+i,item_code:l.item_code,quantity:String(Number(l.ordered_quantity)-Number(l.received_quantity)),unit_price:l.ordered_unit_price===null?"":String(l.ordered_unit_price)})));setSeq(x=>x+o.rows.length);reset()};
 const changeLine=(id:number,field:keyof Line,value:string)=>{setLines(ls=>ls.map(l=>l.id===id?{...l,[field]:value}:l));reset()};
 const post=async()=>{if(!valid||!confirmed||busy)return;setBusy(true);setError("");setNotice("");
  const key=JSON.stringify({action,payload});const id=request?.key===key?request.id:uuid();setRequest({key,id});
  try{const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+await getToken()},body:JSON.stringify({action,request_id:id,payload})});const d=await res.json();if(!res.ok)throw Error(d.error||"Posting failed");if(!d.result?.order_id&&!d.result?.document_id)throw Error("Transaction confirmation missing");
   setNotice("Posted "+(tab==="order"?"purchase order #"+d.result.order_id:tab==="grv"?"GRV #"+d.result.document_id:"ownership transfer #"+d.result.document_id)+" successfully.");
   setLines([empty(seq)]);setSeq(x=>x+1);setConfirmed(false);setRequest(null);setOrderId(null);await refresh();
  }catch(e){setError("NOT POSTED: "+(e instanceof Error?e.message:String(e)))}finally{setBusy(false)}
 };
 const button=(label:string,onPress:()=>void,active=false)=><Pressable onPress={onPress} style={[styles.button,active&&styles.active]}><ThemedText style={active?styles.white:styles.ink}>{label}</ThemedText></Pressable>;
 const label=(v:string)=><ThemedText style={styles.label}>{v}</ThemedText>;
 const options=<View style={styles.options}>{(data?.owners??[]).filter(o=>o.active).map(o=>button(o.owner_code+" · "+o.owner_name,()=>chooseOwner(o.owner_code),ownerCode===o.owner_code))}</View>;
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <View style={styles.options}>{button("← Stock Home",()=>router.replace("/(tabs)/stock-test"))}{button("↻ Refresh",()=>void refresh())}{button("Manage Owners / Contracts",()=>router.push("/stock-v2-setup"))}</View>
  <ThemedText style={styles.title}>Stock V2 · Multi-owner Transactions</ThemedText>
  <ThemedText>Private test warehouse and demo products only. Historical Access stock is untouched.</ThemedText>
  <View style={styles.options}>{button("Purchase Order",()=>changeTab("order"),tab==="order")}{button("GRV",()=>changeTab("grv"),tab==="grv")}{button("Ownership Transfer",()=>changeTab("transfer"),tab==="transfer")}</View>
  {busy?<ActivityIndicator/>:null}{error?<ThemedText style={styles.error}>{error}</ThemedText>:null}{notice?<ThemedText style={styles.success}>{notice}</ThemedText>:null}
  <View style={styles.card}>
   {label(tab==="transfer"?"From Stock Owner":"Stock Owner")}{options}
   {tab==="transfer"?<>{label("To Stock Owner")}<View style={styles.options}>{data?.owners.filter(o=>o.active&&o.owner_code!==ownerCode).map(o=>button(o.owner_code+" · "+o.owner_name,()=>{setToOwner(o.owner_code);reset()},toOwner===o.owner_code))}</View>
    <ThemedText>Stock ownership changes only. No contract or TraceCode is required.</ThemedText></>:null}
   {tab==="order"?<>
    {label("Supplier (actual supplier)")}<TextInput style={styles.input} value={supplier} onChangeText={v=>{setSupplier(v);reset()}} placeholder="e.g. ZFC"/>
    {label(owner?.default_contract_id?"Automatic owner contract":"Purchase Contract")}
    <View style={styles.options}>{owner?.default_contract_id?button(data?.contracts.find(c=>c.contract_id===owner.default_contract_id)?.contract_code||"Owner default",()=>{}):data?.contracts.filter(c=>c.active).map(c=>button(c.contract_code,()=>{setContractId(c.contract_id);reset()},selectedContract===c.contract_id))}</View>
   </>:null}
   {tab==="grv"?isDirect?<>{label("AO-style Direct GRV — No PO required")}{label("Supplier / Source")}
    <TextInput style={styles.input} value={supplier} onChangeText={v=>{setSupplier(v);reset()}} placeholder="Actual supplier"/>
    <ThemedText>Contract automatically set by owner policy: {data?.contracts.find(c=>c.contract_id===defaultContract)?.contract_code||"None"}</ThemedText>
   </>:<>{label("Choose Outstanding Purchase Order")}{ownerOrders.length===0?<ThemedText>No outstanding purchase orders for this owner.</ThemedText>:<ScrollView style={styles.orderList} nestedScrollEnabled>{ownerOrders.map(o=><Pressable key={o.id} onPress={()=>chooseOrder(o)} style={[styles.order,orderId===o.id&&styles.selected]}><ThemedText>PO #{o.id} · {o.supplier} · {o.rows.length} products · {data?.contracts.find(c=>c.contract_id===o.contract_id)?.contract_code||"Unassigned"}</ThemedText></Pressable>)}</ScrollView>}
    {selectedOrder?<ThemedText>Selected: {selectedOrder.number} · Supplier {selectedOrder.supplier}</ThemedText>:null}
   </>:null}
   {tab==="grv"?<>{label("Delivery note")}<TextInput style={styles.input} value={deliveryNote} onChangeText={v=>{setDeliveryNote(v);reset()}} placeholder="Supplier delivery note"/></>:null}
   {label("Product Lines")}{lines.map(l=>{const item=data?.items.find(i=>i.item_code===l.item_code);return <View key={l.id} style={styles.line}>
    <View style={{minWidth:200,flex:2}}>{label("Product")}<View style={styles.options}>{!l.item_code?data?.items.filter(p=>!lines.some(other=>other.id!==l.id&&other.item_code===p.item_code)).map(p=>button(p.item_name,()=>changeLine(l.id,"item_code",p.item_code))):<>{button(item?.item_name||l.item_code,()=>changeLine(l.id,"item_code",""))}{item?<ThemedText>{item.base_unit}</ThemedText>:null}</>}</View></View>
    <View style={styles.quantity}>{label("Quantity")}<TextInput style={styles.input} keyboardType="decimal-pad" value={l.quantity} onChangeText={v=>changeLine(l.id,"quantity",v)} placeholder="0"/></View>
    {tab!=="transfer"?<View style={styles.quantity}>{label("Unit Price (optional)")}<TextInput style={styles.input} keyboardType="decimal-pad" value={l.unit_price} onChangeText={v=>changeLine(l.id,"unit_price",v)} placeholder="Pending"/></View>:null}
    {tab==="transfer"&&item?<ThemedText>Available: {data?.balances.find(b=>b.owner_code===ownerCode&&b.item_code===l.item_code)?.quantity??0} {item.base_unit}</ThemedText>:null}
    {button("Remove",()=>{setLines(ls=>ls.filter(x=>x.id!==l.id));reset()})}
   </View>})}
   {tab!=="grv"||isDirect?button("＋ Add Product",()=>{setLines(ls=>[...ls,empty(seq)]);setSeq(x=>x+1);reset()}):null}
   <Pressable style={styles.confirm} onPress={()=>setConfirmed(c=>!c)}><ThemedText>{confirmed?"☑":"☐"} Confirm {tab==="order"?"Purchase Order":tab==="grv"?"Goods Receipt":"Ownership Transfer"}</ThemedText></Pressable>
   <Pressable disabled={!valid||!confirmed||busy} style={[styles.button,styles.active,(!valid||!confirmed||busy)&&styles.disabled]} onPress={()=>void post()}><ThemedText style={styles.white}>{busy?"Posting…":"Post "+(tab==="order"?"Purchase Order":tab==="grv"?"GRV":"Ownership Transfer")}</ThemedText></Pressable>
   {!valid?<ThemedText style={styles.error}>Complete the required owner, supplier, contract/PO and product quantities before posting.</ThemedText>:null}
  </View>
 </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:"#f4f7f4"},page:{padding:20,gap:15},title:{fontSize:23,fontWeight:"800",color:"#174832"},label:{fontSize:13,fontWeight:"700",color:"#204c32"},ink:{color:"#214834"},white:{color:"#fff",fontWeight:"700"},card:{backgroundColor:"#fff",borderRadius:8,padding:18,gap:12,borderWidth:1,borderColor:"#dae4dd"},options:{flexDirection:"row",flexWrap:"wrap",gap:7,alignItems:"center"},button:{borderRadius:5,borderWidth:1,borderColor:"#b7c8bc",padding:10,backgroundColor:"#fff"},active:{backgroundColor:"#175b3c",borderColor:"#175b3c"},disabled:{opacity:.45},input:{borderWidth:1,borderColor:"#b7c8bc",backgroundColor:"#fff",borderRadius:5,padding:10,minHeight:43,minWidth:110},line:{flexDirection:"row",alignItems:"center",gap:10,flexWrap:"wrap",paddingVertical:10,borderBottomWidth:1,borderColor:"#e1e7e2"},quantity:{minWidth:110,flex:1,gap:5},orderList:{maxHeight:200,borderWidth:1,borderColor:"#cbd9cf",borderRadius:4},order:{padding:12,borderBottomWidth:1,borderColor:"#e0e0e0"},selected:{backgroundColor:"#ddf0df"},confirm:{padding:13,backgroundColor:"#f1f7f1",borderRadius:5},error:{color:"#a52626",fontWeight:"700"},success:{color:"#176539",fontWeight:"700"}});
