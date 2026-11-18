import { supabase } from "@/supabase";
import { verifiedIrrigationRoles } from "@/utils/irrigation-access";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { jsplColors as C } from "@/constants/jspl-design";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

function todayDmy() {
  const d = new Date();
  return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
}
function parseDate(input: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(input.trim());
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]), year = m[3] ? Number(m[3]) : new Date().getFullYear();
  const candidate = new Date(year, month-1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth()+1 !== month || candidate.getDate() !== day) return null;
  return year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
}
function recent(iso: string) {
  const current = new Date(), entered = new Date(iso+"T12:00:00");
  const first = new Date(current.getFullYear(),current.getMonth(),current.getDate()-9);
  const last = new Date(current.getFullYear(),current.getMonth(),current.getDate()+1);
  return entered >= first && entered < last;
}
export default function AddPanReading() {
  const [allowed,setAllowed] = useState(false);
  const [checking,setChecking] = useState(true);
  const [date,setDate] = useState(todayDmy());
  const [mm,setMm] = useState("");
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const back = () => router.replace("/(tabs)/home/irrigation/pan-readings");
  useEffect(() => { let alive = true;
    void verifiedIrrigationRoles(supabase).then(roles => {
      if(alive){setAllowed(roles.includes("admin") || roles.includes("irrigation"));setChecking(false);}
    });
    return () => {alive=false;};
  }, []);
  const save = async () => {
    if(!allowed || saving)return;
    const iso = parseDate(date), value = Number(mm);
    if(!iso || !recent(iso)) return Alert.alert("Invalid date","Enter a date within the last 10 calendar days, including today.");
    if(!mm.trim() || !Number.isFinite(value) || value < 0 || value > 30)
      return Alert.alert("Invalid reading","Enter the pan reading in millimetres (0–30).");
    setSaving(true);setError("");
    try {
      const {data: exists,error:lookupError} = await supabase.from("irrigation_pan")
        .select("irrigation_pan_id").eq("irrigation_pan_date",iso).limit(1);
      if(lookupError)throw lookupError;
      if(exists?.length){setError("A pan reading is already recorded for this date. Ask Admin to correct it.");return;}
      const {error:saveError} = await supabase.from("irrigation_pan")
        .insert({irrigation_pan_date:iso,irrigation_pan_reading:value});
      if(saveError)throw saveError;
      back();
    }catch(e:any){setError(e?.message ?? "Could not save the reading.");}
    finally{setSaving(false);}
  };
  return <View style={styles.screen}>
    <JsplModuleHeader title="Add Pan Reading" backLabel="Back to Pan Readings" onBack={back}/>
    {checking ? <ActivityIndicator style={{marginTop:30}}/> :
     !allowed ? <Text style={styles.error}>Irrigation access is not assigned to this account.</Text> :
     <View style={styles.form}>
       <Text style={styles.label}>Reading date (DD/MM/YYYY)</Text>
       <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="DD/MM/YYYY" />
       <Text style={styles.label}>Pan reading (mm)</Text>
       <TextInput style={styles.input} value={mm} onChangeText={setMm} keyboardType="decimal-pad" placeholder="mm" />
       <Text style={styles.note}>You may enter readings for the last 10 calendar days. Previous readings remain in the historical list.</Text>
       {error ? <Text style={styles.error}>{error}</Text> : null}
       <Pressable style={[styles.button,saving&&styles.disabled]} disabled={saving} onPress={save}>
         <Text style={styles.buttonText}>{saving ? "Saving…" : "Save Pan Reading"}</Text>
       </Pressable>
     </View>}
  </View>;
}
const styles=StyleSheet.create({
 screen:{flex:1,padding:16,backgroundColor:C.background},
 form:{marginTop:16,padding:18,borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:"#fff"},
 label:{color:C.text,fontWeight:"700",marginTop:12,marginBottom:6},
 input:{borderWidth:1,borderColor:C.border,borderRadius:8,padding:12,color:C.text,backgroundColor:"#fff"},
 note:{color:C.textSecondary,marginTop:16},
 error:{color:"#b00020",marginTop:12},
 button:{backgroundColor:C.primaryDark,marginTop:18,padding:14,borderRadius:8,alignItems:"center"},
 buttonText:{color:"#fff",fontWeight:"800"},
 disabled:{opacity:0.5},
});
