import {useEffect,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {StockV2Header} from "@/components/jspl/StockV2Header";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type PO={order_id:number;order_number:string;order_date:string;supplier_name:string;owner_code:string;status:string;order_line_id:number;item_code:string;item_name:string;originally_ordered:number;received_quantity:number;cancelled_quantity:number;outstanding_quantity:number};
export default function POCorrections(){
 const router=useRouter();const [rows,setRows]=useState<PO[]>([]),[search,setSearch]=useState(""),[selected,setSelected]=useState<PO|null>(null),[qty,setQty]=useState(""),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const token=async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");return session.access_token};
 const load=async()=>{try{const t=await token();const r=await fetch(endpoint+"?po_corrections=1",{headers:{authorization:"Bearer "+t}});const v=await r.json();if(!r.ok)throw Error(v.error||"Unable to load purchase orders");setRows(v.rows??[])}catch(e){setError(String(e))}};
 useEffect(()=>{void load()},[]);
 const post=async()=>{if(!selected)return;setBusy(true);setError("");setNotice("");try{const t=await token();const n=Number(qty);if(!Number.isFinite(n)||n<=0||n>selected.outstanding_quantity)throw Error("Enter a valid quantity not exceeding outstanding");if(reason.trim().length<5)throw Error("Enter a reason (at least five characters)");const r=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+t,"content-type":"application/json"},body:JSON.stringify({action:"cancel_po_balance",order_line_id:selected.order_line_id,quantity:n,reason:reason.trim()})});const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to close balance");setNotice("Cancelled "+n+" units. Remaining: "+d.result.remaining);setSelected(null);setQty("");setReason("");await load()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 return <ThemedView style={{flex:1}}><ScrollView contentContainerStyle={st.page}><StockV2Header title="PO Corrections"/>
 <Pressable onPress={()=>router.back()}><ThemedText>‹ Back to Stock</ThemedText></Pressable><ThemedText style={st.title}>Close Outstanding Purchase Order Balances</ThemedText>
 <ThemedText>Cancel all or part of the unreceived balance. Received stock and posted GRVs remain unchanged. All cancellations are audited.</ThemedText>
 {error?<ThemedText style={st.error}>{error}</ThemedText>:null}{notice?<ThemedText>{notice}</ThemedText>:null}
 <TextInput style={st.input} placeholder="Search PO, supplier or product" value={search} onChangeText={setSearch}/>
 {rows.filter(r=>(r.order_number+" "+r.supplier_name+" "+r.item_name).toLowerCase().includes(search.toLowerCase())).slice(0,150).map(r=><Pressable key={r.order_line_id} style={st.line} onPress={()=>{setSelected(r);setQty(String(Math.max(0,r.outstanding_quantity)));setReason("");setError("")}}>
  <ThemedText style={st.bold}>{r.order_number} · {r.supplier_name} · {r.item_name} ›</ThemedText>
  <ThemedText>Ordered {r.originally_ordered} · Received {r.received_quantity} · Cancelled {r.cancelled_quantity} · Outstanding {r.outstanding_quantity}</ThemedText>
 </Pressable>)}
 {busy?<ActivityIndicator/>:null}
 </ScrollView>
 <Modal visible={!!selected} animationType="slide" onRequestClose={()=>setSelected(null)}>
 <ThemedView style={{flex:1}}><ScrollView contentContainerStyle={st.page}>
  <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}><ThemedText style={st.title}>Purchase Order {selected?.order_number}</ThemedText><Pressable onPress={()=>setSelected(null)}><ThemedText>✕ Close</ThemedText></Pressable></View>
  <ThemedText style={st.bold}>{selected?.supplier_name} · {selected?.item_name}</ThemedText>
  <ThemedText>Ordered {selected?.originally_ordered} · Received {selected?.received_quantity} · Previously cancelled {selected?.cancelled_quantity}</ThemedText>
  <ThemedText style={st.bold}>Unreceived balance: {selected?.outstanding_quantity}</ThemedText>
  <ThemedText>Previously received stock is locked. Only the outstanding quantity can be cancelled; it will not change physical stock.</ThemedText>
  {selected?.status==="approved"&&Number(selected?.outstanding_quantity)>0?<><ThemedText>Quantity to cancel</ThemedText><TextInput style={st.input} keyboardType="decimal-pad" value={qty} onChangeText={setQty}/><ThemedText>Reason for cancellation</ThemedText><TextInput style={st.input} value={reason} onChangeText={setReason}/><Pressable style={st.button} disabled={busy} onPress={()=>void post()}><ThemedText style={{color:"#fff",fontWeight:"700"}}>Cancel Outstanding Balance</ThemedText></Pressable></>:<ThemedText>This purchase order line is locked. No outstanding balance can be cancelled.</ThemedText>}
  {error?<ThemedText style={st.error}>{error}</ThemedText>:null}
 </ScrollView></ThemedView></Modal></ThemedView>;
}
const st=StyleSheet.create({page:{padding:16,gap:12},title:{fontSize:20,fontWeight:"700"},input:{borderWidth:1,borderColor:"#bccbc2",backgroundColor:"#fff",padding:11,borderRadius:6},line:{backgroundColor:"#fff",padding:12,borderBottomWidth:1,borderColor:"#dedede",gap:4},bold:{fontWeight:"700"},selectedLine:{backgroundColor:"#e5f3e9"},panel:{backgroundColor:"#fff",padding:16,gap:10,borderRadius:8},button:{backgroundColor:"#145e36",padding:13,borderRadius:6,alignSelf:"flex-start"},error:{color:"#af241c"}});
