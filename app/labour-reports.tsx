import {useEffect,useMemo,useState} from "react";
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import {Picker} from "@react-native-picker/picker";
import {router} from "expo-router";
import {supabase} from "@/supabase";
import {formatJsplDate,formatJsplNumber,jsplColors as C} from "@/constants/jspl-design";
type DailyRow={source_type:string;source_id:number;labour_date:string;labour_week:string;farm_name:string;report_farm:string;tracecode_name:string;crop_name:string;activity_name:string;labour_qty:number;kgs:number|null;unit_cost:number;total_cost:number};
type WeeklyRow={labour_week:string;report_farm:string;crop_name:string;tracecode_name:string;activity_name:string;unit_cost:number;total_labour_qty:number;total_kgs:number|null;avg_kgs_per_person:number|null;total_cost:number;cost_per_ha:number|null};
function validDate(s:string){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());if(!m)return null;const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCDate()===+m[1]&&d.getUTCMonth()+1===+m[2]&&d.getUTCFullYear()===+m[3]?m[3]+"-"+m[2]+"-"+m[1]:null}
const money=(n:number|null)=>"$"+formatJsplNumber(n??0);
export default function LabourReports(){
 const [mode,setMode]=useState<"daily"|"weekly"|"ao">("daily");
 const [date,setDate]=useState(""),[week,setWeek]=useState(""),[weeks,setWeeks]=useState<string[]>([]);
 const [daily,setDaily]=useState<DailyRow[]>([]),[weekly,setWeekly]=useState<WeeklyRow[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[searched,setSearched]=useState(false);
 useEffect(()=>{(async()=>{const {data,error:e}=await supabase.from("labour_v2_weekly_report").select("labour_week").order("labour_week",{ascending:false}).limit(5000);if(e){setError(e.message);return;}const unique=Array.from(new Set((data||[]).map(x=>x.labour_week)));setWeeks(unique);if(unique.length)setWeek(unique[0]);})()},[]);
 async function load(){
  setBusy(true);setError("");setSearched(false);
  try{
   if(mode==="daily"){
    const day=validDate(date);if(!day)throw Error("Choose an existing date in dd/mm/yyyy format.");
    const {data,error:e}=await supabase.from("labour_v2_report_rows").select("source_type,source_id,labour_date,labour_week,farm_name,report_farm,tracecode_name,crop_name,activity_name,labour_qty,kgs,unit_cost,total_cost").eq("labour_date",day).order("report_farm").order("tracecode_name").order("activity_name").limit(2000);
    if(e)throw e;setDaily(data||[]);setWeekly([]);
   }else{
    if(!week)throw Error("Select a Labour week.");
    const {data,error:e}=await supabase.from(mode==="ao"?"labour_v2_weekly_ao_report":"labour_v2_weekly_report").select("labour_week,report_farm,crop_name,tracecode_name,activity_name,unit_cost,total_labour_qty,total_kgs,avg_kgs_per_person,total_cost,cost_per_ha").eq("labour_week",week).order("report_farm").order("tracecode_name").order("activity_name").order("unit_cost").limit(2000);
    if(e)throw e;setWeekly(data||[]);setDaily([]);
   }
   setSearched(true);
  }catch(e:any){setError(e.message||"Unable to load report");}finally{setBusy(false)}
 }
 const resultCount=mode==="daily"?daily.length:weekly.length;
 const qty=useMemo(()=>mode==="daily"?daily.reduce((s,r)=>s+Number(r.labour_qty||0),0):weekly.reduce((s,r)=>s+Number(r.total_labour_qty||0),0),[mode,daily,weekly]);
 const kilos=useMemo(()=>mode==="daily"?daily.reduce((s,r)=>s+Number(r.kgs||0),0):weekly.reduce((s,r)=>s+Number(r.total_kgs||0),0),[mode,daily,weekly]);
 const total=useMemo(()=>mode==="daily"?daily.reduce((s,r)=>s+Number(r.total_cost||0),0):weekly.reduce((s,r)=>s+Number(r.total_cost||0),0),[mode,daily,weekly]);
 return <ScrollView contentContainerStyle={styles.page}>
  <View style={styles.header}><View style={{flex:1}}><Text style={styles.big}>Labour Reports</Text><Text style={styles.white}>John Sole (Private) Limited · Access report structure</Text></View><Image source={require("../assets/images/jspl_farm_logo.png")} style={styles.logo}/></View>
  <View style={styles.row}><Pressable style={styles.outline} onPress={()=>router.replace("/(tabs)/labour")}><Text style={styles.dark}>← Labour</Text></Pressable><Pressable style={styles.outline} onPress={()=>router.replace("/(tabs)/main-dashboard")}><Text style={styles.dark}>Main Dashboard</Text></Pressable></View>
  <View style={styles.panel}><Text style={styles.title}>Select Report</Text>
   <View style={styles.row}>{([{mode:"daily",label:"Daily Report"},{mode:"weekly",label:"Weekly Report"},{mode:"ao",label:"AO Weekly"}] as const).map(x=><Pressable key={x.mode} style={mode===x.mode?styles.primary:styles.outline} onPress={()=>{setMode(x.mode);setSearched(false)}}><Text style={mode===x.mode?styles.white:styles.dark}>{x.label}</Text></Pressable>)}</View>
   {mode==="daily"?<><Text style={styles.label}>Labour Date (dd/mm/yyyy)</Text><TextInput style={styles.input} placeholder="dd/mm/yyyy" value={date} onChangeText={setDate}/></>:<><Text style={styles.label}>Week (yy/ww)</Text><View style={styles.picker}><Picker selectedValue={week} onValueChange={x=>setWeek(String(x))}><Picker.Item label="Select week" value=""/>{weeks.map(w=><Picker.Item key={w} value={w} label={w}/>)}</Picker></View></>}
   <Pressable style={styles.primary} onPress={load} disabled={busy}><Text style={styles.white}>{busy?"Loading…":"View "+(mode==="daily"?"Daily":mode==="ao"?"AO Weekly":"Weekly")+" Report"}</Text></Pressable>
   {!!error&&<Text style={styles.error}>{error}</Text>}
   {busy&&<ActivityIndicator color={C.primary}/>}
  </View>
  {searched&&<View style={styles.panel}><Text style={styles.title}>{mode==="daily"?"Labour Daily Report — "+date:"Labour "+(mode==="ao"?"Agri Orange ":"")+"Weekly Report — "+week}</Text><Text style={styles.hint}>Report rows {resultCount} · Labour Qty {formatJsplNumber(qty)} · Kgs {formatJsplNumber(kilos)} · Value {money(total)}</Text>
   {resultCount===0?<Text style={styles.hint}>No matching Labour records.</Text>:
   mode==="daily"? daily.map(r=><View style={styles.line} key={r.source_type+":"+r.source_id}>
    <Text style={styles.lineTitle}>{r.farm_name} · {r.tracecode_name} · {r.crop_name}</Text><Text style={styles.hint}>{r.activity_name}</Text>
    <Text style={styles.hint}>Qty {formatJsplNumber(Number(r.labour_qty))} · Kgs {r.kgs??"—"} · Unit Cost {money(Number(r.unit_cost))} · Value {money(Number(r.total_cost))}</Text>
   </View>):
   weekly.map((r,i)=><View style={styles.line} key={i+":"+r.tracecode_name+":"+r.activity_name}>
    <Text style={styles.lineTitle}>{r.report_farm} · {r.tracecode_name} · {r.crop_name}</Text><Text style={styles.hint}>{r.activity_name} · Unit Cost {money(Number(r.unit_cost))}</Text>
    <Text style={styles.hint}>Qty {formatJsplNumber(Number(r.total_labour_qty))} · Kgs {formatJsplNumber(Number(r.total_kgs||0))} · Kgs/person {r.avg_kgs_per_person==null?"—":formatJsplNumber(Number(r.avg_kgs_per_person))}</Text><Text style={styles.value}>Value {money(Number(r.total_cost))} · Cost/ha {r.cost_per_ha==null?"—":money(Number(r.cost_per_ha))}</Text>
   </View>)}
   <Text style={styles.title}>Grand total: {money(total)}</Text>
   <Text style={styles.hint}>Read-only Access-calculated reports. Print/Excel parity and support cost-centre labels are still under review.</Text>
  </View>}
 </ScrollView>
}
const styles=StyleSheet.create({page:{backgroundColor:C.background,padding:22,flexGrow:1,gap:15},header:{backgroundColor:C.primaryDark,padding:18,borderRadius:12,flexDirection:"row",alignItems:"center",gap:12},big:{fontSize:23,color:"#FFF",fontWeight:"800"},white:{color:"#FFF",fontWeight:"700"},logo:{width:65,height:65,resizeMode:"contain",backgroundColor:"#FFF",borderRadius:8},row:{flexDirection:"row",gap:9,flexWrap:"wrap",alignItems:"center"},panel:{backgroundColor:"#FFF",padding:16,borderRadius:10,borderColor:C.border,borderWidth:1,gap:11},primary:{backgroundColor:C.primary,borderRadius:7,padding:12},outline:{borderColor:C.primary,borderWidth:1,borderRadius:7,padding:11},dark:{color:C.primaryDark,fontWeight:"700"},label:{color:C.text,fontWeight:"700"},title:{fontSize:18,fontWeight:"800",color:C.primaryDark},input:{backgroundColor:"#FFF",borderColor:C.border,borderWidth:1,padding:11,borderRadius:7,color:C.text},picker:{borderColor:C.border,borderWidth:1,borderRadius:7,overflow:"hidden"},hint:{color:C.textSecondary,fontSize:12},line:{borderBottomWidth:1,borderColor:C.border,paddingVertical:11,gap:4},lineTitle:{fontSize:14,fontWeight:"700",color:C.primaryDark},value:{color:C.primaryDark,fontWeight:"700"},error:{color:C.danger,fontWeight:"700"}});
