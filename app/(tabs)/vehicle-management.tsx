import {useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from "react-native";
import {JsplSearchCombo} from "@/components/jspl/JsplSearchCombo";
import {Redirect,router,useFocusEffect} from "expo-router";
import {supabase} from "@/supabase";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {jsplColors as C,jsplSpacing as S,jsplRadii as R} from "@/constants/jspl-design";
type Vehicle={is_other:boolean;ownership_status:'owned'|'hired'|null;owner_company_id:number|null;hire_supplier_id:number|null;has_meter:boolean;meter_type:string|null;fuel_type:string;vehicle_id:number;vehicle_name:string;vehicle_model:string|null;vehicle_discontinued:boolean;vehicle_type_id:number|null;vehicle_type?:{type_name:string}|null};
type Type={vehicle_type_id:number;type_name:string};
export default function VehicleManagement(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[rows,setRows]=useState<Vehicle[]>([]),[types,setTypes]=useState<Type[]>([]);
 const [companyNames,setCompanyNames]=useState<Record<number,string>>({});
 const [supplierNames,setSupplierNames]=useState<Record<number,string>>({});
 const [typeFilter,setTypeFilter]=useState<number|null>(null),[statusFilter,setStatusFilter]=useState<"all"|"active"|"discontinued">("active"),[search,setSearch]=useState(""),[error,setError]=useState("");
 const load=useCallback(async()=>{
  const [v,t,c,s]=await Promise.all([supabase.from("vehicle").select("vehicle_id,vehicle_name,vehicle_model,vehicle_discontinued,vehicle_type_id,fuel_type,is_other,ownership_status,owner_company_id,hire_supplier_id,has_meter,meter_type").order("vehicle_name"),
    supabase.from("vehicle_type").select("vehicle_type_id,type_name").order("type_name"),
    supabase.from('company').select('company_id,company_name,owns_vehicles').order('company_name'),
    supabase.rpc('vehicle_hire_suppliers')]);
  if(c.error||s.error){setError(c.error?.message||s.error?.message||'Supplier lookup failed');return;}
  setCompanyNames(Object.fromEntries((c.data??[]).filter(company=>company.owns_vehicles).map(company=>[company.company_id,company.company_name])));
  setSupplierNames(Object.fromEntries((s.data??[]).filter((supplier:{active:boolean})=>supplier.active)
    .map((supplier:{supplier_id:number;supplier_name:string})=>[supplier.supplier_id,supplier.supplier_name])));
  if(v.error||t.error){setError(v.error?.message||t.error?.message||"Loading failed");return;}
  setError("");
  setRows((v.data||[]) as Vehicle[]);setTypes((t.data||[]) as Type[]);
 },[]);
 useEffect(()=>{(async()=>{const {data:u,error:ue}=await supabase.auth.getUser();if(ue||!u.user){setAllowed(false);return;}const {data:r,error:e}=await supabase.rpc("my_farm_app_roles");setAllowed(!e&&Array.isArray(r)&&r.some((x:string)=>String(x).trim().toLowerCase()==="admin"));})()},[]);
 useFocusEffect(useCallback(()=>{if(allowed)void load();},[allowed,load]));
 if(allowed===null)return <ActivityIndicator/>;
 if(!allowed)return <Redirect href="/(tabs)/fuel"/>;
 const filtered=rows.filter(v=>(statusFilter==="all" || (statusFilter==="active" ? !v.vehicle_discontinued : v.vehicle_discontinued))&&(typeFilter===null||v.vehicle_type_id===typeFilter)&&v.vehicle_name.toLowerCase().includes(search.trim().toLowerCase()));
 return <ScrollView contentContainerStyle={styles.page}>
  <JsplModuleHeader title="Vehicle Management" backLabel="Control Panel" backHref="/(tabs)/control-panel" />
  <Pressable style={styles.add} onPress={()=>router.push({pathname:"/(tabs)/vehicle-detail",params:{mode:"create"}})}><Text style={styles.addText}>+ Add Vehicle</Text></Pressable>
  <JsplSearchCombo label="Vehicle type" selector="product" value={typeFilter} onChange={v=>setTypeFilter(v==null?null:Number(v))} options={types.map(t=>({id:t.vehicle_type_id,label:t.type_name}))} placeholder="All vehicle types"/>
  <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Search vehicles"/>
  <Text style={styles.label}>Vehicle status</Text>
  <JsplSearchCombo label="Status" selector="product" value={statusFilter} onChange={v=>setStatusFilter((v??"active") as typeof statusFilter)} options={[{id:"active",label:"Active vehicles"},{id:"all",label:"All vehicles"},{id:"discontinued",label:"Discontinued only"}]}/>
  {!!error&&<Text style={{color:C.danger}}>{error}</Text>}
  <Text style={styles.count}>{filtered.length} of {rows.length} vehicles</Text>
  {filtered.map(v=>{
    const owner=v.owner_company_id&&companyNames[v.owner_company_id];
    const supplier=v.hire_supplier_id&&supplierNames[v.hire_supplier_id];
    const missing=v.vehicle_discontinued||v.is_other?[]:[
      !v.vehicle_name?.trim()&&'Name',!v.vehicle_type_id&&'Type',!v.fuel_type&&'Fuel type',
      !v.ownership_status&&'Ownership',v.ownership_status==='owned'&&!owner&&'Owner company',
      v.ownership_status==='hired'&&!supplier&&'Hire supplier',v.has_meter&&!v.meter_type&&'Meter type',
    ].filter(Boolean);
    return <View key={v.vehicle_id} style={[styles.item,missing.length>0&&{borderLeftWidth:3,borderLeftColor:C.danger}]}><View style={{flex:1}}><Text style={[styles.name,missing.length>0&&{color:C.danger}]}>{v.vehicle_name||'Unnamed vehicle'}{missing.length>0?' ('+missing.length+')':''}</Text><Text style={styles.info}>{types.find(t=>t.vehicle_type_id===v.vehicle_type_id)?.type_name||"Unassigned type"} · {v.fuel_type==="NONE"?"No fuel":v.fuel_type==="PETROL"?"Petrol":"Diesel"} · {v.vehicle_discontinued?"Discontinued":"Active"} · {owner||supplier||(v.ownership_status==='hired'?'Hired':'Owner unassigned')}</Text>{missing.length>0?<Text style={{color:C.danger}}>Missing {missing.join(', ')}</Text>:null}</View><Pressable style={styles.edit} onPress={()=>router.push({pathname:"/(tabs)/vehicle-detail",params:{mode:"edit",id:String(v.vehicle_id)}})}><Text style={styles.linkText}>Edit</Text></Pressable></View>;})}
 </ScrollView>;
}
const styles=StyleSheet.create({page:{padding:S.xl,backgroundColor:C.background,flexGrow:1},link:{marginBottom:S.lg},linkText:{color:C.primary,fontWeight:"700"},add:{backgroundColor:C.primary,borderRadius:R.md,padding:S.lg,alignSelf:"flex-start",marginBottom:S.lg},addText:{color:"#fff",fontWeight:"700"},label:{fontWeight:"700",color:C.text,marginBottom:S.sm},picker:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:R.md,marginBottom:S.md},input:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:R.md,padding:S.md,marginBottom:S.md},row:{flexDirection:"row",alignItems:"center",gap:S.md,marginBottom:S.lg},count:{color:C.textSecondary,marginBottom:S.sm},item:{backgroundColor:C.surface,borderBottomWidth:1,borderColor:C.border,padding:S.md,flexDirection:"row",alignItems:"center",gap:S.md},name:{fontWeight:"700",color:C.text},info:{color:C.textSecondary,marginTop:4},edit:{padding:S.sm}});
