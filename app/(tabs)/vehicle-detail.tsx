import {useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from "react-native";
import {Picker} from "@react-native-picker/picker";
import {JsplSearchCombo} from "@/components/jspl/JsplSearchCombo";
import {Redirect,router,useLocalSearchParams} from "expo-router";
import {supabase} from "@/supabase";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {jsplColors as C,jsplSpacing as S,jsplRadii as R} from "@/constants/jspl-design";

import {stockMutation,stockRequest} from "@/utils/stock-workflow";
import {FuelType} from "@/utils/equipment-fuel";
type Ref={id:number;label:string};
type Vehicle={ownership_status:'owned'|'hired'|null;owner_company_id:number|null;hire_supplier_id:number|null;fuel_type:FuelType;is_other:boolean;vehicle_id:number;vehicle_name:string;vehicle_model:string|null;vehicle_assignment_id:number|null;tractor_size:number|null;consumption:number|null;vehicle_discontinued:boolean;has_meter:boolean;meter_type:string|null;vehicle_type_id:number|null;tractor_class_id:number|null};
export default function VehicleDetail(){
 const {id,mode}=useLocalSearchParams<{id?:string;mode?:string}>();
 // An explicit create mode takes precedence over any stale edit ID retained by navigation.
 const creating=mode==="create" || id==="new";
 const parsedId=Number(id);
 const vehicleId=!creating && id && Number.isSafeInteger(parsedId) && parsedId>0 ? parsedId : null;
 const [allowed,setAllowed]=useState<boolean|null>(null);
 const [owners,setOwners]=useState<Ref[]>([]),[suppliers,setSuppliers]=useState<Ref[]>([]);
 const [types,setTypes]=useState<Ref[]>([]),[assignments,setAssignments]=useState<Ref[]>([]),[classes,setClasses]=useState<Ref[]>([]);
 const [row,setRow]=useState<Partial<Vehicle>>({vehicle_name:"",vehicle_model:"",fuel_type:undefined,is_other:false,vehicle_discontinued:false,has_meter:false,meter_type:null,vehicle_type_id:null,vehicle_assignment_id:null,tractor_class_id:null,tractor_size:null,consumption:null});
 const [farms,setFarms]=useState<Ref[]>([]),[farm,setFarm]=useState<number|null>(null),[originalFarm,setOriginalFarm]=useState<number|null>(null),[farmReady,setFarmReady]=useState(false),[originalFixed,setOriginalFixed]=useState(false);
 const [fixedTypes,setFixedTypes]=useState<number[]>([]);
 const fixed=fixedTypes.includes(Number(row.vehicle_type_id));
 const [size,setSize]=useState(""),[consumption,setConsumption]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  // Reset form state whenever this screen is reused for a new vehicle.
  setRow({vehicle_name:"",vehicle_model:"",fuel_type:undefined,is_other:false,vehicle_discontinued:false,has_meter:false,meter_type:null,vehicle_type_id:null,vehicle_assignment_id:null,tractor_class_id:null,tractor_size:null,consumption:null});
  setSize("");setConsumption("");setError("");setFarmReady(false);setOriginalFixed(false);setOriginalFarm(null);setFarm(null);
  (async()=>{
  const {data:u,error:ue}=await supabase.auth.getUser();
  if(ue||!u.user){setAllowed(false);return;}
  const {data:roles,error:re}=await supabase.rpc("my_farm_app_roles");
  const admin=!re&&Array.isArray(roles)&&roles.some((v:string)=>String(v).toLowerCase()==="admin");
  setAllowed(admin);if(!admin)return;
  const [t,a,c,v,companies,supplierList]=await Promise.all([
   supabase.from("vehicle_type").select("vehicle_type_id,type_name,type_code,active").order("type_name"),
   supabase.from("vehicle_assignment").select("vehicle_assignment_id,vehicle_assignment").order("vehicle_assignment"),
   supabase.from("tractor_class").select("tractor_class_id,class_name").order("sort_order"),
   vehicleId?supabase.from("vehicle").select("*").eq("vehicle_id",vehicleId).single():Promise.resolve({data:null,error:null}),
   supabase.from('company').select('company_id,company_name,owns_vehicles').order('company_name'),
   supabase.rpc('vehicle_hire_suppliers'),
  ]);
  if(companies.error||supplierList.error){setError(companies.error?.message||supplierList.error?.message||'Supplier lookup failed');return;}
  setOwners((companies.data??[]).filter(c=>c.owns_vehicles||c.company_id===v.data?.owner_company_id).map(c=>({id:Number(c.company_id),label:c.company_name})));
  setSuppliers((supplierList.data??[]).filter((s:{active:boolean;supplier_id:number})=>s.active||s.supplier_id===v.data?.hire_supplier_id)
    .map((s:{supplier_id:number;supplier_name:string})=>({id:Number(s.supplier_id),label:s.supplier_name})));
  if(t.error||a.error||c.error||v.error){setError(t.error?.message||a.error?.message||c.error?.message||v.error?.message||"Lookup failed");return;}
  const fixedIds=(t.data??[]).filter(x=>/pump|pivot/i.test(x.type_name+' '+x.type_code)).map(x=>Number(x.vehicle_type_id));
  setFixedTypes(fixedIds);setOriginalFixed(fixedIds.includes(Number(v.data?.vehicle_type_id)));
  setTypes((t.data||[]).filter(x=>x.active||x.vehicle_type_id===v.data?.vehicle_type_id).map(x=>({id:Number(x.vehicle_type_id),label:x.type_name})));
  setAssignments((a.data||[]).map(x=>({id:Number(x.vehicle_assignment_id),label:x.vehicle_assignment})));
  setClasses((c.data||[]).map(x=>({id:Number(x.tractor_class_id),label:x.class_name})));
  if(v.data){setRow(v.data as Vehicle);setSize(v.data.tractor_size==null?"":String(v.data.tractor_size));setConsumption(v.data.consumption==null?"":String(v.data.consumption));}
 })()},[vehicleId,creating]);
 useEffect(()=>{
  if(!allowed||(!fixed&&!originalFixed))return;
  let current=true;
  setFarmReady(false);
  stockRequest('?irrigation_asset_farm='+(vehicleId??0)).then(data=>{if(current){setFarms(data.farms);setOriginalFarm(data.farm_id);setFarm(data.farm_id);setFarmReady(true);}}).catch(e=>{if(current)setError(e.message);});
  return ()=>{current=false;};
 },[allowed,fixed,originalFixed,vehicleId]);
 const set=(key:keyof Vehicle,value:any)=>setRow(old=>({...old,[key]:value}));
 async function save(){
  if(!row.fuel_type){setError("Select Diesel, Petrol or No fuel.");return;}
  if(!row.vehicle_name?.trim()){setError("Vehicle name is required.");return;}
  const numberOrNull=(v:string)=>v.trim()===""?null:Number(v);
  if((size.trim()&&!Number.isFinite(Number(size)))||(consumption.trim()&&!Number.isFinite(Number(consumption)))){setError("Enter valid numeric values.");return;}
  setBusy(true);setError("");
  const payload={fuel_type:row.fuel_type,vehicle_name:row.vehicle_name.trim(),ownership_status:row.ownership_status??null,owner_company_id:row.ownership_status==='owned'?row.owner_company_id??null:null,
   hire_supplier_id:row.ownership_status==='hired'?row.hire_supplier_id??null:null,vehicle_model:row.vehicle_model?.trim()||null,
   vehicle_assignment_id:row.vehicle_assignment_id??null,tractor_size:numberOrNull(size),consumption:numberOrNull(consumption),
   vehicle_discontinued:!!row.vehicle_discontinued,has_meter:!!row.has_meter,meter_type:row.has_meter?(row.meter_type||"HOURS"):null,
   vehicle_type_id:row.vehicle_type_id??null,tractor_class_id:row.tractor_class_id??null};
  try {
  if(fixed||originalFixed){
   if(!farmReady){setError('Wait for the farm list to load.');return;}
   await stockMutation('irrigation-vehicle',{action:'save_irrigation_vehicle',vehicle_id:vehicleId,vehicle:payload,farm_id:fixed?farm:null,previous_farm_id:originalFarm});
   router.replace('/(tabs)/vehicle-management');return;
  }
  const response=vehicleId?await supabase.from("vehicle").update(payload).eq("vehicle_id",vehicleId).select("vehicle_id"):await supabase.from("vehicle").insert(payload).select("vehicle_id");
  setBusy(false);
  if(response.error){setError(response.error.message);return;}
  if(!response.data?.length){setError("Not saved. Check database permissions.");return;}
  router.replace("/(tabs)/vehicle-management");
  }catch(e){setError("Save not confirmed: "+(e instanceof Error?e.message:String(e)));}finally{setBusy(false)}
 }
 if(allowed===null)return <ActivityIndicator/>;
 if(!allowed)return <Redirect href="/(tabs)/fuel"/>;
 const picker=(label:string,value:number|null|undefined,onChange:(n:number|null)=>void,items:Ref[])=><View style={styles.group}><JsplSearchCombo label={label} selector="product" value={value??null} onChange={v=>onChange(v==null?null:Number(v))} options={items}/></View>;
 const input=(label:string,value:string,onChange:(s:string)=>void,keyboardType:"default"|"numeric"="default")=><View style={styles.group}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboardType}/></View>;
 return <ScrollView contentContainerStyle={styles.page}>
  <JsplModuleHeader title={vehicleId?"Edit Vehicle":"Add Vehicle"} backLabel="Vehicles" backHref="/(tabs)/vehicle-management" />
  {input("Vehicle name",row.vehicle_name||"",v=>set("vehicle_name",v))}
  {input("Vehicle model",row.vehicle_model||"",v=>set("vehicle_model",v))}
  <JsplSearchCombo label="Ownership" selector="product" value={row.ownership_status??null}
    onChange={value=>setRow(current=>current.ownership_status===value?current:{...current,ownership_status:value as Vehicle['ownership_status'],owner_company_id:null,hire_supplier_id:null})}
    options={[{id:'owned',label:'Owned'},{id:'hired',label:'Hired'}]}/>
  {row.ownership_status==='owned'?picker('Owner company',row.owner_company_id,value=>set('owner_company_id',value),owners):null}
  {row.ownership_status==='hired'?picker('Hire supplier',row.hire_supplier_id,value=>set('hire_supplier_id',value),suppliers):null}
  {picker("Vehicle type",row.vehicle_type_id,v=>set("vehicle_type_id",v),types)}
  {fixed?picker("Fixed farm",farm,setFarm,farms):null}
  <JsplSearchCombo label="Fuel type" selector="product" value={row.fuel_type??null} onChange={v=>set("fuel_type",v)} options={[{id:"DIESEL",label:"Diesel"},{id:"PETROL",label:"Petrol"},{id:"NONE",label:"No fuel (e.g. implement)"}]}/>
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
