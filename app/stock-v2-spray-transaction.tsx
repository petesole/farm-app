import {stockMutation} from "@/utils/stock-workflow";
import {StockRecovery} from "@/components/jspl/StockWorkflowControls";
import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/supabase";
import { JsplSearchCombo } from "@/components/jspl/JsplSearchCombo";
import { StockV2Header } from "@/components/jspl/StockV2Header";
import { jsplColors as C } from "@/constants/jspl-design";

const endpoint = "https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type SprayLine = {job_id:number;external_tracecode_id:number;tracecode_name:string;area_ha:number;status:string;item_code:string;item_name:string;base_unit:string;rate_per_ha:number;planned_quantity:number;issued_quantity:number};
type Product = {item_code:string;item_name:string;quantity:number};
type ReturnLine = {document_id:number;document_number:string;source_line_id:number;item_name:string;base_unit:string;available_to_return:number};
const fmt=(n:number)=>Number.isFinite(n)?n.toLocaleString("en-GB",{maximumFractionDigits:3}):"—";
export default function SprayTransaction(){
 const params=useLocalSearchParams<{jobId?:string;mode?:string}>();
 const jobId=Number(params.jobId); const mode=params.mode==="return"?"return":"issue";
 const [lines,setLines]=useState<SprayLine[]>([]),[products,setProducts]=useState<Product[]>([]),[issues,setIssues]=useState<ReturnLine[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [hectares,setHectares]=useState(""),[documentId,setDocumentId]=useState<number|null>(null);
 const [amounts,setAmounts]=useState<Record<number,string>>({}),[complete,setComplete]=useState(false),[confirmed,setConfirmed]=useState(false);
 const selected=useMemo(()=>lines.filter(l=>Number(l.job_id)===jobId),[lines,jobId]);
 const area=selected.length?Math.min(...selected.map(l=>l.rate_per_ha>0?Math.max(0,(l.planned_quantity-l.issued_quantity)/l.rate_per_ha):0)):0;
 const chosenIssues=issues.filter(x=>Number(x.document_id)===documentId);
 const token=async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");return session.access_token};
 useEffect(()=>{let alive=true;(async()=>{try{
  if(!Number.isSafeInteger(jobId)||jobId<=0)throw Error("Invalid spray reference");
  const access=await token();
  const [res,returnRes]=await Promise.all([fetch(endpoint,{headers:{authorization:"Bearer "+access}}),mode==="return"?fetch(endpoint+"?spray_return_issues=1&job_id="+jobId,{headers:{authorization:"Bearer "+access}}):Promise.resolve(null)]);
  const data=await res.json();if(!res.ok)throw Error(data.error||"Unable to load spray");
  const job=(data.sprays??[]).filter((l:SprayLine)=>Number(l.job_id)===jobId);
  if(!job.length)throw Error("Spray not found");
  if(mode==="return"&&job[0].status!=="completed")throw Error("Only completed sprays can return unused stock");
  if(mode==="issue"&&(job[0].status!=="planned"||job.every((l:SprayLine)=>Number(l.planned_quantity)<=Number(l.issued_quantity))))throw Error("No outstanding spray stock to issue");
  if(!alive)return;
  setLines(job.map((l:SprayLine)=>({...l,job_id:Number(l.job_id),external_tracecode_id:Number(l.external_tracecode_id)})));setProducts(data.items??[]);
  if(returnRes){const d=await returnRes.json();if(!returnRes.ok)throw Error(d.error||"Unable to load original issues");if(alive)setIssues((d.rows??[]).map((l:ReturnLine)=>({...l,document_id:Number(l.document_id),source_line_id:Number(l.source_line_id),available_to_return:Number(l.available_to_return)})))}
 }catch(e){if(alive)setError(e instanceof Error?e.message:String(e))}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[jobId,mode]);
 useEffect(()=>{if(mode==="issue"&&area>0&&!hectares)setHectares(String(Number(area.toFixed(3))))},[mode,area]);
 const post=async()=>{
  if(busy||!confirmed)return;
  setError("");
  try{
   if(!selected.length)throw Error("Spray not loaded");
   let payload:unknown, action:string;
   if(mode==="issue"){
    const ha=Number(hectares);
    if(!Number.isFinite(ha)||ha<=0||ha>area+0.00001)throw Error("Enter hectares within the remaining spray area");
    const requested=selected.map(l=>({item_code:l.item_code,quantity:Number((ha*l.rate_per_ha).toFixed(4))}));
    const shortage=requested.find(l=>l.quantity>(products.find(p=>p.item_code===l.item_code)?.quantity??0)+0.00001);
    if(shortage)throw Error("Insufficient stock for "+(products.find(p=>p.item_code===shortage.item_code)?.item_name??shortage.item_code));
    action="planned_issue";payload={job_id:jobId,tracecode_id:selected[0].external_tracecode_id,lines:requested};
   }else{
    const chosen=chosenIssues.map(x=>({source_line_id:x.source_line_id,quantity:Number(amounts[x.source_line_id]||0)})).filter(x=>x.quantity>0);
    if(!documentId||!chosen.length)throw Error("Select an original issue and enter return quantities");
    for(const row of chosen){const source=chosenIssues.find(x=>x.source_line_id===row.source_line_id)!;if(!Number.isFinite(row.quantity)||row.quantity>source.available_to_return+0.00001)throw Error("Invalid return quantity for "+source.item_name)}
    action="spray_return";payload={job_id:jobId,issue_document_id:documentId,spray_complete:complete,lines:chosen};
   }
   setBusy(true);
   const data=await stockMutation('spray-transaction',{action,payload});
   if(!data.result?.document_id)throw Error('Transaction not confirmed by server');
   router.replace({pathname:"/stock-v2-spray-planning",params:{postedDocument:String(data.result.document_id)}});
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const docOptions=[...new Map(issues.map(x=>[x.document_id,x.document_number])).entries()].map(([id,label])=>({id,label,active:true}));
 return <ScrollView contentContainerStyle={s.page}>
  {error?<StockRecovery scope="spray-transaction" onRecovered={()=>router.replace("/stock-v2-spray-planning")}/>:null}
  <StockV2Header title={mode==="return"?"Spray Stock Return":"Spray Transfer / Issue"} onStock={()=>router.replace("/stock-v2-spray-planning")}/>
  <Text style={s.title}>Spray #{jobId} {selected[0]?.tracecode_name??""}</Text>
  {loading?<ActivityIndicator/>:null}
  {!!error&&<Text style={s.error}>{error}</Text>}
  {!loading&&!error&&!selected.length?<Text style={s.error}>Spray details could not be displayed. Return to Spray Planning and reopen the issue.</Text>:null}
  {!loading&&selected.length>0&&<View style={s.panel}>
   {mode==="issue"?<>
    <Text>Remaining: {fmt(area)} ha</Text>
    <Text>Hectares to issue</Text>
    <TextInput accessibilityLabel="Hectares to issue" style={s.input} value={hectares} onChangeText={x=>{setHectares(x);setConfirmed(false)}} keyboardType="decimal-pad"/>
    <View style={s.row}><Text style={s.name}>Product</Text><Text style={s.value}>Required</Text><Text style={s.value}>Available</Text></View>
    {selected.map(l=><View key={l.item_code} style={s.row}><Text style={s.name}>{l.item_name}</Text><Text style={s.value}>{fmt(Number(hectares)*l.rate_per_ha)} {l.base_unit}</Text><Text style={s.value}>{fmt(products.find(p=>p.item_code===l.item_code)?.quantity??0)}</Text></View>)}
   </>:<>
    <JsplSearchCombo label="Original issue" selector="product" options={docOptions} value={documentId} onChange={v=>{setDocumentId(typeof v==="number"?v:null);setAmounts({});setConfirmed(false)}} placeholder="Select issue document"/>
    <View style={s.row}><Text style={s.name}>Product</Text><Text style={s.value}>Maximum return</Text><Text style={s.value}>Return quantity</Text></View>
    {chosenIssues.map(x=><View key={x.source_line_id} style={s.row}><Text style={s.name}>{x.item_name}</Text><Text style={s.value}>{fmt(x.available_to_return)} {x.base_unit}</Text><TextInput accessibilityLabel={"Return quantity "+x.source_line_id} style={[s.input,s.value]} keyboardType="decimal-pad" value={amounts[x.source_line_id]??""} onChangeText={v=>{setAmounts(a=>({...a,[x.source_line_id]:v}));setConfirmed(false)}}/></View>)}
    <JsplSearchCombo label="Spray status" selector="product" options={[{id:"incomplete",label:"Incomplete — keep outstanding",active:true},{id:"complete",label:"Complete — close spray",active:true}]} value={complete?"complete":"incomplete"} onChange={v=>{setComplete(v==="complete");setConfirmed(false)}}/>
   </>}
   <Pressable accessibilityRole="checkbox" accessibilityState={{checked:confirmed}} onPress={()=>setConfirmed(c=>!c)}><Text style={s.check}>{confirmed?"☑":"☐"} Confirm {mode==="issue"?"stock issue":"stock return"}</Text></Pressable>
   <View style={s.row}><Pressable style={s.button} onPress={()=>router.replace("/stock-v2-spray-planning")}><Text>Cancel</Text></Pressable><Pressable style={s.button} disabled={busy||!confirmed} onPress={()=>void post()}><Text>{busy?"Posting…":"Post "+(mode==="issue"?"Issue":"Return")}</Text></Pressable></View>
  </View>}
 </ScrollView>
}
const s=StyleSheet.create({page:{padding:18,gap:12,backgroundColor:C.background,flexGrow:1},title:{fontWeight:"800",fontSize:19,color:C.primaryDark},panel:{backgroundColor:C.surface,padding:16,borderRadius:10,gap:12},row:{flexDirection:"row",alignItems:"center",gap:10},name:{flex:2,color:C.text},value:{flex:1,color:C.text,textAlign:"right",minWidth:90},input:{borderWidth:1,borderColor:C.border,borderRadius:8,padding:8,minHeight:42,backgroundColor:C.surface},button:{borderWidth:1,borderColor:C.primary,borderRadius:8,padding:12,minHeight:42},check:{fontWeight:"700",color:C.primaryDark},error:{color:C.danger,fontWeight:"700"}});
