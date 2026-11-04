import {useEffect,useState} from "react";
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {router} from "expo-router";
import {supabase} from "@/supabase";
import {formatJsplDate,formatJsplNumber,jsplColors as C} from "@/constants/jspl-design";
type Daily={labour_week:string;labour_date:string;report_farm:string;entry_count:number;labour_qty:number;kgs:number|null;total_cost:number};
type Job={labour_week:string;report_farm:string;activity_id:number;activity_name:string;labour_qty:number;total_cost:number};
function addDays(date:Date,n:number){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function accessWeek(date:Date){const d=addDays(date,1),yy=String(d.getFullYear()).slice(2),start=new Date(d.getFullYear(),0,1),dayNo=Math.floor((new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()-start.getTime())/86400000);const week=String(Math.floor((dayNo+start.getDay())/7)+1).padStart(2,"0"),name=yy+"/"+week;return name==="24/53"?"25/01":name}
const usd=(x:number)=>"$"+formatJsplNumber(x);
export default function LabourSummary(){
 const [week,setWeek]=useState(""),[previous,setPrevious]=useState(""),[currentDaily,setCurrentDaily]=useState<Daily[]>([]),[previousDaily,setPreviousDaily]=useState<Daily[]>([]),[currentJobs,setCurrentJobs]=useState<Job[]>([]),[previousJobs,setPreviousJobs]=useState<Job[]>([]);
 const [busy,setBusy]=useState(true),[error,setError]=useState("");
 async function load(){
  setBusy(true);setError("");
  const now=new Date(),w=accessWeek(now),pw=accessWeek(addDays(now,-7));setWeek(w);setPrevious(pw);
  const queries=await Promise.all([
    supabase.from("labour_v2_daily_summary").select("*").eq("labour_week",w).order("labour_date"),
    supabase.from("labour_v2_daily_summary").select("*").eq("labour_week",pw).order("labour_date"),
    supabase.from("labour_v2_job_summary").select("*").eq("labour_week",w).order("report_farm").order("activity_name"),
    supabase.from("labour_v2_job_summary").select("*").eq("labour_week",pw).order("report_farm").order("activity_name")
  ]);
  const fail=queries.find(x=>x.error);
  if(fail?.error)setError(fail.error.message);
  else{setCurrentDaily(queries[0].data||[]);setPreviousDaily(queries[1].data||[]);setCurrentJobs(queries[2].data||[]);setPreviousJobs(queries[3].data||[])}
  setBusy(false);
 }
 useEffect(()=>{load()},[]);
 function renderWeek(name:string,days:Daily[],jobs:Job[]){
  const total=days.reduce((n,x)=>n+Number(x.total_cost||0),0);
  return <View style={styles.panel}><Text style={styles.title}>{name}</Text><Text style={styles.total}>Total Labour Value: {usd(total)}</Text>
   <Text style={styles.section}>Cost by day & farm</Text>
   {days.length===0?<Text style={styles.hint}>No entries for this week.</Text>:days.map((d,i)=><View key={i} style={styles.line}><Text style={styles.label}>{formatJsplDate(d.labour_date)} · {d.report_farm}</Text><Text style={styles.hint}>Qty {formatJsplNumber(Number(d.labour_qty))} · Entries {d.entry_count} · {usd(Number(d.total_cost))}</Text></View>)}
   <Text style={styles.section}>Labour quantity by job & farm</Text>
   {jobs.map((j,i)=><View key={i} style={styles.line}><Text style={styles.label}>{j.report_farm} · {j.activity_name}</Text><Text style={styles.hint}>Qty {formatJsplNumber(Number(j.labour_qty))} · {usd(Number(j.total_cost))}</Text></View>)}
  </View>
 }
 return <ScrollView contentContainerStyle={styles.page}>
 <View style={styles.header}><View style={{flex:1}}><Text style={styles.big}>Labour Summaries</Text><Text style={styles.white}>Current and previous week · Access grouping</Text></View><Image source={require("../assets/images/jspl_farm_logo.png")} style={styles.logo}/></View>
 <View style={styles.row}><Pressable style={styles.button} onPress={()=>router.replace("/(tabs)/labour")}><Text style={styles.btn}>← Labour</Text></Pressable><Pressable style={styles.button} onPress={()=>router.replace("/(tabs)/main-dashboard")}><Text style={styles.btn}>Main Dashboard</Text></Pressable><Pressable style={styles.button} onPress={load}><Text style={styles.btn}>Refresh</Text></Pressable></View>
 {busy?<ActivityIndicator/>:error?<Text style={{color:C.danger}}>{error}</Text>:<>{renderWeek("Current Week · "+week,currentDaily,currentJobs)}{renderWeek("Previous Week · "+previous,previousDaily,previousJobs)}</>}
 </ScrollView>
}
const styles=StyleSheet.create({page:{padding:22,gap:15,backgroundColor:C.background,flexGrow:1},header:{backgroundColor:C.primaryDark,borderRadius:12,padding:18,flexDirection:"row",alignItems:"center"},big:{fontSize:23,fontWeight:"800",color:"#FFF"},white:{color:"#E2EEE5",fontSize:13},logo:{width:65,height:65,resizeMode:"contain",backgroundColor:"#FFF",borderRadius:8},row:{flexDirection:"row",gap:10,flexWrap:"wrap"},button:{borderWidth:1,borderColor:C.primary,padding:12,borderRadius:7},btn:{color:C.primaryDark,fontWeight:"700"},panel:{backgroundColor:"#FFF",borderWidth:1,borderColor:C.border,borderRadius:10,padding:16,gap:8},title:{fontSize:18,color:C.primaryDark,fontWeight:"800"},total:{fontWeight:"800",color:C.primaryDark,fontSize:15},section:{fontWeight:"800",color:C.primaryDark,marginTop:14},line:{borderBottomWidth:1,borderColor:C.border,padding:8},label:{fontWeight:"700",color:C.text},hint:{fontSize:12,color:C.textSecondary}});
