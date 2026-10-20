import {useEffect,useMemo,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors,jsplSpacing} from "@/constants/jspl-design";
const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Line={document_id:number;document_date:string;delivery_note:string;delivery_note_date:string|null;supplier_name:string;owner_code:string;item_code:string;item_name:string;base_unit:string;line_id:number;quantity:number};
const fmt=(v:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());if(!m)return null;const iso=m[3]+"-"+m[2]+"-"+m[1];const d=new Date(iso+"T12:00:00Z");return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==iso?null:iso;};
export default function GRVOutstanding(){
 const router=useRouter();
 const [rows,setRows]=useState<Line[]>([]),[selected,setSelected]=useState<number|null>(null),[invoice,setInvoice]=useState(""),[date,setDate]=useState(new Date().toLocaleDateString("en-GB")),[prices,setPrices]=useState<Record<number,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=async()=>{setBusy(true);setError("");try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");const r=await fetch(endpoint+"?outstanding_dnotes=1",{headers:{authorization:"Bearer "+session.access_token}});const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load outstanding invoices");setRows(d.rows??[]);}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 const documents=useMemo(()=>{const map=new Map<number,Line[]>();for(const l of rows){if(!map.has(l.document_id))map.set(l.document_id,[]);map.get(l.document_id)!.push(l);}return [...map.values()]},[rows]);
 const selectedLines=documents.find(d=>d[0].document_id===selected)??[];
 const valid=selectedLines.length>0&&invoice.trim().length>0&&!!fmt(date)&&selectedLines.every(l=>Number.isFinite(Number(prices[l.line_id]))&&Number(prices[l.line_id])>0);
 const post=async()=>{if(!valid||busy)return;setBusy(true);setError("");setSuccess("");try{
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
  const payload={document_id:selected,invoice_number:invoice.trim(),invoice_date:fmt(date),lines:selectedLines.map(l=>({line_id:l.line_id,unit_price:Number(prices[l.line_id])}))};
  const r=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+session.access_token,"content-type":"application/json"},body:JSON.stringify({action:"match_invoice",payload})});const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to match invoice");
  const completed=Array.isArray(d.result?.cost_runs)?d.result.cost_runs.length:0;
  const pending=Array.isArray(d.result?.cost_pending)?d.result.cost_pending:[];
  setSuccess("Invoice matched to DNote #"+selected+". No stock was received again. "+
   (pending.length?"WA COSTING PENDING for "+pending.length+" product(s): "+pending.map((x:{reason:string})=>x.reason).join("; "):
   "Historical WA recalculated for "+completed+" product(s), including downstream issues and transfers."));setSelected(null);setInvoice("");setPrices({});
  const fresh=await fetch(endpoint+"?outstanding_dnotes=1",{headers:{authorization:"Bearer "+session.access_token}});const data=await fresh.json();if(fresh.ok)setRows(data.rows??[]);
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <Pressable onPress={()=>router.replace("/stock-test")}><ThemedText>← Stock Home</ThemedText></Pressable>
  <ThemedText style={styles.heading}>GRV · Outstanding Invoices ({documents.length})</ThemedText>
  <ThemedText>Received delivery notes awaiting supplier invoices. Matching an invoice does not receive stock a second time.</ThemedText>
  <Pressable style={styles.button} onPress={()=>void load()}><ThemedText>↻ Refresh</ThemedText></Pressable>
  {busy?<ActivityIndicator/>:null}{error?<ThemedText style={styles.error}>{error}</ThemedText>:null}{success?<ThemedText>{success}</ThemedText>:null}
  {documents.length===0?<ThemedText>No outstanding delivery notes.</ThemedText>:documents.map(group=><Pressable key={group[0].document_id} onPress={()=>{setSelected(group[0].document_id);setInvoice("");setPrices({});setError("")}} style={[styles.card,selected===group[0].document_id&&styles.selected]}>
    <ThemedText style={styles.bold}>DNote {group[0].delivery_note} · {group[0].owner_code}</ThemedText>
    <ThemedText>{group[0].supplier_name} · {group[0].delivery_note_date||group[0].document_date} · {group.length} products</ThemedText>
  </Pressable>)}
  {selectedLines.length>0?<View style={styles.form}>
   <ThemedText style={styles.bold}>Match invoice to {selectedLines[0].delivery_note}</ThemedText>
   <ThemedText>Supplier Invoice Number</ThemedText><TextInput style={styles.input} value={invoice} onChangeText={setInvoice}/>
   <ThemedText>Invoice Date (DD/MM/YYYY)</ThemedText><TextInput style={styles.input} value={date} onChangeText={setDate}/>
   {selectedLines.map(l=><View key={l.line_id} style={styles.line}><ThemedText style={styles.bold}>{l.item_name} · {l.quantity} {l.base_unit}</ThemedText><ThemedText>Actual unit purchase price (USD)</ThemedText><TextInput keyboardType="decimal-pad" style={styles.input} value={prices[l.line_id]??""} onChangeText={v=>setPrices(p=>({...p,[l.line_id]:v}))}/></View>)}
   <Pressable disabled={!valid||busy} style={[styles.submit,(!valid||busy)&&styles.disabled]} onPress={()=>void post()}><ThemedText style={styles.submitText}>Confirm GRV — Match Invoice</ThemedText></Pressable>
  </View>:null}
 </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},heading:{fontWeight:"700",fontSize:22,color:jsplColors.primaryDark},card:{backgroundColor:"#fff",padding:12,borderWidth:1,borderColor:jsplColors.border,borderRadius:8,gap:5},selected:{borderColor:jsplColors.primary,borderWidth:2},bold:{fontWeight:"700"},button:{padding:10,alignSelf:"flex-start",borderColor:jsplColors.border,borderWidth:1},form:{backgroundColor:"#fff",borderWidth:1,borderColor:jsplColors.border,borderRadius:8,padding:14,gap:9},line:{borderTopWidth:1,borderColor:jsplColors.border,paddingTop:9,gap:5},input:{minHeight:42,borderWidth:1,borderRadius:5,borderColor:jsplColors.border,padding:10,color:"#111",backgroundColor:"#fff"},submit:{backgroundColor:jsplColors.primary,padding:15,alignSelf:"flex-start",borderRadius:6},disabled:{opacity:0.5},submitText:{color:"white",fontWeight:"700"},error:{color:jsplColors.danger}});
