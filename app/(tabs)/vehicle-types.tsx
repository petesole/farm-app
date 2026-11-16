import {useCallback,useState} from 'react';
import {useFocusEffect,router} from 'expo-router';
import {ActivityIndicator,Pressable,ScrollView,Text,View} from 'react-native';
import {supabase} from '@/supabase';
import {JsplModuleHeader} from '@/components/jspl/JsplModuleHeader';
import {JsplSearchCombo} from '@/components/jspl/JsplSearchCombo';
import {jsplColors as C} from '@/constants/jspl-design';
type Row={vehicle_type_id:number;type_code:string;type_name:string;active:boolean};
export default function VehicleTypes(){
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[status,setStatus]=useState('active');
 useFocusEffect(useCallback(()=>{let alive=true;(async()=>{
  setLoading(true);const roles=await supabase.rpc('my_farm_app_roles');
  if(roles.error||!roles.data?.some((x:string)=>x.toLowerCase()==='admin')){if(alive){setError('Admin access required.');setLoading(false);}return;}
  const result=await supabase.from('vehicle_type').select('*').order('type_name');
  if(alive){setError(result.error?.message??'');setRows(result.data??[]);setLoading(false);}
 })().catch(e=>{if(alive){setError(String(e));setLoading(false);}});return()=>{alive=false};},[]));
 return <ScrollView contentContainerStyle={{padding:24,gap:12,backgroundColor:C.background,flexGrow:1}}>
  <JsplModuleHeader title="Vehicle Types" backLabel="Vehicles" backHref="/(tabs)/vehicle-management"/>
  {error?<Text style={{color:C.danger}}>{error}</Text>:null}
  {!error&&<Pressable onPress={()=>router.push({pathname:'/(tabs)/vehicle-type-edit',params:{id:'new'}})}><Text style={{color:C.primary,fontWeight:'700'}}>Add vehicle type</Text></Pressable>}
  <JsplSearchCombo label="Status" selector="product" value={status} onChange={v=>setStatus(String(v??'active'))} options={[{id:'active',label:'Active types'},{id:'all',label:'All types'}]}/>
  {loading?<ActivityIndicator/>:rows.filter(t=>status==='all'||t.active).map(t=><View key={t.vehicle_type_id} style={{padding:16,backgroundColor:C.surface,flexDirection:'row',gap:12}}>
   <View style={{flex:1}}><Text style={{fontWeight:'700'}}>{t.type_name}</Text><Text>{t.active?'Active':'Inactive'}</Text></View>
   <Pressable onPress={()=>router.push({pathname:'/(tabs)/vehicle-type-edit',params:{id:String(t.vehicle_type_id)}})}><Text style={{color:C.primary}}>Edit</Text></Pressable>
  </View>)}
 </ScrollView>;
}
