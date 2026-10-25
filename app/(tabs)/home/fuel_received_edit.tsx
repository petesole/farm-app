import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import {fuelDateDisplay,fuelDateISO} from "./fuel_admin_dates";
import {useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {Picker} from "@react-native-picker/picker";
import {router} from "expo-router";
import {ThemedText} from "@/components/themed-text";
import {supabase} from "../../../supabase";
type Received={fuel_received_id:number;fuel_received_date:string;supplier_id:number;invoice_no:string|null;fuel_received:number};
type Supplier={supplier_id:number;supplier_name:string};
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
export default function FuelReceivedEdit(){
 const [dateInput,setDateInput]=useState(()=>fuelDateDisplay(today()));
 const [date,setDate]=useState(today()),[rows,setRows]=useState<Received[]>([]),[suppliers,setSuppliers]=useState<Supplier[]>([]);
 const [editing,setEditing]=useState<Received|null|undefined>(undefined),[supplierId,setSupplierId]=useState<number|null>(null);
 const [litres,setLitres]=useState(""),[invoice,setInvoice]=useState("");
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function load(d:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){setError("Invalid date.");return;}
  setLoading(true);setError("");setEditing(undefined);setDate(d);setDateInput(fuelDateDisplay(d));
  const [a,b]=await Promise.all([
   supabase.from("fuel_received").select("fuel_received_id,fuel_received_date,supplier_id,invoice_no,fuel_received").eq("fuel_received_date",d).order("fuel_received_id"),
   supabase.from("supplier").select("supplier_id,supplier_name").order("supplier_name")
  ]);
  if(a.error)setError(a.error.message);else setRows((a.data??[]) as Received[]);
  if(b.error)setError(b.error.message);else setSuppliers((b.data??[]) as Supplier[]);
  setLoading(false);
 }
 useEffect(()=>{load(today());},[]);
 function findDate(){const iso=fuelDateISO(dateInput);if(!iso){setError("Enter a valid date, e.g. 5/12 or 05/12/2026.");return;}load(iso);}
 function choose(r:Received|null){setEditing(r);setSupplierId(r?.supplier_id??null);setLitres(r?String(r.fuel_received):"");setInvoice(r?.invoice_no??"");setError("");setNotice("");}
 async function save(){
  if(editing===undefined)return;
  // Frontend safeguard only. Real permission enforcement must also be in RLS.
  const {data: identity,error: identityError}=await supabase.auth.getUser();
  if(identityError||!identity.user){setError("Please sign in again.");return;}
  const {data: roles,error: rolesError}=await supabase.rpc("my_farm_app_roles");
  if(rolesError||!Array.isArray(roles)||!roles.some((role: string)=>["admin","manager"].includes(String(role).trim().toLowerCase()))){
   setError("Only an administrator or manager can correct fuel records.");return;
  }
  const qty=Number(litres.replace(/,/g,"").trim());
  if(!supplierId){setError("Select a supplier.");return;}
  if(!Number.isFinite(qty)||qty<=0){setError("Enter a valid positive quantity of litres.");return;}
  setSaving(true);setError("");
  const payload={fuel_received_date:date,supplier_id:supplierId,fuel_received:qty,invoice_no:invoice.trim()||null};
  const result=editing===null
   ?await supabase.from("fuel_received").insert(payload).select("fuel_received_id")
   :await supabase.from("fuel_received").update(payload).eq("fuel_received_id",editing.fuel_received_id).select("fuel_received_id");
  setSaving(false);
  if(result.error){setError(result.error.message);return;}
  if(!result.data?.length){setError("No record saved. Check your edit permissions.");return;}
  setNotice(editing===null?"Missing delivery added.":"Fuel delivery updated.");await load(date);
 }
 return <ScrollView contentContainerStyle={s.page}>
 <JsplModuleHeader title="Fuel Received Corrections" />
  <ThemedText type="title">Fuel Received Edit / Add</ThemedText>
  <Pressable style={s.btn} onPress={()=>router.back()}><ThemedText>← Fuel Admin</ThemedText></Pressable>
  <View style={s.card}><ThemedText type="subtitle">Select date</ThemedText><View style={s.row}>
   <TextInput style={[s.input,{flex:1}]} value={dateInput} onChangeText={setDateInput} placeholder="dd/mm/yyyy or 5/12"/>
   <Pressable style={s.btn} onPress={findDate}><ThemedText>Find</ThemedText></Pressable>
  </View></View>
  {!!error&&<ThemedText style={s.error}>{error}</ThemedText>}
  {!!notice&&<ThemedText>{notice}</ThemedText>}
  {loading?<ActivityIndicator/>:<View style={s.card}>
   <ThemedText type="subtitle">Deliveries on {fuelDateDisplay(date)}</ThemedText>
   {rows.map(r=><Pressable key={r.fuel_received_id} style={s.btn} onPress={()=>choose(r)}>
    <ThemedText>#{r.fuel_received_id} · {suppliers.find(s=>s.supplier_id===r.supplier_id)?.supplier_name??"Supplier"} · {r.fuel_received} L{r.invoice_no?" · "+r.invoice_no:""} — Edit</ThemedText>
   </Pressable>)}
   {!rows.length&&<ThemedText>No fuel received on this date.</ThemedText>}
   <Pressable style={s.btn} onPress={()=>choose(null)}><ThemedText>+ Add missing fuel delivery</ThemedText></Pressable>
  </View>}
  {editing!==undefined&&<View style={s.card}>
   <ThemedText type="subtitle">{editing===null?"Add fuel delivery":"Edit delivery #"+editing.fuel_received_id}</ThemedText>
   <ThemedText>Supplier</ThemedText><View style={s.picker}><Picker selectedValue={supplierId} onValueChange={setSupplierId}>
    <Picker.Item label="Select supplier" value={null}/>
    {suppliers.map(s=><Picker.Item key={s.supplier_id} value={s.supplier_id} label={s.supplier_name}/>)}
   </Picker></View>
   <ThemedText>Invoice number</ThemedText><TextInput style={s.input} value={invoice} onChangeText={setInvoice}/>
   <ThemedText>Litres received</ThemedText><TextInput style={s.input} keyboardType="numeric" value={litres} onChangeText={setLitres}/>
   <View style={s.row}>
    <Pressable style={s.btn} disabled={saving} onPress={save}><ThemedText>{saving?"Saving…":"Save"}</ThemedText></Pressable>
    <Pressable style={s.btn} onPress={()=>setEditing(undefined)}><ThemedText>Cancel</ThemedText></Pressable>
   </View>
  </View>}
 </ScrollView>;
}
const s=StyleSheet.create({page:{padding:18,paddingBottom:45,gap:12},card:{borderWidth:1,borderRadius:10,padding:12,gap:10},row:{flexDirection:"row",gap:8,alignItems:"center"},btn:{borderWidth:1,borderRadius:8,padding:10},input:{borderWidth:1,borderRadius:8,padding:10},picker:{borderWidth:1,borderRadius:8},error:{color:"red"}});
