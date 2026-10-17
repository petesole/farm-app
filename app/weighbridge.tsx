import { supabase } from "../supabase";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Text, TextInput, Pressable, View } from "react-native";

type Slip = { farm_slip_id:number; slip_number:string; weigh_date:string; net_kg:number; crop_id:number; customer_name:string|null; movement_type:string };
type Delivery = { delivery_id:number; dispatch_slip_id:number; receiving_wb_number:string|null; receiving_date:string|null; receiving_net_kg:number|null; receiving_moisture_pct:number|null; wheat_grade:string|null; rejected_kg:number|null; grv_number:string|null; grv_date:string|null; grv_accepted_kg:number|null; return_reconciliation_closed:boolean; notes:string|null };
type Reconcile = { dispatch_slip_id:number; outbound_difference_kg:number|null; return_difference_kg:number|null; farm_returned_kg:number; reconciliation_status:string; settled_transport_difference_kg:number|null };
const ink="#243044",muted="#667085",blue="#175a9e",border="#ced5df",bg="#f4f6f9";
const inputStyle={borderWidth:1,borderColor:border,borderRadius:5,padding:9,backgroundColor:"#fff",minWidth:175,color:ink} as const;
const tonnes=(v:number|null|undefined)=>v==null?"—":(Number(v)/1000).toFixed(3)+" t";
const text=(v:unknown)=>v==null?"":String(v);
const numberOrNull=(v:string)=>v.trim()===""?null:Number(v);
const formatDate=(v:string)=>{if(!v.trim())return null;const m=v.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);if(!m)return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;const year=m[3]?Number(m[3].length===2?"20"+m[3]:m[3]):new Date().getFullYear();const month=Number(m[2]),day=Number(m[1]);const check=new Date(Date.UTC(year,month-1,day));if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;return [year,String(month).padStart(2,"0"),String(day).padStart(2,"0")].join("-")};
const showDate=(v:string|null|undefined)=>v?/^\d{4}-\d{2}-\d{2}$/.test(v)?v:v.substring(8,10)+"/"+v.substring(5,7)+"/"+v.substring(0,4):"";
function Field({label,value,change}:{label:string;value:string;change:(v:string)=>void}){return <View style={{marginBottom:12,marginRight:12}}><Text style={{fontSize:12,color:muted,marginBottom:4}}>{label}</Text><TextInput style={inputStyle} value={value} onChangeText={change}/></View>}
function Button({title,press,disabled=false}:{title:string;press:()=>void;disabled?:boolean}){return <Pressable disabled={disabled} onPress={press} style={{backgroundColor:disabled?"#98a2b3":blue,padding:11,borderRadius:5,marginBottom:8,marginRight:10}}><Text style={{color:"white",fontWeight:"bold"}}>{title}</Text></Pressable>}
export default function WeighbridgeAdmin(){
 const [access,setAccess]=useState<boolean|null>(null);
 const [error,setError]=useState("");
 const [slips,setSlips]=useState<Slip[]>([]);
 const [deliveries,setDeliveries]=useState<Record<number,Delivery>>({});
 const [recs,setRecs]=useState<Record<number,Reconcile>>({});
 const [selected,setSelected]=useState<number|null>(null);
 const [search,setSearch]=useState("");
 const [saving,setSaving]=useState(false);
 const [f,setF]=useState({receiving_wb_number:"",receiving_date:"",receiving_net_kg:"",receiving_moisture_pct:"",wheat_grade:"",rejected_kg:"0",grv_number:"",grv_date:"",grv_accepted_kg:"",notes:"",return_reconciliation_closed:false});
 const set=(key:keyof typeof f,value:any)=>setF(prev=>({...prev,[key]:value}));
 async function load(){
  const [a,b,c]=await Promise.all([
   supabase.from("wb_farm_slip").select("farm_slip_id,slip_number,weigh_date,net_kg,crop_id,customer_name,movement_type").in("movement_type",["field_to_customer","stock_to_customer"]).eq("status","confirmed").order("weigh_date",{ascending:false}).limit(500),
   supabase.from("wb_delivery").select("*").limit(1000),
   supabase.from("wb_return_reconciliation_v").select("*").limit(1000)
  ]);
  if(a.error||b.error||c.error){setError([a.error?.message,b.error?.message,c.error?.message].filter(Boolean).join(" | "));return;}
  setError("");setSlips((a.data||[]) as Slip[]);
  setDeliveries(Object.fromEntries(((b.data||[]) as Delivery[]).map(d=>[d.dispatch_slip_id,d])));
  setRecs(Object.fromEntries(((c.data||[]) as Reconcile[]).map(d=>[d.dispatch_slip_id,d])));
 }
 useEffect(()=>{if(Platform.OS!=="web"){setAccess(false);return;}let live=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!live)return;if(!user){setAccess(false);setError("Sign in with your Supabase Admin account.");return;}const {data,error:rpcError}=await supabase.rpc("wb_admin_allowed");if(!live)return;setAccess(!rpcError&&data===true);if(rpcError)setError(rpcError.message)})();return()=>{live=false}},[]);
 useEffect(()=>{if(access)load()},[access]);
 useEffect(()=>{const d=selected==null?undefined:deliveries[selected];setF({receiving_wb_number:text(d?.receiving_wb_number),receiving_date:showDate(d?.receiving_date),receiving_net_kg:text(d?.receiving_net_kg),receiving_moisture_pct:text(d?.receiving_moisture_pct),wheat_grade:text(d?.wheat_grade),rejected_kg:text(d?.rejected_kg??0),grv_number:text(d?.grv_number),grv_date:showDate(d?.grv_date),grv_accepted_kg:text(d?.grv_accepted_kg),notes:text(d?.notes),return_reconciliation_closed:d?.return_reconciliation_closed??false})},[selected,deliveries]);
 const visible=useMemo(()=>slips.filter(s=>(s.slip_number+" "+s.customer_name+" "+s.weigh_date).toLowerCase().includes(search.toLowerCase())),[slips,search]);
 const outDel=slips.filter(s=>!deliveries[s.farm_slip_id]?.receiving_wb_number).length;
 const outGrv=slips.filter(s=>!deliveries[s.farm_slip_id]?.grv_number).length;
 async function save(){
  if(selected===null||saving)return;
  const recv=numberOrNull(f.receiving_net_kg),rej=numberOrNull(f.rejected_kg),accepted=numberOrNull(f.grv_accepted_kg),moist=numberOrNull(f.receiving_moisture_pct);
  if([recv,rej,accepted,moist].some(n=>n!==null&&(!Number.isFinite(n)||n<0))){setError("Weights and moisture must be non-negative numbers.");return;}
  if(moist!==null&&moist>100){setError("Moisture cannot exceed 100%.");return;}
  if(recv!==null&&rej!==null&&rej>recv){setError("Rejected kg cannot exceed received kg.");return;}
  if(f.receiving_date&&!formatDate(f.receiving_date)||f.grv_date&&!formatDate(f.grv_date)){setError("Enter a valid date as DD/MM/YYYY (or 5/12 for this year).");return;}
  if(f.wheat_grade&&!["Premium","B1","B2","B3","UG"].includes(f.wheat_grade)){setError("Grade must be Premium, B1, B2, B3 or UG.");return;}
  const data={dispatch_slip_id:selected,receiving_wb_number:f.receiving_wb_number.trim()||null,receiving_date:formatDate(f.receiving_date),receiving_net_kg:recv,receiving_moisture_pct:moist,wheat_grade:f.wheat_grade||null,rejected_kg:rej,grv_number:f.grv_number.trim()||null,grv_date:formatDate(f.grv_date),grv_accepted_kg:accepted,notes:f.notes.trim()||null,return_reconciliation_closed:f.return_reconciliation_closed};
  setSaving(true);setError("");
  const existing=deliveries[selected];
  const result=existing?await supabase.from("wb_delivery").update(data).eq("delivery_id",existing.delivery_id):await supabase.from("wb_delivery").insert(data);
  setSaving(false);
  if(result.error){setError(result.error.message);return;}
  await load();
 }
 if(Platform.OS!=="web")return <View style={{padding:24}}><Text>Weighbridge Admin is desktop web only.</Text></View>;
 if(access===null)return <View style={{padding:24}}><Text>Checking Admin access…</Text></View>;
 if(!access)return <View style={{padding:24}}><Text style={{fontWeight:"bold",fontSize:22}}>Weighbridge Admin — restricted</Text><Text>{error||"Your account does not have the Admin role."}</Text></View>;
 const slip=slips.find(s=>s.farm_slip_id===selected),rec=selected===null?undefined:recs[selected];
 return <ScrollView style={{flex:1,backgroundColor:bg}} contentContainerStyle={{padding:24,minWidth:960}}>
  <Text style={{fontSize:25,fontWeight:"bold",color:ink}}>John Sole P/L — Weighbridge Admin</Text>
  <Text style={{color:muted,marginBottom:18}}>Customer WB · GRV · Returns · Reconciliation | Desktop | Admin only</Text>
  <View style={{flexDirection:"row",flexWrap:"wrap"}}><Button title="Manual WB Entry" press={()=>router.push("/weighbridge-manual")} /><Button title="Crop Report" press={()=>router.push("/weighbridge-crop-report")} /><Button title="Delivery Report (WB + Manual)" press={()=>router.push("/weighbridge-delivery-report")} /><Button title="Daily DNotes Report" press={()=>router.push("/weighbridge-daily-dnotes")} /><Button title="Batch Scanner" press={()=>router.push("/weighbridge-batch-scanner")} /><Button title="Receiving Documents" press={()=>router.push("/weighbridge-receiving-inbox")} /><Button title="Return Reconciliation" press={()=>router.push("/weighbridge-return-reconciliation")} /></View>
  <View style={{flexDirection:"row",marginBottom:16}}>
   {[["Out Del",outDel],["Out GRVs",outGrv],["Dispatched loads",slips.length]].map(([label,value])=><View key={label} style={{backgroundColor:"#fff",borderRadius:8,padding:16,minWidth:170,marginRight:12}}><Text style={{color:muted}}>{label}</Text><Text style={{fontSize:28,fontWeight:"bold",color:ink}}>{value}</Text></View>)}
  </View>
  {error?<Text style={{color:"#b42318",marginBottom:12}}>{error}</Text>:null}
  <View style={{flexDirection:"row",alignItems:"flex-start"}}>
   <View style={{backgroundColor:"#fff",padding:14,borderRadius:8,width:385,marginRight:16}}>
    <Text style={{fontWeight:"bold",fontSize:18,marginBottom:12}}>Dispatches</Text>
    <TextInput style={inputStyle} placeholder="Search slip, customer or date" value={search} onChangeText={setSearch}/>
    <Button title="Refresh" press={load}/>
    <ScrollView style={{maxHeight:620}}>
     {visible.map(s=>{const d=deliveries[s.farm_slip_id];return <Pressable key={s.farm_slip_id} onPress={()=>setSelected(s.farm_slip_id)} style={{padding:10,backgroundColor:selected===s.farm_slip_id?"#e7f1fc":"white",borderBottomWidth:1,borderBottomColor:border}}>
      <Text style={{fontWeight:"bold",color:ink}}>{s.slip_number} · {tonnes(s.net_kg)}</Text>
      <Text style={{color:muted,fontSize:12}}>{showDate(s.weigh_date)} · {s.customer_name||"Customer not specified"}</Text>
      <Text style={{fontSize:12,color:!d?.receiving_wb_number?"#b42318":muted}}>{d?.receiving_wb_number?"WB received":"Out Del"}  ·  {d?.grv_number?"GRV received":"Out GRV"}</Text>
     </Pressable>})}
     {!visible.length?<Text style={{marginTop:15,color:muted}}>No matching confirmed dispatches.</Text>:null}
    </ScrollView>
   </View>
   <View style={{backgroundColor:"white",padding:18,borderRadius:8,flex:1}}>
    {!slip?<Text style={{color:muted}}>Select a dispatch to enter the customer's receiving weighbridge and GRV details.</Text>:<>
     <Text style={{fontSize:19,fontWeight:"bold",color:ink}}>Dispatch {slip.slip_number} — {tonnes(slip.net_kg)}</Text>
     <Text style={{color:muted,marginBottom:16}}>{showDate(slip.weigh_date)} · {slip.customer_name||"Customer not specified"}</Text>
     <Text style={{fontWeight:"bold",fontSize:16,marginBottom:10}}>Customer receiving WB (one report per dispatch)</Text>
     <View style={{flexDirection:"row",flexWrap:"wrap"}}>
      <Field label="Customer WB number" value={f.receiving_wb_number} change={v=>set("receiving_wb_number",v)}/>
      <Field label="WB date (DD/MM/YYYY)" value={f.receiving_date} change={v=>set("receiving_date",v)}/>
      <Field label="Received nett kg" value={f.receiving_net_kg} change={v=>set("receiving_net_kg",v)}/>
      <Field label="Receiving moisture %" value={f.receiving_moisture_pct} change={v=>set("receiving_moisture_pct",v)}/>
      <Field label="Wheat grade (Premium/B1/B2/B3/UG)" value={f.wheat_grade} change={v=>set("wheat_grade",v)}/>
      <Field label="Rejected kg" value={f.rejected_kg} change={v=>set("rejected_kg",v)}/>
     </View>
     <Text style={{fontWeight:"bold",fontSize:16,marginVertical:10}}>Customer GRV</Text>
     <View style={{flexDirection:"row",flexWrap:"wrap"}}>
      <Field label="GRV number" value={f.grv_number} change={v=>set("grv_number",v)}/>
      <Field label="GRV date (DD/MM/YYYY)" value={f.grv_date} change={v=>set("grv_date",v)}/>
      <Field label="GRV accepted kg" value={f.grv_accepted_kg} change={v=>set("grv_accepted_kg",v)}/>
     </View>
     <Text style={{fontWeight:"bold",fontSize:16,marginVertical:10}}>Returns & transporter reconciliation</Text>
     <Text style={{color:ink,marginBottom:6}}>Outbound difference: {tonnes(rec?.outbound_difference_kg)}  ·  Verified returned: {tonnes(rec?.farm_returned_kg)}</Text>
     <Text style={{color:ink,marginBottom:6}}>Return journey difference: {tonnes(rec?.return_difference_kg)}</Text>
     <Text style={{color:ink,marginBottom:6}}>Settled transporter difference: {tonnes(rec?.settled_transport_difference_kg)}</Text>
     <Text style={{color:muted,marginBottom:10}}>Status: {rec?.reconciliation_status||"Not yet calculated"}. Return quantities come from confirmed farm WB slips linked to this dispatch.</Text>
     <Pressable onPress={()=>set("return_reconciliation_closed",!f.return_reconciliation_closed)} style={{flexDirection:"row",alignItems:"center",marginBottom:14}}>
      <Text style={{fontSize:20,marginRight:9}}>{f.return_reconciliation_closed?"☑":"☐"}</Text>
      <Text>Return journey closed — finalise any short-return difference</Text>
     </Pressable>
     <Field label="Notes" value={f.notes} change={v=>set("notes",v)}/>
     <Button title={saving?"Saving…":"Save receiving WB and GRV"} press={save} disabled={saving}/>
    </>}
   </View>
  </View>
  <Text style={{fontSize:12,color:muted,marginTop:16}}>Counts cover the latest 500 confirmed dispatches displayed here, not necessarily the entire season. No WB computer synchronisation is modified.</Text>
 </ScrollView>;
}
