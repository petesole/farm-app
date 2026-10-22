import {wbParseDate,wbFormatDate,wbToday} from "../utils/wb-date";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Text, TextInput, Pressable, View } from "react-native";
import { supabase } from "../supabase";

type Season={season_id:number;season_name:string};
type Crop={crop_id:number;crop_name:string;active:boolean};
type Customer={customer_id:number;customer_name:string;active:boolean};
type Point={delivery_point_id:number;customer_id:number;point_name:string;active:boolean};
type Trace={tracecode_id:number;tracecode_name:string;tracecode_size:number|null;crop_id:number|null;season_id:number|null};
type Transporter={wb_transporter_id:number;wb_transporter_name:string};
type Vehicle={wb_transporter_reg_id:number;wb_transporter_id:number;wb_transporter_reg_no:string;default_driver_id:number|null};
type Driver={driver_id:number;driver_name:string};
type Entry={season_id:number|null;manual_entry_id:string;dnote_number:string;slip_date:string;crop_id:number|null;registration_text:string;status:string;net_kg:number;transporter_id:number|null;vehicle_reg_id:number|null;driver_id:number|null;notes:string|null;owner_type:string;third_party_name:string|null;origin_type:string;destination_type:string;movement_kind:string;customer_id:number|null;delivery_point_id:number|null;moisture_pct:number|null;harvest_class_id:number|null};
type Allocation={manual_allocation_id:number;manual_entry_id:string;tracecode_id:number;allocated_kg:number};
const field={borderWidth:1,borderColor:"#ccd3dd",padding:9,borderRadius:5,backgroundColor:"white",minWidth:180} as const;
const dateParse=wbParseDate;
const dateDisplay=wbFormatDate;
const num=(v:string)=>v.trim()===""?NaN:Number(v);
const empty=()=>({dnote_number:"",slip_date:wbFormatDate(wbToday()),season_id:"",crop_id:"",transporter_id:"",vehicle_reg_id:"",driver_id:"",registration_text:"",net_kg:"",notes:"",owner_type:"own",third_party_name:"",origin_type:"FIELD",destination_type:"farm_stock",movement_kind:"HARVEST_IN",customer_id:"",delivery_point_id:"",moisture_pct:"",harvest_class_id:""});
function Button({title,onPress,disabled=false}:{title:string;onPress:()=>void;disabled?:boolean}){return <Pressable disabled={disabled} onPress={onPress} style={{padding:10,backgroundColor:disabled?"#a6b1bf":"#18599a",borderRadius:5,marginRight:8,marginTop:8}}><Text style={{color:"#fff",fontWeight:"bold"}}>{title}</Text></Pressable>}
function Input({label,value,onChange,editable=true}:{label:string;value:string;onChange:(v:string)=>void;editable?:boolean}){return <View style={{marginRight:12,marginBottom:12}}><Text style={{color:"#536075",fontSize:12,marginBottom:4}}>{label}</Text><TextInput editable={editable} value={value} onChangeText={onChange} style={field}/></View>}
function Picker({label,value,options,onChange,disabled=false}:{label:string;value:string;options:{id:string;name:string}[];onChange:(v:string)=>void;disabled?:boolean}){return <View style={{marginRight:14,marginBottom:10,minWidth:185}}><Text style={{color:"#536075",fontSize:12,marginBottom:5}}>{label}</Text><ScrollView style={{height:110,borderWidth:1,borderColor:"#ccd3dd",borderRadius:5}} nestedScrollEnabled>{options.map(o=><Pressable disabled={disabled} key={o.id} onPress={()=>onChange(o.id)} style={{padding:7,backgroundColor:value===o.id?"#d7eaff":"white"}}><Text style={{color:"#273445"}}>{o.name}</Text></Pressable>)}</ScrollView></View>}
export default function ManualWeighbridge(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[error,setError]=useState(""),[working,setWorking]=useState(false);
 const [customers,setCustomers]=useState<Customer[]>([]),[points,setPoints]=useState<Point[]>([]);
 const [seasons,setSeasons]=useState<Season[]>([]),[crops,setCrops]=useState<Crop[]>([]),[traces,setTraces]=useState<Trace[]>([]),[transporters,setTransporters]=useState<Transporter[]>([]),[vehicles,setVehicles]=useState<Vehicle[]>([]),[drivers,setDrivers]=useState<Driver[]>([]);
 const [entries,setEntries]=useState<Entry[]>([]),[allocations,setAllocations]=useState<Allocation[]>([]);
 const [step,setStep]=useState<1|2|3>(1);
 const [chosen,setChosen]=useState<string|null>(null),[form,setForm]=useState(empty()),[allocationField,setAllocationField]=useState(""),[allocationKg,setAllocationKg]=useState(""),[filter,setFilter]=useState("");
 const change=(k:keyof ReturnType<typeof empty>,v:string)=>setForm(f=>({...f,[k]:v}));
 async function refresh(){
  const names=["crop","tracecode","wb_transporter","wb_transporter_reg","wb_driver","wb_manual_entries","wb_manual_allocations","wb_customer","wb_customer_delivery_point","season"] as const;
  const results=await Promise.all(names.map(n=>supabase.from(n).select("*").limit(n==="wb_manual_entries"?500:n==="wb_manual_allocations"?1500:1000)));
  const errs=results.map(r=>r.error?.message).filter(Boolean);if(errs.length){setError(errs.join("; "));return;}
  setError("");setCrops(results[0].data as Crop[]);setTraces(results[1].data as Trace[]);setTransporters(results[2].data as Transporter[]);setVehicles(results[3].data as Vehicle[]);setDrivers(results[4].data as Driver[]);
  setEntries(results[5].data as Entry[]);setAllocations(results[6].data as Allocation[]);setCustomers(results[7].data as Customer[]);setPoints(results[8].data as Point[]);setSeasons(results[9].data as Season[]);
 }
 useEffect(()=>{if(Platform.OS!=="web"){setAllowed(false);return;}let live=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!live)return;if(!user){setAllowed(false);setError("Sign into Supabase as an Admin.");return;}const {data,error:e}=await supabase.rpc("wb_admin_allowed");if(!live)return;setAllowed(!e&&data===true);if(e)setError(e.message)})();return()=>{live=false}},[]);
 useEffect(()=>{if(allowed)refresh()},[allowed]);
 const selected=entries.find(e=>e.manual_entry_id===chosen);
 const currentAlloc=allocations.filter(a=>a.manual_entry_id===chosen);
 const total=currentAlloc.reduce((s,a)=>s+Number(a.allocated_kg),0);
 const net=num(form.net_kg);
 const needsAllocation=form.owner_type==="own"&&form.origin_type==="FIELD"&&(form.movement_kind==="HARVEST_IN"||form.movement_kind==="MARKET_OUT");
 const selectedNeedsAllocation=!!selected&&selected.owner_type==="own"&&selected.origin_type==="FIELD"&&(selected.movement_kind==="HARVEST_IN"||selected.movement_kind==="MARKET_OUT");
 const cropTraces=traces.filter(t=>String(t.crop_id)===form.crop_id&&String(t.season_id)===form.season_id);
 const visible=useMemo(()=>entries.filter(e=>(e.dnote_number+" "+e.slip_date+" "+e.registration_text).toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>b.slip_date.localeCompare(a.slip_date)),[entries,filter]);
 function open(e:Entry){setStep(e.status==="draft"?3:3);setChosen(e.manual_entry_id);setForm({dnote_number:e.dnote_number,slip_date:dateDisplay(e.slip_date),season_id:String(e.season_id||allocations.map(a=>a.manual_entry_id===e.manual_entry_id?traces.find(t=>t.tracecode_id===a.tracecode_id)?.season_id:null).find(Boolean)||""),crop_id:String(e.crop_id||""),transporter_id:String(e.transporter_id||""),vehicle_reg_id:String(e.vehicle_reg_id||""),driver_id:String(e.driver_id||""),registration_text:e.registration_text,net_kg:String(e.net_kg),notes:e.notes||"",owner_type:e.owner_type||"own",third_party_name:e.third_party_name||"",origin_type:e.origin_type||"FIELD",destination_type:e.destination_type||"farm_stock",movement_kind:e.movement_kind||"HARVEST_IN",customer_id:e.customer_id?String(e.customer_id):"",delivery_point_id:e.delivery_point_id?String(e.delivery_point_id):"",moisture_pct:e.moisture_pct==null?"":String(e.moisture_pct),harvest_class_id:e.harvest_class_id?String(e.harvest_class_id):""});setAllocationField("");setAllocationKg("");setError("")}
 function reset(){setStep(1);setChosen(null);setForm(empty());setAllocationField("");setAllocationKg("");setError("")}
 async function save(){if(working||selected?.status==="completed")return;const date=dateParse(form.slip_date);if(!date||!form.dnote_number.trim()||!form.registration_text.trim()||!form.crop_id||!form.season_id||!Number.isFinite(net)||net<=0||(form.owner_type==="third_party"&&!form.third_party_name.trim())||(form.destination_type==="customer"&&!form.customer_id)||(form.owner_type==="own"&&(form.moisture_pct===""||!Number.isFinite(num(form.moisture_pct))||num(form.moisture_pct)<0||num(form.moisture_pct)>100))||(form.moisture_pct!==""&&(!Number.isFinite(num(form.moisture_pct))||num(form.moisture_pct)<0||num(form.moisture_pct)>100))){setError("Enter date, Field DNote, crop, season, truck registration and positive nett kilograms. Own grain also requires moisture (0–100%).");return;}if(chosen&&currentAlloc.length>0&&(!needsAllocation||Number(selected?.net_kg)!==net||selected?.crop_id!==Number(form.crop_id)||selected?.season_id!==Number(form.season_id))){setError("Existing allocations must be removed before changing the crop, season, nett weight or allocation requirement.");return;}
 const payload={dnote_number:form.dnote_number.trim(),slip_date:date,season_id:Number(form.season_id),crop_id:Number(form.crop_id),registration_text:form.registration_text.trim(),transporter_id:form.transporter_id?+form.transporter_id:null,vehicle_reg_id:form.vehicle_reg_id?+form.vehicle_reg_id:null,driver_id:form.driver_id?+form.driver_id:null,net_kg:net,notes:form.notes||null,owner_type:form.owner_type,third_party_name:form.owner_type==="third_party"?form.third_party_name.trim():null,origin_type:form.origin_type,destination_type:form.destination_type,movement_kind:form.movement_kind,customer_id:form.destination_type==="customer"?Number(form.customer_id):null,delivery_point_id:form.destination_type==="customer"&&form.delivery_point_id?Number(form.delivery_point_id):null,moisture_pct:form.moisture_pct===""?null:Number(form.moisture_pct),};
 setWorking(true);const r=chosen?await supabase.from("wb_manual_entries").update(payload).eq("manual_entry_id",chosen).select("manual_entry_id").single():await supabase.from("wb_manual_entries").insert(payload).select("manual_entry_id").single();setWorking(false);if(r.error){setError(r.error.message);return;}await refresh();setChosen(r.data.manual_entry_id);setStep(3);setError("");}
 async function add(){if(!chosen||selected?.status!=="draft"||!selectedNeedsAllocation||working)return;const kg=num(allocationKg),tid=Number(allocationField);if(!Number.isFinite(kg)||kg<=0||!cropTraces.some(t=>t.tracecode_id===tid)||total+kg>Number(selected.net_kg)+0.001){setError("Select a matching TraceCode and enter kilograms within the unallocated balance.");return;}setWorking(true);const r=await supabase.from("wb_manual_allocations").insert({manual_entry_id:chosen,tracecode_id:tid,allocated_kg:kg});setWorking(false);if(r.error){setError(r.error.message);return;}setAllocationField("");setAllocationKg("");await refresh();}
 async function remove(id:number){if(selected?.status!=="draft")return;const r=await supabase.from("wb_manual_allocations").delete().eq("manual_allocation_id",id);if(r.error){setError(r.error.message);return;}await refresh();}
 async function complete(){if(!selected||selected.status!=="draft")return;if(selected.owner_type==="own"&&selected.moisture_pct==null){setError("Moisture is required before completing an own-grain slip.");return;}if(selectedNeedsAllocation&&Math.abs(total-Number(selected.net_kg))>0.001){setError("Allocate the entire nett weight before completing the slip.");return;}if(!selectedNeedsAllocation&&total>0){setError("This movement does not need a field allocation. Remove any allocations first.");return;}if(Number(selected.net_kg)!==num(form.net_kg)||selected.dnote_number!==form.dnote_number.trim()||selected.registration_text!==form.registration_text.trim()||selected.crop_id!==Number(form.crop_id)||selected.movement_kind!==form.movement_kind){setError("Slip details have changed. Save the draft again before completing.");return;}setWorking(true);const r=await supabase.from("wb_manual_entries").update({status:"completed"}).eq("manual_entry_id",selected.manual_entry_id);setWorking(false);if(r.error){setError(r.error.message);return;}await refresh();}
 if(Platform.OS!=="web")return <Text style={{padding:25}}>Manual Weighbridge is web-only.</Text>;
 if(allowed===null)return <Text style={{padding:25}}>Checking Admin access…</Text>;
 if(!allowed)return <Text style={{padding:25}}>Manual Weighbridge — Admin only. {error}</Text>;
 const locked=selected?.status==="completed";
 return <ScrollView style={{backgroundColor:C.background,flex:1}} contentContainerStyle={{padding:22,minWidth:1020}}>
 <WbModuleHeader title="Manual Weighbridge"/>
 <Text style={{fontWeight:"bold",fontSize:25,color:"#20304b"}}>John Sole P/L — Manual Weighbridge</Text>
 <Text style={{marginBottom:18,color:"#667085"}}>Enter one nett weight (no opening/closing weights). Save a draft first, allocate only when required, then complete the slip. Drafts can be reopened and edited.</Text>
 {error?<Text style={{color:"#bb2525",marginBottom:10}}>{error}</Text>:null}
 <View style={{flexDirection:"row",alignItems:"flex-start"}}>
 <View style={{width:300,backgroundColor:"white",padding:14,borderRadius:8,marginRight:15}}>
 <Text style={{fontSize:18,fontWeight:"bold",marginBottom:10}}>Manual slips</Text>
 <TextInput style={field} placeholder="Search slip or registration" value={filter} onChangeText={setFilter}/>
 <View style={{flexDirection:"row"}}><Button title="New slip" onPress={reset}/><Button title="Refresh" onPress={refresh}/></View>
 <ScrollView style={{maxHeight:620,marginTop:12}}>{visible.map(e=><Pressable key={e.manual_entry_id} onPress={()=>open(e)} style={{padding:9,borderBottomWidth:1,borderColor:"#e2e6ec",backgroundColor:chosen===e.manual_entry_id?"#e0edfc":"white"}}><Text style={{fontWeight:"bold"}}>{e.dnote_number} · {(Number(e.net_kg)/1000).toFixed(3)} t</Text><Text style={{fontSize:12,color:"#657085"}}>{dateDisplay(e.slip_date)} · {e.registration_text} · {e.status}</Text></Pressable>)}{!visible.length?<Text>No manual slips yet.</Text>:null}</ScrollView>
 </View>
 <View style={{flex:1,backgroundColor:"white",padding:18,borderRadius:8}}>
 <Text style={{fontSize:18,fontWeight:"bold",marginBottom:12}}>{chosen?"Manual slip "+(selected?.status==="completed"?"— Completed":"— Draft"):"New manual slip"}</Text>
 <View style={{flexDirection:"row",marginBottom:18,flexWrap:"wrap"}}>{([["1","Movement"],["2","Slip details"],["3","Allocation & completion"]] as const).map(([number,label])=><View key={number} style={{padding:10,marginRight:8,marginBottom:6,borderRadius:5,backgroundColor:step===Number(number)?C.primary:"#edf2f4"}}><Text style={{fontWeight:"bold",color:step===Number(number)?"white":C.textSecondary}}>{number}. {label}</Text></View>)}</View>
 {step===1?<View>
 <Text style={{fontWeight:"bold",fontSize:16,marginBottom:8}}>Step 1 — Grower and movement</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>
 <Picker label="Grower (select first)" value={form.owner_type} onChange={v=>setForm(f=>({...f,owner_type:v,crop_id:"",customer_id:"",delivery_point_id:""}))} options={[{id:"own",name:"John Sole (Own)"},{id:"third_party",name:"Third-party grower"}]} disabled={!!locked}/>
 {form.owner_type==="third_party"?<Input label="Third-party grower name" value={form.third_party_name} onChange={v=>change("third_party_name",v)} editable={!locked}/>:null}
 <Picker label="Origin" value={form.origin_type} onChange={v=>setForm(f=>({...f,origin_type:v,movement_kind:v==="CUSTOMER"?"CUSTOMER_RETURN":f.destination_type==="customer"?"MARKET_OUT":v==="FIELD"?"HARVEST_IN":"OTHER"}))} options={[{id:"FIELD",name:"Field"},{id:"STOCK",name:"Stock"},{id:"CUSTOMER",name:"Customer return"}]} disabled={!!locked}/>
 <Picker label="Destination" value={form.destination_type} onChange={v=>setForm(f=>({...f,destination_type:v,customer_id:"",delivery_point_id:"",movement_kind:v==="customer"?"MARKET_OUT":f.origin_type==="CUSTOMER"?"CUSTOMER_RETURN":f.origin_type==="FIELD"?"HARVEST_IN":"OTHER"}))} options={[{id:"farm_stock",name:"Farm stock"},{id:"customer",name:"Market / Customer"},{id:"third_party",name:"Third party"}]} disabled={!!locked}/>
 </View>
 {form.destination_type==="customer"?<View style={{flexDirection:"row",flexWrap:"wrap"}}>
 <Picker label="Market / Customer" value={form.customer_id} onChange={v=>setForm(f=>({...f,customer_id:v,delivery_point_id:""}))} options={customers.filter(x=>x.active).map(x=>({id:String(x.customer_id),name:x.customer_name}))} disabled={!!locked}/>
 <Picker label="Delivery point" value={form.delivery_point_id} onChange={v=>change("delivery_point_id",v)} options={points.filter(x=>x.active&&String(x.customer_id)===form.customer_id).map(x=>({id:String(x.delivery_point_id),name:x.point_name}))} disabled={!!locked}/>
 </View>:null}
 <Button title="Next: Slip details →" onPress={()=>{if(form.owner_type==="third_party"&&!form.third_party_name.trim()){setError("Enter the third-party grower name.");return;}if(form.destination_type==="customer"&&!form.customer_id){setError("Choose the customer first.");return;}setError("");setStep(2)}} disabled={!!locked}/>
 </View>:null}
 {step===2?<View>
 <Text style={{fontWeight:"bold",fontSize:16,marginBottom:8}}>Step 2 — Slip details and nett weight</Text>
 <Picker label="Season (required)" value={form.season_id} onChange={v=>{change("season_id",v);setAllocationField("")}} options={seasons.map(s=>({id:String(s.season_id),name:s.season_name}))} disabled={!!locked||currentAlloc.length>0}/>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>
 <Input label="Field DNote / manual slip reference" value={form.dnote_number} onChange={v=>change("dnote_number",v)} editable={!locked}/>
 <Input label="Date (DD/MM/YYYY, or 5/12)" value={form.slip_date} onChange={v=>change("slip_date",v)} editable={!locked}/>
 <Input label="Nett weight kg (single weight)" value={form.net_kg} onChange={v=>change("net_kg",v)} editable={!locked}/>
 </View>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>
 <Picker label="Crop" value={form.crop_id} onChange={v=>{change("crop_id",v);setAllocationField("")}} options={crops.filter(c=>form.owner_type!=="own"||c.active).map(c=>({id:String(c.crop_id),name:c.crop_name}))} disabled={!!locked||currentAlloc.length>0}/>
 <Picker label="Transporter" value={form.transporter_id} onChange={v=>setForm(f=>({...f,transporter_id:v,vehicle_reg_id:"",driver_id:""}))} options={transporters.map(t=>({id:String(t.wb_transporter_id),name:t.wb_transporter_name}))} disabled={!!locked}/>
 <Picker label="Vehicle registration" value={form.vehicle_reg_id} onChange={v=>{const vehicle=vehicles.find(x=>String(x.wb_transporter_reg_id)===v);setForm(f=>({...f,vehicle_reg_id:v,registration_text:vehicle?.wb_transporter_reg_no||f.registration_text,driver_id:vehicle?.default_driver_id?String(vehicle.default_driver_id):f.driver_id}))}} options={vehicles.filter(v=>!form.transporter_id||String(v.wb_transporter_id)===form.transporter_id).map(v=>({id:String(v.wb_transporter_reg_id),name:v.wb_transporter_reg_no}))} disabled={!!locked}/>
 <Picker label="Driver" value={form.driver_id} onChange={v=>change("driver_id",v)} options={drivers.map(d=>({id:String(d.driver_id),name:d.driver_name}))} disabled={!!locked}/>
 </View>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>
 <Input label="Registration (saved on slip)" value={form.registration_text} onChange={v=>change("registration_text",v)} editable={!locked}/>
 <Input label="Moisture %" value={form.moisture_pct} onChange={v=>change("moisture_pct",v)} editable={!locked}/>
 <Input label="Notes" value={form.notes} onChange={v=>change("notes",v)} editable={!locked}/>
 </View>
 <Text style={{color:C.primaryDark,marginBottom:6}}>{needsAllocation?"Field allocation required: save draft, then allocate the full nett weight.":"No field allocation required for this movement. Save draft, then complete."}</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}><Button title="← Back: Movement" onPress={()=>setStep(1)}/>{!locked?<Button title={working?"Saving…":"Save draft and continue →"} onPress={save} disabled={working}/>:<Button title="View completed slip →" onPress={()=>setStep(3)}/>}</View>
 </View>:null}
 {step===3&&chosen?<View style={{marginTop:22,borderTopWidth:1,borderColor:"#ddd",paddingTop:16}}>
 <Text style={{fontSize:16,fontWeight:"bold",marginBottom:8}}>Step 3 — Allocate if required and complete</Text>
 <Text style={{marginBottom:10}}>Draft saved: {selected?.dnote_number||"—"} · {Number(selected?.net_kg||0).toLocaleString()} kg</Text>
 {selected?.status==="draft"?<Button title="← Edit draft details" onPress={()=>setStep(2)}/>:null}
 <Text style={{fontWeight:"bold",fontSize:18}}>{selectedNeedsAllocation?"Field TraceCode allocations required":"Field allocation not required"}</Text>
 <Text style={{marginVertical:6}}>Nett: {Number(selected?.net_kg||0).toFixed(2)} kg · Allocated: {total.toFixed(2)} kg · Remaining: {(Number(selected?.net_kg||0)-total).toFixed(2)} kg</Text>
 {currentAlloc.map(a=><View key={a.manual_allocation_id} style={{flexDirection:"row",alignItems:"center",paddingVertical:6}}><Text style={{minWidth:270}}>{traces.find(t=>t.tracecode_id===a.tracecode_id)?.tracecode_name||a.tracecode_id}</Text><Text>{Number(a.allocated_kg).toFixed(2)} kg</Text>{!locked?<Button title="Remove" onPress={()=>remove(a.manual_allocation_id)}/>:null}</View>)}
 {!locked?<>{selectedNeedsAllocation?<View style={{flexDirection:"row",alignItems:"center",flexWrap:"wrap"}}><Picker label="TraceCode" value={allocationField} onChange={setAllocationField} options={cropTraces.map(t=>({id:String(t.tracecode_id),name:t.tracecode_name}))}/><Input label="Allocated kg" value={allocationKg} onChange={setAllocationKg}/><Button title="Add allocation" onPress={add} disabled={working}/></View>:<Text style={{color:"#536075",marginBottom:10}}>This is not a new own-field harvest allocation. Existing stock dispatches and third-party loads are not allocated to a field again.</Text>}<Button title="Complete slip" onPress={complete} disabled={working||(selectedNeedsAllocation&&Math.abs(total-Number(selected?.net_kg||0))>0.001)}/></>:null}
 </View>:step===3?<Text style={{marginTop:16,color:"#667085"}}>Save the draft slip to continue.</Text>:null}
 </View></View>
 <Text style={{color:"#697386",marginTop:15,fontSize:12}}>Manual slips are independent of the WB computer. Own-field harvests require full TraceCode allocation before completion. Stock-to-market and third-party movements do not require reallocation. Completed slips are locked.</Text>
 </ScrollView>;
}
