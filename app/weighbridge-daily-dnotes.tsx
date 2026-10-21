import {wbParseDate,wbFormatDate,wbToday} from "../utils/wb-date";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import {useEffect,useMemo,useState} from "react";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
type Raw={source:string;source_id:string;report_date:string;dnote:string|null;wb_slip:string|null;crop_name:string|null;movement_kind:string|null;registration_text:string|null;load_kg:number;tracecode_id:number|null;tracecode_name:string|null;allocation_kg:number|null};
type Load={key:string;source:string;dnote:string;wbSlip:string;crop:string;movement:string;registration:string;kg:number;alloc:{name:string;kg:number}[]};
const n=(x:number)=>Number(x).toLocaleString("en-US",{maximumFractionDigits:2});
const parseDate=wbParseDate;
const localToday=wbToday;
export default function DailyDnotes(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[day,setDay]=useState(localToday),[data,setData]=useState<Raw[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 useEffect(()=>{if(Platform.OS!=="web"){setAllowed(false);return;}let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!alive)return;if(!user){setAllowed(false);return;}const r=await supabase.rpc("wb_admin_allowed");if(alive){setAllowed(r.data===true&&!r.error);if(r.error)setError(r.error.message)}})();return()=>{alive=false}},[]);
 useEffect(()=>{if(!allowed)return;let alive=true;const d=parseDate(day);if(!d){setData([]);setError("Enter a valid date as DD/MM/YYYY (or DD/MM for this year).");return;}setLoading(true);(async()=>{const r=await supabase.from("wb_daily_dnote_report_v").select("*").eq("report_date",d).limit(10000);if(!alive)return;setLoading(false);if(r.error){setError(r.error.message);setData([])}else{setData((r.data||[]) as Raw[]);setError("")}})();return()=>{alive=false}},[allowed,day]);
 const loads=useMemo(()=>{const map=new Map<string,Load>();for(const r of data){const key=r.source+":"+r.source_id;let l=map.get(key);if(!l){l={key,source:r.source,dnote:r.dnote||"",wbSlip:r.wb_slip||"",crop:r.crop_name||"",movement:r.movement_kind||"",registration:r.registration_text||"",kg:Number(r.load_kg),alloc:[]};map.set(key,l)}if(r.tracecode_id!=null)l.alloc.push({name:r.tracecode_name||String(r.tracecode_id),kg:Number(r.allocation_kg||0)})}return [...map.values()].sort((a,b)=>{const chunks=(s:string)=>s.match(/\d+|\D+/g)||[];const x=chunks(a.dnote),y=chunks(b.dnote);for(let i=0;i<Math.max(x.length,y.length);i++){if(x[i]==null)return -1;if(y[i]==null)return 1;let diff=/^\d+$/.test(x[i])&&/^\d+$/.test(y[i])?Number(x[i])-Number(y[i]):x[i].localeCompare(y[i]);if(diff)return diff}return a.key.localeCompare(b.key)})},[data]);
 const total=loads.reduce((a,x)=>a+x.kg,0),allocated=loads.reduce((a,x)=>a+x.alloc.reduce((s,b)=>s+b.kg,0),0);
 function exportCsv(){if(typeof document==="undefined")return;const headings=["Date","DNote","WB Slip","Source","Crop","Movement","Truck","Nett kg","Nett t","TraceCode","Allocation kg","Allocation t"];const lines=[headings,...loads.flatMap(l=>(l.alloc.length?l.alloc:[{name:"",kg:0}]).map((a,i)=>[wbFormatDate(parseDate(day)||day),l.dnote,l.wbSlip,l.source,l.crop,l.movement,l.registration,i===0?l.kg:"",i===0?l.kg/1000:"",a.name,a.name?a.kg:"",a.name?a.kg/1000:""]))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");const url=URL.createObjectURL(new Blob(["\ufeff",lines],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="Daily_DNotes_"+(parseDate(day)||"date")+".csv";a.click();URL.revokeObjectURL(url)}
 const btn=(name:string,onPress:()=>void)=><Pressable onPress={onPress} style={{padding:10,backgroundColor:C.primary,borderRadius:5,marginRight:9}}><Text style={{color:"white",fontWeight:"bold"}}>{name}</Text></Pressable>;
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;
 if(allowed===null)return <Text style={{padding:24}}>Checking Admin access…</Text>;
 if(!allowed)return <Text style={{padding:24}}>Daily DNotes Report — Admin only.</Text>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:22,minWidth:1020}}>
 <WbModuleHeader title="Daily DNotes"/>
 <Text style={{fontSize:26,fontWeight:"bold",marginBottom:6}}>Daily DNotes — Tonnage & Trace Allocations</Text>
 <Text style={{color:"#667085",marginBottom:14}}>Completed WB computer and manual slips · Ordered by DNote number · Zimbabwe local date</Text>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:14}}><Text style={{marginRight:10}}>Date (DD/MM/YYYY):</Text><TextInput value={day} onChangeText={setDay} style={{borderWidth:1,borderColor:"#c9d3df",padding:10,backgroundColor:"white",width:170,marginRight:12}}/>{btn("Today",()=>setDay(localToday()))}{btn("Print",()=>{if(typeof window!=="undefined")window.print()})}{btn("Excel / CSV",exportCsv)}</View>
 {error?<Text style={{color:"#b42318",marginBottom:10}}>{error}</Text>:null}
 <View style={{flexDirection:"row",marginBottom:16}}>{[["DNotes",String(loads.length)],["Nett tonnes",(total/1000).toFixed(3)+" t"],["Allocated tonnes",(allocated/1000).toFixed(3)+" t"]].map(([label,value])=><View key={label} style={{backgroundColor:"white",padding:15,marginRight:12,borderRadius:6,minWidth:185}}><Text style={{color:"#667085"}}>{label}</Text><Text style={{fontSize:21,fontWeight:"bold"}}>{value}</Text></View>)}</View>
 <View style={{backgroundColor:"white",borderWidth:1,borderColor:"#d4dce6"}}>
 <View style={{flexDirection:"row",backgroundColor:"#f4e96b",paddingVertical:12}}>{[["DNote",130],["Source",110],["Crop / Movement",210],["Truck",120],["Nett kg",110],["Nett t",100],["TraceCode allocations (kg)",300]].map(([s,w])=><Text key={s} style={{width:Number(w),paddingHorizontal:10,fontWeight:"bold"}}>{s}</Text>)}</View>
 {loads.map(l=><View key={l.key} style={{flexDirection:"row",paddingVertical:10,borderBottomWidth:1,borderColor:"#e7eaf0"}}>
 <Text style={{width:130,paddingHorizontal:10,fontWeight:"bold"}}>{l.dnote||"—"}{l.wbSlip?"\nWB "+l.wbSlip:""}</Text>
 <Text style={{width:110,paddingHorizontal:10}}>{l.source}</Text>
 <Text style={{width:210,paddingHorizontal:10}}>{l.crop}{"\n"}{l.movement}</Text>
 <Text style={{width:120,paddingHorizontal:10}}>{l.registration}</Text>
 <Text style={{width:110,paddingHorizontal:10,textAlign:"right"}}>{n(l.kg)}</Text>
 <Text style={{width:100,paddingHorizontal:10,textAlign:"right"}}>{(l.kg/1000).toFixed(3)}</Text>
 <View style={{width:300,paddingHorizontal:10}}>{l.alloc.length?l.alloc.map((a,i)=><Text key={i}>{a.name}: {n(a.kg)} kg</Text>):<Text style={{color:"#b42318"}}>No field allocation</Text>}
 {l.alloc.length>0&&Math.abs(l.alloc.reduce((s,a)=>s+a.kg,0)-l.kg)>0.01?<Text style={{color:"#b42318"}}>Allocation difference: {n(l.kg-l.alloc.reduce((s,a)=>s+a.kg,0))} kg</Text>:null}</View>
 </View>)}
 {!loading&&loads.length===0?<Text style={{padding:14,color:"#667085"}}>No completed DNotes for this date.</Text>:null}
 </View>
 <Text style={{marginTop:12,color:"#667085"}}>{loading?"Loading…":"Daily total: "+(total/1000).toFixed(3)+" tonnes across "+loads.length+" slips."} Loads are counted once even when allocated across several TraceCodes. Unallocated market loads are shown without field allocations.</Text>
 </ScrollView>;
}