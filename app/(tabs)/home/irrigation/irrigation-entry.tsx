import { supabase } from "@/supabase";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import { useEffect,useMemo,useState } from "react";
import { ActivityIndicator,Alert,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
type Field={tracecode_id:number;tracecode_name:string;crop?:{crop_name:string}|null};
const pad=(n:number)=>String(n).padStart(2,"0");
const today=()=>{const d=new Date();return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join("-")};
const human=(iso:string)=>iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4);
function parseDate(v:string):string|null{
 const x=v.trim().split("/");if(x.length!==3&&x.length!==2)return null;
 const y=x.length===3?Number(x[2]):new Date().getFullYear(),m=Number(x[1]),d=Number(x[0]);
 if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||y<2000)return null;
 const date=new Date(y,m-1,d);if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)return null;
 return [y,pad(m),pad(d)].join("-");
}
function validWindow(iso:string){const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());const input=new Date(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1,Number(iso.slice(8,10)));const delta=Math.round((start.getTime()-input.getTime())/86400000);return delta>=0&&delta<=9;}
export default function IrrigationEntry(){
 const [fields,setFields]=useState<Field[]>([]),[crop,setCrop]=useState(""),[trace,setTrace]=useState(""),[date,setDate]=useState(human(today())),[mm,setMm]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 useEffect(()=>{(async()=>{
  const r=await supabase.from("tracecode").select("tracecode_id,tracecode_name,crop:crop_id(crop_name)").is("end_date",null).not("irrigation_type_id","is",null).neq("irrigation_type_id",4).order("tracecode_name");
  if(r.error)setError(r.error.message);else setFields((r.data||[]) as unknown as Field[]);setLoading(false);
 })()},[]);
 const crops=useMemo(()=>Array.from(new Set(fields.map(f=>f.crop?.crop_name||"Unknown"))).sort(),[fields]);
 const matches=fields.filter(f=>!crop||(f.crop?.crop_name||"Unknown")===crop);
 const save=async()=>{
  if(saving)return;const iso=parseDate(date),quantity=Number(mm);
  if(!iso||!validWindow(iso)){Alert.alert("Invalid date","Use DD/MM/YYYY. Today and the previous 9 days only; no future dates.");return;}
  if(!trace||!matches.some(f=>String(f.tracecode_id)===trace)){Alert.alert("Select a field","Choose an active irrigated trace.");return;}
  if(!mm.trim()||!Number.isFinite(quantity)||quantity<=0){Alert.alert("Invalid irrigation","Enter a positive amount in mm.");return;}
  setSaving(true);setError("");
  try{
   const id=Number(trace);
   const existing=await supabase.from("irrigation_applied").select("irrigation_applied_id").eq("tracecode_id",id).eq("applied_date",iso).limit(1);
   if(existing.error)throw existing.error;
   if((existing.data||[]).length){Alert.alert("Already recorded","This field already has irrigation recorded on this date. Ask management to check it rather than recording a duplicate.");return;}
   const start=iso+"T12:00:00+02:00",end=iso+"T12:01:00+02:00";
   const result=await supabase.from("irrigation_applied").insert({tracecode_id:id,applied_date:iso,start_at:start,end_at:end,mm_applied:quantity,effective_mm:quantity*0.9,notes:"Manual phone entry; start/end are placeholders, not measured"}).select("irrigation_applied_id").single();
   if(result.error)throw result.error;
   Alert.alert("Irrigation saved",human(iso)+" • "+fields.find(f=>f.tracecode_id===id)?.tracecode_name+" • "+quantity+" mm",[{text:"OK",onPress:()=>router.replace("/(tabs)/irrigation_main_dashboard")}]);
  }catch(e:any){setError(e?.message||"Save could not be verified. Check the field history before retrying.");}finally{setSaving(false);}
 };
 return <ScrollView style={s.screen} contentContainerStyle={s.body}>
  <View style={s.head}><Text style={s.title}>Record Irrigation</Text><Pressable onPress={()=>router.replace("/(tabs)/irrigation_main_dashboard")} style={s.back}><Text style={s.backText}>Back</Text></Pressable></View>
  <Text style={s.note}>Record actual irrigation only. Today or the previous 9 days.</Text>
  {loading?<ActivityIndicator color="#135c38"/>:<>
   <Text style={s.label}>Crop</Text><View style={s.pick}><Picker selectedValue={crop} onValueChange={v=>{setCrop(String(v));setTrace("");}}><Picker.Item label="Select crop" value=""/>{crops.map(x=><Picker.Item key={x} label={x} value={x}/>)}</Picker></View>
   <Text style={s.label}>Trace Code</Text><View style={s.pick}><Picker selectedValue={trace} onValueChange={v=>setTrace(String(v))}><Picker.Item label="Select trace code" value=""/>{matches.map(f=><Picker.Item key={f.tracecode_id} label={f.tracecode_name} value={String(f.tracecode_id)}/>)}</Picker></View>
   <Text style={s.label}>Date (DD/MM/YYYY)</Text><TextInput style={s.input} value={date} onChangeText={setDate} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation"/>
   <Text style={s.label}>Actual irrigation applied (mm)</Text><TextInput style={s.input} value={mm} onChangeText={setMm} placeholder="mm" keyboardType="decimal-pad"/>
   {error?<Text style={s.error}>{error}</Text>:null}
   <Pressable disabled={saving} style={[s.save,saving&&{opacity:0.6}]} onPress={save}><Text style={s.saveText}>{saving?"Saving…":"Save Irrigation"}</Text></Pressable>
  </>}
 </ScrollView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:"#f4f7f5"},body:{padding:16,paddingBottom:45},head:{backgroundColor:"#135c38",padding:16,borderRadius:9,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},title:{color:"#fff",fontSize:22,fontWeight:"800"},back:{backgroundColor:"#fff",padding:10,borderRadius:7},backText:{color:"#135c38",fontWeight:"800"},note:{marginVertical:16,color:"#53665b"},label:{color:"#234a34",fontWeight:"800",marginTop:12,marginBottom:6},pick:{backgroundColor:"#fff",borderColor:"#c7d5ca",borderWidth:1,borderRadius:8,overflow:"hidden"},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#c7d5ca",padding:13,borderRadius:8,fontSize:16},save:{backgroundColor:"#135c38",padding:15,borderRadius:8,marginTop:24,alignItems:"center"},saveText:{color:"#fff",fontWeight:"800"},error:{color:"#a21c1c",marginTop:12}});
