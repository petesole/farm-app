import {useEffect,useState} from 'react';
import {router,useLocalSearchParams} from 'expo-router';
import {ActivityIndicator,Pressable,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {supabase} from '@/supabase';
import {JsplModuleHeader} from '@/components/jspl/JsplModuleHeader';
import {jsplColors as C} from '@/constants/jspl-design';
export default function VehicleTypeEdit(){
 const {id}=useLocalSearchParams<{id:string}>();const creating=id==='new';
 const [name,setName]=useState(''),[code,setCode]=useState(''),[active,setActive]=useState(true),[sort,setSort]=useState('0'),[error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;setReady(false);(async()=>{
  const roles=await supabase.rpc('my_farm_app_roles');
  if(roles.error||!roles.data?.some((x:string)=>x.toLowerCase()==='admin'))throw Error('Admin access required.');
  if(!creating){if(!Number.isSafeInteger(Number(id))||Number(id)<=0)throw Error('Invalid vehicle type.');
   const r=await supabase.from('vehicle_type').select('*').eq('vehicle_type_id',Number(id)).single();if(r.error)throw r.error;
   if(alive){setName(r.data.type_name);setCode(r.data.type_code);setActive(r.data.active);setSort(String(r.data.sort_order));}}
  if(alive)setReady(true);
 })().catch(e=>{if(alive)setError(e.message)});return()=>{alive=false};},[id,creating]);
 async function save(){
  if(busy||!ready)return;
  if(!name.trim()||!code.trim()||!Number.isInteger(Number(sort))){setError('Enter a name, code and whole-number sort order.');return;}
  setBusy(true);setError('');try{
   const payload={type_name:name.trim(),type_code:code.trim().toUpperCase(),active,sort_order:Number(sort)};
   const r=creating?await supabase.from('vehicle_type').insert(payload).select('vehicle_type_id'):await supabase.from('vehicle_type').update(payload).eq('vehicle_type_id',Number(id)).select('vehicle_type_id');
   if(r.error)throw r.error;if(r.data?.length!==1)throw Error('Save was not confirmed. Check permissions before retrying.');
   router.replace('/(tabs)/vehicle-types');
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 return <ScrollView contentContainerStyle={{padding:24,gap:14,backgroundColor:C.background,flexGrow:1}}>
  <JsplModuleHeader title={creating?'Add Vehicle Type':'Edit Vehicle Type'} backLabel="Vehicle Types" backHref="/(tabs)/vehicle-types"/>
  {!ready&&!error?<ActivityIndicator/>:null}
  <Text>Type name</Text><TextInput accessibilityLabel="Type name" value={name} editable={ready&&!busy} onChangeText={setName} style={{backgroundColor:C.surface,padding:12,borderWidth:1,borderColor:C.border}}/>
  <Text>Code</Text><TextInput accessibilityLabel="Type code" value={code} editable={ready&&!busy&&creating} onChangeText={setCode} autoCapitalize="characters" style={{backgroundColor:C.surface,padding:12,borderWidth:1,borderColor:C.border}}/>
  <Text>Sort order</Text><TextInput accessibilityLabel="Sort order" value={sort} editable={ready&&!busy} onChangeText={setSort} keyboardType="numeric" style={{backgroundColor:C.surface,padding:12,borderWidth:1,borderColor:C.border}}/>
  <View style={{flexDirection:'row',alignItems:'center',gap:16}}><Text>Active</Text><Switch value={active} disabled={!ready||busy} onValueChange={setActive}/></View>
  <Text>Inactive types remain on existing equipment records and are excluded from new selections.</Text>
  {!!error&&<Text style={{color:C.danger}}>{error}</Text>}
  <Pressable disabled={!ready||busy} onPress={save} style={{padding:16,backgroundColor:C.primary,opacity:ready&&!busy?1:0.5}}><Text style={{color:'#fff',fontWeight:'700'}}>{busy?'Saving…':'Save type'}</Text></Pressable>
 </ScrollView>;
}
