import {useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from "react-native";
import {Picker} from "@react-native-picker/picker";
import {Redirect,router,useFocusEffect} from "expo-router";
import {supabase} from "@/supabase";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {jsplColors as C,jsplSpacing as S,jsplRadii as R} from "@/constants/jspl-design";
type Vehicle={vehicle_id:number;vehicle_name:string;vehicle_model:string|null;vehicle_discontinued:boolean;vehicle_type_id:number|null;vehicle_type?:{type_name:string}|null};
type Type={vehicle_type_id:number;type_name:string};
export default function VehicleManagement(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[rows,setRows]=useState<Vehicle[]>([]),[types,setTypes]=useState<Type[]>([]);
 const [typeFilter,setTypeFilter]=useState<number|null>(null),[showInactive,setShowInactive]=useState(false),[search,setSearch]=useState(""),[error,setError]=useState("");
 const load=useCallback(async()=>{
  const [v,t]=await Promise.all([supabase.from("vehicle").select("vehicle_id,vehicle_name,vehicle_model,vehicle_discontinued,vehicle_type_id").order("vehicle_name"),supabase.from("vehicle_type").select("vehicle_type_id,type_name").order("type_name")]);
  if(v.error||t.error){setError(v.error?.message||t.error?.message||"Loading failed");return;}
  setRows((v.data||[]) as Vehicle[]);setTypes((t.data||[]) as Type[]);
 },[]);
 useEffect(()=>{(async()=>{const {data:u,error:ue}=await supabase.auth.getUser();if(ue||!u.user){setAllowed(false);return;}const {data:r,error:e}=await supabase.rpc("my_farm_app_roles");setAllowed(!e&&Array.isArray(r)&&r.some((x:string)=>String(x).trim().toLowerCase()==="admin"));})()},[]);
 useFocusEffect(useCallback(()=>{if(allowed)void load();},[allowed,load]));
 if(allowed===null)return <ActivityIndicator/>;
 if(!allowed)return <Redirect href="/(tabs)/fuel"/>;
 const filtered=rows.filter(v=>(showInactive||!v.vehicle_discontinued)&&(typeFilter===null||v.vehicle_type_id===typeFilter)&&v.vehicle_name.toLowerCase().includes(search.toLowerCase()));
 return <ScrollView contentContainerStyle={styles.page}>
  <JsplModuleHeader title="Vehicle Management" showMain />
  <Pressable onPress={()=>router.replace("/(tabs)/control-panel")} style={styles.link}><Text style={styles.linkText}>← Control Panel</Text></Pressable>
  <Pressable style={styles.add} onPress={()=>router.push({pathname:"/(tabs)/vehicle-detail",params:{mode:"create"}})}><Text style={styles.addText}>+ Add Vehicle</Text></Pressable>
  <Text style={styles.label}>Filter by vehicle type</Text>
  <View style={styles.picker}><Picker selectedValue={typeFilter} onValueChange={v=>setTypeFilter(v==null?null:Number(v))}><Picker.Item label="All vehicle types" value={null}/>{types.map(t=><Picker.Item key={t.vehicle_type_id} label={t.type_name} value={t.vehicle_type_id}/>)}</Picker></View>
  <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Search vehicles"/>
  <View style={styles.row}><Text style={styles.label}>Show discontinued</Text><Switch value={showInactive} onValueChange={setShowInactive}/></View>
  {!!error&&<Text style={{color:C.danger}}>{error}</Text>}
  <Text style={styles.count}>{filtered.length} vehicles</Text>
  {filtered.map(v=><View key={v.vehicle_id} style={styles.item}><View style={{flex:1}}><Text style={styles.name}>{v.vehicle_name}</Text><Text style={styles.info}>{types.find(t=>t.vehicle_type_id===v.vehicle_type_id)?.type_name||"Unassigned type"} · {v.vehicle_discontinued?"Discontinued":"Active"}</Text></View><Pressable style={styles.edit} onPress={()=>router.push({pathname:"/(tabs)/vehicle-detail",params:{mode:"edit",id:String(v.vehicle_id)}})}><Text style={styles.linkText}>Edit</Text></Pressable></View>)}
 </ScrollView>;
}
const styles=StyleSheet.create({page:{padding:S.xl,backgroundColor:C.background,flexGrow:1},link:{marginBottom:S.lg},linkText:{color:C.primary,fontWeight:"700"},add:{backgroundColor:C.primary,borderRadius:R.md,padding:S.lg,alignSelf:"flex-start",marginBottom:S.lg},addText:{color:"#fff",fontWeight:"700"},label:{fontWeight:"700",color:C.text,marginBottom:S.sm},picker:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:R.md,marginBottom:S.md},input:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:R.md,padding:S.md,marginBottom:S.md},row:{flexDirection:"row",alignItems:"center",gap:S.md,marginBottom:S.lg},count:{color:C.textSecondary,marginBottom:S.sm},item:{backgroundColor:C.surface,borderBottomWidth:1,borderColor:C.border,padding:S.md,flexDirection:"row",alignItems:"center",gap:S.md},name:{fontWeight:"700",color:C.text},info:{color:C.textSecondary,marginTop:4},edit:{padding:S.sm}});
