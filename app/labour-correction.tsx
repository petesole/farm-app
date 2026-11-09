import { JsplSearchCombo } from "@/components/jspl/JsplSearchCombo";
import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/supabase";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { formatJsplDate, jsplColors as C } from "@/constants/jspl-design";

type Row={source_id:number;source_type:string;labour_date:string;tracecode_id:number;activity_id:number;labour_qty:number;kgs:number|null;unit_cost:number};
type Trace={tracecode_id:number;tracecode_name:string};
type Activity={activity_id:number;activity_name:string;active:boolean;labour_measure:"Kgs"|"Unit"};
const liveTest=process.env.EXPO_PUBLIC_LABOUR_LIVE_TEST!=="0";
export default function LabourCorrection(){
 const {recordId,historyDate,workDate,source}=useLocalSearchParams<{recordId?:string;historyDate?:string;workDate?:string;source?:string}>();
 const adding=!recordId;
 const id=Number(recordId);
 const sourceType=source==="Access"?"Access":"App";
 const [savedDate,setSavedDate]=useState(""),[activities,setActivities]=useState<Activity[]>([]),[traces,setTraces]=useState<Trace[]>([]);
 const [traceId,setTraceId]=useState(""),[activityId,setActivityId]=useState("");
 const [qty,setQty]=useState(""),[kgs,setKgs]=useState(""),[rate,setRate]=useState(""),[reason,setReason]=useState("");
 const [error,setError]=useState(""),[loading,setLoading]=useState(true),[reviewed,setReviewed]=useState(false),[saving,setSaving]=useState(false);
 useEffect(()=>{let alive=true;(async()=>{try{
  const auth=await supabase.rpc("my_farm_app_roles");
  if(auth.error)throw Error(auth.error.message);
  if(!(auth.data||[]).includes("admin"))throw Error("Only administrators may correct saved Labour records");
  if(adding ? !workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) : !Number.isSafeInteger(id)||id<=0)throw Error("Invalid saved Labour reference");
  let request=supabase.from("labour_v2_report_rows").select("source_id,source_type,labour_date,tracecode_id,activity_id,labour_qty,kgs,unit_cost");
  request=adding ? request.eq("labour_date",workDate!) : request.eq("source_type",sourceType).eq("source_id",id);
  const [r,a,t]=await Promise.all([
   request.limit(1),
   supabase.from("labour_v2_activity").select("activity_id,activity_name,active,labour_measure").order("activity_name"),
   supabase.from("tracecode").select("tracecode_id,tracecode_name").order("tracecode_name")
  ]);
  if(r.error||a.error||t.error)throw Error(r.error?.message||a.error?.message||t.error?.message);
  const record=r.data?.[0] as Row|undefined;
  if(!record)throw Error("Saved Labour record not found");
  if(!alive)return;
  setSavedDate(record.labour_date);setActivities(a.data||[]);setTraces(t.data||[]);
  if(!adding){
   setTraceId(String(record.tracecode_id));setActivityId(String(record.activity_id));setQty(String(record.labour_qty));setKgs(record.kgs==null?"":String(record.kgs));setRate(String(record.unit_cost));
  }
 }catch(e){if(alive)setError(e instanceof Error?e.message:String(e))}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[adding,id,workDate,sourceType]);
 const activity=activities.find(item=>String(item.activity_id)===activityId);
 const inKgs=activity?.labour_measure==="Kgs";
 const measure=inKgs?kgs:qty;
 const value=Number(measure)*Number(rate);
 async function review(){
  if(saving)return;
  setReviewed(false);
  if(!traceId||!activity){setError("Select a trace and activity.");return;}
  if(!measure.trim()||!Number.isFinite(Number(measure))||Number(measure)<=0||!rate.trim()||!Number.isFinite(Number(rate))||Number(rate)<0){setError("Enter a positive measure and valid unit cost.");return;}
  if(reason.trim().length<8){setError("Enter a correction reason of at least eight characters.");return;}
  setError("");
  if(!liveTest){setReviewed(true);return;}
  setSaving(true);
  try {
   const result=await supabase.rpc("labour_v2_admin_save_line",{
    p_source:adding?"New":sourceType,p_id:adding?null:id,p_date:savedDate,
    p_trace:Number(traceId),p_activity:Number(activityId),p_qty:inKgs?null:Number(qty),
    p_kgs:inKgs?Number(kgs):null,p_rate:Number(rate),p_reason:reason.trim()
   });
   if(result.error){setError(result.error.message);return;}
   if(result.data==null){setError("Save status uncertain. Check History before trying again.");return;}
   router.replace({pathname:"/labour-history",params:{date:historyDate||formatJsplDate(savedDate)}});
  }catch{setError("Save status uncertain. Check History before trying again.");}
  finally{setSaving(false);}
 }
 return <ScrollView contentContainerStyle={s.page}>
  <JsplModuleHeader title={adding?"Add Labour Line":"Edit Labour Line"} backLabel="Back to History" backHref="/labour-history" onBack={()=>router.replace({pathname:"/labour-history",params:{date:historyDate||""}})} />
  {loading?<ActivityIndicator/>:null}
  {!!error&&<Text style={s.error}>{error}</Text>}
  {savedDate&&<View style={s.panel}>
   <Text style={s.title}>{adding?"Add Line to Saved Date":"Edit Labour Line #"+id}</Text>
   <Text>Saved date: {formatJsplDate(savedDate)} (locked)</Text>
   <Text style={s.label}>{liveTest?"Saving records an audited correction in FarmingMain.":"Preview only. Corrections are not written to FarmingMain."}</Text>
   <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1}}>
    <View style={{minWidth:720,flex:1,flexDirection:"row",gap:10}}>
     <View style={{flex:1,minWidth:180}}><JsplSearchCombo label="Trace" selector="product" options={traces.map(t=>({id:String(t.tracecode_id),label:t.tracecode_name}))} value={traceId} onChange={v=>{setReviewed(false);setTraceId(String(v??""))}} /></View>
     <View style={{flex:1,minWidth:180}}><JsplSearchCombo label="Activity" selector="product" options={activities.filter(a=>a.active||String(a.activity_id)===activityId).map(a=>({id:String(a.activity_id),label:a.activity_name}))} value={activityId} onChange={v=>{setReviewed(false);setActivityId(String(v??""))}} /></View>
     {activity&&<View style={{width:100}}><Text style={s.label}>{inKgs?"Kgs":"Qty"}</Text><TextInput accessibilityLabel={inKgs?"Kgs":"Qty"} style={s.input} value={measure} onChangeText={v=>{setReviewed(false);(inKgs?setKgs:setQty)(v)}} keyboardType="decimal-pad"/></View>}
     <View style={{width:100}}><Text style={s.label}>Unit Cost</Text><TextInput accessibilityLabel="Unit Cost" style={s.input} value={rate} onChangeText={v=>{setReviewed(false);setRate(v)}} keyboardType="decimal-pad"/></View>
     <View style={{width:100}}><Text style={s.label}>Value</Text><Text>{activity&&measure.trim()&&rate.trim()&&Number.isFinite(value)?"$"+value.toFixed(2):"—"}</Text></View>
    </View>
   </ScrollView>
   <Text style={s.label}>Reason for correction (mandatory)</Text>
   <TextInput accessibilityLabel="Reason for correction" style={[s.input,{minHeight:76}]} multiline value={reason} onChangeText={v=>{setReviewed(false);setReason(v)}}/>
   <Pressable accessibilityRole="button" style={s.button} disabled={saving} onPress={()=>void review()}><Text>{saving?"Saving…":liveTest?"Save Correction":"Validate Preview"}</Text></Pressable>
   {reviewed&&<Text accessibilityRole="alert">Correction validated in preview. No changes saved.</Text>}
  </View>}
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:18,flexGrow:1,gap:12,backgroundColor:C.background},panel:{padding:16,gap:12,backgroundColor:"#fff",borderRadius:10},title:{color:C.primaryDark,fontSize:19,fontWeight:"800"},error:{color:C.danger,fontWeight:"700"},label:{fontWeight:"700",color:C.text},select:{borderWidth:1,borderColor:C.border,borderRadius:8,overflow:"hidden"},row:{flexDirection:"row",flexWrap:"wrap",gap:10,alignItems:"center"},field:{flex:1,minWidth:110},input:{borderWidth:1,borderColor:C.border,padding:10,borderRadius:8,backgroundColor:"#fff"},button:{borderWidth:1,borderColor:C.primary,borderRadius:8,padding:12}});
