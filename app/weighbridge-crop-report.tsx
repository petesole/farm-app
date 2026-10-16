import { useEffect,useMemo,useState } from "react";
import { Platform,Pressable,ScrollView,Text,TextInput,View } from "react-native";
import { supabase } from "../supabase";
type CropRow={tracecode_id:number;tracecode_name:string;season_id:number;season_name:string;crop_name:string|null;farm_name:string|null;variety_name:string|null;irrigation_type:string|null;plant_population:number|null;actual_planting_date:string|null;hectares:number|null;harvested_tonnes:number|null;harvest_yield_t_ha:number|null;delivered_yield_t_ha:number|null;financial_yield_t_ha:number|null};
type Season={season_id:number;season_name:string};
const fmt=(v:number|null|undefined,n=2)=>v==null?"—":Number(v).toLocaleString("en-US",{minimumFractionDigits:n,maximumFractionDigits:n});
const dt=(d:string|null)=>d?/^\d{4}-\d{2}-\d{2}$/.test(d)?d:d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4):"—";
const columns=["Crop","Farm","Variety","TraceCode","Irrigation","Plant Pop","Actual Planting","Ha","Harvested (t)","Harvest t/ha","Delivered t/ha","Financial t/ha"];
const cell=(v:string|number,key:string,align:"left"|"right"="left")=><View key={key} style={{width:key==="name"?145:key==="date"?130:110,padding:8,borderRightWidth:1,borderRightColor:"#d4dbe3",justifyContent:"center"}}><Text style={{color:"#243247",textAlign:align}}>{v}</Text></View>;
function Btn({label,fn}:{label:string;fn:()=>void}){return <Pressable onPress={fn} style={{paddingVertical:10,paddingHorizontal:18,marginRight:10,borderRadius:5,backgroundColor:"#cbeaff",borderWidth:1,borderColor:"#80baf0"}}><Text>{label}</Text></Pressable>}
export default function CropReport(){
 const [auth,setAuth]=useState<boolean|null>(null),[seasons,setSeasons]=useState<Season[]>([]),[season,setSeason]=useState(""),[rows,setRows]=useState<CropRow[]>([]),[filter,setFilter]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{if(Platform.OS!=="web"){setAuth(false);return;}let live=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!live)return;if(!user){setAuth(false);setErr("Sign in with your Admin account.");return;}const a=await supabase.rpc("wb_admin_allowed");if(!live)return;setAuth(a.data===true&&!a.error);if(a.error)setErr(a.error.message)})();return()=>{live=false}},[]);
 useEffect(()=>{if(!auth)return;(async()=>{const {data,error}=await supabase.from("season").select("season_id,season_name").order("season_id",{ascending:false});if(error){setErr(error.message);return;}setSeasons((data||[]) as Season[]);if(data?.length)setSeason(String(data[0].season_id));})()},[auth]);
 useEffect(()=>{if(!season)return;let live=true;(async()=>{setBusy(true);const {data,error}=await supabase.from("wb_crop_harvest_report_v").select("*").eq("season_id",Number(season)).order("tracecode_name").limit(3000);if(!live)return;setBusy(false);if(error){setErr(error.message);return;}setErr("");setRows((data||[]) as CropRow[]);})();return()=>{live=false}},[season]);
 const shown=useMemo(()=>rows.filter(r=>(r.tracecode_name+" "+r.crop_name+" "+r.farm_name+" "+r.variety_name).toLowerCase().includes(filter.toLowerCase())),[rows,filter]);
 const ha=shown.reduce((s,r)=>s+Number(r.hectares||0),0),harvest=shown.reduce((s,r)=>s+Number(r.harvested_tonnes||0),0);
 const allDelivered=shown.length>0&&shown.every(r=>r.delivered_yield_t_ha!=null),allFinancial=shown.length>0&&shown.every(r=>r.financial_yield_t_ha!=null);
 const delivered=allDelivered?shown.reduce((s,r)=>s+Number(r.delivered_yield_t_ha)*Number(r.hectares||0),0):null;
 const financial=allFinancial?shown.reduce((s,r)=>s+Number(r.financial_yield_t_ha)*Number(r.hectares||0),0):null;
 function csv(){const hdr=["Season",...columns];const content=[hdr,...shown.map(r=>[r.season_name,r.crop_name||"",r.farm_name||"",r.variety_name||"",r.tracecode_name,r.irrigation_type||"",r.plant_population??"",dt(r.actual_planting_date),r.hectares??"",r.harvested_tonnes??"",r.harvest_yield_t_ha??"",r.delivered_yield_t_ha??"",r.financial_yield_t_ha??""])].map(a=>a.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");if(typeof document!=="undefined"){const blob=new Blob(["\ufeff",content],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="Crop_Report_"+(seasons.find(s=>String(s.season_id)===season)?.season_name||season)+".csv";link.click();URL.revokeObjectURL(url)}}
 if(Platform.OS!=="web")return <Text style={{padding:20}}>Crop Report is available on desktop web.</Text>;
 if(auth===null)return <Text style={{padding:20}}>Checking Admin access…</Text>;
 if(!auth)return <Text style={{padding:20}}>Crop Report — Admin only. {err}</Text>;
 return <ScrollView style={{flex:1,backgroundColor:"#f5f7fa"}} contentContainerStyle={{minWidth:1450,padding:18}}>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:15,flexWrap:"wrap"}}>
 <Text style={{fontSize:29,fontWeight:"bold",color:"#1c2d40",marginRight:25}}>Crop Report {seasons.find(s=>String(s.season_id)===season)?.season_name||""}</Text>
 <Btn label="Print" fn={()=>{if(typeof window!=="undefined")window.print()}}/><Btn label="Excel / CSV" fn={csv}/>
 </View>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:15}}>
 <Text style={{marginRight:8,fontWeight:"bold"}}>Season</Text>
 <ScrollView horizontal style={{flexGrow:0,maxWidth:450,marginRight:24}}>{seasons.map(s=><Pressable key={s.season_id} onPress={()=>setSeason(String(s.season_id))} style={{padding:9,borderWidth:1,borderColor:"#d0d8e2",backgroundColor:season===String(s.season_id)?"#c6e4ff":"white",marginRight:5}}><Text>{s.season_name}</Text></Pressable>)}</ScrollView>
 <Text style={{marginRight:8,fontWeight:"bold"}}>TraceCode / Crop / Farm</Text><TextInput value={filter} onChangeText={setFilter} placeholder="Filter TraceCode" style={{backgroundColor:"#fff",padding:9,borderWidth:1,borderColor:"#c9d2df",width:235}}/>
 </View>
 <View style={{flexDirection:"row",marginBottom:14}}>
 {[["Ha",fmt(ha,1)],["Harvested",fmt(harvest)+" t"],["Harvest Yield",ha>0?fmt(harvest/ha)+" t/ha":"—"],["Delivered Yield",delivered!=null&&ha>0?fmt(delivered/ha)+" t/ha":"Pending"],["Financial Yield",financial!=null&&ha>0?fmt(financial/ha)+" t/ha":"Pending"]].map(([name,value])=><View key={name} style={{padding:13,marginRight:12,minWidth:170,backgroundColor:"#fff",borderRadius:6,borderWidth:1,borderColor:"#d9e0e8"}}><Text style={{fontSize:13,color:"#667085"}}>{name}</Text><Text style={{fontSize:20,fontWeight:"bold"}}>{value}</Text></View>)}
 </View>
 {err?<Text style={{color:"#b42318",marginBottom:10}}>{err}</Text>:null}
 <View style={{backgroundColor:"#fff",borderWidth:1,borderColor:"#ccd5df"}}>
 <View style={{flexDirection:"row",backgroundColor:"#f2e96a",borderBottomWidth:2,borderBottomColor:"#c6b849"}}>{columns.map((col,i)=>cell(col,i===3?"name":i===6?"date":String(i),i>=7?"right":"left"))}</View>
 {shown.map(r=><View key={r.tracecode_id} style={{flexDirection:"row",borderBottomWidth:1,borderBottomColor:"#e3e8ed"}}>
 {[[r.crop_name||"","0"],[r.farm_name||"","1"],[r.variety_name||"","2"],[r.tracecode_name,"name"],[r.irrigation_type||"","4"],[r.plant_population==null?"—":fmt(r.plant_population,0),"5"],[dt(r.actual_planting_date),"date"],[fmt(r.hectares,2),"7"],[fmt(r.harvested_tonnes),"8"],[fmt(r.harvest_yield_t_ha),"9"],[fmt(r.delivered_yield_t_ha),"10"],[fmt(r.financial_yield_t_ha),"11"]].map(([v,k],i)=>cell(v,k,i>=7?"right":"left"))}
 </View>)}
 </View>
 <Text style={{color:"#687488",marginTop:12}}>{busy?"Loading…":shown.length+" TraceCodes"} · Delivered and Financial yields remain blank until stock allocations and customer moisture deductions are reconciled. Totals follow the current filters.</Text>
 </ScrollView>;
}