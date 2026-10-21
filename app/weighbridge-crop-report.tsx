import {wbParseDate,wbFormatDate,wbToday} from "../utils/wb-date";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import { useEffect,useMemo,useState } from "react";
import { Platform,Pressable,ScrollView,Text,TextInput,View } from "react-native";
import { supabase } from "../supabase";
type CropRow={tracecode_id:number;tracecode_name:string;season_id:number;crop_id:number;season_name:string;crop_name:string|null;farm_name:string|null;variety_name:string|null;irrigation_type:string|null;plant_population:number|null;actual_planting_date:string|null;hectares:number|null;harvested_tonnes:number|null;harvest_yield_t_ha:number|null;delivered_yield_t_ha:number|null;financial_yield_t_ha:number|null};
type Season={season_id:number;season_name:string};
type Expected={season_id:number;crop_id:number;customer_received_kg:number;in_transit_kg:number;stock_kg:number;stock_at_12_kg:number|null;moisture_pct:number|null;expected_total_kg:number|null};
const fmt=(v:number|null|undefined,n=2)=>v==null?"—":Number(v).toLocaleString("en-US",{minimumFractionDigits:n,maximumFractionDigits:n});
const dt=(d:string|null)=>wbFormatDate(d)||"—";
const columns=["Crop","Farm","Variety","TraceCode","Irrigation","Plant Pop","Actual Planting","Ha","Harvested (t)","Harvest t/ha","Expected t/ha","Delivered t/ha","Financial t/ha"];
const cell=(v:string|number,key:string,align:"left"|"right"="left")=><View key={key} style={{width:key==="name"?145:key==="date"?130:110,padding:8,borderRightWidth:1,borderRightColor:"#d4dbe3",justifyContent:"center"}}><Text style={{color:"#243247",textAlign:align}}>{v}</Text></View>;
function Btn({label,fn}:{label:string;fn:()=>void}){return <Pressable onPress={fn} style={{paddingVertical:10,paddingHorizontal:18,marginRight:10,borderRadius:5,backgroundColor:C.successTint,borderWidth:1,borderColor:"#80baf0"}}><Text>{label}</Text></Pressable>}
export default function CropReport(){
 const [expected,setExpected]=useState<Expected[]>([]),[moistCrop,setMoistCrop]=useState(""),[moistValue,setMoistValue]=useState("");
 const [auth,setAuth]=useState<boolean|null>(null),[seasons,setSeasons]=useState<Season[]>([]),[season,setSeason]=useState(""),[rows,setRows]=useState<CropRow[]>([]),[filter,setFilter]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{if(Platform.OS!=="web"){setAuth(false);return;}let live=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!live)return;if(!user){setAuth(false);setErr("Sign in with your Admin account.");return;}const a=await supabase.rpc("wb_admin_allowed");if(!live)return;setAuth(a.data===true&&!a.error);if(a.error)setErr(a.error.message)})();return()=>{live=false}},[]);
 useEffect(()=>{if(!auth)return;let live=true;(async()=>{const [s,h]=await Promise.all([supabase.from("season").select("season_id,season_name").order("season_id",{ascending:false}),supabase.from("wb_crop_harvest_report_v").select("season_id").gt("harvested_tonnes",0).limit(5000)]);if(!live)return;if(s.error||h.error){setErr(s.error?.message||h.error?.message||"Failed to load seasons");return;}const productive=new Set((h.data||[]).map(r=>Number(r.season_id)));const available=((s.data||[]) as Season[]).filter(x=>productive.has(Number(x.season_id))&&x.season_name.trim().toLowerCase()!=="cont");setSeasons(available);setSeason(current=>available.some(x=>String(x.season_id)===current)?current:available.length?String(available[0].season_id):"");setErr("");})().catch(e=>{if(live)setErr(String(e))});return()=>{live=false}},[auth]);
 useEffect(()=>{if(!season)return;let live=true;(async()=>{setBusy(true);const [{data,error},{data:projection,error:projectionError}]=await Promise.all([supabase.from("wb_crop_harvest_report_v").select("*").eq("season_id",Number(season)).order("tracecode_name").limit(3000),supabase.from("wb_expected_yield_crop_v").select("*").eq("season_id",Number(season))]);if(!live)return;setBusy(false);if(error||projectionError){setErr(error?.message||projectionError?.message||"Query failed");return;}setErr("");setRows((data||[]) as CropRow[]);setExpected((projection||[]) as Expected[]);})();return()=>{live=false}},[season]);
 const shown=useMemo(()=>rows.filter(r=>(r.tracecode_name+" "+r.crop_name+" "+r.farm_name+" "+r.variety_name).toLowerCase().includes(filter.toLowerCase())),[rows,filter]);
 const ha=shown.reduce((s,r)=>s+Number(r.hectares||0),0),harvest=shown.reduce((s,r)=>s+Number(r.harvested_tonnes||0),0);
 const cropHarvest=new Map<number,number>();for(const r of rows)cropHarvest.set(r.crop_id,(cropHarvest.get(r.crop_id)||0)+Number(r.harvested_tonnes||0));
 const expectedByCrop=new Map(expected.map(e=>[e.crop_id,e]));
 const projected=(r:CropRow)=>{const e=expectedByCrop.get(r.crop_id),pool=cropHarvest.get(r.crop_id)||0;if(!e||e.expected_total_kg==null||pool<=0||!r.hectares||Number(r.hectares)<=0)return null;return (Number(e.expected_total_kg)/1000)*Number(r.harvested_tonnes||0)/pool/Number(r.hectares)};
 const estimated=shown.length>0&&shown.every(r=>projected(r)!=null)?shown.reduce((s,r)=>s+(projected(r)||0)*Number(r.hectares||0),0):null;
 async function saveMoist(){const m=Number(moistValue);if(!moistCrop||moistValue.trim()===""||!Number.isFinite(m)||m<0||m>100){setErr("Choose a crop and enter moisture between 0 and 100%.");return;}const {error}=await supabase.from("wb_stock_moisture_snapshot").upsert({season_id:Number(season),crop_id:Number(moistCrop),moisture_pct:m},{onConflict:"season_id,crop_id"});if(error){setErr(error.message);return;}const {data,error:e}=await supabase.from("wb_expected_yield_crop_v").select("*").eq("season_id",Number(season));if(e){setErr(e.message);return;}setExpected((data||[]) as Expected[]);setErr("");}
 const allDelivered=shown.length>0&&shown.every(r=>r.delivered_yield_t_ha!=null),allFinancial=shown.length>0&&shown.every(r=>r.financial_yield_t_ha!=null);
 const delivered=allDelivered?shown.reduce((s,r)=>s+Number(r.delivered_yield_t_ha)*Number(r.hectares||0),0):null;
 const financial=allFinancial?shown.reduce((s,r)=>s+Number(r.financial_yield_t_ha)*Number(r.hectares||0),0):null;
 function csv(){const hdr=["Season",...columns];const content=[hdr,...shown.map(r=>[r.season_name,r.crop_name||"",r.farm_name||"",r.variety_name||"",r.tracecode_name,r.irrigation_type||"",r.plant_population??"",dt(r.actual_planting_date),r.hectares??"",r.harvested_tonnes??"",r.harvest_yield_t_ha??"",projected(r)??"",r.delivered_yield_t_ha??"",r.financial_yield_t_ha??""])].map(a=>a.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");if(typeof document!=="undefined"){const blob=new Blob(["\ufeff",content],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="Crop_Report_"+(seasons.find(s=>String(s.season_id)===season)?.season_name||season)+".csv";link.click();URL.revokeObjectURL(url)}}
 if(Platform.OS!=="web")return <Text style={{padding:20}}>Crop Report is available on desktop web.</Text>;
 if(auth===null)return <Text style={{padding:20}}>Checking Admin access…</Text>;
 if(!auth)return <Text style={{padding:20}}>Crop Report — Admin only. {err}</Text>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{minWidth:1450,padding:18}}>
 <WbModuleHeader title="Crop Report"/>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:15,flexWrap:"wrap"}}>
 <Text style={{fontSize:29,fontWeight:"bold",color:"#1c2d40",marginRight:25}}>Crop Report {seasons.find(s=>String(s.season_id)===season)?.season_name||""}</Text>
 <Btn label="Print" fn={()=>{if(typeof window!=="undefined")window.print()}}/><Btn label="Excel / CSV" fn={csv}/>
 </View>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:15}}>
 <Text style={{marginRight:8,fontWeight:"bold"}}>Season</Text>
 <ScrollView horizontal style={{flexGrow:0,maxWidth:450,marginRight:24}}>{seasons.map(s=><Pressable key={s.season_id} onPress={()=>setSeason(String(s.season_id))} style={{padding:9,borderWidth:1,borderColor:"#d0d8e2",backgroundColor:season===String(s.season_id)?"#c6e4ff":"white",marginRight:5}}><Text>{s.season_name}</Text></Pressable>)}</ScrollView>
 <Text style={{marginRight:8,fontWeight:"bold"}}>TraceCode / Crop / Farm</Text><TextInput value={filter} onChangeText={setFilter} placeholder="Filter TraceCode" style={{backgroundColor:"#fff",padding:9,borderWidth:1,borderColor:"#c9d2df",width:235}}/>
 </View>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:10,flexWrap:"wrap"}}><Text style={{marginRight:8}}>Stock moisture (12% adjustment):</Text><ScrollView horizontal style={{flexGrow:0,maxWidth:450}}>{expected.filter(e=>Number(e.stock_kg)>0).map(e=><Pressable key={e.crop_id} onPress={()=>{setMoistCrop(String(e.crop_id));setMoistValue(e.moisture_pct==null?"":String(e.moisture_pct))}} style={{padding:8,backgroundColor:moistCrop===String(e.crop_id)?"#cfe7ff":"white",marginRight:5,borderWidth:1,borderColor:"#d5dce4"}}><Text>{rows.find(r=>r.crop_id===e.crop_id)?.crop_name||e.crop_id}: {e.moisture_pct==null?"missing":e.moisture_pct+"%"}</Text></Pressable>)}</ScrollView><TextInput placeholder="Moisture %" value={moistValue} onChangeText={setMoistValue} style={{width:115,backgroundColor:"white",borderWidth:1,borderColor:"#cbd5df",padding:8,marginHorizontal:8}}/><Btn label="Save moisture" fn={saveMoist}/></View>
 <View style={{flexDirection:"row",marginBottom:14}}>
 {[["Ha",fmt(ha,1)],["Harvested",fmt(harvest)+" t"],["Harvest Yield",ha>0?fmt(harvest/ha)+" t/ha":"—"],["Expected Yield",estimated!=null&&ha>0?fmt(estimated/ha)+" t/ha":"Pending"],["Delivered Yield",delivered!=null&&ha>0?fmt(delivered/ha)+" t/ha":"Pending"],["Financial Yield",financial!=null&&ha>0?fmt(financial/ha)+" t/ha":"Pending"]].map(([name,value])=><View key={name} style={{padding:13,marginRight:12,minWidth:170,backgroundColor:"#fff",borderRadius:6,borderWidth:1,borderColor:"#d9e0e8"}}><Text style={{fontSize:13,color:"#667085"}}>{name}</Text><Text style={{fontSize:20,fontWeight:"bold"}}>{value}</Text></View>)}
 </View>
 {err?<Text style={{color:"#b42318",marginBottom:10}}>{err}</Text>:null}
 <View style={{backgroundColor:"#fff",borderWidth:1,borderColor:"#ccd5df"}}>
 <View style={{flexDirection:"row",backgroundColor:"#f2e96a",borderBottomWidth:2,borderBottomColor:"#c6b849"}}>{columns.map((col,i)=>cell(col,i===3?"name":i===6?"date":String(i),i>=7?"right":"left"))}</View>
 {shown.map(r=><View key={r.tracecode_id} style={{flexDirection:"row",borderBottomWidth:1,borderBottomColor:"#e3e8ed"}}>
 {[[r.crop_name||"","0"],[r.farm_name||"","1"],[r.variety_name||"","2"],[r.tracecode_name,"name"],[r.irrigation_type||"","4"],[r.plant_population==null?"—":fmt(r.plant_population,0),"5"],[dt(r.actual_planting_date),"date"],[fmt(r.hectares,2),"7"],[fmt(r.harvested_tonnes),"8"],[fmt(r.harvest_yield_t_ha),"9"],[fmt(projected(r)),"12"],[fmt(r.delivered_yield_t_ha),"10"],[fmt(r.financial_yield_t_ha),"11"]].map(([v,k],i)=>cell(v,k,i>=7?"right":"left"))}
 </View>)}
 </View>
 <Text style={{color:"#687488",marginTop:12}}>{busy?"Loading…":shown.length+" TraceCodes"} · Expected Yield apportions each crop pool by its harvested TraceCode share, provisionally. Only dispatches represented in the farm-slip delivery workflow are included. Delivered and Financial yields remain blank until stock allocations and customer moisture deductions are reconciled. Totals follow the current filters.</Text>
 </ScrollView>;
}