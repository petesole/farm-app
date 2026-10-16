import {useEffect,useMemo,useState} from "react";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
type D={source_type:string;source_id:string|null;farm_slip_id:number|null;slip_number:string;dnote_number:string|null;weigh_date:string;crop_id:number;net_kg:number;season_id:number|null;receiving_wb_number:string|null;receiving_date:string|null;receiving_net_kg:number|null;rejected_kg:number|null;grv_number:string|null;grv_accepted_kg:number|null;wheat_grade:string|null;customer_id:number|null};
type S={season_id:number;season_name:string};type C={crop_id:number;crop_name:string};
const input={borderWidth:1,borderColor:"#bec8d5",borderRadius:4,backgroundColor:"white",padding:9,minWidth:145} as const;
const money=(v:number|null)=>v==null?"—":Number(v).toLocaleString("en-US");
const date=(v:string)=>{if(!v.trim())return null;if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const m=v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);if(!m)return null;const y=Number(m[3]||new Date().getFullYear()),mo=+m[2],d=+m[1];const x=new Date(Date.UTC(y,mo-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d?`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`:null};
const showDate=(s:string|null)=>s?s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4):"";
function B({label,click}:{label:string;click:()=>void}){return <Pressable onPress={click} style={{backgroundColor:"#165a9c",borderRadius:5,padding:10,marginRight:10,marginBottom:9}}><Text style={{color:"#fff",fontWeight:"bold"}}>{label}</Text></Pressable>}
function F({label,value,onChange}:{label:string;value:string;onChange:(x:string)=>void}){return <View style={{marginRight:12,marginBottom:10}}><Text style={{color:"#59677a",fontSize:12,marginBottom:4}}>{label}</Text><TextInput style={input} value={value} onChangeText={onChange}/></View>}
export default function Deliveries(){
 const [ok,setOk]=useState<boolean|null>(null),[rows,setRows]=useState<D[]>([]),[seasons,setSeasons]=useState<S[]>([]),[crops,setCrops]=useState<C[]>([]),[sel,setSel]=useState<string|null>(null),[query,setQuery]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({season_id:"",receiving_wb_number:"",receiving_date:"",receiving_net_kg:"",rejected_kg:"0",grv_number:"",grv_accepted_kg:"",wheat_grade:""});
 const set=(k:keyof typeof form,v:string)=>setForm(f=>({...f,[k]:v}));
 async function load(){const [a,b,c]=await Promise.all([supabase.from("wb_unified_dispatch_v").select("*").order("weigh_date",{ascending:false}).limit(3000),supabase.from("season").select("season_id,season_name").order("season_id",{ascending:false}),supabase.from("crop").select("crop_id,crop_name")]);if(a.error||b.error||c.error){setError(a.error?.message||b.error?.message||c.error?.message||"Failed to load");return;}setRows((a.data||[]) as D[]);setSeasons((b.data||[]) as S[]);setCrops((c.data||[]) as C[]);setError("");}
 useEffect(()=>{if(Platform.OS!=="web"){setOk(false);return;}let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!alive)return;if(!user){setOk(false);return;}const {data}=await supabase.rpc("wb_admin_allowed");if(!alive)return;setOk(data===true)})();return()=>{alive=false}},[]);
 useEffect(()=>{if(ok)load()},[ok]);
 const selected=rows.find(x=>x.source_type+":"+(x.source_id||x.farm_slip_id)===sel);
 useEffect(()=>{if(!selected)return;setForm({season_id:selected.season_id?String(selected.season_id):"",receiving_wb_number:selected.receiving_wb_number||"",receiving_date:showDate(selected.receiving_date),receiving_net_kg:selected.receiving_net_kg==null?"":String(selected.receiving_net_kg),rejected_kg:String(selected.rejected_kg??0),grv_number:selected.grv_number||"",grv_accepted_kg:selected.grv_accepted_kg==null?"":String(selected.grv_accepted_kg),wheat_grade:selected.wheat_grade||""})},[sel,rows]);
 const displayed=useMemo(()=>rows.filter(r=>[r.slip_number,r.dnote_number,crops.find(c=>c.crop_id===r.crop_id)?.crop_name,r.source_type].join(" ").toLowerCase().includes(query.toLowerCase())),[rows,query,crops]);
 const outDel=rows.filter(r=>!r.receiving_wb_number).length,outGrv=rows.filter(r=>!r.grv_number).length;
 async function save(){if(!selected||selected.source_type==="farm_slip"||!selected.source_id||busy)return;const rec=form.receiving_net_kg.trim()?Number(form.receiving_net_kg):null,rej=form.rejected_kg.trim()?Number(form.rejected_kg):null,acc=form.grv_accepted_kg.trim()?Number(form.grv_accepted_kg):null;
 if(!form.season_id){setError("Select the correct season first.");return;}
 if([rec,rej,acc].some(v=>v!==null&&(!Number.isFinite(v)||v<0))||(rec!==null&&rej!==null&&rej>rec)){setError("Check received, rejected and GRV kilograms.");return;}
 const rd=form.receiving_date?date(form.receiving_date):null;if(form.receiving_date&&!rd){setError("Invalid receiving date. Use DD/MM/YYYY.");return;}
 if(form.wheat_grade&&!["Premium","B1","B2","B3","UG"].includes(form.wheat_grade)){setError("Invalid wheat grade.");return;}
 setBusy(true);const {error:e}=await supabase.from("wb_source_delivery").upsert({source_type:selected.source_type,source_id:selected.source_id,season_id:+form.season_id,receiving_wb_number:form.receiving_wb_number||null,receiving_date:rd,receiving_net_kg:rec,rejected_kg:rej,grv_number:form.grv_number||null,grv_accepted_kg:acc,wheat_grade:form.wheat_grade||null},{onConflict:"source_type,source_id"});setBusy(false);if(e){setError(e.message);return;}await load();}
 if(Platform.OS!=="web")return <Text>Desktop only</Text>;if(ok===null)return <Text>Checking Admin access…</Text>;if(!ok)return <Text style={{padding:20}}>Weighbridge Delivery Report — Admin only.</Text>;
 return <ScrollView style={{backgroundColor:"#f5f7fa",flex:1}} contentContainerStyle={{padding:20,minWidth:1080}}>
 <Text style={{fontWeight:"bold",fontSize:25,marginBottom:8}}>Weighbridge — Delivery Report</Text>
 <Text style={{color:"#697386",marginBottom:14}}>WB computer + Manual Weighbridge + legacy farm slips. Each source appears once. Customer WB and GRV entered against its original slip.</Text>
 <Text style={{fontSize:16,marginBottom:10}}>Dispatches: {rows.length}   |   Outstanding customer WB: {outDel}   |   Outstanding GRVs: {outGrv}   |   Season unassigned: {rows.filter(r=>r.season_id==null).length}</Text>
 {error?<Text style={{color:"#b42318",marginBottom:8}}>{error}</Text>:null}
 <View style={{flexDirection:"row",alignItems:"flex-start"}}>
 <View style={{width:410,backgroundColor:"white",padding:12,marginRight:16,borderRadius:6}}>
 <F label="Search slip, DNote or crop" value={query} onChange={setQuery}/><B label="Refresh" click={load}/>
 <ScrollView style={{maxHeight:690}}>{displayed.map((r,i)=><Pressable key={r.source_type+":"+(r.source_id||r.farm_slip_id)} onPress={()=>setSel(r.source_type+":"+(r.source_id||r.farm_slip_id))} style={{padding:10,borderBottomWidth:1,borderColor:"#e4e8ed",backgroundColor:sel===r.source_type+":"+(r.source_id||r.farm_slip_id)?"#dcecff":"white"}}>
 <Text style={{fontWeight:"bold"}}>{r.slip_number} {r.dnote_number?" / "+r.dnote_number:""} · {money(r.net_kg)} kg</Text>
 <Text style={{fontSize:12,color:"#667085"}}>{r.source_type==="scale"?"WB computer":r.source_type==="manual"?"Manual":"Farm slip"} · {showDate(r.weigh_date)} · {crops.find(c=>c.crop_id===r.crop_id)?.crop_name}</Text>
 <Text style={{fontSize:12,color:r.season_id==null?"#b42318":"#667085"}}>{r.season_id==null?"Assign season · ":""}{r.receiving_wb_number?"Customer WB ✓":"Out Del"} · {r.grv_number?"GRV ✓":"Out GRV"}</Text>
 </Pressable>)}{!displayed.length?<Text>No dispatches found.</Text>:null}</ScrollView>
 </View>
 <View style={{flex:1,backgroundColor:"white",borderRadius:6,padding:16}}>
 {!selected?<Text>Select a dispatch to enter the customer receiving WB and GRV.</Text>:<>
 <Text style={{fontWeight:"bold",fontSize:20,marginBottom:8}}>Slip {selected.slip_number} · {money(selected.net_kg)} kg</Text>
 <Text style={{color:"#667085",marginBottom:13}}>Source: {selected.source_type} · Date: {showDate(selected.weigh_date)}</Text>
 {selected.source_type==="farm_slip"?<Text style={{color:"#a04a00"}}>Legacy farm slip: continue using the existing Delivery Entry page for this slip.</Text>:<>
 <Text style={{fontWeight:"bold",marginBottom:5}}>Season (required)</Text>
 <ScrollView horizontal style={{flexGrow:0,maxWidth:580,marginBottom:16}}>{seasons.map(s=><Pressable key={s.season_id} onPress={()=>set("season_id",String(s.season_id))} style={{padding:10,backgroundColor:form.season_id===String(s.season_id)?"#c8e7ff":"#f5f6f8",borderWidth:1,borderColor:"#d8dce4",marginRight:5}}><Text>{s.season_name}</Text></Pressable>)}</ScrollView>
 <Text style={{fontWeight:"bold",marginBottom:9}}>Customer receiving weighbridge</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}><F label="Customer WB number" value={form.receiving_wb_number} onChange={v=>set("receiving_wb_number",v)}/><F label="Date DD/MM/YYYY" value={form.receiving_date} onChange={v=>set("receiving_date",v)}/><F label="Customer net kg" value={form.receiving_net_kg} onChange={v=>set("receiving_net_kg",v)}/><F label="Rejected kg" value={form.rejected_kg} onChange={v=>set("rejected_kg",v)}/><F label="Wheat grade" value={form.wheat_grade} onChange={v=>set("wheat_grade",v)}/></View>
 <Text style={{fontWeight:"bold",marginBottom:9}}>GRV</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}><F label="GRV number" value={form.grv_number} onChange={v=>set("grv_number",v)}/><F label="GRV accepted kg" value={form.grv_accepted_kg} onChange={v=>set("grv_accepted_kg",v)}/></View>
 {form.receiving_net_kg.trim()?<Text style={{marginBottom:12}}>Farm-to-customer WB difference: {money(Number(form.receiving_net_kg)-Number(selected.net_kg))} kg (returns require separate reconciliation)</Text>:null}
 <B label={busy?"Saving…":"Save customer delivery"} click={save}/>
 </>}
 </>}
 </View></View>
 <Text style={{color:"#6c7788",fontSize:12,marginTop:12}}>Unassigned seasons are excluded from season yield calculations; stock moisture is required for 12% equivalent estimates. Customer returns still need source-linked reconciliation.</Text>
 </ScrollView>;
}