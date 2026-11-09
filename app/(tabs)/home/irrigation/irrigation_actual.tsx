import { supabase } from "@/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { router,useLocalSearchParams } from "expo-router";
import { useCallback,useState } from "react";
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,View } from "react-native";
type RecordRow={irrigation_applied_id:number;applied_date:string;mm_applied:number};
const format=(d:string)=>d?d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4):"—";
export default function IrrigationHistory(){
 const {tracecode_id}=useLocalSearchParams<{tracecode_id:string}>();
 const id=Number(tracecode_id);
 const [name,setName]=useState(""),[rows,setRows]=useState<RecordRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!Number.isInteger(id)||id<=0){setError("Invalid trace code");setLoading(false);return;}
  setLoading(true);setError("");
  const [tr,ar]=await Promise.all([supabase.from("tracecode").select("tracecode_name").eq("tracecode_id",id).single(),
   supabase.from("irrigation_applied").select("irrigation_applied_id,applied_date,mm_applied").eq("tracecode_id",id).order("applied_date",{ascending:false}).order("irrigation_applied_id",{ascending:false})]);
  if(tr.error||ar.error)setError(tr.error?.message||ar.error?.message||"Unable to load history");
  else{setName(tr.data?.tracecode_name||"");setRows((ar.data||[]) as RecordRow[]);}
  setLoading(false);
 },[id]);
 useFocusEffect(useCallback(()=>{load();},[load]));
 return <ScrollView style={s.screen} contentContainerStyle={s.body}>
  <View style={s.head}><View><Text style={s.small}>IRRIGATION HISTORY · VIEW ONLY</Text><Text style={s.title}>{name||"Field history"}</Text></View>
   <Pressable style={s.back} onPress={()=>router.replace("/(tabs)/irrigation_main_dashboard")}><Text style={s.backText}>Back</Text></Pressable></View>
  {loading?<ActivityIndicator style={{marginTop:22}} color="#135c38"/>:error?<Text style={s.error}>{error}</Text>:<>
   <Text style={s.total}>Total applied: {rows.reduce((sum,r)=>sum+Number(r.mm_applied||0),0).toFixed(1)} mm</Text>
   {rows.length===0?<Text>No irrigation recorded for this field.</Text>:rows.map(r=><View style={s.row} key={r.irrigation_applied_id}>
    <Text style={s.date}>{format(r.applied_date)}</Text><Text style={s.mm}>{Number(r.mm_applied).toFixed(1)} mm</Text>
   </View>)}
  </>}
 </ScrollView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:"#f4f7f5"},body:{padding:16,paddingBottom:50},
head:{backgroundColor:"#135c38",borderRadius:10,padding:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
small:{fontSize:11,color:"#d4eadd",fontWeight:"700"},title:{fontSize:22,color:"#fff",fontWeight:"800",marginTop:4},
back:{padding:10,backgroundColor:"#fff",borderRadius:8},backText:{color:"#135c38",fontWeight:"700"},
total:{fontWeight:"800",fontSize:16,color:"#135c38",marginVertical:18},
row:{backgroundColor:"#fff",padding:14,borderBottomWidth:1,borderColor:"#e3e8e4",flexDirection:"row",justifyContent:"space-between"},
date:{fontWeight:"600"},mm:{fontWeight:"800",color:"#135c38"},error:{color:"#a11",marginTop:16}});
