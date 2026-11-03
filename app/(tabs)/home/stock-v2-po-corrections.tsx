import {useEffect,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
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
 {rows.filter(r=>(r.order_number+" "+r.supplier_name+" "+r.item_name).toLowerCase().includes(search.toLowerCase())).slice(0,150).map(r=><View key={r.order_line_id}>
 <Pressable style={[st.line,selected?.order_line_id===r.order_line_id&&st.selectedLine]} onPress={()=>{if(selected?.order_line_id===r.order_line_id){setSelected(null);return;}setSelected(r);setQty(String(Math.max(0,r.outstanding_quantity)));setReason("");setError("")}}>
 <ThemedText style={st.bold}>{selected?.order_line_id===r.order_line_id?"▾":"▸"} {r.order_number} · {r.supplier_name} · {r.item_name}</ThemedText>
 <ThemedText>Ordered {r.originally_ordered} · Received {r.received_quantity} · Cancelled {r.cancelled_quantity} · Outstanding {r.outstanding_quantity}</ThemedText>
 </Pressable>
 {selected?.order_line_id===r.order_line_id?<View style={st.panel}>
 <ThemedText style={st.title}>Correct {r.order_number}</ThemedText>
 <ThemedText>{r.item_name} · Maximum cancellation: {r.outstanding_quantity}</ThemedText>
 {r.status==="approved"&&r.outstanding_quantity>0?<><TextInput style={st.input} keyboardType="decimal-pad" placeholder="Quantity to cancel" value={qty} onChangeText={setQty}/><TextInput style={st.input} placeholder="Reason for cancellation" value={reason} onChangeText={setReason}/><Pressable disabled={busy} onPress={()=>void post()} style={st.button}><ThemedText style={{color:"white",fontWeight:"700"}}>Cancel Outstanding Quantity</ThemedText></Pressable></>:<ThemedText>This line has no cancellable outstanding balance.</ThemedText>}
 <Pressable onPress={()=>setSelected(null)}><ThemedText>Close</ThemedText></Pressable>
 </View>:null}
 </View>)}
 {busy?<ActivityIndicator/>:null}
 </ScrollView></ThemedView>;
}
const st=StyleSheet.create({page:{padding:16,gap:12},title:{fontSize:20,fontWeight:"700"},input:{borderWidth:1,borderColor:"#bccbc2",backgroundColor:"#fff",padding:11,borderRadius:6},line:{backgroundColor:"#fff",padding:12,borderBottomWidth:1,borderColor:"#dedede",gap:4},bold:{fontWeight:"700"},selectedLine:{backgroundColor:"#e5f3e9"},panel:{backgroundColor:"#fff",padding:16,gap:10,borderRadius:8},button:{backgroundColor:"#145e36",padding:13,borderRadius:6,alignSelf:"flex-start"},error:{color:"#af241c"}});
