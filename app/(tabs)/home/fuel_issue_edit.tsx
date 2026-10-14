import {useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {Picker} from "@react-native-picker/picker";
import {router} from "expo-router";
import {ThemedText} from "@/components/themed-text";
import {supabase} from "../../../supabase";
type Issue={fuel_issue_id:number;fuel_issue_date:string;vehicle_id:number;fuel_issued:number;meter_reading:number|null;notes:string|null};
type Vehicle={vehicle_id:number;vehicle_name:string;has_meter:boolean|null;meter_type:string|null};
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
export default function FuelIssueEdit(){
 const [date,setDate]=useState(today()),[issues,setIssues]=useState<Issue[]>([]),[vehicles,setVehicles]=useState<Vehicle[]>([]);
 const [editing,setEditing]=useState<Issue|null|undefined>(undefined),[vehicleId,setVehicleId]=useState<number|null>(null);
 const [litres,setLitres]=useState(""),[meter,setMeter]=useState(""),[notes,setNotes]=useState("");
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function load(d:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){setError("Date must be YYYY-MM-DD.");return;}
  setLoading(true);setError("");setEditing(undefined);
  const [a,b]=await Promise.all([
   supabase.from("fuel_issue").select("fuel_issue_id,fuel_issue_date,vehicle_id,fuel_issued,meter_reading,notes").eq("fuel_issue_date",d).order("fuel_issue_id"),
   supabase.from("vehicle").select("vehicle_id,vehicle_name,has_meter,meter_type").order("vehicle_name")
  ]);
  if(a.error)setError(a.error.message);else setIssues((a.data??[]) as Issue[]);
  if(b.error)setError(b.error.message);else setVehicles((b.data??[]) as Vehicle[]);
  setLoading(false);
 }
 useEffect(()=>{load(today());},[]);
 function choose(r:Issue|null){setEditing(r);setVehicleId(r?.vehicle_id??null);setLitres(r?String(r.fuel_issued):"");setMeter(r?.meter_reading==null?"":String(r.meter_reading));setNotes(r?.notes??"");setError("");setNotice("");}
 async function save(){
  if(editing===undefined)return;
  const qty=Number(litres.replace(/,/g,""));const meterValue=meter.trim()?Number(meter):null;
  if(!vehicleId){setError("Select a vehicle.");return;}
  if(!Number.isFinite(qty)||qty<=0){setError("Enter a positive fuel quantity.");return;}
  if(meterValue!==null&&(!Number.isFinite(meterValue)||meterValue<0)){setError("Invalid meter reading.");return;}
  const vehicle=vehicles.find(v=>v.vehicle_id===vehicleId);
  if(vehicle?.has_meter&&meterValue===null){setError("Enter the vehicle meter reading.");return;}
  if(vehicle?.has_meter&&meterValue!==null){
   // Compare against the adjacent recorded readings in chronological order.
   // On the same date the issue ID establishes the sequence.
   const q=await supabase.from("fuel_issue")
    .select("fuel_issue_id,fuel_issue_date,meter_reading")
    .eq("vehicle_id",vehicleId).not("meter_reading","is",null)
    .order("fuel_issue_date",{ascending:true})
    .order("fuel_issue_id",{ascending:true}).limit(10000);
   if(q.error){setError("Meter history could not be checked: "+q.error.message);return;}
   const history=(q.data??[]).filter(r=>r.fuel_issue_id!==editing?.fuel_issue_id);
   const index=history.findIndex(r=>r.fuel_issue_date>date||(r.fuel_issue_date===date&&editing!==null&&r.fuel_issue_id>editing.fuel_issue_id));
   const prev=index===0?null:index<0?history[history.length-1]:history[index-1];
   const next=index<0?null:history[index];
   if(prev&&meterValue<Number(prev.meter_reading)){setError("Reading must be at least "+prev.meter_reading+" (previous reading on "+prev.fuel_issue_date+").");return;}
   if(next&&meterValue>Number(next.meter_reading)){setError("Reading cannot exceed "+next.meter_reading+" (next reading on "+next.fuel_issue_date+").");return;}
  }
  setSaving(true);setError("");
  const payload={fuel_issue_date:date,vehicle_id:vehicleId,fuel_issued:qty,meter_reading:vehicle?.has_meter?meterValue:null,notes:notes.trim()||null};
  const result=editing===null?await supabase.from("fuel_issue").insert(payload).select("fuel_issue_id"):await supabase.from("fuel_issue").update(payload).eq("fuel_issue_id",editing.fuel_issue_id).select("fuel_issue_id");
  setSaving(false);
  if(result.error){setError(result.error.message);return;}
  if(!result.data?.length){setError("No record saved. Check your permissions.");return;}
  setNotice(editing===null?"Missing fuel issue added.":"Fuel issue updated.");await load(date);
 }
 return <ScrollView contentContainerStyle={s.page}>
  <ThemedText type="title">Fuel Issue Edit / Add</ThemedText>
  <Pressable style={s.btn} onPress={()=>router.back()}><ThemedText>← Fuel Admin</ThemedText></Pressable>
  <View style={s.card}><ThemedText type="subtitle">Select date</ThemedText><View style={s.row}>
   <TextInput style={[s.input,{flex:1}]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"/>
   <Pressable style={s.btn} onPress={()=>load(date)}><ThemedText>Find</ThemedText></Pressable>
  </View></View>
  {!!error&&<ThemedText style={{color:"red"}}>{error}</ThemedText>}
  {!!notice&&<ThemedText>{notice}</ThemedText>}
  {loading?<ActivityIndicator/>:<View style={s.card}><ThemedText type="subtitle">Issues on {date}</ThemedText>
   {issues.map(r=><Pressable key={r.fuel_issue_id} style={s.btn} onPress={()=>choose(r)}><ThemedText>#{r.fuel_issue_id} · {vehicles.find(v=>v.vehicle_id===r.vehicle_id)?.vehicle_name??"Vehicle"} · {r.fuel_issued} L — Edit</ThemedText></Pressable>)}
   {!issues.length&&<ThemedText>No issues on this date.</ThemedText>}
   <Pressable style={s.btn} onPress={()=>choose(null)}><ThemedText>+ Add missing fuel issue</ThemedText></Pressable>
  </View>}
  {editing!==undefined&&<View style={s.card}>
   <ThemedText type="subtitle">{editing===null?"Add fuel issue":"Edit issue #"+editing.fuel_issue_id}</ThemedText>
   <ThemedText>Vehicle</ThemedText><View style={s.picker}><Picker selectedValue={vehicleId} onValueChange={setVehicleId}><Picker.Item label="Select vehicle" value={null}/>{vehicles.map(v=><Picker.Item key={v.vehicle_id} value={v.vehicle_id} label={v.vehicle_name}/>)}</Picker></View>
   <ThemedText>Litres issued</ThemedText><TextInput style={s.input} value={litres} onChangeText={setLitres} keyboardType="numeric"/>
   <ThemedText>Meter reading (if vehicle has meter)</ThemedText><TextInput style={s.input} value={meter} onChangeText={setMeter} keyboardType="numeric"/>
   <ThemedText>Notes</ThemedText><TextInput style={s.input} value={notes} onChangeText={setNotes}/>
   <View style={s.row}><Pressable style={s.btn} disabled={saving} onPress={save}><ThemedText>{saving?"Saving…":"Save"}</ThemedText></Pressable><Pressable style={s.btn} onPress={()=>setEditing(undefined)}><ThemedText>Cancel</ThemedText></Pressable></View>
  </View>}
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:18,paddingBottom:45,gap:12},card:{borderWidth:1,borderRadius:10,padding:12,gap:10},row:{flexDirection:"row",gap:8,alignItems:"center"},btn:{borderWidth:1,borderRadius:8,padding:10},input:{borderWidth:1,borderRadius:8,padding:10},picker:{borderWidth:1,borderRadius:8}});
