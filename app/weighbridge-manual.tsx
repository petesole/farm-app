import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Text, TextInput, Pressable, View } from "react-native";
import { supabase } from "../supabase";

type Crop={crop_id:number;crop_name:string};
type Trace={tracecode_id:number;tracecode_name:string;tracecode_size:number|null;crop_id:number|null};
type Transporter={wb_transporter_id:number;wb_transporter_name:string};
type Vehicle={wb_transporter_reg_id:number;wb_transporter_id:number;wb_transporter_reg_no:string;default_driver_id:number|null};
type Driver={driver_id:number;driver_name:string};
type Entry={manual_entry_id:string;dnote_number:string;slip_date:string;crop_id:number|null;registration_text:string;status:string;net_kg:number;transporter_id:number|null;vehicle_reg_id:number|null;driver_id:number|null;notes:string|null};
type Allocation={manual_allocation_id:number;manual_entry_id:string;tracecode_id:number;allocated_kg:number};
const field={borderWidth:1,borderColor:"#ccd3dd",padding:9,borderRadius:5,backgroundColor:"white",minWidth:180} as const;
const dateParse=(v:string)=>{const match=v.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);if(!match)return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;const y=match[3]?Number(match[3].length===2?"20"+match[3]:match[3]):new Date().getFullYear(),m=+match[2],d=+match[1];const dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`:null};
const dateDisplay=(v:string)=>v?/^\d{4}-\d{2}-\d{2}$/.test(v)?v:`${v.slice(8,10)}/${v.slice(5,7)}/${v.slice(0,4)}`:"";
const num=(v:string)=>v.trim()===""?NaN:Number(v);
const empty=()=>({dnote_number:"",slip_date:"",crop_id:"",transporter_id:"",vehicle_reg_id:"",driver_id:"",registration_text:"",net_kg:"",notes:""});
function Button({title,onPress,disabled=false}:{title:string;onPress:()=>void;disabled?:boolean}){return <Pressable disabled={disabled} onPress={onPress} style={{padding:10,backgroundColor:disabled?"#a6b1bf":"#18599a",borderRadius:5,marginRight:8,marginTop:8}}><Text style={{color:"#fff",fontWeight:"bold"}}>{title}</Text></Pressable>}
function Input({label,value,onChange,editable=true}:{label:string;value:string;onChange:(v:string)=>void;editable?:boolean}){return <View style={{marginRight:12,marginBottom:12}}><Text style={{color:"#536075",fontSize:12,marginBottom:4}}>{label}</Text><TextInput editable={editable} value={value} onChangeText={onChange} style={field}/></View>}
function Picker({label,value,options,onChange,disabled=false}:{label:string;value:string;options:{id:string;name:string}[];onChange:(v:string)=>void;disabled?:boolean}){return <View style={{marginRight:14,marginBottom:10,minWidth:185}}><Text style={{color:"#536075",fontSize:12,marginBottom:5}}>{label}</Text><ScrollView style={{height:110,borderWidth:1,borderColor:"#ccd3dd",borderRadius:5}} nestedScrollEnabled>{options.map(o=><Pressable disabled={disabled} key={o.id} onPress={()=>onChange(o.id)} style={{padding:7,backgroundColor:value===o.id?"#d7eaff":"white"}}><Text style={{color:"#273445"}}>{o.name}</Text></Pressable>)}</ScrollView></View>}
export default function ManualWeighbridge(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[error,setError]=useState(""),[working,setWorking]=useState(false);
 const [crops,setCrops]=useState<Crop[]>([]),[traces,setTraces]=useState<Trace[]>([]),[transporters,setTransporters]=useState<Transporter[]>([]),[vehicles,setVehicles]=useState<Vehicle[]>([]),[drivers,setDrivers]=useState<Driver[]>([]);
 const [entries,setEntries]=useState<Entry[]>([]),[allocations,setAllocations]=useState<Allocation[]>([]);
 const [chosen,setChosen]=useState<string|null>(null),[form,setForm]=useState(empty()),[allocationField,setAllocationField]=useState(""),[allocationKg,setAllocationKg]=useState(""),[filter,setFilter]=useState("");
 const change=(k:keyof ReturnType<typeof empty>,v:string)=>setForm(f=>({...f,[k]:v}));
 async function refresh(){
  const names=["crop","tracecode","wb_transporter","wb_transporter_reg","wb_driver","wb_manual_entries","wb_manual_allocations"] as const;
  const results=await Promise.all(names.map(n=>supabase.from(n).select("*").limit(n==="wb_manual_entries"?500:n==="wb_manual_allocations"?1500:1000)));
  const errs=results.map(r=>r.error?.message).filter(Boolean);if(errs.length){setError(errs.join("; "));return;}
  setError("");setCrops(results[0].data as Crop[]);setTraces(results[1].data as Trace[]);setTransporters(results[2].data as Transporter[]);setVehicles(results[3].data as Vehicle[]);setDrivers(results[4].data as Driver[]);
  setEntries(results[5].data as Entry[]);setAllocations(results[6].data as Allocation[]);
 }
 useEffect(()=>{if(Platform.OS!=="web"){setAllowed(false);return;}let live=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!live)return;if(!user){setAllowed(false);setError("Sign into Supabase as an Admin.");return;}const {data,error:e}=await supabase.rpc("wb_admin_allowed");if(!live)return;setAllowed(!e&&data===true);if(e)setError(e.message)})();return()=>{live=false}},[]);
 useEffect(()=>{if(allowed)refresh()},[allowed]);
 const selected=entries.find(e=>e.manual_entry_id===chosen);
 const currentAlloc=allocations.filter(a=>a.manual_entry_id===chosen);
 const total=currentAlloc.reduce((s,a)=>s+Number(a.allocated_kg),0);
 const net=num(form.net_kg);
 const cropTraces=traces.filter(t=>String(t.crop_id)===form.crop_id);
 const visible=useMemo(()=>entries.filter(e=>(e.dnote_number+" "+e.slip_date+" "+e.registration_text).toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>b.slip_date.localeCompare(a.slip_date)),[entries,filter]);
 function open(e:Entry){setChosen(e.manual_entry_id);setForm({dnote_number:e.dnote_number,slip_date:dateDisplay(e.slip_date),crop_id:String(e.crop_id||""),transporter_id:String(e.transporter_id||""),vehicle_reg_id:String(e.vehicle_reg_id||""),driver_id:String(e.driver_id||""),registration_text:e.registration_text,net_kg:String(e.net_kg),notes:e.notes||""});setAllocationField("");setAllocationKg("");setError("")}
 function reset(){setChosen(null);setForm(empty());setAllocationField("");setAllocationKg("");setError("")}
 async function save(){if(working||selected?.status==="completed")return;const date=dateParse(form.slip_date);if(!date||!form.dnote_number.trim()||!form.registration_text.trim()||!form.crop_id||!Number.isFinite(net)||net<=0){setError("Enter valid date, slip number, crop, registration and positive nett kilograms.");return;}
 const payload={dnote_number:form.dnote_number.trim(),slip_date:date,crop_id:Number(form.crop_id),registration_text:form.registration_text.trim(),transporter_id:form.transporter_id?+form.transporter_id:null,vehicle_reg_id:form.vehicle_reg_id?+form.vehicle_reg_id:null,driver_id:form.driver_id?+form.driver_id:null,net_kg:net,notes:form.notes||null};
 setWorking(true);const r=chosen?await supabase.from("wb_manual_entries").update(payload).eq("manual_entry_id",chosen).select("manual_entry_id").single():await supabase.from("wb_manual_entries").insert(payload).select("manual_entry_id").single();setWorking(false);if(r.error){setError(r.error.message);return;}await refresh();setChosen(r.data.manual_entry_id);}
 async function add(){if(!chosen||selected?.status!=="draft"||working)return;const kg=num(allocationKg),tid=Number(allocationField);if(!Number.isFinite(kg)||kg<=0||!cropTraces.some(t=>t.tracecode_id===tid)||total+kg>Number(selected.net_kg)+0.001){setError("Select a matching TraceCode and enter kilograms within the unallocated balance.");return;}setWorking(true);const r=await supabase.from("wb_manual_allocations").insert({manual_entry_id:chosen,tracecode_id:tid,allocated_kg:kg});setWorking(false);if(r.error){setError(r.error.message);return;}setAllocationField("");setAllocationKg("");await refresh();}
 async function remove(id:number){if(selected?.status!=="draft")return;const r=await supabase.from("wb_manual_allocations").delete().eq("manual_allocation_id",id);if(r.error){setError(r.error.message);return;}await refresh();}
 async function complete(){if(!selected||selected.status!=="draft")return;if(Math.abs(total-Number(selected.net_kg))>0.001){setError("Allocations must equal the full nett weight.");return;}setWorking(true);const r=await supabase.from("wb_manual_entries").update({status:"completed"}).eq("manual_entry_id",selected.manual_entry_id);setWorking(false);if(r.error){setError(r.error.message);return;}await refresh();}
 if(Platform.OS!=="web")return <Text style={{padding:25}}>Manual Weighbridge is web-only.</Text>;
 if(allowed===null)return <Text style={{padding:25}}>Checking Admin access…</Text>;
 if(!allowed)return <Text style={{padding:25}}>Manual Weighbridge — Admin only. {error}</Text>;
 const locked=selected?.status==="completed";
 return <ScrollView style={{backgroundColor:"#f4f6f9",flex:1}} contentContainerStyle={{padding:22,minWidth:1020}}>
 <Text style={{fontWeight:"bold",fontSize:25,color:"#20304b"}}>John Sole P/L — Manual Weighbridge</Text>
 <Text style={{marginBottom:18,color:"#667085"}}>Desktop only · Manual date and nett kilograms · TraceCode allocations · Admin access</Text>
 {error?<Text style={{color:"#bb2525",marginBottom:10}}>{error}</Text>:null}
 <View style={{flexDirection:"row",alignItems:"flex-start"}}>
 <View style={{width:300,backgroundColor:"white",padding:14,borderRadius:8,marginRight:15}}>
 <Text style={{fontSize:18,fontWeight:"bold",marginBottom:10}}>Manual slips</Text>
 <TextInput style={field} placeholder="Search slip or registration" value={filter} onChangeText={setFilter}/>
 <View style={{flexDirection:"row"}}><Button title="New slip" onPress={reset}/><Button title="Refresh" onPress={refresh}/></View>
 <ScrollView style={{maxHeight:620,marginTop:12}}>{visible.map(e=><Pressable key={e.manual_entry_id} onPress={()=>open(e)} style={{padding:9,borderBottomWidth:1,borderColor:"#e2e6ec",backgroundColor:chosen===e.manual_entry_id?"#e0edfc":"white"}}><Text style={{fontWeight:"bold"}}>{e.dnote_number} · {(Number(e.net_kg)/1000).toFixed(3)} t</Text><Text style={{fontSize:12,color:"#657085"}}>{dateDisplay(e.slip_date)} · {e.registration_text} · {e.status}</Text></Pressable>)}{!visible.length?<Text>No manual slips yet.</Text>:null}</ScrollView>
 </View>
 <View style={{flex:1,backgroundColor:"white",padding:18,borderRadius:8}}>
 <Text style={{fontSize:18,fontWeight:"bold",marginBottom:12}}>{chosen?"Manual slip details":"New manual slip"}</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>
 <Input label="Slip number" value={form.dnote_number} onChange={v=>change("dnote_number",v)} editable={!locked}/>
 <Input label="Date (DD/MM/YYYY, or 5/12)" value={form.slip_date} onChange={v=>change("slip_date",v)} editable={!locked}/>
 <Input label="Nett weight kg" value={form.net_kg} onChange={v=>change("net_kg",v)} editable={!locked}/>
 </View>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>
 <Picker label="Crop" value={form.crop_id} onChange={v=>{change("crop_id",v);setAllocationField("")}} options={crops.map(c=>({id:String(c.crop_id),name:c.crop_name}))} disabled={!!locked||currentAlloc.length>0}/>
 <Picker label="Transporter" value={form.transporter_id} onChange={v=>setForm(f=>({...f,transporter_id:v,vehicle_reg_id:"",driver_id:""}))} options={transporters.map(t=>({id:String(t.wb_transporter_id),name:t.wb_transporter_name}))} disabled={!!locked}/>
 <Picker label="Vehicle registration" value={form.vehicle_reg_id} onChange={v=>{const vehicle=vehicles.find(x=>String(x.wb_transporter_reg_id)===v);setForm(f=>({...f,vehicle_reg_id:v,registration_text:vehicle?.wb_transporter_reg_no||f.registration_text,driver_id:vehicle?.default_driver_id?String(vehicle.default_driver_id):f.driver_id}))}} options={vehicles.filter(v=>!form.transporter_id||String(v.wb_transporter_id)===form.transporter_id).map(v=>({id:String(v.wb_transporter_reg_id),name:v.wb_transporter_reg_no}))} disabled={!!locked}/>
 <Picker label="Driver" value={form.driver_id} onChange={v=>change("driver_id",v)} options={drivers.map(d=>({id:String(d.driver_id),name:d.driver_name}))} disabled={!!locked}/>
 </View>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>
 <Input label="Registration (saved on slip)" value={form.registration_text} onChange={v=>change("registration_text",v)} editable={!locked}/>
 <Input label="Notes" value={form.notes} onChange={v=>change("notes",v)} editable={!locked}/>
 </View>
 {!locked?<Button title={working?"Saving…":"Save draft slip"} onPress={save} disabled={working}/>:<Text style={{color:"#087a45",fontWeight:"bold"}}>Completed — locked for editing</Text>}
 {chosen?<View style={{marginTop:22,borderTopWidth:1,borderColor:"#ddd",paddingTop:16}}>
 <Text style={{fontWeight:"bold",fontSize:18}}>TraceCode allocations</Text>
 <Text style={{marginVertical:6}}>Nett: {Number(selected?.net_kg||0).toFixed(2)} kg · Allocated: {total.toFixed(2)} kg · Remaining: {(Number(selected?.net_kg||0)-total).toFixed(2)} kg</Text>
 {currentAlloc.map(a=><View key={a.manual_allocation_id} style={{flexDirection:"row",alignItems:"center",paddingVertical:6}}><Text style={{minWidth:270}}>{traces.find(t=>t.tracecode_id===a.tracecode_id)?.tracecode_name||a.tracecode_id}</Text><Text>{Number(a.allocated_kg).toFixed(2)} kg</Text>{!locked?<Button title="Remove" onPress={()=>remove(a.manual_allocation_id)}/>:null}</View>)}
 {!locked?<><View style={{flexDirection:"row",alignItems:"center",flexWrap:"wrap"}}><Picker label="TraceCode" value={allocationField} onChange={setAllocationField} options={cropTraces.map(t=>({id:String(t.tracecode_id),name:t.tracecode_name}))}/><Input label="Allocated kg" value={allocationKg} onChange={setAllocationKg}/><Button title="Add allocation" onPress={add} disabled={working}/></View><Button title="Complete slip" onPress={complete} disabled={working||Math.abs(total-Number(selected?.net_kg||0))>0.001}/></>:null}
 </View>:<Text style={{marginTop:16,color:"#667085"}}>Save the draft first, then allocate its nett weight to TraceCodes.</Text>}
 </View></View>
 <Text style={{color:"#697386",marginTop:15,fontSize:12}}>Manual slips are independent of the WB computer. Only completed and fully allocated slips enter the manual harvest tonnage view. Customer dispatch integration is a separate next step.</Text>
 </ScrollView>;
}
