import {useEffect,useState} from "react";
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {router} from "expo-router";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {supabase} from "@/supabase";
import {formatJsplDate,formatJsplNumber,jsplColors as C} from "@/constants/jspl-design";

type Daily={labour_week:string;labour_date:string;report_farm:string;entry_count:number;labour_qty:number;total_cost:number};
type Job={labour_week:string;report_farm:string;activity_name:string;labour_qty:number};
const money=(n:number)=>"$"+formatJsplNumber(n);
function accessWeek(offset:number){
 const dt=new Date();dt.setDate(dt.getDate()+offset+1);
 const jan=new Date(dt.getFullYear(),0,1);
 const day=Math.floor((new Date(dt.getFullYear(),dt.getMonth(),dt.getDate()).getTime()-jan.getTime())/86400000);
 const value=String(dt.getFullYear()).slice(-2)+"/"+String(1+Math.floor((day+jan.getDay())/7)).padStart(2,"0");
 return value==="24/53"?"25/01":value;
}
function Summary({title,days,jobs,week}:{title:string;days:Daily[];jobs:Job[];week:string}){
 const total=days.reduce((sum,row)=>sum+Number(row.total_cost||0),0);
 return <View style={styles.summary}><Text style={styles.summaryTitle}>{title} — {week}</Text>
 <View style={styles.summaryColumns}>
  <View style={styles.summaryHalf}><Text style={styles.smallHead}>Labour Cost</Text>
    {days.length===0?<Text style={styles.muted}>No entries</Text>:days.map((r,i)=><View key={i} style={styles.tinyRow}><Text style={styles.muted}>{formatJsplDate(r.labour_date)} · {r.report_farm}</Text><Text style={styles.num}>{money(Number(r.total_cost))}</Text></View>)}
    <View style={styles.tinyRow}><Text style={styles.bold}>Total</Text><Text style={styles.bold}>{money(total)}</Text></View>
  </View>
  <View style={styles.summaryHalf}><Text style={styles.smallHead}>Labour Qty by Job</Text>
    {jobs.length===0?<Text style={styles.muted}>No entries</Text>:jobs.map((r,i)=><View key={i} style={styles.tinyRow}><Text style={styles.muted}>{r.report_farm} · {r.activity_name}</Text><Text style={styles.num}>{formatJsplNumber(Number(r.labour_qty),0)}</Text></View>)}
  </View>
 </View></View>;
}
export default function LabourMain(){
 const [days,setDays]=useState<Daily[][]>([[],[]]),[jobs,setJobs]=useState<Job[][]>([[],[]]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [canReturnToMain,setCanReturnToMain]=useState(false);
 useEffect(()=>{
  let active=true;
  void supabase.rpc("my_farm_app_roles").then(({data,error})=>{
   if(active&&!error)setCanReturnToMain((data||[]).includes("admin"));
  });
  return()=>{active=false};
 },[]);
 const week=accessWeek(0),previousWeek=accessWeek(-7);
 useEffect(()=>{let active=true;(async()=>{
  try{
   const r=await Promise.all([
    supabase.from("labour_v2_daily_summary").select("labour_week,labour_date,report_farm,entry_count,labour_qty,total_cost").eq("labour_week",week).order("labour_date"),
    supabase.from("labour_v2_daily_summary").select("labour_week,labour_date,report_farm,entry_count,labour_qty,total_cost").eq("labour_week",previousWeek).order("labour_date"),
    supabase.from("labour_v2_job_summary").select("labour_week,report_farm,activity_name,labour_qty").eq("labour_week",week).order("report_farm").order("activity_name"),
    supabase.from("labour_v2_job_summary").select("labour_week,report_farm,activity_name,labour_qty").eq("labour_week",previousWeek).order("report_farm").order("activity_name")
   ]);
   const failure=r.find(x=>x.error);if(failure?.error)throw failure.error;
   if(active){setDays([r[0].data||[],r[1].data||[]]);setJobs([r[2].data||[],r[3].data||[]]);}
  }catch(e:any){if(active)setError(e.message||"Unable to load Labour summary");}
  finally{if(active)setLoading(false);}
 })();return()=>{active=false}},[week,previousWeek]);
 const tiles=[
 {title:"Labour Input",description:"Enter daily Labour records",path:"/labour-entry"},
 {title:"Daily Report",description:"Select date, print report",path:"/labour-reports?mode=daily"},
 {title:"Weekly Report",description:"Select week, print or export to Excel",path:"/labour-reports?mode=weekly"},
 {title:"Input History",description:"Look up historical Labour records",path:"/labour-history"},
 {title:"AO Weekly",description:"Agri Orange weekly Labour report",path:"/labour-reports?mode=ao"},
 ];
 return <ScrollView contentContainerStyle={styles.page}>
  <JsplModuleHeader title="Labour" backLabel={canReturnToMain?"Back to Main":undefined} backHref="/(tabs)/main-dashboard" />
  <View style={styles.top}><Text style={styles.title}>Labour</Text>
   
  </View>
  <View style={styles.grid}>{tiles.map(tile=><Pressable key={tile.title} style={styles.tile} onPress={()=>router.push(tile.path as any)}>
   <Text style={styles.tileName}>{tile.title}</Text><Text style={styles.muted}>{tile.description}</Text>
  </Pressable>)}</View>
  {loading?<ActivityIndicator color={C.primary}/>:error?<Text style={styles.error}>{error}</Text>:<>
   <Summary title="Current Week" week={week} days={days[0]} jobs={jobs[0]}/>
   <Summary title="Last Week" week={previousWeek} days={days[1]} jobs={jobs[1]}/>
  </>}
 </ScrollView>;
}
const styles=StyleSheet.create({
 page:{flexGrow:1,backgroundColor:C.background,padding:22,gap:16},
 header:{backgroundColor:C.primaryDark,borderRadius:12,padding:16,flexDirection:"row",alignItems:"center",gap:12},
 heading:{fontSize:22,fontWeight:"800",color:"#FFF"},sub:{color:"#E3EDE4",marginTop:4},
 logo:{width:64,height:64,backgroundColor:"#FFF",borderRadius:7},
 top:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},
 title:{fontSize:21,fontWeight:"800",color:C.primaryDark},
 back:{borderWidth:1,borderColor:C.primary,borderRadius:7,padding:10},
 backText:{color:C.primaryDark,fontWeight:"700"},
 grid:{flexDirection:"row",flexWrap:"wrap",gap:10},
 tile:{width:"31%",minWidth:180,flexGrow:1,borderWidth:1,borderColor:C.border,borderRadius:10,padding:17,backgroundColor:"#FFF",minHeight:92,justifyContent:"center",gap:5},
 tileName:{color:C.primaryDark,fontSize:16,fontWeight:"800"},
 muted:{color:C.textSecondary,fontSize:12,flexShrink:1},
 summary:{borderWidth:1,borderColor:C.border,backgroundColor:"#FFF",padding:14,borderRadius:10,gap:10},
 summaryTitle:{fontSize:17,fontWeight:"800",color:C.primaryDark},
 summaryColumns:{flexDirection:"row",flexWrap:"wrap",gap:15},
 summaryHalf:{flex:1,minWidth:250,maxHeight:360,overflow:"hidden",gap:5},
 smallHead:{fontWeight:"800",color:C.primaryDark,fontSize:13,marginBottom:5},
 tinyRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:9,borderBottomWidth:1,borderColor:C.border,paddingVertical:3},
 num:{color:C.text,fontSize:12,fontVariant:["tabular-nums"]},
 bold:{fontWeight:"800",color:C.primaryDark,fontSize:12},
 error:{color:C.danger,fontWeight:"700"}
});
