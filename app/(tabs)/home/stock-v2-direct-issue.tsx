import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "../../../supabase";
import {jsplColors,jsplSpacing,jsplRadii,jsplSizes} from "@/constants/jspl-design";

type Trace={tracecode_id:number;tracecode_name:string;end_date:string|null};
type Input={input_id:number;inputs_name:string};
const demoProducts:Input[]=[
 {input_id:-1001,inputs_name:"DEMO Mosquito Spray (L)"},
 {input_id:-1002,inputs_name:"DEMO Glyphosate (L)"},
 {input_id:-1003,inputs_name:"DEMO Lambda Insecticide (L)"},
 {input_id:-1004,inputs_name:"DEMO Compound D Fertiliser (kg)"}
];
type IssueLine={id:number;input_id:number|null;query:string;quantity:string};
type InventoryRow={input_id:number;stock_item_id:number;owner_code:string;location_name:string;available:number;unit:string};
type BalanceResult={verified_owner:boolean;owner_code:string|null;balances:InventoryRow[]};
const inventoryEndpoint=process.env.EXPO_PUBLIC_STOCK_V2_READ_API_URL || "";
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
 const [inventory,setInventory]=useState<BalanceResult|null>(null);
 const [inventoryStatus,setInventoryStatus]=useState("Private Stock V2 balance service not configured");
 const [inventoryLoading,setInventoryLoading]=useState(false);
 const [posting,setPosting]=useState(false);
 const [confirmed,setConfirmed]=useState(false);
 const [postMessage,setPostMessage]=useState("");
 const [requestId,setRequestId]=useState<string|null>(null);
 useEffect(()=>{let active=true;(async()=>{
  const [t,i]=await Promise.all([
   supabase.from("tracecode").select("tracecode_id,tracecode_name,end_date").order("tracecode_name"),
   supabase.from("inputs").select("input_id,inputs_name").order("inputs_name").range(0,999)
  ]);
  if(!active)return;
  if(t.error||i.error)setError([t.error?.message,i.error?.message].filter(Boolean).join("; "));
  else {const today=new Date().toISOString().slice(0,10);const rows=((t.data??[]) as Trace[]).filter(x=>!x.end_date||x.end_date.slice(0,10)>=today);setTraces(rows);setInputs([...demoProducts,...((i.data??[]) as Input[])]);}
  setLoading(false);
 })();return()=>{active=false}},[]);
 useEffect(()=>{let active=true;setInventory(null);
   if(traceId===null||!inventoryEndpoint){setInventoryStatus("Stock V2 balances unavailable until a private read service is configured.");return;}
   (async()=>{setInventoryLoading(true);try{
     const {data:{session}}=await supabase.auth.getSession();
     if(!session?.access_token)throw new Error("Authentication required");
     const url=new URL(inventoryEndpoint);
     url.searchParams.set("tracecode_id",String(traceId));
     const response=await fetch(url.toString(),{headers:{Authorization:"Bearer "+session.access_token}});
     if(!response.ok)throw new Error("Stock service returned "+response.status);
     const result=await response.json() as BalanceResult;
     if(!Array.isArray(result.balances)||typeof result.verified_owner!=="boolean")throw new Error("Invalid stock response");
     if(active){setInventory(result);setInventoryStatus(result.verified_owner?"Ownership checked":"Tracecode ownership not verified");}
   }catch(e){if(active)setInventoryStatus(e instanceof Error?e.message:String(e))}
   finally{if(active)setInventoryLoading(false)}})();
   return()=>{active=false};
 },[traceId]);
 const chosen=traces.find(t=>t.tracecode_id===traceId);
 const edit=(id:number,changes:Partial<IssueLine>)=>setLines(old=>old.map(x=>x.id===id?{...x,...changes}:x));
 const valid=!!chosen&&purpose.trim().length>0&&lines.length>0&&lines.every(x=>x.input_id!==null&&x.input_id<=-1001&&x.input_id>=-1004&&Number(x.quantity)>0&&Number.isFinite(Number(x.quantity)));
 const postDemo=async()=>{
  if(!valid||posting||!confirmed)return;
  setPosting(true);setPostMessage("");
  const id=requestId??"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,ch=>{
    const r=Math.floor(Math.random()*16);return(ch==="x"?r:(r&3)|8).toString(16);
  });
  setRequestId(id);
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error("Sign in to Supabase first. Demo posting requires an authenticated user.");
   const body={request_id:id,tracecode_id:traceId,purpose,lines:lines.map(x=>({input_id:x.input_id,quantity:Number(x.quantity)}))};
   const res=await fetch("https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-issue",{
     method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},body:JSON.stringify(body)
   });
   const result=await res.json();
   if(!res.ok)throw new Error(result.error||"Posting failed");
   setPostMessage("Posted test issue #"+result.document_id+(result.duplicate?" (already posted)":"")+". Test stock deducted.");
   setConfirmed(false);
   setRequestId(null);
   setLines([{id:nextLineId++,input_id:null,query:"",quantity:""}]);
   setPurpose("");
  }catch(e){setPostMessage("NOT POSTED: "+(e instanceof Error?e.message:String(e)));}
  finally{setPosting(false)}
 };
 const qtyTotal=useMemo(()=>lines.filter(x=>Number(x.quantity)>0).length,[lines]);
 return <ThemedView style={styles.root}><ScrollView keyboardShouldPersistTaps="always" contentContainerStyle={styles.page}>
  <ThemedText type="title">Stock V2 · Direct Issue</ThemedText>
  <ThemedText style={styles.warn}>TEST MODE — only four DEMO products will be posted to TEST_JS stock, never live inventory.</ThemedText>
  {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:null}
  <ThemedText style={styles.head}>Issue type: Direct (no spray programme)</ThemedText>
  <ThemedText style={styles.label}>Allocate to tracecode</ThemedText>
  <ScrollView horizontal showsHorizontalScrollIndicator={false}>{traces.map(t=><Pressable key={t.tracecode_id} onPress={()=>setTraceId(t.tracecode_id)} style={[styles.chip,traceId===t.tracecode_id&&styles.sel]}><ThemedText>{t.tracecode_name}</ThemedText></Pressable>)}</ScrollView>
  <ThemedText style={styles.label}>Purpose / job description</ThemedText>
  <TextInput style={styles.input} value={purpose} onChangeText={setPurpose} placeholder="e.g. Mosquito spraying at domestic house"/>
  <View style={styles.card}>
   <ThemedText style={styles.head}>Available Stock V2 balances</ThemedText>
   {inventoryLoading?<ActivityIndicator/>:null}
   <ThemedText style={styles.warn}>{inventoryStatus}</ThemedText>
   {inventory?.owner_code?<ThemedText>Stock owner: {inventory.owner_code}</ThemedText>:null}
  </View>
  <ThemedText style={styles.head}>Products to issue</ThemedText>
  {lines.map(line=><View key={line.id} style={styles.card}>
   <ThemedText style={styles.label}>Chemical / Fertiliser</ThemedText>
   <View style={{flexDirection:"row",gap:6}}>
    <TextInput style={[styles.input,{flex:1}]} value={line.query} onChangeText={v=>{edit(line.id,{query:v,input_id:null});setOpen(line.id)}} onFocus={()=>setOpen(line.id)} autoCorrect={false} placeholder="Type any letters to filter"/>
    <Pressable accessibilityLabel="Open input dropdown" style={styles.dropdownButton} onPress={()=>setOpen(open===line.id?null:line.id)}><ThemedText>▼</ThemedText></Pressable>
   </View>
   {line.input_id!==null?<ThemedText style={styles.selectedText}>✓ Selected from inputs master</ThemedText>:<ThemedText style={styles.warn}>Choose a product from the dropdown</ThemedText>}
   {open===line.id?<View style={styles.suggest}><ScrollView nestedScrollEnabled keyboardShouldPersistTaps="always" style={{maxHeight:190}}>
    {inputs.filter(x=>x.inputs_name.toLowerCase().includes(line.query.toLowerCase().trim())).slice(0,30).map(x=><Pressable key={x.input_id} style={styles.option} onPress={()=>{edit(line.id,{query:x.inputs_name,input_id:x.input_id});setOpen(null)}}><ThemedText>{x.inputs_name}</ThemedText></Pressable>)}
   </ScrollView><Pressable onPress={()=>setOpen(null)} style={styles.option}><ThemedText>Close list</ThemedText></Pressable></View>:null}
   {line.input_id!==null?<View>
     {(inventory?.verified_owner?inventory.balances:[]).filter(b=>b.input_id===line.input_id&&b.owner_code===inventory?.owner_code).map((b,i)=><ThemedText key={i} style={styles.selectedText}>Available: {b.available} {b.unit} at {b.location_name} ({b.owner_code})</ThemedText>)}
     {!inventory?.verified_owner||!inventory.balances.some(b=>b.input_id===line.input_id)?<ThemedText style={styles.warn}>Stock balance display requires the secured Stock V2 read service. Demo product selection is for screen testing.</ThemedText>:null}
   </View>:null}
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
   <Pressable style={[styles.btn,confirmed&&styles.sel]} onPress={()=>setConfirmed(x=>!x)}><ThemedText>{confirmed?"✓ Confirmed: Test stock issue":"Tap to confirm TEST stock issue"}</ThemedText></Pressable>
   <Pressable disabled={!valid||!confirmed||posting} style={[styles.btn,(!valid||!confirmed||posting)&&styles.disabled]} onPress={postDemo}>
    <ThemedText>{posting?"Posting...":"Post DEMO Issue"}</ThemedText>
   </Pressable>
   {postMessage?<ThemedText>{postMessage}</ThemedText>:null}
  </View>
 </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.xl,gap:jsplSpacing.md,paddingBottom:40},head:{fontWeight:"700",fontSize:16},label:{opacity:0.8},warn:{color:"#9b6c19"},error:{color:"#b22"},chip:{padding:9,borderWidth:1,borderColor:"#999",borderRadius:8,marginRight:6},sel:{backgroundColor:"#c8e8d8"},dropdownButton:{borderWidth:1,borderColor:"#888",borderRadius:8,paddingHorizontal:14,justifyContent:"center"},selectedText:{color:"#187a48",fontWeight:"600"},input:{minHeight:jsplSizes.inputHeight,borderWidth:1,borderColor:jsplColors.border,paddingHorizontal:jsplSpacing.md,paddingVertical:9,borderRadius:jsplRadii.sm,backgroundColor:jsplColors.surface,color:jsplColors.text},card:{borderWidth:1,borderColor:"#aaa",borderRadius:10,padding:12,gap:8},option:{padding:9,borderBottomWidth:1,borderBottomColor:"#ddd"},suggest:{backgroundColor:"white",borderWidth:1,borderColor:"#ddd",padding:4},btn:{minHeight:jsplSizes.buttonHeight,paddingHorizontal:jsplSpacing.md,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.sm,alignItems:"center",justifyContent:"center"},disabled:{backgroundColor:"#ddd",borderRadius:8,padding:14,alignItems:"center"}});