import {useEffect,useMemo,useState} from "react";
import {router} from "expo-router";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import {wbFormatDate} from "../utils/wb-date";
type Scan={scan_document_id:string;batch_id:string;document_type:string;extraction_status:string;extracted_data:Record<string,unknown>|null;storage_path:string;page_start:number;page_end:number};
type Dispatch={source_type:string;source_id:string;slip_number:string;dnote_number:string|null;weigh_date:string;net_kg:number;registration_text:string|null;receiving_wb_number:string|null;grv_number:string|null};
type Receipt={scan_document_id:string;source_id:string|null};
const n=(x:unknown)=>String(x??"").replace(/[^a-zA-Z0-9]/g,"").toUpperCase();
const str=(x:unknown)=>String(x??"");
const date=(x:unknown)=>wbFormatDate(str(x));
function Btn({label,press,disabled=false}:{label:string;press:()=>void;disabled?:boolean}){return <Pressable onPress={press} disabled={disabled} style={{padding:10,margin:4,backgroundColor:disabled?"#aaa":C.primary,borderRadius:6}}><Text style={{color:"white",fontWeight:"bold"}}>{label}</Text></Pressable>}
export default function UnmatchedDocuments(){
 const [authorized,setAuthorized]=useState<boolean|null>(null),[scans,setScans]=useState<Scan[]>([]),[receipts,setReceipts]=useState<Receipt[]>([]),[loads,setLoads]=useState<Dispatch[]>([]),[samples,setSamples]=useState<string[]>([]),[selected,setSelected]=useState(""),[chosen,setChosen]=useState(""),[query,setQuery]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[info,setInfo]=useState("");
 async function refresh(){const [s,r,d,b]=await Promise.all([supabase.from("wb_scan_document").select("scan_document_id,batch_id,document_type,extraction_status,extracted_data,storage_path,page_start,page_end").eq("extraction_status","reviewed").limit(3000),supabase.from("wb_received_document").select("scan_document_id,source_id").limit(3000),supabase.from("wb_unified_dispatch_v").select("source_type,source_id,slip_number,dnote_number,weigh_date,net_kg,registration_text,receiving_wb_number,grv_number").order("weigh_date",{ascending:false}).limit(3000),supabase.from("wb_scan_batch").select("batch_id").eq("is_test",true)]);if(s.error||r.error||d.error||b.error){setError(s.error?.message||r.error?.message||d.error?.message||b.error?.message||"Load failed");return;}setScans((s.data||[]) as Scan[]);setReceipts((r.data||[]) as Receipt[]);setLoads(((d.data||[]) as Dispatch[]).filter(x=>x.source_type==="scale"||x.source_type==="manual"));setSamples((b.data||[]).map(x=>x.batch_id));}
 useEffect(()=>{let live=true;(async()=>{const u=await supabase.auth.getUser();if(!u.data.user){if(live)setAuthorized(false);return;}const r=await supabase.rpc("wb_admin_allowed");if(live)setAuthorized(r.data===true&&!r.error)})();return()=>{live=false}},[]);
 useEffect(()=>{if(authorized)refresh()},[authorized]);
 const unmatched=scans.filter(s=>!samples.includes(s.batch_id)&&["customer_wb","grv"].includes(s.document_type)&&!receipts.some(r=>r.scan_document_id===s.scan_document_id&&r.source_id));
 const current=unmatched.find(s=>s.scan_document_id===selected);const x=current?.extracted_data||{};
 const choices=useMemo(()=>{if(!current)return [];return loads.map(d=>{
  let score=0;const reason:string[]=[];const docNote=n(x.delivery_note),farmNote=n(d.dnote_number);
  if(docNote&&farmNote&&(docNote===farmNote)){score+=100;reason.push("DNote exact");}
  else if(docNote&&farmNote&&(docNote.includes(farmNote)||farmNote.includes(docNote))){score+=30;reason.push("DNote similar");}
  if(n(x.vehicle_reg)&&n(x.vehicle_reg)===n(d.registration_text)){score+=40;reason.push("Vehicle exact");}
  const days=Math.abs((Date.parse(str(x.receipt_date))-Date.parse(d.weigh_date))/86400000);
  if(Number.isFinite(days)&&days<=3){score+=15;reason.push("Date within 3 days");}
  if(current.document_type==="customer_wb"&&Math.abs(Number(x.net_kg)-Number(d.net_kg))<1000){score+=10;reason.push("Weight close");}
  const existing=current.document_type==="customer_wb"?d.receiving_wb_number:d.grv_number;
  const documentNumber=str(current.document_type==="customer_wb"?x.wb_number:x.grv_number);
  return {...d,score,reason,blocked:!!existing&&existing!==documentNumber};
 }).filter(d=>!d.blocked).filter(d=>!query.trim()||[d.dnote_number,d.slip_number,d.registration_text].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.score-a.score).slice(0,100)},[current,loads,query]);
 async function confirm(){if(!current||!chosen||busy)return;const d=loads.find(x=>x.source_type+":"+x.source_id===chosen);if(!d)return;setBusy(true);setError("");setInfo("");const r=await supabase.rpc("wb_confirm_reviewed_scan_match",{p_scan_document_id:current.scan_document_id,p_source_type:d.source_type,p_source_id:d.source_id});setBusy(false);if(r.error){setError(r.error.message);return;}setInfo("Confirmed. Document moved to history and "+(current.document_type==="grv"?"GRV":"Customer WB")+" outstanding status updated.");setSelected("");setChosen("");await refresh();}
 async function viewPdf(){if(!current)return;const r=await supabase.storage.from("wb-customer-documents").createSignedUrl(current.storage_path,300);if(r.error){setError(r.error.message);return;}if(typeof window!=="undefined")window.open(r.data.signedUrl,"_blank");}
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;if(authorized===null)return <Text>Checking access…</Text>;if(!authorized)return <Text>WB Admin only.</Text>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:20,minWidth:1050}}>
 <WbModuleHeader title="Unmatched Customer Documents"/>
 <Text style={{color:C.textSecondary,marginBottom:12}}>Reviewed scans are ready to match directly. Select a document and confirm the correct farm dispatch. Nothing changes automatically before your confirmation.</Text>
 <View style={{flexDirection:"row",marginBottom:10}}><Btn label="Batch Scanner" press={()=>router.push("/weighbridge-batch-scanner")}/><Btn label="Delivery Report" press={()=>router.push("/weighbridge-delivery-report")}/><Btn label="Refresh" press={refresh}/></View>
 {error?<Text style={{color:C.danger,marginBottom:10}}>{error}</Text>:null}{info?<Text style={{color:C.primary,marginBottom:10}}>{info}</Text>:null}
 <View style={{flexDirection:"row",gap:12,alignItems:"flex-start"}}>
 <View style={{width:340,padding:12,backgroundColor:"white",borderRadius:7}}><Text style={{fontWeight:"bold",fontSize:17}}>Unmatched ({unmatched.length})</Text>
 {unmatched.map(s=>{const d=s.extracted_data||{};return <Pressable key={s.scan_document_id} onPress={()=>{setSelected(s.scan_document_id);setChosen("");setQuery("");}} style={{padding:11,borderBottomWidth:1,borderColor:C.border,backgroundColor:selected===s.scan_document_id?C.successTint:"white"}}><Text style={{fontWeight:"bold"}}>{s.document_type==="grv"?"GRV":"WB"} {str(s.document_type==="grv"?d.grv_number:d.wb_number)||"No number"}</Text><Text>{date(d.receipt_date)} · {str(d.delivery_note)||"No DNote"} · {str(d.net_kg||d.accepted_kg)} kg</Text></Pressable>})}
 </View>
 <View style={{flex:1,backgroundColor:"white",padding:12,borderRadius:7}}>{!current?<Text>Select an unmatched document to see the suggested dispatch.</Text>:<>
 <Text style={{fontSize:18,fontWeight:"bold",marginBottom:8}}>Confirm where this document belongs</Text>
 <Text>{current.document_type==="grv"?"GRV":"Customer WB"} {str(current.document_type==="grv"?x.grv_number:x.wb_number)} · {str(x.delivery_note)||"DNote unknown"} · {str(x.vehicle_reg)||"No vehicle"} · {str(x.net_kg||x.accepted_kg)} kg</Text>
 <Btn label="Check original PDF" press={viewPdf}/>
 <TextInput value={query} onChangeText={setQuery} placeholder="Find DNote / WB slip / truck" style={{borderWidth:1,borderColor:C.border,padding:10,marginVertical:9}}/>
 {choices.map(d=><Pressable key={d.source_type+":"+d.source_id} onPress={()=>setChosen(d.source_type+":"+d.source_id)} style={{padding:11,marginBottom:7,borderWidth:1,borderRadius:6,borderColor:chosen===d.source_type+":"+d.source_id?C.primary:C.border,backgroundColor:chosen===d.source_type+":"+d.source_id?C.successTint:"white"}}>
 <Text style={{fontWeight:"bold"}}>DNote {d.dnote_number||"—"} · Slip {d.slip_number} · {Number(d.net_kg).toLocaleString()} kg</Text><Text style={{color:C.textSecondary}}>{wbFormatDate(d.weigh_date)} · {d.registration_text||"No vehicle"} · {d.reason.join(", ")||"No direct match indicators"}</Text>
 </Pressable>)}
 <Btn label={busy?"Confirming…":"Confirm this match and update Delivery Report"} press={confirm} disabled={busy||!chosen}/>
 </>}</View></View></ScrollView>;
}