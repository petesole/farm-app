import {wbParseDate,wbFormatDate,wbToday} from "../utils/wb-date";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {WbLastSync} from "../components/jspl/WbLastSync";
import {jsplColors as C} from "../constants/jspl-design";
import {useEffect,useMemo,useState} from "react";
import {Platform,Pressable,ScrollView,Text,View} from "react-native";
import {Picker} from "@react-native-picker/picker";
import {supabase} from "../supabase";
type Raw={source:string;source_id:string;report_date:string;dnote:string|null;wb_slip:string|null;crop_name:string|null;movement_kind:string|null;registration_text:string|null;load_kg:number;tracecode_id:number|null;tracecode_name:string|null;allocation_kg:number|null;season_id:number|null};
type Load={key:string;date:string;source:string;dnote:string;wbSlip:string;crop:string;movement:string;registration:string;kg:number;alloc:{name:string;kg:number}[]};
const n=(x:number)=>Number(x).toLocaleString("en-US",{maximumFractionDigits:2});
const parseDate=wbParseDate;
const localToday=wbToday;
export default function DailyDnotes(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[season,setSeason]=useState(""),[day,setDay]=useState("all"),[data,setData]=useState<Raw[]>([]),[seasonNames,setSeasonNames]=useState<{season_id:number;season_name:string}[]>([]),[sortCol,setSortCol]=useState("date"),[sortAsc,setSortAsc]=useState(false),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 useEffect(()=>{if(Platform.OS!=="web"){setAllowed(false);return;}let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!alive)return;if(!user){setAllowed(false);return;}const r=await supabase.rpc("wb_admin_allowed");if(alive){setAllowed(r.data===true&&!r.error);if(r.error)setError(r.error.message)}})();return()=>{alive=false}},[]);
 useEffect(()=>{if(!allowed)return;let alive=true;setLoading(true);(async()=>{const [r,s]=await Promise.all([supabase.from("wb_daily_dnote_season_v").select("*").order("report_date",{ascending:false}).limit(20000),supabase.from("season").select("season_id,season_name")]);if(!alive)return;setLoading(false);if(r.error||s.error){setError(r.error?.message||s.error?.message||"Unable to load");setData([]);return;}setData((r.data||[]) as Raw[]);setSeasonNames(s.data||[]);setError("")})();return()=>{alive=false}},[allowed]);
 const availableSeasons=useMemo(()=>{const ids=new Set(data.map(r=>r.season_id).filter((id):id is number=>id!==null));return seasonNames.filter(s=>ids.has(s.season_id)).sort((a,b)=>b.season_id-a.season_id)},[data,seasonNames]);
 useEffect(()=>{if(!season&&availableSeasons.length)setSeason(String(availableSeasons[0].season_id))},[season,availableSeasons]);
 const dates=useMemo(()=>[...new Set(data.filter(r=>String(r.season_id)===season).map(r=>r.report_date))].sort((a,b)=>b.localeCompare(a)),[data,season]);
 useEffect(()=>{setDay("all")},[season]);
 const filtered=useMemo(()=>data.filter(r=>String(r.season_id)===season&&(day==="all"||r.report_date===day)),[data,season,day]);
 const loads=useMemo(()=>{const map=new Map<string,Load>();for(const r of filtered){const key=r.source+":"+r.source_id;let l=map.get(key);if(!l){l={key,date:r.report_date,source:r.source,dnote:r.dnote||"",wbSlip:r.wb_slip||"",crop:r.crop_name||"",movement:r.movement_kind||"",registration:r.registration_text||"",kg:Number(r.load_kg),alloc:[]};map.set(key,l)}if(r.tracecode_id!=null)l.alloc.push({name:r.tracecode_name||String(r.tracecode_id),kg:Number(r.allocation_kg||0)})}return [...map.values()].sort((a,b)=>{const value=(x:Load)=>sortCol==="date"?x.date:sortCol==="dnote"?x.dnote:sortCol==="wb"?x.wbSlip:sortCol==="source"?x.source:sortCol==="crop"?x.crop+" "+x.movement:sortCol==="truck"?x.registration:sortCol==="kg"?x.kg:sortCol==="tonnes"?x.kg/1000:sortCol==="allocation"?x.alloc.map(t=>t.name).join(", "):x.wbSlip;const x=value(a),y=value(b);const diff=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),undefined,{numeric:true,sensitivity:"base"});return (sortAsc?diff:-diff)||b.date.localeCompare(a.date)})},[filtered,sortCol,sortAsc]);
 const changeSort=(key:string)=>{if(sortCol===key)setSortAsc(v=>!v);else{setSortCol(key);setSortAsc(true)}};
 const pickerStyle={height:44,minWidth:185,backgroundColor:"white",borderWidth:1,borderColor:"#c9d3df",marginRight:12} as const;
 const total=loads.reduce((a,x)=>a+x.kg,0),allocated=loads.reduce((a,x)=>a+x.alloc.reduce((s,b)=>s+b.kg,0),0);
 function exportCsv(){if(typeof document==="undefined")return;const headings=["Date","DNote","WB Slip","Source","Crop","Movement","Truck","Nett kg","Nett t","TraceCode","Allocation kg","Allocation t"];const lines=[headings,...loads.flatMap(l=>(l.alloc.length?l.alloc:[{name:"",kg:0}]).map((a,i)=>[wbFormatDate(l.date),l.dnote,l.wbSlip,l.source,l.crop,l.movement,l.registration,i===0?l.kg:"",i===0?l.kg/1000:"",a.name,a.name?a.kg:"",a.name?a.kg/1000:""]))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");const url=URL.createObjectURL(new Blob(["\ufeff",lines],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="Daily_DNotes_"+season+"_"+(day==="all"?"All":day)+".csv";a.click();URL.revokeObjectURL(url)}
 const btn=(name:string,onPress:()=>void)=><Pressable onPress={onPress} style={{padding:10,backgroundColor:C.primary,borderRadius:5,marginRight:9}}><Text style={{color:"white",fontWeight:"bold"}}>{name}</Text></Pressable>;
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;
 if(allowed===null)return <Text style={{padding:24}}>Checking Admin access…</Text>;
 if(!allowed)return <Text style={{padding:24}}>Daily DNotes Report — Admin only.</Text>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:22,minWidth:1020}}>
 <WbModuleHeader title="Daily DNotes" right={<WbLastSync refreshKey={data.length}/>}/>
 <Text style={{fontSize:26,fontWeight:"bold",marginBottom:6}}>Daily DNotes — Tonnage & Trace Allocations</Text>
 <Text style={{color:"#667085",marginBottom:14}}>Completed WB computer and manual slips · Choose a season to view all records, latest first · Click any column heading to sort</Text>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
 <Text style={{marginRight:8,fontWeight:"bold"}}>Season:</Text>
 <Picker selectedValue={season} onValueChange={v=>setSeason(String(v))} style={pickerStyle}>{availableSeasons.map(s=><Picker.Item key={s.season_id} label={s.season_name} value={String(s.season_id)}/>)}</Picker>
 <Text style={{marginRight:8,fontWeight:"bold"}}>Date:</Text>
 <Picker selectedValue={day} onValueChange={v=>setDay(String(v))} style={pickerStyle}><Picker.Item label="All dates — latest first" value="all"/>{dates.map(d=><Picker.Item key={d} label={wbFormatDate(d)} value={d}/>)}</Picker>
 {btn("Print",()=>{if(typeof window!=="undefined")window.print()})}{btn("Excel / CSV",exportCsv)}
 </View>
 {error?<Text style={{color:"#b42318",marginBottom:10}}>{error}</Text>:null}
 <View style={{flexDirection:"row",marginBottom:16}}>{[["DNotes",String(loads.length)],["Nett tonnes",(total/1000).toFixed(3)+" t"],["Allocated tonnes",(allocated/1000).toFixed(3)+" t"]].map(([label,value])=><View key={label} style={{backgroundColor:"white",padding:15,marginRight:12,borderRadius:6,minWidth:185}}><Text style={{color:"#667085"}}>{label}</Text><Text style={{fontSize:21,fontWeight:"bold"}}>{value}</Text></View>)}</View>
 <View style={{backgroundColor:"white",borderWidth:1,borderColor:"#d4dce6"}}>
 <View style={{flexDirection:"row",backgroundColor:"#f4e96b",paddingVertical:12}}>{[["Date",110,"date"],["DNote",130,"dnote"],["WB Slip",100,"wb"],["Source",100,"source"],["Crop / Movement",210,"crop"],["Truck",120,"truck"],["Nett kg",110,"kg"],["Nett t",100,"tonnes"],["TraceCode allocations (kg)",300,"allocation"]].map(([s,w,key])=><Pressable key={key} onPress={()=>changeSort(String(key))} style={{width:Number(w),paddingHorizontal:10}}><Text style={{fontWeight:"bold"}}>{s}{sortCol===key?(sortAsc?" ↑":" ↓"):" ↕"}</Text></Pressable>)}</View>
 {loads.map(l=><View key={l.key} style={{flexDirection:"row",paddingVertical:10,borderBottomWidth:1,borderColor:"#e7eaf0"}}>
 <Text style={{width:110,paddingHorizontal:10}}>{wbFormatDate(l.date)}</Text>
 <Text style={{width:130,paddingHorizontal:10,fontWeight:"bold"}}>{l.dnote||"—"}</Text>
 <Text style={{width:100,paddingHorizontal:10}}>{l.wbSlip||"—"}</Text>
 <Text style={{width:100,paddingHorizontal:10}}>{l.source}</Text>
 <Text style={{width:210,paddingHorizontal:10}}>{l.crop}{"\n"}{l.movement}</Text>
 <Text style={{width:120,paddingHorizontal:10}}>{l.registration}</Text>
 <Text style={{width:110,paddingHorizontal:10,textAlign:"right"}}>{n(l.kg)}</Text>
 <Text style={{width:100,paddingHorizontal:10,textAlign:"right"}}>{(l.kg/1000).toFixed(3)}</Text>
 <View style={{width:300,paddingHorizontal:10}}>{l.alloc.length?l.alloc.map((a,i)=><Text key={i}>{a.name}: {n(a.kg)} kg</Text>):<Text style={{color:"#b42318"}}>No field allocation</Text>}
 {l.alloc.length>0&&Math.abs(l.alloc.reduce((s,a)=>s+a.kg,0)-l.kg)>0.01?<Text style={{color:"#b42318"}}>Allocation difference: {n(l.kg-l.alloc.reduce((s,a)=>s+a.kg,0))} kg</Text>:null}</View>
 </View>)}
 {!loading&&loads.length===0?<Text style={{padding:14,color:"#667085"}}>No completed DNotes for the selected season and date.</Text>:null}
 </View>
 <Text style={{marginTop:12,color:"#667085"}}>{loading?"Loading…":"Selected total: "+(total/1000).toFixed(3)+" tonnes across "+loads.length+" slips."} Loads are counted once even when allocated across several TraceCodes. Unallocated market loads are shown without field allocations.</Text>
 </ScrollView>;
}