import {useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from "react-native";
import {Redirect,router,useLocalSearchParams} from "expo-router";
import {supabase} from "@/supabase";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {controlFor,dateDisplay,dateInput} from "@/lib/fieldControls";
import {jsplColors as C,jsplSpacing as S,jsplRadii as R} from "@/constants/jspl-design";
export default function FieldControlDetail(){
 const {kind,id,mode}=useLocalSearchParams<{kind?:string;id?:string;mode?:string}>();
 const def=controlFor(kind);
 const isNew=mode==="new";
 const recordId=!isNew&&id&&Number.isSafeInteger(Number(id))?Number(id):null;
 const [allowed,setAllowed]=useState<boolean|null>(null),[values,setValues]=useState<Record<string,string>>({}),[active,setActive]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{setValues({});setActive(true);setError("");(async()=>{
  const {data:u,error:ue}=await supabase.auth.getUser();if(ue||!u.user){setAllowed(false);return;}
  const {data:r,error:e}=await supabase.rpc("my_farm_app_roles");
  const admin=!e&&Array.isArray(r)&&r.some((x:string)=>String(x).trim().toLowerCase()==="admin");setAllowed(admin);
  if(!admin||!def||!recordId)return;
  const {data,error:readError}=await supabase.from(def.table).select("*").eq(def.id,recordId).single();
  if(readError){setError(readError.message);return;}
  const draft:Record<string,string>={};
  for(const field of def.fields)draft[field.key]=field.type==="date"?dateDisplay(data[field.key]):String(data[field.key]??"");
  setValues(draft);setActive(data.active!==false);
 })()},[kind,recordId,isNew]);
 async function save(){
  if(!def)return;
  const payload:Record<string,unknown>={active};
  for(const f of def.fields){
   const raw=(values[f.key]??"").trim();
   if(f.required&&!raw){setError(f.label+" is required.");return;}
   if(f.type==="number"&&raw&& !Number.isFinite(Number(raw))){setError("Invalid "+f.label);return;}
   if(f.type==="date"&&raw&&!dateInput(raw)){setError(f.label+" must be dd/mm/yyyy.");return;}
   payload[f.key]=f.type==="number"?(raw===""?null:Number(raw)):f.type==="date"?dateInput(raw):raw||null;
  }
  if(def.table==="rain_gauge"&&payload.active_from&&payload.active_to&&String(payload.active_to)<String(payload.active_from)){setError("Active to cannot be before Active from.");return;}
  setBusy(true);setError("");
  const q=recordId?await supabase.from(def.table).update(payload).eq(def.id,recordId).select(def.id):await supabase.from(def.table).insert(payload).select(def.id);
  setBusy(false);
  if(q.error||!q.data?.length){setError(q.error?.message??"No changes saved. Check permissions.");return;}
  router.replace({pathname:"/(tabs)/field-control-list",params:{kind:def.table}});
 }
 if(!def)return <Redirect href="/(tabs)/fields-control"/>;
 if(allowed===null)return <ActivityIndicator/>;
 if(!allowed)return <Redirect href="/(tabs)/fuel"/>;
 return <ScrollView contentContainerStyle={s.page}>
  <JsplModuleHeader title={(recordId?"Edit ":"Add ")+def.title} showMain/>
  <Pressable onPress={()=>router.replace({pathname:"/(tabs)/field-control-list",params:{kind:def.table}})} style={s.back}><Text style={s.link}>← {def.title} List</Text></Pressable>
  {def.fields.map(f=><View key={f.key} style={s.group}><Text style={s.label}>{f.label}{f.required?" *":""}</Text><TextInput style={s.input} keyboardType={f.type==="number"?"numeric":"default"} placeholder={f.type==="date"?"dd/mm/yyyy":f.label} value={values[f.key]??""} onChangeText={v=>setValues(prev=>({...prev,[f.key]:v}))}/></View>)}
  <View style={s.row}><Text style={s.label}>Active</Text><Switch value={active} onValueChange={setActive}/></View>
  {!!error&&<Text style={s.error}>{error}</Text>}
  <Pressable disabled={busy} style={s.save} onPress={save}><Text style={s.saveText}>{busy?"Saving...":"Save"}</Text></Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:S.xl,backgroundColor:C.background,flexGrow:1},back:{marginBottom:S.lg},link:{color:C.primary,fontWeight:"700"},group:{marginBottom:S.md},label:{fontWeight:"700",color:C.text,marginBottom:S.xs},input:{borderWidth:1,borderColor:C.border,borderRadius:R.md,backgroundColor:C.surface,padding:S.md},row:{flexDirection:"row",alignItems:"center",gap:S.md},save:{padding:S.lg,backgroundColor:C.primary,borderRadius:R.md,marginTop:S.xl,alignItems:"center"},saveText:{color:C.surface,fontWeight:"700"},error:{color:C.danger,marginTop:S.md}});
