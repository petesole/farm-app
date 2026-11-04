import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import { supabase } from "@/supabase";
import { jsplColors as C, formatJsplDate, formatJsplNumber } from "@/constants/jspl-design";

type HistoryRow={source_type:string;source_id:number;labour_date:string;tracecode_id:number;tracecode_name:string;activity_id:number;activity_name:string;labour_qty:number;kgs:number|null;unit_cost:number;total_cost:number;crop_name:string};
type Activity={activity_id:number;activity_name:string;active:boolean};
type Trace={tracecode_id:number;tracecode_name:string;access_tc_id:number|null};
function iso(s:string):string|null{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);if(!m)return null;const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCDate()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCFullYear()===+m[3]?m[3]+"-"+m[2]+"-"+m[1]:null}
function amount(n:number|null|undefined){return "$"+formatJsplNumber(Number(n||0))}
export default function LabourHistory(){
 const [rows,setRows]=useState<HistoryRow[]>([]),[date,setDate]=useState(""),[loading,setLoading]=useState(false),[error,setError]=useState(""),[isAdmin,setIsAdmin]=useState(false);
 const [chosen,setChosen]=useState<HistoryRow|null>(null),[action,setAction]=useState("UPDATE"),[reason,setReason]=useState(""),[traceId,setTraceId]=useState(""),[activityId,setActivityId]=useState(""),[qty,setQty]=useState(""),[kgs,setKgs]=useState(""),[rate,setRate]=useState("");
 const [activities,setActivities]=useState<Activity[]>([]),[traces,setTraces]=useState<Trace[]>([]);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{(async()=>{const [r,a,t]=await Promise.all([supabase.rpc("my_farm_app_roles"),supabase.from("labour_v2_activity").select("activity_id,activity_name,active").order("activity_name"),supabase.from("tracecode").select("tracecode_id,tracecode_name,access_tc_id").order("tracecode_name")]);if(r.error||a.error||t.error){setError(r.error?.message||a.error?.message||t.error?.message||"Unable to load history");return;}setIsAdmin((r.data||[]).includes("admin"));setActivities(a.data||[]);setTraces(t.data||[]);})()},[]);
 async function fetchHistory(){setError("");setLoading(true);try{const selected=iso(date.trim());if(date.trim()&&!selected)throw Error("Use dd/mm/yyyy.");let req=supabase.from("labour_v2_report_rows").select("source_type,source_id,labour_date,tracecode_id,tracecode_name,activity_id,activity_name,labour_qty,kgs,unit_cost,total_cost,crop_name").order("labour_date",{ascending:false}).order("source_id",{ascending:false}).limit(250);if(selected)req=req.eq("labour_date",selected);const {data,error:e}=await req;if(e)throw e;setRows(data||[])}catch(e:any){setError(e.message||"Unable to load history")}finally{setLoading(false)}}
 useEffect(()=>{fetchHistory()},[]);
 function edit(r:HistoryRow){if(!isAdmin||r.source_type!=="App")return;setChosen(r);setAction("UPDATE");setTraceId(String(r.tracecode_id));setActivityId(String(r.activity_id));setQty(String(r.labour_qty));setKgs(r.kgs==null?"":String(r.kgs));setRate(String(r.unit_cost));setReason("")}
 async function saveCorrection(){if(!chosen||busy)return;if(reason.trim().length<8){setError("Enter an audit reason of at least eight characters.");return;}if(action==="DELETE"&&reason.trim().length<15){setError("Deletion requires a detailed reason of at least fifteen characters.");return;}setBusy(true);setError("");try{const {error:e}=await supabase.rpc("labour_v2_admin_correct",{p_action:action,p_id:chosen.source_id,p_labour_date:chosen.labour_date,p_tracecode_id:Number(traceId),p_activity_id:Number(activityId),p_qty:Number(qty),p_kgs:kgs.trim()?Number(kgs):null,p_unit_cost:Number(rate),p_reason:reason.trim()});if(e)throw e;setChosen(null);await fetchHistory()}catch(e:any){setError(e.message||"Correction failed")}finally{setBusy(false)}}
 return <ScrollView contentContainerStyle={styles.page}>
 <View style={styles.header}><View style={{flex:1}}><Text style={styles.headerTitle}>Labour Input History</Text><Text style={styles.sub}>Original Access-style register · newest records first</Text></View><Image style={styles.logo} source={require("../assets/images/jspl_farm_logo.png")}/></View>
 <View style={styles.row}><Pressable style={styles.button} onPress={()=>router.replace("/(tabs)/labour")}><Text style={styles.btn}>← Labour Dashboard</Text></Pressable></View>
 {!!error&&<Text style={styles.error}>{error}</Text>}
 <View style={styles.panel}><Text style={styles.label}>Labour Date (dd/mm/yyyy) — leave blank for latest 250</Text><View style={styles.row}><TextInput style={[styles.input,{minWidth:200}]} value={date} onChangeText={setDate} placeholder="dd/mm/yyyy"/><Pressable style={styles.primary} onPress={fetchHistory}><Text style={styles.white}>Search History</Text></Pressable></View>
 {loading?<ActivityIndicator/>:<Text style={styles.hint}>{rows.length} records displayed · historical Access records are read-only</Text>}</View>
 {chosen&&<View style={styles.panel}><Text style={styles.title}>Admin correction · #{chosen.source_id} · {formatJsplDate(chosen.labour_date)}</Text>
 <Text style={styles.hint}>Only saved App entries can be corrected. All actions are audited, and the date cannot be changed.</Text>
 <View style={styles.picker}><Picker selectedValue={action} onValueChange={x=>setAction(String(x))}><Picker.Item label="Correct this entry" value="UPDATE"/><Picker.Item label="Add a missing line to this saved date" value="INSERT"/><Picker.Item label="Delete incorrect entry (audited)" value="DELETE"/></Picker></View>
 {action!=="DELETE"&&<>
 <Text style={styles.label}>Trace</Text><View style={styles.picker}><Picker selectedValue={traceId} onValueChange={x=>setTraceId(String(x))}>{traces.map(t=><Picker.Item key={t.tracecode_id} value={String(t.tracecode_id)} label={t.tracecode_name+" / "+t.tracecode_id+(t.access_tc_id!=null?" / Access "+t.access_tc_id:"")}/>)}</Picker></View>
 <Text style={styles.label}>Activity</Text><View style={styles.picker}><Picker selectedValue={activityId} onValueChange={x=>setActivityId(String(x))}>{activities.map(a=><Picker.Item key={a.activity_id} label={a.activity_name} value={String(a.activity_id)}/>)}</Picker></View>
 <View style={styles.row}><TextInput style={styles.input} value={qty} onChangeText={setQty} placeholder="Labour Qty"/><TextInput style={styles.input} value={kgs} onChangeText={setKgs} placeholder="Kgs"/><TextInput style={styles.input} value={rate} onChangeText={setRate} placeholder="Unit Cost"/></View>
 </>}
 <Text style={styles.label}>Reason for correction (required)</Text><TextInput multiline style={[styles.input,{minHeight:70}]} value={reason} onChangeText={setReason} placeholder="Explain the error and correction"/>
 <View style={styles.row}><Pressable disabled={busy} style={styles.primary} onPress={saveCorrection}><Text style={styles.white}>{busy?"Saving…":"Confirm audited "+(action==="DELETE"?"deletion":"correction")}</Text></Pressable><Pressable style={styles.button} onPress={()=>setChosen(null)}><Text style={styles.btn}>Cancel</Text></Pressable></View>
 </View>}
 <ScrollView horizontal contentContainerStyle={{minWidth:"100%"}}>
  <View style={{minWidth:1050,width:"100%",backgroundColor:"#FFF",borderWidth:1,borderColor:C.border,borderRadius:8}}>
   <View style={styles.historyHeader}>
    <Text style={[styles.historyCell,{width:90}]}>ID</Text>
    <Text style={[styles.historyCell,{width:100}]}>Date</Text>
    <Text style={[styles.historyCell,{width:135}]}>Field</Text>
    <Text style={[styles.historyCell,{width:110}]}>Crop</Text>
    <Text style={[styles.historyCell,{flex:1}]}>Labour Activity</Text>
    <Text style={[styles.historyCell,{width:72}]}>Qty</Text>
    <Text style={[styles.historyCell,{width:75}]}>Kgs</Text>
    <Text style={[styles.historyCell,{width:90}]}>Unit Cost</Text>
    {isAdmin&&<Text style={[styles.historyCell,{width:85}]}>Action</Text>}
   </View>
   {rows.map(r=><View key={r.source_type+":"+r.source_id} style={styles.historyLine}>
    <Text style={[styles.historyCell,{width:90}]}>{r.source_id}</Text>
    <Text style={[styles.historyCell,{width:100}]}>{formatJsplDate(r.labour_date)}</Text>
    <Text style={[styles.historyCell,{width:135}]}>{r.tracecode_name}</Text>
    <Text style={[styles.historyCell,{width:110}]}>{r.crop_name}</Text>
    <Text style={[styles.historyCell,{flex:1}]}>{r.activity_name}</Text>
    <Text style={[styles.historyCell,{width:72}]}>{r.labour_qty}</Text>
    <Text style={[styles.historyCell,{width:75}]}>{r.kgs??"—"}</Text>
    <Text style={[styles.historyCell,{width:90}]}>{amount(r.unit_cost)}</Text>
    {isAdmin&&<View style={{width:85,padding:4}}>{r.source_type==="App"&&<Pressable style={styles.button} onPress={()=>edit(r)}><Text style={styles.btn}>Correct</Text></Pressable>}</View>}
   </View>)}
  </View>
 </ScrollView>
 </ScrollView>
}
const styles=StyleSheet.create({historyHeader:{flexDirection:"row",backgroundColor:"#DCEADD",borderBottomWidth:1,borderColor:C.border,paddingVertical:7},historyLine:{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderColor:C.border,minHeight:42},historyCell:{paddingHorizontal:7,color:C.text,fontSize:12,fontWeight:"500"},page:{padding:22,gap:14,backgroundColor:C.background,flexGrow:1},header:{backgroundColor:C.primaryDark,borderRadius:12,padding:18,flexDirection:"row",gap:12,alignItems:"center"},headerTitle:{fontSize:23,fontWeight:"800",color:"#FFF"},sub:{color:"#E2EEE5",marginTop:5},logo:{width:65,height:65,resizeMode:"contain",backgroundColor:"#FFF",borderRadius:8},row:{flexDirection:"row",gap:10,flexWrap:"wrap",alignItems:"center"},panel:{backgroundColor:"#FFF",borderWidth:1,borderColor:C.border,borderRadius:10,padding:15,gap:10},line:{flexDirection:"row",gap:12,alignItems:"center",backgroundColor:"#FFF",borderRadius:8,borderWidth:1,borderColor:C.border,padding:12},title:{color:C.primaryDark,fontWeight:"700",fontSize:15},label:{color:C.text,fontWeight:"700"},hint:{color:C.textSecondary,fontSize:12},input:{borderWidth:1,borderColor:C.border,borderRadius:7,padding:10,minWidth:110,backgroundColor:"#FFF",color:C.text},picker:{borderWidth:1,borderColor:C.border,borderRadius:7,overflow:"hidden"},primary:{backgroundColor:C.primary,borderRadius:7,padding:12},white:{color:"#FFF",fontWeight:"700"},button:{borderWidth:1,borderColor:C.primary,borderRadius:7,padding:11},btn:{color:C.primaryDark,fontWeight:"700"},error:{color:C.danger,fontWeight:"700"}});
