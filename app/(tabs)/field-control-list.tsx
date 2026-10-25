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
 useEffect(()=>{if(!allowed||!def)return;let valid=true;(async()=>{const {data,error:e}=await supabase.from(def.table).select("*").order(def.name);if(!valid)return;if(e)setError(e.message);else{setError("");setRows((data||[]).filter((item:Record<string,any>) => item != null && item[def.id] != null && typeof item[def.name] === "string" && item[def.name].trim().length > 0));}})();return()=>{valid=false};},[allowed,kind]);
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
 const filtered=rows.filter(x=>x != null && x[def.id] != null && typeof x[def.name] === "string" && x[def.name].trim().length > 0 && (showInactive||x.active!==false));
 return <ScrollView contentContainerStyle={s.page}>
  <JsplModuleHeader title={def.title} showMain/>
  <Pressable onPress={()=>router.replace(def.table==="crop"?"/(tabs)/control-panel":"/(tabs)/fields-control")} style={s.back}><Text style={s.link}>{def.table==="crop"?"← Control Panel":"← Fields Control"}</Text></Pressable>
  <Pressable style={s.primary} onPress={()=>router.push({pathname:"/(tabs)/field-control-detail",params:{kind:def.table,mode:"new"}})}><Text style={s.primaryText}>+ Add New {def.title}</Text></Pressable>
  <View style={s.row}><Text style={s.label}>Show inactive</Text><Switch value={showInactive} onValueChange={setShowInactive}/></View>
  {!!error&&<Text style={{color:C.danger}}>{error}</Text>}
  <Text style={s.muted}>{filtered.length} of {rows.length} records</Text>
  <View style={s.listHeader}><Text style={s.listHeaderTitle}>{def.title}</Text><Text style={s.listHeaderStatus}>Active</Text><Text style={s.listHeaderEdit}> </Text></View>
  {filtered.map(x=><View key={String(x[def.id])} style={s.item}>
   <Text style={s.title} numberOfLines={2}>{String(x[def.name]).trim()}</Text>
   <Switch value={x.active!==false} onValueChange={()=>void toggleActive(x)} trackColor={{false:"#CBD5E1",true:"#16803C"}} thumbColor="#FFFFFF"/>
   <Pressable style={s.edit} onPress={()=>router.push({pathname:"/(tabs)/field-control-detail",params:{kind:def.table,id:String(x[def.id]),mode:"edit"}})}><Text style={s.link}>Edit</Text></Pressable>
  </View>)}
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:S.xl,flexGrow:1,backgroundColor:C.background},back:{marginBottom:S.lg},link:{color:C.primary,fontWeight:"700"},primary:{backgroundColor:C.primary,padding:S.lg,alignSelf:"flex-start",borderRadius:R.md,marginBottom:S.lg},primaryText:{color:"white",fontWeight:"700"},row:{flexDirection:"row",gap:S.md,alignItems:"center",marginBottom:S.lg},label:{color:C.text,fontWeight:"600"},muted:{color:C.textSecondary,marginVertical:S.xs},item:{flexDirection:"row",alignItems:"center",minHeight:52,padding:S.md,backgroundColor:"#FFFFFF",borderBottomWidth:1,borderColor:C.border},title:{flex:1,minWidth:160,color:"#1F2937",fontWeight:"700",fontSize:15,flexShrink:1,paddingRight:S.md},listHeader:{flexDirection:"row",alignItems:"center",backgroundColor:C.primaryDark,padding:S.md},listHeaderTitle:{flex:1,color:"#fff",fontWeight:"700"},listHeaderStatus:{color:"#fff",width:56,textAlign:"center"},listHeaderEdit:{width:52},edit:{padding:S.md}});
