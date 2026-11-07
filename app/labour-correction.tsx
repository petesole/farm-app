import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "@/supabase";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { formatJsplDate, jsplColors as C } from "@/constants/jspl-design";

type Row={source_id:number;source_type:string;labour_date:string;tracecode_id:number;activity_id:number;labour_qty:number;kgs:number|null;unit_cost:number};
type Trace={tracecode_id:number;tracecode_name:string};
type Activity={activity_id:number;activity_name:string;active:boolean};
export default function LabourCorrection(){
 const {recordId}=useLocalSearchParams<{recordId?:string}>();const id=Number(recordId);
 const [row,setRow]=useState<Row|null>(null),[activities,setActivities]=useState<Activity[]>([]),[traces,setTraces]=useState<Trace[]>([]);
 const [action,setAction]=useState("UPDATE"),[traceId,setTraceId]=useState(""),[activityId,setActivityId]=useState("");
 const [qty,setQty]=useState(""),[kgs,setKgs]=useState(""),[rate,setRate]=useState(""),[reason,setReason]=useState("");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 useEffect(()=>{let alive=true;(async()=>{try{
  if(!Number.isSafeInteger(id)||id<=0)throw Error("Invalid record reference");
  const [auth,r,a,t]=await Promise.all([
   supabase.rpc("my_farm_app_roles"),
   supabase.from("labour_v2_report_rows").select("source_id,source_type,labour_date,tracecode_id,activity_id,labour_qty,kgs,unit_cost").eq("source_id",id).eq("source_type","App").limit(1),
   supabase.from("labour_v2_activity").select("activity_id,activity_name,active").order("activity_name"),
   supabase.from("tracecode").select("tracecode_id,tracecode_name").order("tracecode_name")
  ]);
  if(auth.error||r.error||a.error||t.error)throw Error(auth.error?.message||r.error?.message||a.error?.message||t.error?.message);
  if(!(auth.data||[]).includes("admin"))throw Error("Only administrators may correct saved Labour records");
  const record=r.data?.[0] as Row|undefined;if(!record)throw Error("Saved App labour record not found");
  if(!alive)return;
  setRow(record);setActivities(a.data||[]);setTraces(t.data||[]);
  setTraceId(String(record.tracecode_id));setActivityId(String(record.activity_id));setQty(String(record.labour_qty));setKgs(record.kgs==null?"":String(record.kgs));setRate(String(record.unit_cost));
 }catch(e){if(alive)setError(e instanceof Error?e.message:String(e))}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[id]);
 const post=async()=>{
  if(!row||saving)return;setError("");
  // Shared FarmingMain database: never execute a development correction against historical/live records.
  setError("Development review only. Corrections are disabled until an isolated test database is configured.");
  return;
  if(reason.trim().length<(action==="DELETE"?15:8)){setError("Enter a detailed audit reason");return}
  if(action!=="DELETE"&&(!Number.isFinite(Number(qty))||Number(qty)<=0||!Number.isFinite(Number(rate))||Number(rate)<0)){setError("Enter valid quantity and unit cost");return}
  setSaving(true);
  try{
   const {error:e}=await supabase.rpc("labour_v2_admin_correct",{p_action:action,p_id:row.source_id,p_labour_date:row.labour_date,p_tracecode_id:Number(traceId),p_activity_id:Number(activityId),p_qty:Number(qty),p_kgs:kgs.trim()?Number(kgs):null,p_unit_cost:Number(rate),p_reason:reason.trim()});
   if(e)throw e;
   router.replace("/labour-history");
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSaving(false)}
 };
 return <ScrollView contentContainerStyle={s.page}>
  <JsplModuleHeader title="Labour Correction" backLabel="Back to Labour" backHref="/(tabs)/labour" />
  {loading?<ActivityIndicator/>:null}
  {!!error&&<Text style={s.error}>{error}</Text>}
  {row&&<View style={s.panel}>
   <Text style={s.title}>Labour record #{row.source_id}</Text>
   <Text>Saved date: {formatJsplDate(row.labour_date)} (locked)</Text>
   <Text style={s.label}>Correction type</Text>
   <View style={s.select}><Picker selectedValue={action} onValueChange={v=>setAction(String(v))}><Picker.Item label="Correct saved entry" value="UPDATE"/><Picker.Item label="Add missing line on this date" value="INSERT"/><Picker.Item label="Delete incorrect entry (audited)" value="DELETE"/></Picker></View>
   {action!=="DELETE"&&<>
    <Text style={s.label}>Trace</Text>
    <View style={s.select}><Picker selectedValue={traceId} onValueChange={v=>setTraceId(String(v))}>{traces.map(t=><Picker.Item key={t.tracecode_id} value={String(t.tracecode_id)} label={t.tracecode_name}/>)}</Picker></View>
    <Text style={s.label}>Activity</Text>
    <View style={s.select}><Picker selectedValue={activityId} onValueChange={v=>setActivityId(String(v))}>{activities.map(a=><Picker.Item key={a.activity_id} value={String(a.activity_id)} label={a.activity_name}/>)}</Picker></View>
    <View style={s.row}><View style={s.field}><Text>Labour Qty</Text><TextInput style={s.input} value={qty} onChangeText={setQty} keyboardType="decimal-pad"/></View><View style={s.field}><Text>Kgs</Text><TextInput style={s.input} value={kgs} onChangeText={setKgs} keyboardType="decimal-pad"/></View><View style={s.field}><Text>Unit Cost</Text><TextInput style={s.input} value={rate} onChangeText={setRate} keyboardType="decimal-pad"/></View></View>
   </>}
   <Text style={s.label}>Reason for correction (mandatory)</Text>
   <TextInput style={[s.input,{minHeight:76}]} multiline value={reason} onChangeText={setReason}/>
   <View style={s.row}><Pressable style={s.button} onPress={()=>router.replace("/labour-history")}><Text>Cancel</Text></Pressable><Pressable style={s.button} disabled={saving} onPress={()=>void post()}><Text>{saving?"Saving…":"Confirm audited "+(action==="DELETE"?"deletion":"correction")}</Text></Pressable></View>
  </View>}
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:18,flexGrow:1,gap:12,backgroundColor:C.background},panel:{padding:16,gap:12,backgroundColor:"#fff",borderRadius:10},title:{color:C.primaryDark,fontSize:19,fontWeight:"800"},error:{color:C.danger,fontWeight:"700"},label:{fontWeight:"700",color:C.text},select:{borderWidth:1,borderColor:C.border,borderRadius:8,overflow:"hidden"},row:{flexDirection:"row",flexWrap:"wrap",gap:10,alignItems:"center"},field:{flex:1,minWidth:110},input:{borderWidth:1,borderColor:C.border,padding:10,borderRadius:8,backgroundColor:"#fff"},button:{borderWidth:1,borderColor:C.primary,borderRadius:8,padding:12}});
