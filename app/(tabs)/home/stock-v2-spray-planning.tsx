import {StockV2Header} from "@/components/jspl/StockV2Header";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors,jsplSpacing,jsplRadii,jsplSizes} from "@/constants/jspl-design";

const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Product={item_code:string;item_name:string;base_unit:string;quantity:number};
type Spray={job_id:number;external_tracecode_id:number;tracecode_name:string;planned_week_start:string;area_ha:number;spray_type:string;part_label:string|null;sprayer_asset_code:string|null;water_litres_per_ha:number|null;status:string;item_code:string;item_name:string;base_unit:string;rate_per_ha:number;planned_quantity:number;issued_quantity:number};
type Crop={crop_id:number;crop_name:string};
type Trace={tracecode_id:number;crop_id:number|null;end_date:string|null;start_date:string|null};
type Job={id:number;traceId:number;week:string;trace:string;crop:string;area:number;status:string;sprayType:string;part:string;sprayer:string;water:number;lines:Spray[];remainingArea:number};
const fmt=(n:number)=>Number.isFinite(n)?n.toLocaleString("en-GB",{maximumFractionDigits:3}):"—";
const weekLabel=(s:string)=>{const d=new Date(s+"T12:00:00Z");const th=new Date(d);th.setUTCDate(d.getUTCDate()+3-((d.getUTCDay()+6)%7));const yr=th.getUTCFullYear();const jan4=new Date(Date.UTC(yr,0,4));const first=new Date(jan4);first.setUTCDate(jan4.getUTCDate()-((jan4.getUTCDay()+6)%7));return yr+"/"+String(1+Math.round((d.getTime()-first.getTime())/604800000)).padStart(2,"0")};
const uuid=()=>"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==="x"?r:(r&3)|8).toString(16)});
export default function WeeklySprayPlanning(){
 const router=useRouter();
 const [sprays,setSprays]=useState<Spray[]>([]),[products,setProducts]=useState<Product[]>([]),[traces,setTraces]=useState<Trace[]>([]),[crops,setCrops]=useState<Crop[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const [expanded,setExpanded]=useState(""),[issueId,setIssueId]=useState<number|null>(null),[issueHa,setIssueHa]=useState(""),[confirm,setConfirm]=useState(false);
 const [showCompleted,setShowCompleted]=useState(false);
 const [cropFilter,setCropFilter]=useState("all"),[traceFilter,setTraceFilter]=useState("all");
 const [issueHistory,setIssueHistory]=useState<{document_id:number;document_number:string;document_type:string}[]>([]);
 const [latestSlip,setLatestSlip]=useState<number|null>(null);
 const [returnJob,setReturnJob]=useState<number|null>(null);
 const [returnIssues,setReturnIssues]=useState<{document_id:number;document_number:string;source_line_id:number;item_name:string;base_unit:string;available_to_return:number}[]>([]);
 const [returnDoc,setReturnDoc]=useState<number|null>(null);
 const [returnAmounts,setReturnAmounts]=useState<Record<number,string>>({});
 const [returnComplete,setReturnComplete]=useState(false);
 const [returnConfirm,setReturnConfirm]=useState(false);
 const load=useCallback(async()=>{setLoading(true);setError("");try{
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");
  const [res,tc,cr]=await Promise.all([
    fetch(endpoint,{headers:{authorization:"Bearer "+session.access_token}}),
    supabase.from("tracecode").select("tracecode_id,crop_id,start_date,end_date"),
    supabase.from("crop").select("crop_id,crop_name")
  ]);
  const data=await res.json();if(!res.ok)throw Error(data.error||"Could not load spray jobs");
  if(tc.error||cr.error)throw Error(tc.error?.message||cr.error?.message);
  setSprays(data.sprays??[]);setProducts(data.items??[]);setIssueHistory(data.documents??[]);setTraces((tc.data??[]) as Trace[]);setCrops((cr.data??[]) as Crop[]);
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const jobs=useMemo(()=>{
  const map=new Map<number,Spray[]>();
  for(const s of sprays){if(!map.has(s.job_id))map.set(s.job_id,[]);map.get(s.job_id)!.push(s)}
  return [...map.entries()].map(([id,lines]):Job=>{
   const a=lines[0],cropId=traces.find(t=>t.tracecode_id===a.external_tracecode_id)?.crop_id;
   const crop=crops.find(c=>c.crop_id===cropId)?.crop_name??"—";
   const areas=lines.map(l=>l.rate_per_ha>0?Math.max(0,(l.planned_quantity-l.issued_quantity)/l.rate_per_ha):0);
   return {id,traceId:a.external_tracecode_id,week:a.planned_week_start??"",trace:a.tracecode_name??"Unknown trace",crop,area:a.area_ha,status:a.status,sprayType:a.spray_type,part:a.part_label??"",sprayer:a.sprayer_asset_code??"",water:a.water_litres_per_ha??0,lines,remainingArea:areas.length?Math.min(...areas):0};
  }).sort((a,b)=>String(a.week??"").localeCompare(String(b.week??""))||String(a.crop??"").localeCompare(String(b.crop??""))||String(a.trace??"").localeCompare(String(b.trace??""))||a.id-b.id);
 },[sprays,traces,crops]);
 const due=jobs.filter(j=>j.status==="planned"&&j.remainingArea>0.0001);
 const dueCrops=[...new Set(due.map(j=>j.crop))].sort();
 const dueTraces=[...new Map(due.filter(j=>cropFilter==="all"||j.crop===cropFilter).map(j=>[j.traceId,{id:j.traceId,name:j.trace}])).values()].sort((a,b)=>String(a.name??"").localeCompare(String(b.name??"")));
 const visible=jobs.filter(j=>(showCompleted||(j.status==="planned"&&j.remainingArea>0.0001))&&(cropFilter==="all"||j.crop===cropFilter)&&(traceFilter==="all"||String(j.traceId)===traceFilter));
 const groups=useMemo(()=>{const m=new Map<string,Job[]>();for(const j of visible){const k=j.week+"|"+j.crop+"|"+j.trace;if(!m.has(k))m.set(k,[]);m.get(k)!.push(j)}return [...m.entries()].map(([key,rows])=>({key,rows,week:rows[0].week,crop:rows[0].crop,trace:rows[0].trace}))},[visible]);
 const openReturn=async(job:Job)=>{setError("");setReturnJob(job.id);setReturnDoc(null);setReturnIssues([]);setReturnAmounts({});setReturnComplete(false);setReturnConfirm(false);try{
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
  const res=await fetch(endpoint+"?spray_return_issues=1&job_id="+job.id,{headers:{authorization:"Bearer "+session.access_token}});
  const data=await res.json();if(!res.ok)throw Error(data.error||"Cannot load issue lines");
  setReturnIssues(data.rows??[]);
 }catch(e){setError(e instanceof Error?e.message:String(e))}};
 const postReturn=async(job:Job)=>{const selected=returnIssues.filter(x=>x.document_id===returnDoc);
 const lines=selected.map(x=>({source_line_id:x.source_line_id,quantity:Number(returnAmounts[x.source_line_id]||0)})).filter(x=>x.quantity>0);
 if(!returnDoc||!lines.length){setError("Choose an issue and enter at least one return quantity.");return}
 for(const l of lines){const source=selected.find(x=>x.source_line_id===l.source_line_id)!;if(!Number.isFinite(l.quantity)||l.quantity>source.available_to_return+0.00001){setError("Return quantity exceeds the issued balance for "+source.item_name);return}}
 if(!returnConfirm){setError("Confirm the return before posting.");return}
 setSaving(true);setError("");
 try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
 const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},body:JSON.stringify({action:"spray_return",payload:{job_id:job.id,issue_document_id:returnDoc,spray_complete:returnComplete,lines}})});
 const data=await res.json();if(!res.ok)throw Error(data.error||"Return failed");
 if(!data.result?.document_id)throw Error("Return not confirmed");
 setReturnJob(null);setReturnDoc(null);setReturnConfirm(false);await load();
 }catch(e){setError("RETURN NOT POSTED: "+(e instanceof Error?e.message:String(e)))}finally{setSaving(false)}};
 const transfer=async(job:Job)=>{const ha=Number(issueHa);setError("");
  if(!Number.isFinite(ha)||ha<=0||ha>job.remainingArea+0.00001){setError("Enter hectares greater than zero and no more than the outstanding spray area.");return}
  const lines=job.lines.map(l=>({item_code:l.item_code,quantity:Number((ha*l.rate_per_ha).toFixed(4))}));
  const shortage=lines.find(l=>l.quantity>(products.find(p=>p.item_code===l.item_code)?.quantity??0)+0.00001);
  if(shortage){setError("Insufficient test warehouse stock for "+(products.find(p=>p.item_code===shortage.item_code)?.item_name??shortage.item_code));return}
  if(!confirm){setError("Confirm the transfer before issuing stock.");return}
  setSaving(true);
  try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");
   const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},body:JSON.stringify({action:"planned_issue",request_id:uuid(),payload:{job_id:job.id,tracecode_id:job.lines[0].external_tracecode_id,lines}})});
   const data=await res.json();if(!res.ok)throw Error(data.error||"Transfer failed");
   if(!data.result?.document_id)throw Error("Transfer was not confirmed by the server");
   setLatestSlip(Number(data.result.document_id));setIssueId(null);setConfirm(false);await load();
  }catch(e){setError("NOT TRANSFERRED: "+(e instanceof Error?e.message:String(e)))}finally{setSaving(false)}
 };
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
 <StockV2Header title="Weekly Spray Planning" onRefresh={()=>void load()}/>
 <View style={styles.actions}>
  <Pressable style={styles.primary} onPress={()=>router.push("/stock-v2-spray-entry")}><ThemedText style={styles.white}>+ New Spray</ThemedText></Pressable>
  <Pressable style={styles.secondary} onPress={()=>setShowCompleted(v=>!v)}><ThemedText>{showCompleted?"Hide completed":"Show history"}</ThemedText></Pressable>
 </View>
 {showCompleted?<View style={styles.panel}><ThemedText style={styles.bold}>Posted issue slips · Reprint</ThemedText>
  {[...new Map(issueHistory.filter(d=>d.document_type==="issue").map(d=>[d.document_id,d])).values()].map(d=><Pressable key={d.document_id} style={styles.secondary} onPress={()=>router.push({pathname:"/stock-v2-issue-slip",params:{documentId:String(d.document_id)}})}><ThemedText>Reprint {d.document_number}</ThemedText></Pressable>)}
 </View>:null}
 {latestSlip?<Pressable style={styles.primary} onPress={()=>router.push({pathname:"/stock-v2-issue-slip",params:{documentId:String(latestSlip)}})}><ThemedText style={styles.white}>Print Issue Slip #{latestSlip}</ThemedText></Pressable>:null}
 <View style={{flexDirection:"row",flexWrap:"wrap",gap:8,alignItems:"center"}}><ThemedText style={styles.bold}>Due sprays:</ThemedText><ScrollView horizontal style={{flexGrow:0,maxWidth:"100%"}}>{[["all","All crops"],...dueCrops.map(c=>[c,c])].map(([id,label])=><Pressable key={id} onPress={()=>{setCropFilter(id);setTraceFilter("all")}} style={[styles.secondary,{marginRight:6,backgroundColor:cropFilter===id?"#c9ead5":"#fff"}]}><ThemedText>{label}</ThemedText></Pressable>)}</ScrollView></View>
 <View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}><Pressable style={[styles.secondary,{backgroundColor:traceFilter==="all"?"#c9ead5":"#fff"}]} onPress={()=>setTraceFilter("all")}><ThemedText>All due traces</ThemedText></Pressable>{dueTraces.map(t=><Pressable key={t.id} style={[styles.secondary,{backgroundColor:traceFilter===String(t.id)?"#c9ead5":"#fff"}]} onPress={()=>setTraceFilter(String(t.id))}><ThemedText>{t.name}</ThemedText></Pressable>)}</View>
 {error?<ThemedText style={styles.error}>{error}</ThemedText>:null}
 {loading?<ActivityIndicator/>:<View style={styles.panel}>
 <View style={styles.tableHeader}><ThemedText style={[styles.bold,{flex:1}]}>Week</ThemedText><ThemedText style={[styles.bold,{flex:1}]}>Crop</ThemedText><ThemedText style={[styles.bold,{flex:2}]}>Trace Code</ThemedText><ThemedText style={[styles.bold,{width:55,textAlign:"right"}]}>Sprays</ThemedText><View style={{width:75}}/></View>
 {groups.length===0?<ThemedText style={styles.note}>No outstanding spray jobs. Use New Spray to create one.</ThemedText>:groups.map(g=><View key={g.key}>
 <View style={styles.groupRow}><ThemedText style={{flex:1}}>{weekLabel(g.week)}</ThemedText><ThemedText style={{flex:1}}>{g.crop}</ThemedText><ThemedText style={{flex:2}}>{g.trace}</ThemedText><ThemedText style={{width:55,textAlign:"right",fontWeight:"700"}}>{g.rows.length}</ThemedText><Pressable style={styles.secondary} onPress={()=>{setExpanded(v=>v===g.key?"":g.key);setIssueId(null)}}><ThemedText>{expanded===g.key?"Close":"Open"}</ThemedText></Pressable></View>
 {expanded===g.key?g.rows.map(job=><View style={styles.mix} key={job.id}>
 <View style={styles.mixHeader}><ThemedText style={styles.bold}>Spray #{job.id} · {job.sprayType}</ThemedText><ThemedText>{job.status==="planned"?"Outstanding "+fmt(job.remainingArea)+" / "+fmt(job.area)+" ha":"Completed"}</ThemedText></View>
 <ThemedText style={styles.note}>Sprayer: {job.sprayer||"Not specified"} · Water: {fmt(job.water)} L/ha · {job.part}</ThemedText>
 <View style={styles.tableHeader}><ThemedText style={{flex:2,fontWeight:"700"}}>Input</ThemedText><ThemedText style={{flex:1,textAlign:"right",fontWeight:"700"}}>Rate/ha</ThemedText><ThemedText style={{flex:1,textAlign:"right",fontWeight:"700"}}>Required</ThemedText><ThemedText style={{flex:1,textAlign:"right",fontWeight:"700"}}>Stock</ThemedText><ThemedText style={{flex:1,textAlign:"right",fontWeight:"700"}}>Issued</ThemedText></View>
 {job.lines.map(l=><View style={styles.line} key={l.item_code}><ThemedText style={{flex:2}}>{l.item_name}</ThemedText><ThemedText style={styles.num}>{fmt(l.rate_per_ha)} {l.base_unit}</ThemedText><ThemedText style={styles.num}>{fmt(l.planned_quantity)}</ThemedText><ThemedText style={[styles.num,(products.find(p=>p.item_code===l.item_code)?.quantity??0)<Math.max(0,l.planned_quantity-l.issued_quantity)&&styles.stockShort]}>{products.some(p=>p.item_code===l.item_code)?fmt(products.find(p=>p.item_code===l.item_code)!.quantity):"—"}</ThemedText><ThemedText style={styles.num}>{fmt(l.issued_quantity)}</ThemedText></View>)}
 <View style={styles.actions}>
  <Pressable style={styles.secondary} onPress={()=>router.push({pathname:"/stock-v2-application",params:{jobId:String(job.id)}})}><ThemedText>Application / Print Tank Mix</ThemedText></Pressable>
  {job.status==="planned"&&job.lines.every(l=>l.issued_quantity===0)?<Pressable style={styles.secondary} onPress={()=>router.push({pathname:"/stock-v2-spray-entry",params:{editJobId:String(job.id)}})}><ThemedText>Edit Mix</ThemedText></Pressable>:null}
  <Pressable style={styles.secondary} onPress={()=>void openReturn(job)}><ThemedText>Stock Return</ThemedText></Pressable>
  {job.status==="planned"&&job.remainingArea>0?<Pressable style={styles.primary} onPress={()=>{setIssueId(job.id);setIssueHa(String(Number(job.remainingArea.toFixed(3))));setConfirm(false)}}><ThemedText style={styles.white}>Transfer / Issue</ThemedText></Pressable>:null}
 </View>
 {returnJob===job.id?<View style={styles.issue}>
  <ThemedText style={styles.bold}>Return unused stock · Spray #{job.id}</ThemedText>
  <ThemedText>Select original issue</ThemedText>
  {[...new Map(returnIssues.map(x=>[x.document_id,x.document_number])).entries()].map(([id,num])=><Pressable key={id} style={[styles.secondary,returnDoc===id&&{backgroundColor:"#dcefe1"}]} onPress={()=>{setReturnDoc(id);setReturnAmounts({});setReturnConfirm(false)}}><ThemedText>{num}</ThemedText></Pressable>)}
  {!returnIssues.length?<ThemedText>No returnable stock issued for this spray.</ThemedText>:null}
  {returnIssues.filter(x=>x.document_id===returnDoc).map(x=><View key={x.source_line_id} style={{flexDirection:"row",gap:8,alignItems:"center",flexWrap:"wrap"}}>
  <ThemedText style={{flex:1,minWidth:140}}>{x.item_name} · max {fmt(x.available_to_return)} {x.base_unit}</ThemedText>
  <TextInput style={[styles.input,{width:110}]} keyboardType="decimal-pad" placeholder="Return qty" value={returnAmounts[x.source_line_id]??""} onChangeText={v=>{setReturnAmounts(old=>({...old,[x.source_line_id]:v}));setReturnConfirm(false)}}/>
  </View>)}
  <ThemedText style={styles.bold}>Spray status after return</ThemedText>
  <Pressable onPress={()=>{setReturnComplete(false);setReturnConfirm(false)}}><ThemedText>{returnComplete?"◯":"◉"} Spray Incomplete — keep outstanding for reissue</ThemedText></Pressable>
  <Pressable onPress={()=>{setReturnComplete(true);setReturnConfirm(false)}}><ThemedText>{returnComplete?"◉":"◯"} Spray Complete — close spray</ThemedText></Pressable>
  <Pressable onPress={()=>setReturnConfirm(v=>!v)}><ThemedText>{returnConfirm?"☑":"☐"} Confirm stock return</ThemedText></Pressable>
  <Pressable disabled={saving||!returnConfirm} style={[styles.primary,(saving||!returnConfirm)&&{opacity:.5}]} onPress={()=>void postReturn(job)}><ThemedText style={styles.white}>{saving?"Posting…":"Post Stock Return"}</ThemedText></Pressable>
 </View>:null}
 {issueId===job.id?<View style={styles.issue}>
  <ThemedText style={styles.bold}>Transfer / Issue</ThemedText>
  <ThemedText>Planned area: {fmt(job.area)} ha · Remaining: {fmt(job.remainingArea)} ha</ThemedText>
  <ThemedText>Transfer hectares (defaults to all remaining)</ThemedText>
  <TextInput style={styles.input} keyboardType="decimal-pad" value={issueHa} onChangeText={v=>{setIssueHa(v);setConfirm(false)}}/>
  <ThemedText style={styles.bold}>Transfer requirements</ThemedText>
  {job.lines.map(l=><ThemedText key={l.item_code} style={(products.find(p=>p.item_code===l.item_code)?.quantity??0)<Number(issueHa)*l.rate_per_ha?styles.stockShort:undefined}>{l.item_name}: {fmt(Number(issueHa)*l.rate_per_ha)} {l.base_unit} · in stock {fmt(products.find(p=>p.item_code===l.item_code)?.quantity??0)}</ThemedText>)}
  <Pressable onPress={()=>setConfirm(v=>!v)}><ThemedText>{confirm?"☑":"☐"} Confirm stock transfer for all products above</ThemedText></Pressable>
  <Pressable disabled={saving||!confirm} style={[styles.primary,(!confirm||saving)&&{opacity:.5}]} onPress={()=>void transfer(job)}><ThemedText style={styles.white}>{saving?"Posting…":"Post Transfer"}</ThemedText></Pressable>
 </View>:null}
 </View>) :null}
 </View>)}
 </View>}
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12,paddingBottom:55},head:{flexDirection:"row",alignItems:"center"},brand:{fontSize:12,fontWeight:"700",color:jsplColors.primary},title:{fontSize:24,fontWeight:"700",color:jsplColors.primaryDark},note:{fontSize:12,opacity:.7},actions:{flexDirection:"row",flexWrap:"wrap",gap:8,alignItems:"center"},primary:{minHeight:jsplSizes.buttonHeight,justifyContent:"center",paddingHorizontal:14,paddingVertical:10,borderRadius:jsplRadii.sm,backgroundColor:jsplColors.primary,alignSelf:"flex-start"},secondary:{minHeight:jsplSizes.buttonHeight,justifyContent:"center",borderRadius:jsplRadii.sm,borderWidth:1,borderColor:jsplColors.border,paddingHorizontal:jsplSpacing.md,alignSelf:"flex-start"},white:{color:"#fff",fontWeight:"700"},error:{color:"#aa3020",fontWeight:"700"},stockShort:{color:"#c62828",fontWeight:"800"},panel:{borderWidth:1,borderColor:jsplColors.border,backgroundColor:"#fff",borderRadius:jsplRadii.md,padding:10},tableHeader:{flexDirection:"row",backgroundColor:"#dce6e0",padding:9,gap:5,alignItems:"center"},groupRow:{flexDirection:"row",alignItems:"center",padding:8,gap:5,borderBottomWidth:1,borderColor:"#e2e6e8"},bold:{fontWeight:"700"},mix:{borderWidth:1,borderColor:jsplColors.border,padding:12,marginVertical:8,borderRadius:jsplRadii.sm,gap:8},mixHeader:{flexDirection:"row",justifyContent:"space-between",gap:8,flexWrap:"wrap"},line:{flexDirection:"row",padding:7,gap:5,borderBottomWidth:1,borderColor:"#eee"},num:{flex:1,textAlign:"right"},issue:{borderTopWidth:1,borderColor:jsplColors.border,paddingTop:12,gap:8},input:{maxWidth:170,minHeight:jsplSizes.inputHeight,borderWidth:1,borderColor:jsplColors.border,backgroundColor:jsplColors.surface,borderRadius:jsplRadii.sm,paddingHorizontal:jsplSpacing.md,paddingVertical:9}
});
