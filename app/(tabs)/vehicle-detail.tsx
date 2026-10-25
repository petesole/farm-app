import {useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from "react-native";
import {Picker} from "@react-native-picker/picker";
import {Redirect,router,useLocalSearchParams} from "expo-router";
import {supabase} from "@/supabase";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {jsplColors as C,jsplSpacing as S,jsplRadii as R} from "@/constants/jspl-design";

type Ref={id:number;label:string};
type Vehicle={vehicle_id:number;vehicle_name:string;vehicle_model:string|null;vehicle_assignment_id:number|null;tractor_size:number|null;consumption:number|null;vehicle_discontinued:boolean;has_meter:boolean;meter_type:string|null;vehicle_type_id:number|null;tractor_class_id:number|null};
export default function VehicleDetail(){
 const {id}=useLocalSearchParams<{id?:string}>();
 const vehicleId=id && id!=="new"?Number(id):null;
 const [allowed,setAllowed]=useState<boolean|null>(null);
 const [types,setTypes]=useState<Ref[]>([]),[assignments,setAssignments]=useState<Ref[]>([]),[classes,setClasses]=useState<Ref[]>([]);
 const [row,setRow]=useState<Partial<Vehicle>>({vehicle_name:"",vehicle_model:"",vehicle_discontinued:false,has_meter:false,meter_type:null,vehicle_type_id:null,vehicle_assignment_id:null,tractor_class_id:null,tractor_size:null,consumption:null});
 const [size,setSize]=useState(""),[consumption,setConsumption]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{(async()=>{
  const {data:u,error:ue}=await supabase.auth.getUser();
  if(ue||!u.user){setAllowed(false);return;}
  const {data:roles,error:re}=await supabase.rpc("my_farm_app_roles");
  const admin=!re&&Array.isArray(roles)&&roles.some((v:string)=>String(v).toLowerCase()==="admin");
  setAllowed(admin);if(!admin)return;
  const [t,a,c,v]=await Promise.all([
   supabase.from("vehicle_type").select("vehicle_type_id,type_name").order("type_name"),
   supabase.from("vehicle_assignment").select("vehicle_assignment_id,vehicle_assignment").order("vehicle_assignment"),
   supabase.from("tractor_class").select("tractor_class_id,class_name").order("sort_order"),
   vehicleId?supabase.from("vehicle").select("*").eq("vehicle_id",vehicleId).single():Promise.resolve({data:null,error:null})
  ]);
  if(t.error||a.error||c.error||v.error){setError(t.error?.message||a.error?.message||c.error?.message||v.error?.message||"Lookup failed");return;}
  setTypes((t.data||[]).map(x=>({id:Number(x.vehicle_type_id),label:x.type_name})));
  setAssignments((a.data||[]).map(x=>({id:Number(x.vehicle_assignment_id),label:x.vehicle_assignment})));
  setClasses((c.data||[]).map(x=>({id:Number(x.tractor_class_id),label:x.class_name})));
  if(v.data){setRow(v.data as Vehicle);setSize(v.data.tractor_size==null?"":String(v.data.tractor_size));setConsumption(v.data.consumption==null?"":String(v.data.consumption));}
 })()},[vehicleId]);
 const set=(key:keyof Vehicle,value:any)=>setRow(old=>({...old,[key]:value}));
 async function save(){
  if(!row.vehicle_name?.trim()){setError("Vehicle name is required.");return;}
  const numberOrNull=(v:string)=>v.trim()===""?null:Number(v);
  if((size.trim()&&!Number.isFinite(Number(size)))||(consumption.trim()&&!Number.isFinite(Number(consumption)))){setError("Enter valid numeric values.");return;}
  setBusy(true);setError("");
  const payload={vehicle_name:row.vehicle_name.trim(),vehicle_model:row.vehicle_model?.trim()||null,
   vehicle_assignment_id:row.vehicle_assignment_id??null,tractor_size:numberOrNull(size),consumption:numberOrNull(consumption),
   vehicle_discontinued:!!row.vehicle_discontinued,has_meter:!!row.has_meter,meter_type:row.has_meter?(row.meter_type||"HOURS"):null,
   vehicle_type_id:row.vehicle_type_id??null,tractor_class_id:row.tractor_class_id??null};
  const response=vehicleId?await supabase.from("vehicle").update(payload).eq("vehicle_id",vehicleId).select("vehicle_id"):await supabase.from("vehicle").insert(payload).select("vehicle_id");
  setBusy(false);
  if(response.error){setError(response.error.message);return;}
  if(!response.data?.length){setError("Not saved. Check database permissions.");return;}
  router.replace("/(tabs)/vehicle-management");
 }
 if(allowed===null)return <ActivityIndicator/>;
 if(!allowed)return <Redirect href="/(tabs)/fuel"/>;
 const picker=(label:string,value:number|null|undefined,onChange:(n:number|null)=>void,items:Ref[])=><View style={styles.group}><Text style={styles.label}>{label}</Text><View style={styles.picker}><Picker selectedValue={value??null} onValueChange={(v)=>onChange(v==null?null:Number(v))}><Picker.Item label={"Select "+label} value={null}/>{items.map(t=><Picker.Item key={t.id} label={t.label} value={t.id}/>)}</Picker></View></View>;
 const input=(label:string,value:string,onChange:(s:string)=>void,keyboardType:"default"|"numeric"="default")=><View style={styles.group}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboardType}/></View>;
 return <ScrollView contentContainerStyle={styles.page}>
  <JsplModuleHeader title={vehicleId?"Edit Vehicle":"Add Vehicle"} showMain />
  <Pressable onPress={()=>router.replace("/(tabs)/vehicle-management")} style={styles.back}><Text style={styles.backText}>← Vehicle Management</Text></Pressable>
  {input("Vehicle name",row.vehicle_name||"",v=>set("vehicle_name",v))}
  {input("Vehicle model",row.vehicle_model||"",v=>set("vehicle_model",v))}
  {picker("Vehicle type",row.vehicle_type_id,v=>set("vehicle_type_id",v),types)}
  {picker("Vehicle assignment",row.vehicle_assignment_id,v=>set("vehicle_assignment_id",v),assignments)}
  {picker("Tractor class",row.tractor_class_id,v=>set("tractor_class_id",v),classes)}
  {input("Tractor size",size,setSize,"numeric")}
  {input("Consumption",consumption,setConsumption,"numeric")}
  <View style={styles.line}><Text>Has meter</Text><Switch value={!!row.has_meter} onValueChange={v=>{set("has_meter",v);if(!v)set("meter_type",null);else if(!row.meter_type)set("meter_type","HOURS");}} /></View>
  {row.has_meter&&<View style={styles.line}><Text>Meter type</Text><View style={{width:180}}><Picker selectedValue={row.meter_type||"HOURS"} onValueChange={v=>set("meter_type",v)}><Picker.Item label="Hours" value="HOURS"/><Picker.Item label="Kilometres" value="KM"/></Picker></View></View>}
  <View style={styles.line}><Text>Discontinued</Text><Switch value={!!row.vehicle_discontinued} onValueChange={v=>set("vehicle_discontinued",v)}/></View>
  {!!error&&<Text style={{color:C.danger}}>{error}</Text>}
  <Pressable disabled={busy} onPress={save} style={styles.save}><Text style={styles.saveText}>{busy?"Saving...":"Save Vehicle"}</Text></Pressable>
 </ScrollView>;
}
const styles=StyleSheet.create({page:{padding:S.xl,backgroundColor:C.background,flexGrow:1},group:{marginBottom:S.md},label:{fontWeight:"700",color:C.text,marginBottom:S.xs},input:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:R.md,padding:S.md},picker:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:R.md},line:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:S.md,borderBottomWidth:1,borderColor:C.border},save:{backgroundColor:C.primary,padding:S.lg,borderRadius:R.md,marginTop:S.xl,alignItems:"center"},saveText:{color:"white",fontWeight:"700"},back:{marginBottom:S.lg},backText:{color:C.primary,fontWeight:"700"}});
