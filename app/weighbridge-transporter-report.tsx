import {WbAdminSignIn} from "../components/jspl/WbAdminSignIn";
import {useEffect,useMemo,useState} from "react";
import {router} from "expo-router";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import {wbFormatDate} from "../utils/wb-date";
type Move={source_type:string;source_id:string;movement_date:string;slip_number:string;dnote_number:string|null;transporter_id:number|null;transporter_name:string;truck_reg:string;customer_name:string|null;report_season_id:number|null;farm_kg:number;received_kg:number|null;receiving_wb_number:string|null;charge_type:string|null};
type Rate={rate_id:number;season_id:number;charge_type:string;transporter_id:number|null;usd_rate:number};
type Season={season_id:number;season_name:string};
type Transporter={wb_transporter_id:number;wb_transporter_name:string};
const types=[["FIELD_STORAGE_DAY","Field to storage ($/truck/day)"],["GMB_TON","GMB ($/received tonne)"],["SEEDCO_TON","SeedCo ($/received tonne)"]];
const money=(v:number)=>Number(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
function Btn({name,go,disabled=false}:{name:string;go:()=>void;disabled?:boolean}){return <Pressable disabled={disabled} onPress={go} style={{padding:9,marginRight:7,marginBottom:7,borderRadius:5,backgroundColor:disabled?"#9da8a0":C.primary}}><Text style={{color:"white",fontWeight:"bold"}}>{name}</Text></Pressable>}
const esc=(x:string)=>x.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]||c));
export default function TransporterReport(){
 const [ok,setOk]=useState<boolean|null>(null),[rows,setRows]=useState<Move[]>([]),[rates,setRates]=useState<Rate[]>([]),[seasons,setSeasons]=useState<Season[]>([]),[transporters,setTransporters]=useState<Transporter[]>([]);
 const [season,setSeason]=useState("all"),[tr,setTr]=useState("all"),[truck,setTruck]=useState(""),[mode,setMode]=useState("all"),[error,setError]=useState(""),[info,setInfo]=useState(""),[busy,setBusy]=useState(false);
 const [rateSeason,setRateSeason]=useState(""),[rateTransporter,setRateTransporter]=useState("all"),[rateType,setRateType]=useState("FIELD_STORAGE_DAY"),[rateValue,setRateValue]=useState(""),[assignId,setAssignId]=useState("");
 async function refresh(){const [a,b,c,d]=await Promise.all([supabase.from("wb_transport_report_v").select("*").order("movement_date",{ascending:false}).limit(5000),supabase.from("season").select("season_id,season_name").order("season_id",{ascending:false}),supabase.from("wb_transport_rate").select("*"),supabase.from("wb_transporter").select("wb_transporter_id,wb_transporter_name")]);if(a.error||b.error||c.error||d.error){setError(a.error?.message||b.error?.message||c.error?.message||d.error?.message||"Load failed");return;}setRows((a.data||[]) as Move[]);setSeasons((b.data||[]) as Season[]);setRates((c.data||[]) as Rate[]);setTransporters((d.data||[]) as Transporter[]);setError("");}
 useEffect(()=>{let alive=true;(async()=>{const u=await supabase.auth.getUser();if(!u.data.user){if(alive)setOk(false);return;}const a=await supabase.rpc("wb_admin_allowed");if(alive)setOk(a.data===true&&!a.error)})();return()=>{alive=false}},[]);
 useEffect(()=>{if(ok)refresh()},[ok]);
 useEffect(()=>{if(!rateSeason){const s=seasons.find(x=>x.season_name==="Winter26")||seasons[0];if(s)setRateSeason(String(s.season_id))}},[seasons,rateSeason]);
 const results=useMemo(()=>{const daily=new Set<string>();return rows.filter(x=>(season==="all"||String(x.report_season_id)===season)&&(tr==="all"||String(x.transporter_id)===tr)&&x.truck_reg.toLowerCase().includes(truck.toLowerCase())&&(mode==="all"||x.charge_type===mode)).sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.source_id.localeCompare(b.source_id)).map(x=>{
 const own=x.transporter_name.trim().toLowerCase()==="own";
 const rate=rates.find(r=>r.season_id===x.report_season_id&&r.charge_type===x.charge_type&&r.transporter_id===x.transporter_id)||rates.find(r=>r.season_id===x.report_season_id&&r.charge_type===x.charge_type&&r.transporter_id===null);
 const day=[x.movement_date,x.transporter_id,x.truck_reg.replace(/\W/g,"").toUpperCase(),x.report_season_id].join("|");
 const first=!daily.has(day);if(x.charge_type==="FIELD_STORAGE_DAY")daily.add(day);
 const loss=x.charge_type==="GMB_TON"&&x.received_kg!==null?Number(x.farm_kg)-Number(x.received_kg):null;
 const pending=!own&&!!x.charge_type&&(!x.report_season_id||!rate||(x.charge_type!=="FIELD_STORAGE_DAY"&&(x.received_kg===null||!x.receiving_wb_number)));
 const charge=own?0:pending?null:x.charge_type==="FIELD_STORAGE_DAY"?(first?Number(rate?.usd_rate||0):0):x.charge_type?Number(rate?.usd_rate||0)*Number(x.received_kg||0)/1000:null;
 return {...x,loss,pending,charge,rate:rate?.usd_rate??null};
 })},[rows,season,tr,truck,mode,rates]);
 const headers=["Date","Season","Transporter","Truck","Slip","DNote","Route","Farm kg","Customer WB","Received kg","Loss kg","Rate USD","Charge USD","Status"];
 const tabular=results.map(x=>[wbFormatDate(x.movement_date),seasons.find(s=>s.season_id===x.report_season_id)?.season_name||"Unassigned",x.transporter_name,x.truck_reg,x.slip_number||"",x.dnote_number||"",x.charge_type==="FIELD_STORAGE_DAY"?"Field → Storage":x.charge_type==="GMB_TON"?"GMB":x.charge_type==="SEEDCO_TON"?"SeedCo":"Other",money(x.farm_kg),x.receiving_wb_number||"",x.received_kg===null?"Awaiting WB":money(x.received_kg),x.loss===null?"—":money(x.loss),x.rate===null?"—":money(x.rate),x.charge===null?"Pending":money(x.charge),x.loss!==null&&x.loss>200?"LOSS > 200 KG":x.pending?"Pending WB / rate":""]);
 const total=results.reduce((s,x)=>s+(x.charge??0),0),pending=results.filter(x=>x.pending).length,flagged=results.filter(x=>x.loss!==null&&x.loss>200).length;
 function download(){if(typeof document==="undefined")return;const csv="\ufeff"+[headers,...tabular].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="JSPL_Transporter_Report.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function print(){if(typeof window==="undefined")return;const w=window.open("","_blank");if(!w){setError("Allow popups to print.");return;}const body='<h2>JSPL Transporter Report</h2><p>USD '+money(total)+' · Pending '+pending+' · GMB losses above 200 kg '+flagged+'</p><table><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join("")+'</tr>'+tabular.map((r,i)=>'<tr>'+r.map((v,j)=>'<td style="'+(results[i].loss!==null&&results[i].loss>200&&(j===10||j===13)?"background:#ffd8d8;color:#b42318;font-weight:bold":"")+'">'+esc(String(v))+'</td>').join("")+'</tr>').join("")+'</table>';w.document.write('<html><head><style>body{font-family:Arial}table{border-collapse:collapse;width:100%;font-size:10px}td,th{border:1px solid #ccc;padding:4px}@page{size:landscape}</style></head><body>'+body+'</body></html>');w.document.close();w.print();}
 async function saveRate(){const v=Number(rateValue);if(!rateSeason||rateValue.trim()===""||!Number.isFinite(v)||v<0){setError("Enter a valid dollar rate and season.");return;}setBusy(true);const id=rateTransporter==="all"?null:Number(rateTransporter),existing=rates.find(r=>r.season_id===Number(rateSeason)&&r.charge_type===rateType&&r.transporter_id===id);const fields={season_id:Number(rateSeason),charge_type:rateType,transporter_id:id,usd_rate:v};const r=existing?await supabase.from("wb_transport_rate").update(fields).eq("rate_id",existing.rate_id):await supabase.from("wb_transport_rate").insert(fields);setBusy(false);if(r.error){setError(r.error.message);return;}setInfo("Charge rate saved.");await refresh();}
 async function assign(x:Move,id:number){setBusy(true);const r=await supabase.from("wb_transport_season_assignment").upsert({source_type:x.source_type,source_id:x.source_id,season_id:id},{onConflict:"source_type,source_id"});setBusy(false);if(r.error){setError(r.error.message);return;}setAssignId("");await refresh();}
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;if(ok===null)return <Text>Checking access…</Text>;if(!ok)return <WbAdminSignIn onAuthenticated={()=>setOk(true)}/>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:20,minWidth:1000}}>
 <WbModuleHeader title="Transporter Report"/>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}><Btn name="Refresh" go={refresh}/><Btn name="Export to Excel (CSV)" go={download}/><Btn name="Print report" go={print}/></View>
 <Text style={{color:C.textSecondary,marginBottom:12}}>Field → Storage: once per truck per day. GMB: USD 13/t and SeedCo: USD 21/t based on customer receiving WB. Own vehicles: no charge. Unmatched customer WB weights remain pending.</Text>
 {error?<Text style={{color:"#b42318"}}>{error}</Text>:null}{info?<Text style={{color:C.primary}}>{info}</Text>:null}
 <Text style={{fontWeight:"bold"}}>Season</Text><View style={{flexDirection:"row",flexWrap:"wrap"}}><Btn name={season==="all"?"All ✓":"All"} go={()=>setSeason("all")}/>{seasons.filter(s=>rows.some(x=>x.report_season_id===s.season_id)).map(s=><Btn key={s.season_id} name={s.season_name+(season===String(s.season_id)?" ✓":"")} go={()=>setSeason(String(s.season_id))}/>)}</View>
 <Text style={{fontWeight:"bold"}}>Transporter</Text><View style={{flexDirection:"row",flexWrap:"wrap"}}><Btn name="All transporters" go={()=>setTr("all")}/>{transporters.map(t=><Btn key={t.wb_transporter_id} name={t.wb_transporter_name+(tr===String(t.wb_transporter_id)?" ✓":"")} go={()=>setTr(String(t.wb_transporter_id))}/>)}</View>
 <Text style={{fontWeight:"bold"}}>Truck registration</Text><TextInput value={truck} onChangeText={setTruck} placeholder="Filter truck" style={{backgroundColor:"white",padding:10,borderWidth:1,borderColor:C.border,maxWidth:230,marginBottom:9}}/>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>{[["all","All movements"],...types].map(([v,n])=><Btn key={v} name={n+(mode===v?" ✓":"")} go={()=>setMode(v)}/>)}</View>
 <View style={{padding:14,backgroundColor:"white",marginBottom:12,flexDirection:"row",gap:24,flexWrap:"wrap"}}>
 <Text>Loads: <Text style={{fontWeight:"bold"}}>{results.length}</Text></Text><Text>Payable: <Text style={{fontWeight:"bold"}}>USD {money(total)}</Text></Text><Text>Pending charges: {pending}</Text><Text style={{color:flagged?"#b42318":C.text}}>GMB losses over 200 kg: <Text style={{fontWeight:"bold"}}>{flagged}</Text></Text>
 </View>
 <ScrollView horizontal style={{backgroundColor:"white",marginBottom:18}}><View>
 <View style={{flexDirection:"row",backgroundColor:C.primaryDark}}>{headers.map((h,j)=><Text key={j} style={{width:j===2?150:115,padding:8,color:"white",fontWeight:"bold"}}>{h}</Text>)}</View>
 {results.map((x,i)=><View key={x.source_type+x.source_id} style={{flexDirection:"row",borderBottomWidth:1,borderColor:"#ddd",backgroundColor:i%2?"#f7f9f7":"white"}}>{tabular[i].map((val,j)=><Text key={j} style={{width:j===2?150:115,padding:7,color:x.loss!==null&&x.loss>200&&(j===10||j===13)?"#b42318":C.text,fontWeight:x.loss!==null&&x.loss>200&&(j===10||j===13)?"bold":"normal",backgroundColor:x.loss!==null&&x.loss>200&&(j===10||j===13)?"#ffe0de":"transparent"}}>{val}</Text>)}</View>)}
 </View></ScrollView>
 <Text style={{fontSize:18,fontWeight:"bold",marginBottom:8}}>Seasonal charge table</Text>
 <View style={{backgroundColor:"white",padding:12,marginBottom:15}}>
 <Text>Season</Text><View style={{flexDirection:"row",flexWrap:"wrap"}}>{seasons.filter(s=>s.season_name==="Winter26"||s.season_name==="Summer26"||rates.some(r=>r.season_id===s.season_id)).map(s=><Btn key={s.season_id} name={s.season_name+(rateSeason===String(s.season_id)?" ✓":"")} go={()=>setRateSeason(String(s.season_id))}/>)}</View>
 <Text>Charge category</Text><View style={{flexDirection:"row",flexWrap:"wrap"}}>{types.map(([v,n])=><Btn key={v} name={n+(rateType===v?" ✓":"")} go={()=>setRateType(v)}/>)}</View>
 <Text>Transporter-specific override (optional)</Text><View style={{flexDirection:"row",flexWrap:"wrap"}}><Btn name="All hired" go={()=>setRateTransporter("all")}/>{transporters.filter(t=>t.wb_transporter_name.toLowerCase()!=="own").map(t=><Btn key={t.wb_transporter_id} name={t.wb_transporter_name} go={()=>setRateTransporter(String(t.wb_transporter_id))}/>)}</View>
 <TextInput value={rateValue} onChangeText={setRateValue} placeholder="USD rate" keyboardType="decimal-pad" style={{padding:10,borderWidth:1,borderColor:C.border,width:160,marginBottom:8}}/><Btn name={busy?"Saving…":"Save rate"} go={saveRate} disabled={busy}/>
 {rates.filter(r=>String(r.season_id)===rateSeason).map(r=><Text key={r.rate_id} style={{padding:5}}>{types.find(t=>t[0]===r.charge_type)?.[1]} · {r.transporter_id===null?"All hired":transporters.find(t=>t.wb_transporter_id===r.transporter_id)?.wb_transporter_name} · USD {money(r.usd_rate)}</Text>)}
 </View>
 <Text style={{fontSize:18,fontWeight:"bold",marginBottom:8}}>Loads missing season</Text><Text style={{color:C.textSecondary}}>Assign the correct season before charging. This does not change weighbridge slip data.</Text>
 {rows.filter(x=>x.report_season_id===null).map(x=><View key={x.source_type+x.source_id} style={{backgroundColor:"white",padding:9,marginBottom:6}}><Text>{wbFormatDate(x.movement_date)} · {x.transporter_name} · {x.truck_reg} · WB {x.slip_number} · {money(x.farm_kg)} kg</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}><Btn name="Assign season" go={()=>setAssignId(assignId===x.source_id?"":x.source_id)}/>{assignId===x.source_id?seasons.slice(0,12).map(s=><Btn key={s.season_id} name={s.season_name} go={()=>assign(x,s.season_id)} disabled={busy}/>):null}</View>
 </View>)}
 </ScrollView>;
}