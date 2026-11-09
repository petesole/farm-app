import { supabase } from "@/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Field = { tracecode_id:number; tracecode_name:string; crop_id:number|null; irrigation_type_id:number|null; end_date:string|null; crop?:{crop_name:string}|null };
type Applied = { tracecode_id:number; applied_date:string; mm_applied:number; irrigation_applied_id:number };
const green="#135c38";
const dateText=(v?:string|null)=>v? v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4):"Not recorded";
export default function IrrigationMainDashboard(){
 const [fields,setFields]=useState<Field[]>([]),[latest,setLatest]=useState<Record<number,Applied>>({});
 const [crop,setCrop]=useState(""),[trace,setTrace]=useState("");
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[role,setRole]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const [fr,ar,r]=await Promise.all([
    supabase.from("tracecode").select("tracecode_id,tracecode_name,crop_id,irrigation_type_id,end_date,crop:crop_id(crop_name)").is("end_date",null).not("irrigation_type_id","is",null).neq("irrigation_type_id",4).order("tracecode_name"),
    supabase.from("irrigation_applied").select("irrigation_applied_id,tracecode_id,applied_date,mm_applied").order("applied_date",{ascending:false}).order("irrigation_applied_id",{ascending:false}).limit(5000),
    AsyncStorage.getItem("role")
   ]);
   if(fr.error)throw fr.error;if(ar.error)throw ar.error;
   setRole(String(r||"").toLowerCase());
   setFields((fr.data||[]) as unknown as Field[]);
   const last:Record<number,Applied>={};
   for(const row of (ar.data||[]) as Applied[])if(!last[row.tracecode_id])last[row.tracecode_id]=row;
   setLatest(last);
  }catch(e:any){setError(e?.message||String(e));}finally{setLoading(false);}
 },[]);
 useFocusEffect(useCallback(()=>{load();},[load]));
 const crops=useMemo(()=>Array.from(new Set(fields.map(f=>f.crop?.crop_name||"Unknown"))).sort(),[fields]);
 const available=useMemo(()=>fields.filter(f=>!crop||(f.crop?.crop_name||"Unknown")===crop),[fields,crop]);
 const shown=available.filter(f=>!trace||String(f.tracecode_id)===trace);
 const open=(id:number)=>router.push({pathname:"/(tabs)/home/irrigation/irrigation_actual",params:{tracecode_id:String(id)}});
 return <ScrollView style={s.screen} contentContainerStyle={s.container}>
  <View style={s.heading}><View><Text style={s.company}>JOHN SOLE (PVT) LTD</Text><Text style={s.title}>Irrigation Dashboard</Text></View>
   {["admin","manager"].includes(role)?<Pressable style={s.back} onPress={()=>router.replace("/(tabs)/main-dashboard")}><Text style={s.backText}>Back to Main</Text></Pressable>:null}</View>
  <View style={s.actions}><Pressable style={s.action} onPress={()=>router.push("/(tabs)/home/irrigation/irrigation-entry")}><Text style={s.actionText}>+ Record Irrigation</Text></Pressable>
   <Pressable style={s.action} onPress={()=>router.push("/(tabs)/home/irrigation/pan-entry")}><Text style={s.actionText}>+ Pan Reading</Text></Pressable></View>
  <Text style={s.section}>Active Irrigated Fields — Last Irrigation</Text>
  <Text style={s.label}>Crop</Text><View style={s.picker}><Picker selectedValue={crop} onValueChange={v=>{setCrop(String(v));setTrace("");}}><Picker.Item label="All crops" value=""/>{crops.map(c=><Picker.Item key={c} label={c} value={c}/>)}</Picker></View>
  <Text style={s.label}>Trace Code</Text><View style={s.picker}><Picker selectedValue={trace} onValueChange={v=>setTrace(String(v))}><Picker.Item label="All traces" value=""/>{available.map(f=><Picker.Item key={f.tracecode_id} label={f.tracecode_name} value={String(f.tracecode_id)}/>)}</Picker></View>
  {loading?<ActivityIndicator color={green} size="large"/>:error?<View><Text style={s.error}>{error}</Text><Pressable onPress={load}><Text>Retry</Text></Pressable></View>:shown.length===0?<Text>No active irrigated fields match.</Text>:shown.map(f=>{
   const a=latest[f.tracecode_id];return <View key={f.tracecode_id} style={s.card}>
    <View style={{flex:1}}><Text style={s.trace}>{f.tracecode_name}</Text><Text style={s.crop}>{f.crop?.crop_name||"Crop not assigned"}</Text><Text style={s.detail}>Last: {dateText(a?.applied_date)}   •   {a?Number(a.mm_applied).toLocaleString()+" mm":"—"}</Text></View>
    <Pressable style={s.open} onPress={()=>open(f.tracecode_id)}><Text style={s.openText}>Open</Text></Pressable>
   </View>})}
  <Pressable onPress={load} style={s.refresh}><Text style={s.refreshText}>Refresh</Text></Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#f4f7f5"},container:{padding:16,paddingBottom:60},
 heading:{backgroundColor:green,padding:16,borderRadius:10,flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8},
 company:{color:"#dcece3",fontSize:11,fontWeight:"700"},title:{color:"#fff",fontSize:22,fontWeight:"800"},
 back:{backgroundColor:"#fff",borderRadius:8,padding:9},backText:{color:green,fontWeight:"700"},
 actions:{flexDirection:"row",flexWrap:"wrap",gap:8,marginVertical:16},action:{backgroundColor:green,padding:13,borderRadius:8},actionText:{color:"#fff",fontWeight:"800"},
 section:{fontWeight:"800",fontSize:17,color:green,marginVertical:10},label:{fontWeight:"700",marginBottom:4,color:"#263d31"},
 picker:{borderWidth:1,borderColor:"#bdcdc1",borderRadius:8,backgroundColor:"#fff",marginBottom:10,overflow:"hidden"},
 card:{padding:14,backgroundColor:"#fff",borderWidth:1,borderColor:"#d6e3d8",borderRadius:10,marginTop:8,flexDirection:"row",alignItems:"center",gap:8},
 trace:{fontSize:17,fontWeight:"800",color:green},crop:{fontSize:12,color:"#50655a",marginTop:3},detail:{fontSize:13,color:"#1f3329",marginTop:7},
 open:{backgroundColor:green,borderRadius:7,paddingHorizontal:16,paddingVertical:11},openText:{color:"#fff",fontWeight:"800"},
 error:{color:"#a21a1a",padding:12},refresh:{alignSelf:"center",padding:12,marginTop:12},refreshText:{color:green,fontWeight:"700"}
});