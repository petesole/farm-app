import { supabase } from "@/supabase";
import { router } from "expo-router";
import { useEffect,useState } from "react";
import { Alert,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
const pad=(x:number)=>String(x).padStart(2,"0");
const today=()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
const human=(s:string)=>s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4);
const parse=(v:string)=>{const m=/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(v.trim());if(!m)return null;const y=m[3]?+m[3]:new Date().getFullYear(),mo=+m[2],d=+m[1];const dt=new Date(y,mo-1,d);return dt.getFullYear()===y&&dt.getMonth()===mo-1&&dt.getDate()===d?y+"-"+pad(mo)+"-"+pad(d):null;};
export default function PanEntry(){
 const [date,setDate]=useState(human(today())),[reading,setReading]=useState(""),[last,setLast]=useState<{irrigation_pan_date:string;irrigation_pan_reading:number}|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState("");
 useEffect(()=>{supabase.from("irrigation_pan").select("irrigation_pan_date,irrigation_pan_reading").order("irrigation_pan_date",{ascending:false}).limit(1).then(({data})=>setLast(data?.[0]||null));},[]);
 const save=async()=>{
  if(saving)return;
  const iso=parse(date),mm=Number(reading);if(!iso||iso>today()){Alert.alert("Invalid date","Enter a valid date, not in the future.");return;}
  if(!reading.trim()||!Number.isFinite(mm)||mm<0){Alert.alert("Invalid reading","Enter a valid pan reading in mm (zero is allowed).");return;}
  setSaving(true);setError("");
  try{
   const exists=await supabase.from("irrigation_pan").select("irrigation_pan_id").eq("irrigation_pan_date",iso).limit(1);
   if(exists.error)throw exists.error;
   if(exists.data?.length){Alert.alert("Reading exists","A pan reading is already recorded for this date. Ask management to correct it.");return;}
   const r=await supabase.from("irrigation_pan").insert({irrigation_pan_date:iso,irrigation_pan_reading:mm}).select("irrigation_pan_id").single();
   if(r.error)throw r.error;
   Alert.alert("Pan reading saved",human(iso)+" • "+mm+" mm",[{text:"OK",onPress:()=>router.replace("/(tabs)/irrigation_main_dashboard")}]);
  }catch(e:any){setError(e?.message||"Could not confirm save. Check before retrying.");}finally{setSaving(false);}
 };
 return <ScrollView style={s.screen} contentContainerStyle={s.body}>
 <View style={s.head}><Text style={s.title}>Daily Pan Reading</Text><Pressable style={s.back} onPress={()=>router.replace("/(tabs)/irrigation_main_dashboard")}><Text style={s.backText}>Back</Text></Pressable></View>
 {last?<View style={s.info}><Text style={s.label}>Latest saved reading</Text><Text>{human(last.irrigation_pan_date)} · {last.irrigation_pan_reading} mm</Text></View>:null}
 <Text style={s.label}>Date (DD/MM/YYYY)</Text><TextInput style={s.input} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation"/>
 <Text style={s.label}>Pan evaporation (mm)</Text><TextInput style={s.input} value={reading} onChangeText={setReading} keyboardType="decimal-pad" placeholder="mm"/>
 {error?<Text style={s.error}>{error}</Text>:null}
 <Pressable disabled={saving} onPress={save} style={[s.save,saving&&{opacity:0.6}]}><Text style={s.saveText}>{saving?"Saving…":"Save Pan Reading"}</Text></Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:"#f4f7f5"},body:{padding:16,paddingBottom:50},head:{backgroundColor:"#135c38",padding:16,borderRadius:8,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},title:{color:"#fff",fontWeight:"800",fontSize:20},back:{padding:10,backgroundColor:"#fff",borderRadius:8},backText:{color:"#135c38",fontWeight:"800"},info:{backgroundColor:"#fff",padding:12,marginTop:18,borderRadius:8},label:{fontWeight:"800",color:"#254a35",marginTop:18,marginBottom:6},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#c8d7ce",borderRadius:8,padding:13,fontSize:16},error:{color:"#ac1717",marginTop:14},save:{backgroundColor:"#135c38",padding:15,borderRadius:8,alignItems:"center",marginTop:22},saveText:{color:"#fff",fontWeight:"800"}});
