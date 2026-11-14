import {StockSelect} from "@/components/jspl/StockWorkflowControls";
import {JsplSearchCombo} from "@/components/jspl/JsplSearchCombo";
import {StockV2Header} from "@/components/jspl/StockV2Header";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useFocusEffect,useRouter,useLocalSearchParams} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors,jsplSpacing,jsplRadii,jsplSizes} from "@/constants/jspl-design";

const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Product={ao_quantity:number;item_code:string;item_name:string;base_unit:string;quantity:number};
type Spray={owner_code:string;job_id:number;external_tracecode_id:number;tracecode_name:string;planned_week_start:string;completed_date?:string|null;sprayed_date?:string|null;crop_name?:string|null;area_ha:number;spray_type:string;part_label:string|null;sprayer_asset_code:string|null;water_litres_per_ha:number|null;status:string;item_code:string;item_name:string;base_unit:string;rate_per_ha:number;planned_quantity:number;issued_quantity:number};
type Crop={crop_id:number;crop_name:string};
type Trace={tracecode_id:number;crop_id:number|null;end_date:string|null;start_date:string|null};
type Job={id:number;traceId:number;week:string;completedDate:string;trace:string;crop:string;area:number;status:string;sprayType:string;part:string;sprayer:string;water:number;lines:Spray[];remainingArea:number};
const fmt=(n:number)=>Number.isFinite(n)?n.toLocaleString("en-GB",{minimumFractionDigits:3,maximumFractionDigits:3}):"—";
const dateLabel=(v:string|null|undefined)=>{const s=String(v??"").slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4):"—"};
const weekLabel=(v:string)=>dateLabel(v);
const uuid=()=>"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==="x"?r:(r&3)|8).toString(16)});
export default function WeeklySprayPlanning(){
 const router=useRouter();
 const {postedDocument}=useLocalSearchParams<{postedDocument?:string}>();
 const [sprays,setSprays]=useState<Spray[]>([]),[products,setProducts]=useState<Product[]>([]),[traces,setTraces]=useState<Trace[]>([]),[crops,setCrops]=useState<Crop[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const [expanded,setExpanded]=useState("");
 const [showCompleted,setShowCompleted]=useState(false);
 const [isAdmin,setIsAdmin]=useState(false);
 const [cropFilter,setCropFilter]=useState("all"),[traceFilter,setTraceFilter]=useState("all");
 const [issueHistory,setIssueHistory]=useState<{document_id:number;document_number:string;document_type:string}[]>([]);
 const [latestSlip,setLatestSlip]=useState<number|null>(null);
 useEffect(()=>{const n=Number(postedDocument);if(Number.isSafeInteger(n)&&n>0)setLatestSlip(n)},[postedDocument]);

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
 useFocusEffect(useCallback(()=>{void load()},[load]));
 useEffect(()=>{void(async()=>{try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)return;const res=await fetch(endpoint+"?spray_admin=1",{headers:{authorization:"Bearer "+session.access_token}});if(res.ok){const data=await res.json();setIsAdmin(!!data.is_admin)}}catch{}})()},[]);
 const jobs=useMemo(()=>{
  const map=new Map<number,Spray[]>();
  for(const s of sprays){if(!map.has(s.job_id))map.set(s.job_id,[]);map.get(s.job_id)!.push(s)}
  return [...map.entries()].map(([id,lines]):Job=>{
   const a=lines[0],cropId=traces.find(t=>t.tracecode_id===a.external_tracecode_id)?.crop_id;
   const crop=a.crop_name||crops.find(c=>c.crop_id===cropId)?.crop_name||"—";
   const areas=lines.map(l=>l.rate_per_ha>0?Math.max(0,(l.planned_quantity-l.issued_quantity)/l.rate_per_ha):0);
   return {id,traceId:a.external_tracecode_id,week:String(a.planned_week_start??"").slice(0,10),completedDate:String(a.completed_date??"").slice(0,10),trace:a.tracecode_name??"Unknown trace",crop,area:a.area_ha,status:a.status,sprayType:a.spray_type,part:a.part_label??"",sprayer:a.sprayer_asset_code??"",water:a.water_litres_per_ha??0,lines,remainingArea:areas.length?Math.min(...areas):0};
  }).sort((a,b)=>String(a.week??"").localeCompare(String(b.week??""))||String(a.crop??"").localeCompare(String(b.crop??""))||String(a.trace??"").localeCompare(String(b.trace??""))||a.id-b.id);
 },[sprays,traces,crops]);
 const due=jobs.filter(j=>j.status==="planned"&&j.remainingArea>0.0001);
 const filterJobs=jobs.filter(j=>showCompleted?j.status==="completed":(j.status==="planned"&&j.remainingArea>0.0001));
 const filterCrops=[...new Set(filterJobs.filter(j=>traceFilter==="all"||String(j.traceId)===traceFilter).map(j=>j.crop))].sort();
 const filterTraces=[...new Map(filterJobs.filter(j=>cropFilter==="all"||j.crop===cropFilter).map(j=>[j.traceId,{id:j.traceId,name:j.trace}])).values()].sort((a,b)=>String(a.name??"").localeCompare(String(b.name??"")));
 useEffect(()=>{if(cropFilter!=='all'&&!filterJobs.some(j=>j.crop===cropFilter))setCropFilter('all');if(traceFilter!=='all'&&!filterJobs.some(j=>String(j.traceId)===traceFilter&&(cropFilter==='all'||j.crop===cropFilter)))setTraceFilter('all')},[showCompleted,sprays,cropFilter,traceFilter]);
 const visible=jobs.filter(j=>(showCompleted?j.status==="completed":(j.status==="planned"&&j.remainingArea>0.0001))&&(cropFilter==="all"||j.crop===cropFilter)&&(traceFilter==="all"||String(j.traceId)===traceFilter));
 const groups=useMemo(()=>{const m=new Map<string,Job[]>();for(const j of visible){const k=j.week+"|"+j.crop+"|"+j.trace;if(!m.has(k))m.set(k,[]);m.get(k)!.push(j)}return [...m.entries()].map(([key,rows])=>({key,rows,week:rows[0].week,crop:rows[0].crop,trace:rows[0].trace}))},[visible]);
 const deleteSpray=async(job:Job)=>{if(!isAdmin||job.status!=="planned"||job.lines.some(l=>l.issued_quantity>0)){setError("Only an admin can delete a spray without stock issues.");return}
  setSaving(true);setError("");
  try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},body:JSON.stringify({action:"delete_unissued_spray",job_id:job.id})});const data=await res.json();if(!res.ok)throw Error(data.error||"Delete failed");await load()}catch(e){setError("NOT DELETED: "+(e instanceof Error?e.message:String(e)))}finally{setSaving(false)}};

 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
 <StockV2Header title="Weekly Spray Planning" onRefresh={()=>void load()}/>
 <View style={styles.actions}>
  <Pressable style={styles.primary} onPress={()=>router.push("/stock-v2-spray-entry")}><ThemedText style={styles.white}>+ New Spray</ThemedText></Pressable>
  <StockSelect label="Spray status" value={showCompleted?'completed':'planned'} options={[{id:'planned',label:'Outstanding'},{id:'completed',label:'Completed'}]} onChange={v=>{setShowCompleted(v==='completed');setCropFilter('all');setTraceFilter('all')}}/>
 </View>
 {latestSlip?<Pressable style={styles.primary} onPress={()=>router.push({pathname:"/stock-v2-issue-slip",params:{documentId:String(latestSlip)}})}><ThemedText style={styles.white}>Print Latest Issue Slip</ThemedText></Pressable>:null}
 <View style={{flexDirection:"row",flexWrap:"wrap",gap:12,alignItems:"flex-start"}}>
  <View style={{minWidth:220,flex:1}}>
   <JsplSearchCombo label="Crop" selector="crop" options={[{id:"all",label:"All crops",active:true},...filterCrops.map(name=>({id:name,label:name,active:true}))]} value={cropFilter} onChange={value=>{setCropFilter(String(value??"all"));setTraceFilter("all");}} placeholder="Filter crop"/>
  </View>
  <View style={{minWidth:220,flex:1}}>
   <JsplSearchCombo label="Trace Code" selector="trace" options={[{id:"all",label:"All relevant traces",active:true},...filterTraces.map(t=>({id:String(t.id),label:t.name,active:true}))]} value={traceFilter} onChange={value=>setTraceFilter(String(value??"all"))} placeholder="Filter trace"/>
  </View>
 </View>
 {error?<ThemedText style={styles.error}>{error}</ThemedText>:null}
 {loading?<ActivityIndicator/>:<View style={styles.panel}>
 <View style={styles.tableHeader}><ThemedText style={[styles.bold,{flex:1}]}>Week</ThemedText><ThemedText style={[styles.bold,{flex:1}]}>Crop</ThemedText><ThemedText style={[styles.bold,{flex:2}]}>Trace Code</ThemedText><ThemedText style={[styles.bold,{width:65,textAlign:"right"}]}>Spray #</ThemedText><View style={{width:75}}/></View>
 {groups.length===0?<ThemedText style={styles.note}>No outstanding spray jobs. Use New Spray to create one.</ThemedText>:groups.map(g=><View key={g.key}>
 <View style={styles.groupRow}><ThemedText style={{flex:1}}>{weekLabel(g.week)}</ThemedText><ThemedText style={{flex:1}}>{g.crop}</ThemedText><ThemedText style={{flex:2}}>{g.trace}</ThemedText><ThemedText style={{width:65,textAlign:"right",fontWeight:"700"}}>{g.rows.map(j=>"#"+j.id).join(", ")}</ThemedText><Pressable style={styles.secondary} onPress={()=>{setExpanded(v=>v===g.key?"":g.key)}}><ThemedText>{expanded===g.key?"Close":"Open"}</ThemedText></Pressable></View>
 {expanded===g.key?g.rows.map(job=><View style={styles.mix} key={job.id}>
 <View style={styles.mixHeader}><ThemedText style={styles.bold}>Spray #{job.id} · {job.sprayType}</ThemedText><ThemedText>{job.status==="planned"?"Outstanding "+fmt(job.remainingArea)+" / "+fmt(job.area)+" ha":"Completed · "+dateLabel(job.completedDate)}</ThemedText></View>
 {job.lines[0]?.sprayed_date?<ThemedText>Sprayed: {dateLabel(job.lines[0].sprayed_date)}</ThemedText>:null}
 <ThemedText style={styles.note}>Owner: {job.lines[0].owner_code==='AO'?'AO':'HS'} · Sprayer: {job.sprayer||"Not specified"} · Water: {fmt(job.water)} L/ha · {job.part}</ThemedText>
 <View style={styles.tableHeader}><ThemedText style={{flex:2,fontWeight:"700"}}>Input</ThemedText><ThemedText style={{flex:1,textAlign:"right",fontWeight:"700"}}>Rate/ha</ThemedText><ThemedText style={{flex:1,textAlign:"right",fontWeight:"700"}}>Required</ThemedText><ThemedText style={{flex:1,textAlign:"right",fontWeight:"700"}}>Stock</ThemedText><ThemedText style={{flex:1,textAlign:"right",fontWeight:"700"}}>Issued</ThemedText></View>
 {job.lines.map(l=><View style={styles.line} key={l.item_code}><ThemedText style={{flex:2}}>{l.item_name}</ThemedText><ThemedText style={styles.num}>{fmt(job.status==="completed"?l.issued_quantity/job.area:l.rate_per_ha)}</ThemedText><ThemedText style={styles.num}>{fmt(l.planned_quantity)}</ThemedText><ThemedText style={[styles.num,(products.find(p=>p.item_code===l.item_code)?.[job.lines[0].owner_code==='AO'?'ao_quantity':'quantity']??0)<Math.max(0,l.planned_quantity-l.issued_quantity)&&styles.stockShort]}>{products.some(p=>p.item_code===l.item_code)?fmt(products.find(p=>p.item_code===l.item_code)![job.lines[0].owner_code==='AO'?'ao_quantity':'quantity']):"—"}</ThemedText><ThemedText style={styles.num}>{fmt(l.issued_quantity)}</ThemedText></View>)}
 <View style={styles.actions}>
  <Pressable style={styles.secondary} onPress={()=>router.push({pathname:"/stock-v2-application",params:{jobId:String(job.id)}})}><ThemedText>Application / Print Tank Mix</ThemedText></Pressable>
  {job.status==="planned"&&job.lines.every(l=>l.issued_quantity===0)?<Pressable style={styles.secondary} onPress={()=>router.push({pathname:"/stock-v2-spray-entry",params:{editJobId:String(job.id)}})}><ThemedText>Edit Mix</ThemedText></Pressable>:null}
  {isAdmin&&job.status==="planned"&&job.lines.every(l=>l.issued_quantity===0)?<Pressable disabled={saving} style={styles.secondary} onPress={()=>{if(typeof window!=="undefined"&&window.confirm("Delete unissued spray #"+job.id+"? This cannot be undone."))void deleteSpray(job)}}><ThemedText style={styles.error}>Delete Spray (Admin)</ThemedText></Pressable>:null}
  {job.status==="completed"?<Pressable style={styles.secondary} onPress={()=>router.push({pathname:"/stock-v2-spray-transaction",params:{jobId:String(job.id),mode:"return"}})}><ThemedText>Stock Return</ThemedText></Pressable>:null}
  {job.status==="planned"&&job.remainingArea>0?<Pressable style={styles.primary} onPress={()=>router.push({pathname:"/stock-v2-spray-transaction",params:{jobId:String(job.id),mode:"issue"}})}><ThemedText style={styles.white}>Transfer / Issue</ThemedText></Pressable>:null}
 </View>

 </View>) :null}
 </View>)}
 </View>}
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12,paddingBottom:55},head:{flexDirection:"row",alignItems:"center"},brand:{fontSize:12,fontWeight:"700",color:jsplColors.primary},title:{fontSize:24,fontWeight:"700",color:jsplColors.primaryDark},note:{fontSize:12,opacity:.7},actions:{flexDirection:"row",flexWrap:"wrap",gap:8,alignItems:"center"},primary:{minHeight:jsplSizes.buttonHeight,justifyContent:"center",paddingHorizontal:14,paddingVertical:10,borderRadius:jsplRadii.sm,backgroundColor:jsplColors.primary,alignSelf:"flex-start"},secondary:{minHeight:jsplSizes.buttonHeight,justifyContent:"center",borderRadius:jsplRadii.sm,borderWidth:1,borderColor:jsplColors.border,paddingHorizontal:jsplSpacing.md,alignSelf:"flex-start"},white:{color:"#fff",fontWeight:"700"},error:{color:"#aa3020",fontWeight:"700"},stockShort:{color:"#c62828",fontWeight:"800"},panel:{borderWidth:1,borderColor:jsplColors.border,backgroundColor:"#fff",borderRadius:jsplRadii.md,padding:10},tableHeader:{flexDirection:"row",backgroundColor:"#dce6e0",padding:9,gap:5,alignItems:"center"},groupRow:{flexDirection:"row",alignItems:"center",padding:8,gap:5,borderBottomWidth:1,borderColor:"#e2e6e8"},bold:{fontWeight:"700"},mix:{borderWidth:1,borderColor:jsplColors.border,padding:12,marginVertical:8,borderRadius:jsplRadii.sm,gap:8},mixHeader:{flexDirection:"row",justifyContent:"space-between",gap:8,flexWrap:"wrap"},line:{flexDirection:"row",padding:7,gap:5,borderBottomWidth:1,borderColor:"#eee"},num:{flex:1,textAlign:"right"},issue:{borderTopWidth:1,borderColor:jsplColors.border,paddingTop:12,gap:8},input:{maxWidth:170,minHeight:jsplSizes.inputHeight,borderWidth:1,borderColor:jsplColors.border,backgroundColor:jsplColors.surface,borderRadius:jsplRadii.sm,paddingHorizontal:jsplSpacing.md,paddingVertical:9}
});
