import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { jsplColors as C } from "@/constants/jspl-design";
import { supabase } from "../../../supabase";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

// Development-only Labour screen. Access: LabourFNew/LabourSubformNew.
// No data is written until the labour_v2_development.sql schema and
// authorization policies have been reviewed and deployed.
type Activity = { labour_activity_id:number; labour_activity:string; labour_measure:"Unit"|"Kgs" };
type Trace = { tracecode_id:number; tracecode_name:string; crop_id:number|null };
type LabourRow = { labour_id:number; labour_date:string; tracecode_id:number|null; labour_activity_id:number; labour_qty:number; kgs:number|null; labour_unit_cost:number };
function today(){ const d=new Date();return [String(d.getDate()).padStart(2,"0"),String(d.getMonth()+1).padStart(2,"0"),d.getFullYear()].join("/");}
function isoDate(s:string){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());if(!m)return null;const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));if(d.getFullYear()!==Number(m[3])||d.getMonth()!==Number(m[2])-1||d.getDate()!==Number(m[1]))return null;return [m[3],m[2],m[1]].join("-");}
function displayDate(s:string){return /^\d{4}-\d\d-\d\d$/.test(s)?s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4):s;}
const num=(x:string)=>Number(x.replace(",","."));const money=(x:number)=>x.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function LabourScreen(){
 const [date,setDate]=useState(today());
 const [activities,setActivities]=useState<Activity[]>([]);
 const [traces,setTraces]=useState<Trace[]>([]);
 const [rows,setRows]=useState<LabourRow[]>([]);
 const [activityId,setActivityId]=useState<number|null>(null);
 const [traceId,setTraceId]=useState<number|null>(null);
 const [qty,setQty]=useState("");
 const [kgs,setKgs]=useState("");
 const [rate,setRate]=useState("");
 const [editId,setEditId]=useState<number|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [pick,setPick]=useState<"trace"|"activity"|null>(null);
 const activity=activities.find(x=>x.labour_activity_id===activityId);
 const amount=useMemo(()=>Math.max(0,num(activity?.labour_measure==="Kgs"?kgs:qty)||0)*Math.max(0,num(rate)||0),[activity,kgs,qty,rate]);
 async function loadMasters(){
  setLoading(true);setError(null);
  const [a,t]=await Promise.all([
   supabase.from("labour_activity_v2").select("labour_activity_id,labour_activity,labour_measure").eq("active",true).order("labour_activity"),
   supabase.from("tracecode").select("tracecode_id,tracecode_name,crop_id").not("start_date","is",null).is("end_date",null).order("tracecode_name")
  ]);
  if(a.error||t.error){setError(a.error?.message||t.error?.message||"Unable to load Labour data.");setLoading(false);return;}
  setActivities((a.data||[]) as Activity[]);setTraces((t.data||[]) as Trace[]);setLoading(false);
 }
 async function loadRows(){
  const d=isoDate(date);if(!d){setRows([]);return;}
  const r=await supabase.from("labour_transaction_v2").select("labour_id,labour_date,tracecode_id,labour_activity_id,labour_qty,kgs,labour_unit_cost").eq("labour_date",d).order("labour_id",{ascending:false});
  if(r.error){setError(r.error.message);return;}setRows((r.data||[]) as LabourRow[]);
 }
 useEffect(()=>{loadMasters();},[]);
 useEffect(()=>{if(!loading)loadRows();},[date,loading]);
 function reset(){setEditId(null);setActivityId(null);setTraceId(null);setQty("");setKgs("");setRate("");}
 function edit(r:LabourRow){setEditId(r.labour_id);setActivityId(r.labour_activity_id);setTraceId(r.tracecode_id);setQty(String(r.labour_qty));setKgs(r.kgs==null?"":String(r.kgs));setRate(String(r.labour_unit_cost));}
 async function save(){
  const d=isoDate(date);if(!d){Alert.alert("Invalid date","Enter date as dd/mm/yyyy.");return;}
  if(activityId==null){Alert.alert("Labour activity required");return;}
  if(!Number.isFinite(num(qty))||num(qty)<=0||!Number.isFinite(num(rate))||num(rate)<0){Alert.alert("Invalid quantity or rate");return;}
  if(activity?.labour_measure==="Kgs"&&(!Number.isFinite(num(kgs))||num(kgs)<=0)){Alert.alert("Kilograms required");return;}
  setSaving(true);setError(null);
  const record={labour_date:d,tracecode_id:traceId,labour_activity_id:activityId,labour_qty:num(qty),kgs:activity?.labour_measure==="Kgs"?num(kgs):null,labour_unit_cost:num(rate)};
  const res=editId!=null?await supabase.from("labour_transaction_v2").update(record).eq("labour_id",editId):await supabase.from("labour_transaction_v2").insert(record);
  setSaving(false);
  if(res.error){setError(res.error.message);return;}reset();await loadRows();
 }
 return <ScrollView contentContainerStyle={s.page}>
  <JsplModuleHeader title="Labour" subtitle="Daily Labour • Access workflow" backLabel="Back to Dashboard" backHref="/(tabs)/main-dashboard"/>
  <Text style={s.heading}>Daily Labour Entry</Text>
  <Text style={s.label}>Date (dd/mm/yyyy)</Text>
  <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="dd/mm/yyyy" keyboardType="numbers-and-punctuation" maxLength={10}/>
  {loading?<ActivityIndicator/>:null}
  {error?<Text style={s.error}>{error}</Text>:null}
  <Text style={s.label}>Trace Code</Text>
  <Pressable style={s.input} onPress={()=>setPick(pick==="trace"?null:"trace")}><Text>{traces.find(x=>x.tracecode_id===traceId)?.tracecode_name||"Select trace / general labour"}</Text></Pressable>
  {pick==="trace"?<View style={s.picker}><Pressable onPress={()=>{setTraceId(null);setPick(null);}}><Text style={s.option}>General / unallocated</Text></Pressable>{traces.map(t=><Pressable key={t.tracecode_id} onPress={()=>{setTraceId(t.tracecode_id);setPick(null);}}><Text style={s.option}>{t.tracecode_name}</Text></Pressable>)}</View>:null}
  <Text style={s.label}>Labour Activity</Text>
  <Pressable style={s.input} onPress={()=>setPick(pick==="activity"?null:"activity")}><Text>{activity?.labour_activity||"Select labour activity"}</Text></Pressable>
  {pick==="activity"?<View style={s.picker}>{activities.map(a=><Pressable key={a.labour_activity_id} onPress={()=>{setActivityId(a.labour_activity_id);setPick(null);}}><Text style={s.option}>{a.labour_activity} ({a.labour_measure})</Text></Pressable>)}</View>:null}
  <View style={s.row}><View style={s.half}><Text style={s.label}>Labour Qty</Text><TextInput style={s.input} value={qty} onChangeText={setQty} keyboardType="decimal-pad"/></View><View style={s.half}><Text style={s.label}>Unit Cost ($)</Text><TextInput style={s.input} value={rate} onChangeText={setRate} keyboardType="decimal-pad"/></View></View>
  {activity?.labour_measure==="Kgs"?<><Text style={s.label}>Kilograms</Text><TextInput style={s.input} value={kgs} onChangeText={setKgs} keyboardType="decimal-pad"/></>:null}
  <View style={s.total}><Text style={s.totalLabel}>Calculated Labour Cost</Text><Text style={s.totalText}>$ {money(amount)}</Text></View>
  <Pressable style={s.button} onPress={save} disabled={saving||loading}><Text style={s.buttonText}>{saving?"Saving...":editId==null?"Save Labour":"Update Labour"}</Text></Pressable>
  {editId!=null?<Pressable onPress={reset}><Text style={s.cancel}>Cancel edit</Text></Pressable>:null}
  <Text style={s.heading}>Recorded for {date}</Text>
  {rows.length===0?<Text style={s.empty}>No labour recorded for this date.</Text>:rows.map(r=>{const a=activities.find(x=>x.labour_activity_id===r.labour_activity_id);const tr=traces.find(x=>x.tracecode_id===r.tracecode_id);const v=(a?.labour_measure==="Kgs"?Number(r.kgs||0):Number(r.labour_qty))*Number(r.labour_unit_cost);return <Pressable key={r.labour_id} style={s.record} onPress={()=>edit(r)}><Text style={s.recordMain}>{tr?.tracecode_name||"General"} • {a?.labour_activity||r.labour_activity_id}</Text><Text style={s.recordSub}>{r.labour_qty} workers/units{a?.labour_measure==="Kgs"?" • "+r.kgs+" kg":""} • $ {money(v)}  • Edit</Text></Pressable>;})}
  <Text style={s.footer}>Development only. Uses Access quantity/kg calculation. AO allocation and weekly report parity will be verified before release.</Text>
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:16,paddingBottom:52,backgroundColor:"#F5F8F5",gap:9},heading:{fontSize:20,fontWeight:"800",color:C.primaryDark,marginTop:10},label:{fontWeight:"700",color:"#264631",marginTop:5},input:{backgroundColor:"#FFFFFF",borderColor:"#B9CBBB",borderWidth:1,borderRadius:9,minHeight:44,padding:11,justifyContent:"center"},row:{flexDirection:"row",gap:10},half:{flex:1},picker:{backgroundColor:"#FFFFFF",maxHeight:185,overflow:"scroll",borderWidth:1,borderColor:"#BCD0BE",borderRadius:8},option:{padding:11,borderBottomWidth:1,borderBottomColor:"#E4EBE5"},total:{backgroundColor:"#DDEBDF",padding:15,borderRadius:10},totalLabel:{color:"#245331",fontWeight:"700"},totalText:{color:C.primaryDark,fontSize:24,fontWeight:"800"},button:{backgroundColor:C.primaryDark,borderRadius:10,padding:15,alignItems:"center"},buttonText:{color:"#FFFFFF",fontWeight:"800"},cancel:{color:C.primaryDark,textAlign:"center",textDecorationLine:"underline"},error:{color:"#AC2020",padding:8},record:{backgroundColor:"#FFFFFF",borderRadius:9,borderWidth:1,borderColor:"#D5E0D5",padding:12},recordMain:{fontWeight:"700",color:"#23412B"},recordSub:{marginTop:4,color:"#57705B"},empty:{color:"#66766A"},footer:{marginTop:20,fontSize:12,color:"#66766A"}});
