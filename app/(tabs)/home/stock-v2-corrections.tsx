import {useEffect,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {StockV2Header} from "@/components/jspl/StockV2Header";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors} from "@/constants/jspl-design";
const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Doc={document_id:number;document_date:string;delivery_note:string;delivery_note_date:string|null;supplier_name:string;invoice_number:string|null;line_count:number};
const format=(s:string|null)=>s&&/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4):"";
const parse=(s:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);if(!m)return null;const d=new Date(m[3]+"-"+m[2]+"-"+m[1]+"T12:00:00");return Number.isNaN(d.getTime())||d.getDate()!==Number(m[1])?null:m[3]+"-"+m[2]+"-"+m[1]};
export default function StockCorrections(){
 const router=useRouter();const [all,setAll]=useState<Doc[]>([]),[selected,setSelected]=useState<Doc|null>(null),[search,setSearch]=useState("");
 const [number,setNumber]=useState(""),[supplier,setSupplier]=useState(""),[date,setDate]=useState(""),[reason,setReason]=useState("");
 const [error,setError]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const load=async()=>{setLoading(true);try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");const r=await fetch(endpoint+"?correction_dnotes=1",{headers:{authorization:"Bearer "+session.access_token}});const d=await r.json();if(!r.ok)throw Error(d.error||"Cannot load D-Notes");setAll(d.rows??[])}catch(e){setError(String(e))}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const choose=(d:Doc)=>{setSelected(d);setNumber(d.delivery_note??"");setSupplier(d.supplier_name??"");setDate(format(d.delivery_note_date||d.document_date));setReason("");setError("");setMessage("")};
 const save=async()=>{if(!selected)return;const iso=parse(date);if(!iso){setError("Enter valid date dd/mm/yyyy");return}setSaving(true);setError("");setMessage("");try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},body:JSON.stringify({action:"correct_dnote_details",document_id:selected.document_id,delivery_note:number,supplier_name:supplier,delivery_note_date:iso,reason})});const d=await r.json();if(!r.ok)throw Error(d.error||"Correction failed");setMessage("D-Note corrected. Audit record created.");setSelected(null);await load()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSaving(false)}};
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
 <StockV2Header title="Stock Corrections"/>
 <Pressable onPress={()=>router.back()}><ThemedText style={styles.link}>‹ Back to Stock</ThemedText></Pressable>
 <ThemedText style={styles.title}>D-Note Corrections</ThemedText>
 <ThemedText>Administrative details only. Posted product and quantity corrections require a stock adjustment and are not editable here.</ThemedText>
 {error?<ThemedText style={styles.error}>{error}</ThemedText>:null}{message?<ThemedText style={styles.success}>{message}</ThemedText>:null}
 <TextInput style={styles.input} placeholder="Search D-Note number or supplier" value={search} onChangeText={setSearch}/>
 {loading?<ActivityIndicator/>:all.filter(x=>(x.delivery_note+" "+x.supplier_name+" "+x.document_id).toLowerCase().includes(search.toLowerCase())).slice(0,60).map(d=><Pressable key={d.document_id} style={styles.row} onPress={()=>choose(d)}><ThemedText style={styles.strong}>D-Note {d.delivery_note}</ThemedText><ThemedText>{d.supplier_name} · {format(d.delivery_note_date||d.document_date)} · {d.line_count} lines</ThemedText></Pressable>)}
 {selected?<View style={styles.panel}><ThemedText style={styles.title}>Correct D-Note {selected.delivery_note}</ThemedText>
 <ThemedText>Original: {selected.delivery_note} · {selected.supplier_name} · {format(selected.delivery_note_date||selected.document_date)}</ThemedText>
 <ThemedText style={styles.strong}>D-Note Number</ThemedText><TextInput style={styles.input} value={number} onChangeText={setNumber}/>
 <ThemedText style={styles.strong}>Supplier</ThemedText><TextInput style={styles.input} value={supplier} onChangeText={setSupplier}/>
 <ThemedText style={styles.strong}>D-Note Date (dd/mm/yyyy)</ThemedText><TextInput style={styles.input} value={date} onChangeText={setDate}/>
 <ThemedText style={styles.strong}>Reason for correction</ThemedText><TextInput style={styles.input} value={reason} onChangeText={setReason} multiline placeholder="Required"/>
 <View style={{flexDirection:"row",gap:12}}><Pressable onPress={()=>setSelected(null)} style={styles.row}><ThemedText>Cancel</ThemedText></Pressable><Pressable disabled={saving} style={styles.button} onPress={()=>void save()}><ThemedText style={{color:"white",fontWeight:"700"}}>{saving?"Saving…":"Save Correction"}</ThemedText></Pressable></View>
 </View>:null}
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:18,gap:12},title:{fontSize:20,fontWeight:"700"},strong:{fontWeight:"700"},input:{borderWidth:1,borderColor:"#c9d5cd",borderRadius:6,padding:12,backgroundColor:"#fff",minHeight:45},row:{padding:12,borderBottomWidth:1,borderColor:"#dce5df",backgroundColor:"#fff",borderRadius:5,marginVertical:2},panel:{backgroundColor:"#fff",padding:16,borderRadius:8,gap:9,borderWidth:1,borderColor:"#cad9d0"},button:{padding:12,backgroundColor:jsplColors.primary,borderRadius:5},error:{color:"#b00020",fontWeight:"700"},success:{color:"#176634"},link:{color:jsplColors.primary}});
