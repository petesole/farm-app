import React,{useEffect,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {StockV2Header} from "@/components/jspl/StockV2Header";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors} from "@/constants/jspl-design";
const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Doc={display_no:number;document_id:number;document_date:string;delivery_note:string;delivery_note_date:string|null;supplier_name:string;invoice_number:string|null;line_count:number;locked:boolean};
type Line={line_id:number;item_code:string;item_name:string;base_unit:string;received_quantity:number;invoiced_quantity:number;reduced_quantity:number};
const dateLabel=(s:string|null)=>s&&/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4):"";
const iso=(s:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());if(!m)return "";const x=m[3]+"-"+m[2]+"-"+m[1];const d=new Date(x+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===x?x:""};
export default function DNoteCorrections(){
 const router=useRouter();const [docs,setDocs]=useState<Doc[]>([]),[selected,setSelected]=useState<Doc|null>(null),[search,setSearch]=useState("");
 const [number,setNumber]=useState(""),[date,setDate]=useState(""),[reason,setReason]=useState(""),[lines,setLines]=useState<Line[]>([]),[quantities,setQuantities]=useState<Record<number,string>>({});
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const request=async(query:string,payload?:unknown)=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");const r=await fetch(endpoint+query,{method:payload?"POST":"GET",headers:{authorization:"Bearer "+session.access_token,...(payload?{"content-type":"application/json"}:{})},...(payload?{body:JSON.stringify(payload)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error||"Request failed");return j};
 const load=async()=>{setLoading(true);setError("");try{const j=await request("?correction_dnotes=1");setDocs(j.rows||[])}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const open=async(d:Doc)=>{setSelected(d);setNumber(d.delivery_note||"");setDate(dateLabel(d.delivery_note_date||d.document_date));setReason("");setQuantities({});setLines([]);setError("");if(d.locked)return;try{const j=await request("?correction_dnote_lines=1&document_id="+d.document_id);setLines(j.rows||[])}catch(e){setError(e instanceof Error?e.message:String(e))}};
 const close=()=>{setSelected(null);setError("")};
 const save=async()=>{if(!selected||selected.locked)return;setSaving(true);setError("");try{if(!iso(date))throw Error("Enter valid date dd/mm/yyyy");if(reason.trim().length<5)throw Error("Enter a reason of at least 5 characters");await request("",{action:"correct_dnote_details",document_id:selected.document_id,delivery_note:number.trim(),delivery_note_date:iso(date),reason:reason.trim()});close();await load();setNotice("D-Note updated; audit record saved")}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSaving(false)}};
 const reduce=async(l:Line)=>{if(!selected||selected.locked)return;const qty=Number(quantities[l.line_id]);setSaving(true);setError("");try{const remaining=Math.max(0,l.received_quantity-l.invoiced_quantity-l.reduced_quantity);if(!Number.isFinite(qty)||qty<=0||qty>remaining)throw Error("Enter a quantity within the available uninvoiced balance");if(reason.trim().length<5)throw Error("Enter a reason of at least 5 characters");await request("",{action:"correct_dnote_uninvoiced",line_id:l.line_id,quantity:qty,reason:reason.trim()});setLines(v=>v.map(x=>x.line_id===l.line_id?{...x,reduced_quantity:x.reduced_quantity+qty}:x));setQuantities(x=>({...x,[l.line_id]:""}));setNotice("Audited adjustment posted");await load()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSaving(false)}};
 const matched=docs.filter(d=>(d.delivery_note+" "+d.supplier_name+" "+d.display_no).toLowerCase().includes(search.toLowerCase()));
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <StockV2Header title="D-Note Corrections"/>
  <Pressable onPress={()=>router.back()}><ThemedText style={styles.link}>‹ Back to Stock</ThemedText></Pressable>
  <ThemedText>Open any D-Note to view its status. Once a GRV/invoice has been linked, the original D-Note is locked.</ThemedText>
  <TextInput style={styles.input} placeholder="Search D-Note or supplier" value={search} onChangeText={setSearch}/>
  {notice?<ThemedText style={styles.success}>{notice}</ThemedText>:null}{error&&!selected?<ThemedText style={styles.error}>{error}</ThemedText>:null}
  {loading?<ActivityIndicator/>:matched.slice(0,250).map(d=><Pressable key={d.document_id} style={styles.row} onPress={()=>void open(d)}>
   <View style={{flex:1}}><ThemedText style={styles.bold}>D-Note {d.display_no} · {d.supplier_name}</ThemedText><ThemedText>{dateLabel(d.delivery_note_date||d.document_date)} · {d.line_count} lines · {d.delivery_note}</ThemedText></View>
   <ThemedText style={d.locked?styles.error:styles.success}>{d.locked?"Locked":"Open"} ›</ThemedText>
  </Pressable>)}
 </ScrollView>
 <Modal visible={!!selected} animationType="slide" onRequestClose={close}>
  <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
   <View style={styles.top}><ThemedText style={styles.heading}>D-Note {selected?.display_no}</ThemedText><Pressable onPress={close}><ThemedText style={styles.link}>✕ Close</ThemedText></Pressable></View>
   <ThemedText style={styles.bold}>{selected?.supplier_name} · {selected?.delivery_note}</ThemedText>
   <ThemedText>Original date {dateLabel(selected?.delivery_note_date||selected?.document_date||null)} · {selected?.line_count} lines</ThemedText>
   {selected?.locked?<View style={styles.panel}><ThemedText style={styles.error}>Locked — GRV/invoice already linked</ThemedText><ThemedText>The original D-Note cannot be changed. Resolve subsequent quantity or price differences with a linked supplier return, credit or adjustment, preserving the original record.</ThemedText><Pressable onPress={()=>{close();router.push("/(tabs)/home/stock-v2-supplier-returns")}} style={styles.button}><ThemedText style={styles.white}>Open Supplier Returns</ThemedText></Pressable></View>:<>
    <ThemedText style={styles.bold}>D-Note Number</ThemedText><TextInput style={styles.input} value={number} onChangeText={setNumber}/>
    <ThemedText style={styles.bold}>D-Note Date (dd/mm/yyyy)</ThemedText><TextInput style={styles.input} value={date} onChangeText={setDate}/>
    <ThemedText style={styles.bold}>Reason for correction</ThemedText><TextInput multiline style={styles.input} value={reason} onChangeText={setReason}/>
    <Pressable disabled={saving} style={styles.button} onPress={()=>void save()}><ThemedText style={styles.white}>{saving?"Saving…":"Save D-Note Details"}</ThemedText></Pressable>
    <ThemedText style={styles.heading}>Uninvoiced Stock Corrections</ThemedText>
    {lines.map(l=>{const remaining=Math.max(0,l.received_quantity-l.invoiced_quantity-l.reduced_quantity);return <View key={l.line_id} style={styles.panel}>
      <ThemedText style={styles.bold}>{l.item_name}</ThemedText><ThemedText>Received {l.received_quantity} · Invoiced {l.invoiced_quantity} · Reduced {l.reduced_quantity} · Available {remaining} {l.base_unit}</ThemedText>
      {remaining>0?<View style={styles.top}><TextInput style={[styles.input,{flex:1}]} placeholder="Qty to remove" keyboardType="decimal-pad" value={quantities[l.line_id]||""} onChangeText={v=>setQuantities(x=>({...x,[l.line_id]:v}))}/><Pressable style={styles.button} disabled={saving} onPress={()=>void reduce(l)}><ThemedText style={styles.white}>Reduce</ThemedText></Pressable></View>:null}
     </View>})}
   </>}
   {error?<ThemedText style={styles.error}>{error}</ThemedText>:null}{notice?<ThemedText style={styles.success}>{notice}</ThemedText>:null}
  </ScrollView></ThemedView>
 </Modal></ThemedView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:16,gap:12,paddingBottom:40},top:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:12},heading:{fontSize:20,fontWeight:"700"},row:{borderWidth:1,borderColor:"#d3ddd6",backgroundColor:"#fff",borderRadius:8,padding:14,flexDirection:"row",alignItems:"center",gap:8},panel:{padding:14,backgroundColor:"#fff",borderWidth:1,borderColor:"#c7d9cb",borderRadius:9,gap:8},bold:{fontWeight:"700"},input:{borderColor:"#c5d3c9",borderWidth:1,backgroundColor:"#fff",borderRadius:7,padding:12,minHeight:44},button:{backgroundColor:"#155e35",padding:12,borderRadius:7},white:{color:"#fff",fontWeight:"700"},link:{color:"#156b3a",fontWeight:"700"},error:{color:"#b91c1c",fontWeight:"700"},success:{color:"#156c34",fontWeight:"700"}});
