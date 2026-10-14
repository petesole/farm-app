import {fuelDateDisplay,fuelDateISO} from "./fuel_admin_dates";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import { ThemedText } from "@/components/themed-text";
import { supabase } from "../../../supabase";

type Dip = { fuel_dip_id:number; fuel_dip_date:string; fuel_dip_type_id:number; dip_reading:number };
type Type = { fuel_dip_type_id:number; fuel_dip_type_name:string };
const today = () => { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };
export default function FuelDipEdit(){
 const [dateInput,setDateInput]=useState(()=>fuelDateDisplay(today()));
 const [date,setDate]=useState(today());
 const [dips,setDips]=useState<Dip[]>([]);
 const [types,setTypes]=useState<Type[]>([]);
 const [editing,setEditing]=useState<Dip|null|undefined>(undefined);
 const [typeId,setTypeId]=useState<number|null>(null);
 const [reading,setReading]=useState("");
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function load(d:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){setError("Invalid date.");return;}
  setLoading(true);setError("");setEditing(undefined);setDate(d);setDateInput(fuelDateDisplay(d));
  const [a,b]=await Promise.all([
   supabase.from("fuel_dip").select("fuel_dip_id,fuel_dip_date,fuel_dip_type_id,dip_reading").eq("fuel_dip_date",d).order("fuel_dip_type_id"),
   supabase.from("fuel_dip_type").select("fuel_dip_type_id,fuel_dip_type_name").order("fuel_dip_type_id")
  ]);
  if(a.error)setError(a.error.message);else setDips((a.data??[]) as Dip[]);
  if(b.error)setError(b.error.message);else setTypes((b.data??[]) as Type[]);
  setLoading(false);
 }
 useEffect(()=>{load(today());},[]);
 function findDate(){const iso=fuelDateISO(dateInput);if(!iso){setError("Enter a valid date, e.g. 5/12 or 05/12/2026.");return;}load(iso);}
 const exists=(id:number)=>dips.some(d=>d.fuel_dip_type_id===id);
 function choose(d:Dip|null,id:number){
  setEditing(d);setTypeId(id);setReading(d?String(d.dip_reading):"");setError("");setNotice("");
 }
 async function save(){
  if(editing===undefined||typeId===null)return;
  const amount=Number(reading.replace(/,/g,""));
  if(!Number.isFinite(amount)||amount<=0){setError("Enter a valid positive dip reading.");return;}
  if(editing===null&&exists(typeId)){setError("This opening/closing dip already exists for the selected date.");return;}
  setSaving(true);setError("");
  const result=editing===null
   ? await supabase.rpc("fuel_insert_dip",{p_fuel_dip_date:date,p_fuel_dip_type_id:typeId,p_dip_reading:amount})
   : await supabase.from("fuel_dip").update({dip_reading:amount}).eq("fuel_dip_id",editing.fuel_dip_id).select("fuel_dip_id");
  setSaving(false);
  if(result.error){setError(result.error.message);return;}
  if(editing!==null&&(!result.data||result.data.length===0)){setError("No dip updated. Check edit permissions.");return;}
  setNotice(editing===null?"Missing dip added.":"Dip reading corrected.");await load(date);
 }
 return <ScrollView contentContainerStyle={styles.page}>
  <ThemedText type="title">Fuel Dip Edit / Add</ThemedText>
  <Pressable style={styles.btn} onPress={()=>router.back()}><ThemedText>← Fuel Admin</ThemedText></Pressable>
  <View style={styles.card}>
   <ThemedText type="subtitle">Select date</ThemedText>
   <View style={styles.row}>
    <TextInput style={[styles.input,{flex:1}]} value={dateInput} onChangeText={setDateInput} placeholder="dd/mm/yyyy or 5/12"/>
    <Pressable style={styles.btn} onPress={findDate}><ThemedText>Find</ThemedText></Pressable>
   </View>
  </View>
  {!!error&&<ThemedText style={styles.error}>{error}</ThemedText>}
  {!!notice&&<ThemedText>{notice}</ThemedText>}
  {loading?<ActivityIndicator/>:<View style={styles.card}>
   <ThemedText type="subtitle">Dips on {fuelDateDisplay(date)}</ThemedText>
   {dips.map(d=><Pressable key={d.fuel_dip_id} style={styles.btn} onPress={()=>choose(d,d.fuel_dip_type_id)}>
    <ThemedText>{types.find(t=>t.fuel_dip_type_id===d.fuel_dip_type_id)?.fuel_dip_type_name??"Dip"}: {d.dip_reading} L — Edit</ThemedText>
   </Pressable>)}
   {!dips.length&&<ThemedText>No dips recorded.</ThemedText>}
   {types.filter(t=>[1,2].includes(t.fuel_dip_type_id)&&!exists(t.fuel_dip_type_id)).map(t=>
    <Pressable key={t.fuel_dip_type_id} style={styles.btn} onPress={()=>choose(null,t.fuel_dip_type_id)}>
     <ThemedText>+ Add missing {t.fuel_dip_type_name}</ThemedText>
    </Pressable>)}
  </View>}
  {editing!==undefined&&<View style={styles.card}>
   <ThemedText type="subtitle">{editing===null?"Add missing dip":"Edit dip"}</ThemedText>
   <ThemedText>{types.find(t=>t.fuel_dip_type_id===typeId)?.fuel_dip_type_name}</ThemedText>
   <TextInput style={styles.input} value={reading} onChangeText={setReading} keyboardType="numeric" placeholder="Litres"/>
   <View style={styles.row}>
    <Pressable style={styles.btn} disabled={saving} onPress={save}><ThemedText>{saving?"Saving…":"Save"}</ThemedText></Pressable>
    <Pressable style={styles.btn} onPress={()=>setEditing(undefined)}><ThemedText>Cancel</ThemedText></Pressable>
   </View>
  </View>}
 </ScrollView>;
}
const styles=StyleSheet.create({page:{padding:18,paddingBottom:40,gap:12},card:{borderWidth:1,borderRadius:10,padding:12,gap:10},row:{flexDirection:"row",gap:8,alignItems:"center"},btn:{borderWidth:1,borderRadius:8,padding:10},input:{borderWidth:1,borderRadius:8,padding:10},error:{color:"red"}});
