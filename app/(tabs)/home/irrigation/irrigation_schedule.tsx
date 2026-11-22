import { supabase } from "@/supabase";
import { verifiedIrrigationRoles } from "@/utils/irrigation-access";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { jsplColors as C } from "@/constants/jspl-design";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type Programme = {
  trace: string | null;
  crop: string | null;
  last_irrigation_date: string | null;
  daily_req: number | null;
  acc_req: number | null;
  net_mm: number | null;
  next_app: string | null;
  next_app_mm: number | null;
};
type Schedule = {
  irrigation_schedule_id: number;
  scheduled_date: string;
  planned_mm: number;
  status: string;
};
const displayDate = (s?:string|null) => {
  if(!s)return "—";
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m?m[3]+"/"+m[2]+"/"+m[1]:s;
};
const number=(v:number|null|undefined)=>v==null?"—":Number(v).toFixed(1);
function dateISO(s:string):string|null {
  const m=/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s.trim());
  if(!m)return null;
  const d=Number(m[1]),mo=Number(m[2]),y=m[3]?Number(m[3]):new Date().getFullYear();
  const date=new Date(y,mo-1,d);
  if(date.getFullYear()!==y||date.getMonth()!==mo-1||date.getDate()!==d)return null;
  return y+"-"+String(mo).padStart(2,"0")+"-"+String(d).padStart(2,"0");
}
export default function IrrigationProgramme(){
  const {tracecode_id}=useLocalSearchParams<{tracecode_id?:string}>();
  const traceId=Number(tracecode_id);
  const [admin,setAdmin]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [programme,setProgramme]=useState<Programme|null>(null);
  const [schedules,setSchedules]=useState<Schedule[]>([]);
  const [date,setDate]=useState("");
  const [mm,setMm]=useState("");
  const [saving,setSaving]=useState(false);
  const back=()=>router.replace("/(tabs)/irrigation_main_dashboard");
  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const roles=await verifiedIrrigationRoles(supabase);
      const canManage=roles.includes("admin");
      setAdmin(canManage);
      if(!canManage)throw new Error("Only Admin can manage irrigation scheduling.");
      if(!Number.isInteger(traceId)||traceId<=0)throw new Error("Invalid field.");
      const [dashboard,plans]=await Promise.all([
        supabase.from("irrigation_dashboard_cache")
          .select("trace,crop,last_irrigation_date,daily_req,acc_req,net_mm,next_app,next_app_mm")
          .eq("tracecode_id",traceId).single(),
        supabase.from("irrigation_schedule")
          .select("irrigation_schedule_id,scheduled_date,planned_mm,status")
          .eq("tracecode_id",traceId).order("scheduled_date",{ascending:true}),
      ]);
      if(dashboard.error)throw dashboard.error;
      if(plans.error)throw plans.error;
      setProgramme(dashboard.data as Programme);
      setSchedules((plans.data??[]) as Schedule[]);
    }catch(e:any){setError(e?.message??"Unable to load irrigation programme.");}
    finally{setLoading(false);}
  },[traceId]);
  useFocusEffect(useCallback(()=>{void refresh();},[refresh]));
  const save=async()=>{
    if(!admin||saving)return;
    const iso=dateISO(date),amount=Number(mm);
    const today=new Date();
    const min=today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
    if(!iso||iso<min)return Alert.alert("Invalid date","Plan a date today or later.");
    if(!mm.trim()||!Number.isFinite(amount)||amount<=0||amount>200)
      return Alert.alert("Invalid amount","Enter planned irrigation in mm (1–200).");
    setSaving(true);
    try{
      const {error:saveError}=await supabase.from("irrigation_schedule")
        .insert({tracecode_id:traceId,scheduled_date:iso,planned_mm:amount,status:"planned"});
      if(saveError)throw saveError;
      setDate("");setMm("");
      await refresh();
      Alert.alert("Saved","Planned irrigation added.");
    }catch(e:any){Alert.alert("Not saved",e?.message??"Please retry.");}
    finally{setSaving(false);}
  };
  const edit=(id:number)=>router.push({pathname:"/(tabs)/home/irrigation/irrigation_schedule_edit",params:{irrigation_schedule_id:String(id),tracecode_id:String(traceId)}});
  return <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
    <JsplModuleHeader title="Irrigation Programme" subtitle={programme?.trace+" · "+programme?.crop} backLabel="Back to Irrigation" onBack={back}/>
    {loading?<ActivityIndicator size="large" />:error?<Text style={styles.error}>{error}</Text>:<>
      <View style={styles.card}>
        <Text style={styles.title}>Calculated field requirement</Text>
        <Text style={styles.help}>Requirements recalculate from recorded irrigation, rainfall and daily pan evaporation.</Text>
        <View style={styles.stats}>
          <Stat label="Last irrigated" value={displayDate(programme?.last_irrigation_date)}/>
          <Stat label="Daily requirement" value={number(programme?.daily_req)+" mm"}/>
          <Stat label="Accumulated" value={number(programme?.acc_req)+" mm"}/>
          <Stat label="Net requirement" value={number(programme?.net_mm)+" mm"}/>
          <Stat label="Next planned" value={displayDate(programme?.next_app)}/>
          <Stat label="Next planned mm" value={number(programme?.next_app_mm)+" mm"}/>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Plan next irrigation</Text>
        <Text style={styles.label}>Date (DD/MM/YYYY)</Text>
        <TextInput value={date} onChangeText={setDate} style={styles.input} placeholder="DD/MM/YYYY"/>
        <Text style={styles.label}>Planned mm</Text>
        <TextInput value={mm} onChangeText={setMm} style={styles.input} keyboardType="decimal-pad" placeholder="mm"/>
        <Pressable onPress={save} disabled={saving} style={[styles.button,saving&&styles.disabled]}>
          <Text style={styles.buttonText}>{saving?"Saving…":"Save Plan"}</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Irrigation programme entries</Text>
        {!schedules.length?<Text>No planned irrigation records.</Text>:schedules.map(r=><View style={styles.item} key={r.irrigation_schedule_id}>
          <View style={{flex:1}}>
            <Text style={styles.itemText}>{displayDate(r.scheduled_date)} · {number(r.planned_mm)} mm</Text>
            <Text style={styles.help}>{r.status}</Text>
          </View>
          {["planned","scheduled"].includes(String(r.status).toLowerCase())?
            <Pressable onPress={()=>edit(r.irrigation_schedule_id)} style={styles.edit}><Text style={styles.editText}>Edit</Text></Pressable>:null}
        </View>)}
      </View>
    </>}
  </ScrollView>;
}
function Stat({label,value}:{label:string;value:string}){
  return <View style={styles.stat}><Text style={styles.help}>{label}</Text><Text style={styles.itemText}>{value}</Text></View>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:C.background},body:{padding:16,paddingBottom:40},
  card:{padding:16,backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,marginTop:12},
  title:{fontSize:18,fontWeight:"800",color:C.primaryDark,marginBottom:8},
  label:{fontWeight:"700",color:C.text,marginTop:10,marginBottom:5},
  help:{color:C.textSecondary,marginVertical:4},
  stats:{flexDirection:"row",flexWrap:"wrap",gap:10,marginTop:8},
  stat:{width:"47%",padding:10,backgroundColor:C.background,borderRadius:8},
  input:{borderWidth:1,borderColor:C.border,borderRadius:8,padding:12,backgroundColor:"#fff",color:C.text},
  button:{backgroundColor:C.primaryDark,alignItems:"center",padding:14,borderRadius:8,marginTop:16},
  buttonText:{color:"#fff",fontWeight:"800"},disabled:{opacity:0.5},
  item:{flexDirection:"row",alignItems:"center",paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.border},
  itemText:{fontWeight:"700",color:C.text},
  edit:{borderWidth:1,borderColor:C.primaryDark,borderRadius:8,paddingHorizontal:12,paddingVertical:9},
  editText:{fontWeight:"700",color:C.primaryDark},
  error:{color:"#b00020",marginTop:12},
});
