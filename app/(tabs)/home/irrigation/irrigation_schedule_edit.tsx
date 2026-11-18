import { supabase } from "@/supabase";
import { verifiedIrrigationRoles } from "@/utils/irrigation-access";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { jsplColors as C } from "@/constants/jspl-design";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

function isoFromDmy(s:string):string|null {
  const m=/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s.trim());
  if(!m)return null;
  const day=Number(m[1]),mon=Number(m[2]),year=m[3]?Number(m[3]):new Date().getFullYear();
  const d=new Date(year,mon-1,day);
  return d.getFullYear()===year&&d.getMonth()+1===mon&&d.getDate()===day
    ? year+"-"+String(mon).padStart(2,"0")+"-"+String(day).padStart(2,"0") : null;
}
function display(s:string){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return m?m[3]+"/"+m[2]+"/"+m[1]:s;}
export default function IrrigationScheduleEdit(){
  const {irrigation_schedule_id,tracecode_id}=useLocalSearchParams<{irrigation_schedule_id?:string;tracecode_id?:string}>();
  const scheduleId=Number(irrigation_schedule_id);
  const traceId=Number(tracecode_id);
  const [allowed,setAllowed]=useState(false);
  const [date,setDate]=useState("");
  const [mm,setMm]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const back=()=>router.replace({pathname:"/(tabs)/home/irrigation/irrigation_schedule",params:{tracecode_id:String(traceId)}});
  useEffect(()=>{let mounted=true;(async()=>{
    try{
      const roles=await verifiedIrrigationRoles(supabase);
      if(!roles.includes("admin"))throw new Error("Admin access required.");
      if(!Number.isInteger(scheduleId)||scheduleId<=0)throw new Error("Invalid programme entry.");
      const {data,error:e}=await supabase.from("irrigation_schedule")
        .select("irrigation_schedule_id,tracecode_id,scheduled_date,planned_mm,status")
        .eq("irrigation_schedule_id",scheduleId).single();
      if(e||!data)throw e||new Error("Schedule not found.");
      if(Number(data.tracecode_id)!==traceId||!["planned","scheduled"].includes(String(data.status)))
        throw new Error("Only pending plans for this field may be edited.");
      if(!mounted)return;
      setDate(display(data.scheduled_date));setMm(String(data.planned_mm));setAllowed(true);
    }catch(e:any){if(mounted)setError(e?.message??"Unable to open plan.");}
    finally{if(mounted)setLoading(false);}
  })();return()=>{mounted=false};},[scheduleId,traceId]);
  const save=async()=>{
    if(!allowed||busy)return;
    const iso=isoFromDmy(date),amount=Number(mm);
    if(!iso)return Alert.alert("Invalid date","Use DD/MM/YYYY.");
    if(!mm.trim()||!Number.isFinite(amount)||amount<=0||amount>200)
      return Alert.alert("Invalid mm","Enter planned millimetres (1–200).");
    setBusy(true);
    try{
      const {data,error:e}=await supabase.from("irrigation_schedule")
        .update({scheduled_date:iso,planned_mm:amount})
        .eq("irrigation_schedule_id",scheduleId).eq("tracecode_id",traceId)
        .in("status",["planned","scheduled"]).select("irrigation_schedule_id");
      if(e)throw e;
      if(!data?.length)throw new Error("No pending plan was updated. Refresh the programme.");
      back();
    }catch(e:any){Alert.alert("Not saved",e?.message??"Please retry.");}
    finally{setBusy(false);}
  };
  return <View style={styles.screen}>
    <JsplModuleHeader title="Edit Irrigation Plan" backLabel="Back to Irrigation Programme" onBack={back}/>
    {loading?<ActivityIndicator/>:error?<Text style={styles.error}>{error}</Text>:<View style={styles.card}>
      <Text style={styles.label}>Planned date (DD/MM/YYYY)</Text>
      <TextInput style={styles.input} value={date} onChangeText={setDate}/>
      <Text style={styles.label}>Planned mm</Text>
      <TextInput style={styles.input} value={mm} onChangeText={setMm} keyboardType="decimal-pad"/>
      <Pressable style={[styles.button,busy&&styles.disabled]} disabled={busy} onPress={save}>
        <Text style={styles.buttonText}>{busy?"Saving…":"Save Changes"}</Text>
      </Pressable>
    </View>}
  </View>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:C.background,padding:16},
  card:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:16,marginTop:16},
  label:{fontWeight:"700",color:C.text,marginTop:12,marginBottom:6},
  input:{borderWidth:1,borderColor:C.border,borderRadius:8,padding:12,backgroundColor:"#fff",color:C.text},
  button:{backgroundColor:C.primaryDark,marginTop:20,padding:14,alignItems:"center",borderRadius:8},
  buttonText:{fontWeight:"800",color:"#fff"},disabled:{opacity:0.5},
  error:{color:"#b00020",marginTop:16},
});
