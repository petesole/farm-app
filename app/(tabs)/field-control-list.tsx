import {useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Switch,Text,View} from "react-native";
import {Redirect,router,useLocalSearchParams} from "expo-router";
import {supabase} from "@/supabase";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {controlFor} from "@/lib/fieldControls";
import {jsplColors as C,jsplSpacing as S,jsplRadii as R} from "@/constants/jspl-design";
export default function FieldControlList(){
 const {kind}=useLocalSearchParams<{kind?:string}>();
 const def=controlFor(kind);
 const [allowed,setAllowed]=useState<boolean|null>(null),[rows,setRows]=useState<Record<string,any>[]>([]),[showInactive,setShowInactive]=useState(false),[error,setError]=useState("");
 useEffect(()=>{(async()=>{const {data:u,error:ue}=await supabase.auth.getUser();if(ue||!u.user){setAllowed(false);return;}const {data:r,error:e}=await supabase.rpc("my_farm_app_roles");setAllowed(!e&&Array.isArray(r)&&r.some((x:string)=>String(x).trim().toLowerCase()==="admin"));})()},[]);
 useEffect(()=>{if(!allowed||!def)return;let valid=true;(async()=>{const {data,error:e}=await supabase.from(def.table).select("*").order(def.name);if(!valid)return;if(e)setError(e.message);else{setError("");setRows(data||[]);}})();return()=>{valid=false};},[allowed,kind]);
 if(!def)return <Redirect href="/(tabs)/fields-control"/>;
 if(allowed===null)return <ActivityIndicator/>;
 if(!allowed)return <Redirect href="/(tabs)/fuel"/>;
 async function toggleActive(item:Record<string,any>){
  if(!def)return;
  const next=item.active===false;
  const {data,error:e}=await supabase.from(def.table).update({active:next}).eq(def.id,item[def.id]).select(def.id);
  if(e||!data?.length){setError(e?.message??"Could not change status.");return;}
  setRows(old=>old.map(x=>x[def.id]===item[def.id]?{...x,active:next}:x));
 }
 const filtered=rows.filter(x=>showInactive||x.active!==false);
 return <ScrollView contentContainerStyle={s.page}>
  <JsplModuleHeader title={def.title} showMain/>
  <Pressable onPress={()=>router.replace("/(tabs)/fields-control")} style={s.back}><Text style={s.link}>← Fields Control</Text></Pressable>
  <Pressable style={s.primary} onPress={()=>router.push({pathname:"/(tabs)/field-control-detail",params:{kind:def.table,mode:"new"}})}><Text style={s.primaryText}>+ Add New {def.title}</Text></Pressable>
  <View style={s.row}><Text style={s.label}>Show inactive</Text><Switch value={showInactive} onValueChange={setShowInactive}/></View>
  {!!error&&<Text style={{color:C.danger}}>{error}</Text>}
  <Text style={s.muted}>{filtered.length} of {rows.length} records</Text>
  {filtered.map(x=><View key={String(x[def.id])} style={s.item}>
   <View style={{flex:1}}><Text style={s.title}>{String(x[def.name]??"")}</Text><Text style={s.muted}>{x.active===false?"Inactive":"Active"}</Text></View>
   <Text style={s.muted}>Active</Text><Switch value={x.active!==false} onValueChange={()=>void toggleActive(x)}/>
   <Pressable style={s.edit} onPress={()=>router.push({pathname:"/(tabs)/field-control-detail",params:{kind:def.table,id:String(x[def.id]),mode:"edit"}})}><Text style={s.link}>Edit</Text></Pressable>
  </View>)}
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:S.xl,flexGrow:1,backgroundColor:C.background},back:{marginBottom:S.lg},link:{color:C.primary,fontWeight:"700"},primary:{backgroundColor:C.primary,padding:S.lg,alignSelf:"flex-start",borderRadius:R.md,marginBottom:S.lg},primaryText:{color:"white",fontWeight:"700"},row:{flexDirection:"row",gap:S.md,alignItems:"center",marginBottom:S.lg},label:{color:C.text,fontWeight:"600"},muted:{color:C.textSecondary,marginVertical:S.xs},item:{flexDirection:"row",alignItems:"center",padding:S.md,backgroundColor:C.surface,borderBottomWidth:1,borderColor:C.border},title:{color:C.text,fontWeight:"700"},edit:{padding:S.md}});
