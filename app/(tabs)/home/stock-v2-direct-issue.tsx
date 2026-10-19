import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "../../../supabase";

type Trace={tracecode_id:number;tracecode_name:string;end_date:string|null};
type Input={input_id:number;inputs_name:string};
type IssueLine={id:number;input_id:number|null;query:string;quantity:string};
let nextLineId=1;
export default function StockV2DirectIssue(){
 const [traces,setTraces]=useState<Trace[]>([]);
 const [inputs,setInputs]=useState<Input[]>([]);
 const [traceId,setTraceId]=useState<number|null>(null);
 const [purpose,setPurpose]=useState("");
 const [lines,setLines]=useState<IssueLine[]>([{id:nextLineId++,input_id:null,query:"",quantity:""}]);
 const [open,setOpen]=useState<number|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{let active=true;(async()=>{
  const [t,i]=await Promise.all([
   supabase.from("tracecode").select("tracecode_id,tracecode_name,end_date").order("tracecode_name"),
   supabase.from("inputs").select("input_id,inputs_name").order("inputs_name").range(0,999)
  ]);
  if(!active)return;
  if(t.error||i.error)setError([t.error?.message,i.error?.message].filter(Boolean).join("; "));
  else {const today=new Date().toISOString().slice(0,10);const rows=((t.data??[]) as Trace[]).filter(x=>!x.end_date||x.end_date.slice(0,10)>=today);setTraces(rows);setInputs((i.data??[]) as Input[]);}
  setLoading(false);
 })();return()=>{active=false}},[]);
 const chosen=traces.find(t=>t.tracecode_id===traceId);
 const edit=(id:number,changes:Partial<IssueLine>)=>setLines(old=>old.map(x=>x.id===id?{...x,...changes}:x));
 const valid=!!chosen&&purpose.trim().length>0&&lines.length>0&&lines.every(x=>x.input_id!==null&&Number(x.quantity)>0&&Number.isFinite(Number(x.quantity)));
 const qtyTotal=useMemo(()=>lines.filter(x=>Number(x.quantity)>0).length,[lines]);
 return <ThemedView style={styles.root}><ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={styles.page}>
  <ThemedText type="title">Stock V2 · Direct Issue</ThemedText>
  <ThemedText style={styles.warn}>Development preview. No stock is deducted and posting is disabled.</ThemedText>
  {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:null}
  <ThemedText style={styles.head}>Issue type: Direct (no spray programme)</ThemedText>
  <ThemedText style={styles.label}>Allocate to tracecode</ThemedText>
  <ScrollView horizontal showsHorizontalScrollIndicator={false}>{traces.map(t=><Pressable key={t.tracecode_id} onPress={()=>setTraceId(t.tracecode_id)} style={[styles.chip,traceId===t.tracecode_id&&styles.sel]}><ThemedText>{t.tracecode_name}</ThemedText></Pressable>)}</ScrollView>
  <ThemedText style={styles.label}>Purpose / job description</ThemedText>
  <TextInput style={styles.input} value={purpose} onChangeText={setPurpose} placeholder="e.g. Mosquito spraying at domestic house"/>
  <ThemedText style={styles.head}>Products to issue</ThemedText>
  {lines.map(line=><View key={line.id} style={styles.card}>
   <ThemedText style={styles.label}>Input (type any letters to search)</ThemedText>
   <TextInput style={styles.input} value={line.query} onChangeText={v=>{edit(line.id,{query:v,input_id:null});setOpen(line.id)}} onFocus={()=>setOpen(line.id)} autoCorrect={false} placeholder="Find chemical / fertiliser"/>
   {open===line.id?<View style={styles.suggest}><ScrollView nestedScrollEnabled keyboardShouldPersistTaps="always" style={{maxHeight:190}}>
    {inputs.filter(x=>x.inputs_name.toLowerCase().includes(line.query.toLowerCase().trim())).slice(0,30).map(x=><Pressable key={x.input_id} style={styles.option} onPress={()=>{edit(line.id,{query:x.inputs_name,input_id:x.input_id});setOpen(null)}}><ThemedText>{x.inputs_name}</ThemedText></Pressable>)}
   </ScrollView><Pressable onPress={()=>setOpen(null)} style={styles.option}><ThemedText>Close list</ThemedText></Pressable></View>:null}
   <ThemedText style={styles.label}>Actual quantity to issue (in product's stock unit)</ThemedText>
   <TextInput style={styles.input} keyboardType="decimal-pad" value={line.quantity} onChangeText={v=>edit(line.id,{quantity:v})} placeholder="e.g. 0.5"/>
   <Pressable onPress={()=>setLines(old=>old.filter(x=>x.id!==line.id))}><ThemedText style={styles.error}>Remove product</ThemedText></Pressable>
  </View>)}
  <Pressable style={styles.btn} onPress={()=>setLines(old=>[...old,{id:nextLineId++,input_id:null,query:"",quantity:""}])}><ThemedText>+ Add another product</ThemedText></Pressable>
  <View style={styles.card}><ThemedText style={styles.head}>Posting preview</ThemedText>
   <ThemedText>Tracecode: {chosen?.tracecode_name??"Not selected"}</ThemedText>
   <ThemedText>Purpose: {purpose||"Not entered"}</ThemedText>
   <ThemedText>Products with quantities: {qtyTotal}</ThemedText>
   {lines.map(x=><ThemedText key={x.id}>{x.input_id!==null?"✓":"○"} {x.query||"Choose input"} — {x.quantity||"0"} stock units</ThemedText>)}
   <ThemedText style={styles.warn}>{valid?"Entry complete for preview. Actual stock availability and stock ownership still need to be validated before posting.":"Select a tracecode, enter a purpose and choose products and quantities."}</ThemedText>
   <View style={styles.disabled}><ThemedText style={{color:"#666"}}>Post Issue — not enabled yet</ThemedText></View>
  </View>
 </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({root:{flex:1},page:{padding:16,gap:10,paddingBottom:40},head:{fontWeight:"700",fontSize:16},label:{opacity:0.8},warn:{color:"#9b6c19"},error:{color:"#b22"},chip:{padding:9,borderWidth:1,borderColor:"#999",borderRadius:8,marginRight:6},sel:{backgroundColor:"#c8e8d8"},input:{borderWidth:1,borderColor:"#888",padding:10,borderRadius:8,backgroundColor:"white",color:"#222"},card:{borderWidth:1,borderColor:"#aaa",borderRadius:10,padding:12,gap:8},option:{padding:9,borderBottomWidth:1,borderBottomColor:"#ddd"},suggest:{backgroundColor:"white",borderWidth:1,borderColor:"#ddd",padding:4},btn:{padding:12,borderWidth:1,borderColor:"#888",borderRadius:9,alignItems:"center"},disabled:{backgroundColor:"#ddd",borderRadius:8,padding:14,alignItems:"center"}});