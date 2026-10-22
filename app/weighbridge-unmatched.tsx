import React,{useEffect,useMemo,useState} from "react";
import {router,useLocalSearchParams} from "expo-router";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import {wbFormatDate} from "../utils/wb-date";
type Scan={linked_source_id?:string|null;scan_document_id:string;batch_id:string;document_type:string;extraction_status:string;extracted_data:Record<string,unknown>|null;storage_path:string;page_start:number;page_end:number};
type Dispatch={source_type:string;source_id:string;slip_number:string;dnote_number:string|null;weigh_date:string;net_kg:number;registration_text:string|null;receiving_wb_number:string|null;grv_number:string|null;own_slip_kg:number;linked_field_kg:number;linked_manual_slips:string};
type Receipt={scan_document_id:string;source_id:string|null};
const n=(x:unknown)=>String(x??"").replace(/[^a-zA-Z0-9]/g,"").toUpperCase();
const str=(x:unknown)=>String(x??"");
const date=(x:unknown)=>wbFormatDate(str(x));
function Btn({label,press,disabled=false}:{label:string;press:()=>void;disabled?:boolean}){return <Pressable onPress={press} disabled={disabled} style={{padding:10,margin:4,backgroundColor:disabled?"#aaa":C.primary,borderRadius:6}}><Text style={{color:"white",fontWeight:"bold"}}>{label}</Text></Pressable>}
export default function UnmatchedDocuments(){
 const params=useLocalSearchParams<{scan?:string}>();
 const [preview,setPreview]=useState("");
 const [customerDnote,setCustomerDnote]=useState("");
 const [authorized,setAuthorized]=useState<boolean|null>(null),[scans,setScans]=useState<Scan[]>([]),[receipts,setReceipts]=useState<Receipt[]>([]),[loads,setLoads]=useState<Dispatch[]>([]),[samples,setSamples]=useState<string[]>([]),[selected,setSelected]=useState(""),[chosen,setChosen]=useState(""),[query,setQuery]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[info,setInfo]=useState("");
 async function refresh(){const [s,r,d,b]=await Promise.all([supabase.from("wb_scan_document").select("scan_document_id,batch_id,document_type,extraction_status,extracted_data,storage_path,page_start,page_end,linked_source_id").eq("extraction_status","reviewed").limit(3000),supabase.from("wb_received_document").select("scan_document_id,source_id").limit(3000),supabase.from("wb_customer_dispatch_v").select("source_type,source_id,slip_number,dnote_number,weigh_date,net_kg,registration_text,receiving_wb_number,grv_number,own_slip_kg,linked_field_kg,linked_manual_slips").order("weigh_date",{ascending:false}).limit(3000),supabase.from("wb_scan_batch").select("batch_id").eq("is_test",true)]);if(s.error||r.error||d.error||b.error){setError(s.error?.message||r.error?.message||d.error?.message||b.error?.message||"Load failed");return;}setScans((s.data||[]) as Scan[]);setReceipts((r.data||[]) as Receipt[]);setLoads(((d.data||[]) as Dispatch[]).filter(x=>x.source_type==="scale"||x.source_type==="manual"));setSamples((b.data||[]).map(x=>x.batch_id));}
 useEffect(()=>{let live=true;(async()=>{const u=await supabase.auth.getUser();if(!u.data.user){if(live)setAuthorized(false);return;}const r=await supabase.rpc("wb_admin_allowed");if(live)setAuthorized(r.data===true&&!r.error)})();return()=>{live=false}},[]);
 useEffect(()=>{if(authorized)refresh()},[authorized]);
 useEffect(()=>{if(typeof params.scan==="string"&&params.scan)setSelected(params.scan)},[params.scan]);
 const unmatched=scans.filter(s=>!samples.includes(s.batch_id)&&["customer_wb","grv","customer_dnote"].includes(s.document_type)&&!s.linked_source_id&&!receipts.some(r=>r.scan_document_id===s.scan_document_id&&r.source_id));
 const current=unmatched.find(s=>s.scan_document_id===selected);const x=current?.extracted_data||{};
 useEffect(()=>{let alive=true;setPreview("");if(!current)return;supabase.storage.from("wb-customer-documents").createSignedUrl(current.storage_path,3600).then(r=>{if(!alive)return;if(r.error){setError("PDF preview: "+r.error.message);return;}setPreview(r.data?.signedUrl||"")});return()=>{alive=false}},[current?.scan_document_id]);
 const choices=useMemo(()=>{if(!current)return [];return loads.map(d=>{
  let score=0;const reason:string[]=[];const docNote=n(current.document_type==="customer_dnote"?"":x.delivery_note),farmNote=n(d.dnote_number);
  if(docNote&&farmNote&&(docNote===farmNote)){score+=100;reason.push("DNote exact");}
  else if(docNote&&farmNote&&(docNote.includes(farmNote)||farmNote.includes(docNote))){score+=30;reason.push("DNote similar");}
  if(n(x.vehicle_reg)&&n(x.vehicle_reg)===n(d.registration_text)){score+=40;reason.push("Vehicle exact");}
  const days=Math.abs((Date.parse(str(x.receipt_date))-Date.parse(d.weigh_date))/86400000);
  if(Number.isFinite(days)&&days<=3){score+=15;reason.push("Date within 3 days");}
  if(current.document_type==="customer_wb"&&Math.abs(Number(x.net_kg)-Number(d.net_kg))<1000){score+=10;reason.push("Weight close");}
  const existing=current.document_type==="customer_dnote"?"":current.document_type==="customer_wb"?d.receiving_wb_number:d.grv_number;
  const documentNumber=str(current.document_type==="customer_wb"?x.wb_number:current.document_type==="grv"?x.grv_number:"");
  return {...d,score,reason,blocked:!!existing&&existing!==documentNumber};
 }).filter(d=>!d.blocked).filter(d=>!query.trim()||[d.dnote_number,d.slip_number,d.registration_text].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.score-a.score).slice(0,100)},[current,loads,query]);
 async function confirm(){if(!current||!chosen||busy)return;const d=loads.find(x=>x.source_type+":"+x.source_id===chosen);if(!d)return;setBusy(true);setError("");setInfo("");const r=current.document_type==="customer_dnote"?await supabase.rpc("wb_confirm_customer_dnote_scan",{p_scan_document_id:current.scan_document_id,p_source_type:d.source_type,p_source_id:d.source_id,p_customer_dnote_number:customerDnote.trim()}):await supabase.rpc("wb_confirm_reviewed_scan_match",{p_scan_document_id:current.scan_document_id,p_source_type:d.source_type,p_source_id:d.source_id});setBusy(false);if(r.error){setError(r.error.message);return;}setInfo(current.document_type==="customer_dnote"?"Customer DNote linked to outgoing dispatch; Field DNote unchanged.":"Confirmed. Document moved to history and "+(current.document_type==="grv"?"GRV":current.document_type==="customer_dnote"?"Customer DNote":"Customer WB")+" outstanding status updated.");setSelected("");setChosen("");await refresh();}
 async function viewPdf(){if(!current)return;const r=await supabase.storage.from("wb-customer-documents").createSignedUrl(current.storage_path,300);if(r.error){setError(r.error.message);return;}if(typeof window!=="undefined")window.open(r.data.signedUrl,"_blank");}
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;if(authorized===null)return <Text>Checking access…</Text>;if(!authorized)return <Text>WB Admin only.</Text>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:20,minWidth:1050}}>
 <WbModuleHeader title="Unmatched Customer Documents"/>
 <Text style={{color:C.textSecondary,marginBottom:12}}>Reviewed scans are ready to match directly. Select a document and confirm the correct farm dispatch. Nothing changes automatically before your confirmation.</Text>
 <View style={{flexDirection:"row",marginBottom:10}}><Btn label="Batch Scanner" press={()=>router.push("/weighbridge-batch-scanner")}/><Btn label="Delivery Report" press={()=>router.push("/weighbridge-delivery-report")}/><Btn label="Refresh" press={refresh}/></View>
 {error?<Text style={{color:C.danger,marginBottom:10}}>{error}</Text>:null}{info?<Text style={{color:C.primary,marginBottom:10}}>{info}</Text>:null}
 {!current?<View style={{backgroundColor:"white",padding:16,borderRadius:7}}>
 <Text style={{fontSize:17,fontWeight:"bold",marginBottom:10}}>Select a document to confirm ({unmatched.length})</Text>
 {unmatched.map(s=>{const x=s.extracted_data||{};return <Pressable key={s.scan_document_id} onPress={()=>{setSelected(s.scan_document_id);setCustomerDnote(String((s.extracted_data||{}).customer_dnote_number||(s.extracted_data||{}).delivery_note_number||(s.extracted_data||{}).document_number||(s.extracted_data||{}).delivery_note||""));setChosen("");setQuery("");}} style={{padding:13,borderBottomWidth:1,borderColor:C.border}}>
 <Text style={{fontWeight:"bold"}}>{s.document_type==="grv"?"GRV":s.document_type==="customer_dnote"?"Customer DNote":"Customer WB"} {str(s.document_type==="customer_dnote"?x.customer_dnote_number||x.delivery_note_number||x.document_number||x.delivery_note:s.document_type==="grv"?x.grv_number:x.wb_number)}</Text>
 <Text>{date(x.receipt_date)} · {str(x.delivery_note)||"No reference"} · {str(x.net_kg||x.accepted_kg)} kg</Text></Pressable>})}
 </View>:<>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:10}}>
 <Text style={{fontWeight:"bold",fontSize:19,flex:1}}>Confirm matching DNote — {current.document_type==="grv"?"GRV":"Customer WB"} {str(current.document_type==="customer_dnote"?x.customer_dnote_number||x.delivery_note_number||x.document_number||x.delivery_note:current.document_type==="grv"?x.grv_number:x.wb_number)}</Text>
 <Btn label="Back to unmatched" press={()=>{setSelected("");setChosen("");setQuery("")}}/>
 </View>
 <View style={{flexDirection:"row",gap:14,alignItems:"flex-start"}}>
 <View style={{width:465,backgroundColor:"white",padding:14,borderRadius:7}}>
 <Text style={{fontWeight:"bold",fontSize:17,marginBottom:5}}>Select the correct Field DNote / WB dispatch</Text>
 {current.document_type==="customer_dnote"?<><Text style={{color:C.textSecondary}}>Enter the number printed on the customer-facing delivery note (not the Field DNote).</Text><TextInput value={customerDnote} onChangeText={setCustomerDnote} placeholder="Customer DNote number e.g. 5548" style={{borderWidth:1,borderColor:C.border,padding:10,marginBottom:10,borderRadius:5}}/></>:null}
 <Text style={{color:C.textSecondary,marginBottom:9}}>Customer document: {str(x.delivery_note)||"No reference"} · {str(x.vehicle_reg)||"No truck"} · {str(x.net_kg||x.accepted_kg)} kg</Text>
 <TextInput value={query} onChangeText={setQuery} placeholder="Search DNote / farm WB slip / vehicle" style={{borderWidth:1,borderColor:C.border,padding:10,marginBottom:10,borderRadius:5}}/>
 <ScrollView style={{maxHeight:580}}>
 {choices.map(d=><Pressable key={d.source_type+":"+d.source_id} onPress={()=>setChosen(d.source_type+":"+d.source_id)} style={{padding:11,marginBottom:7,borderWidth:1,borderRadius:6,borderColor:chosen===d.source_type+":"+d.source_id?C.primary:C.border,backgroundColor:chosen===d.source_type+":"+d.source_id?C.successTint:"white"}}>
 <Text style={{fontWeight:"bold"}}>{chosen===d.source_type+":"+d.source_id?"✓ ":""}Field DNote {d.dnote_number||"—"} · Slip {d.slip_number}</Text>
 <Text>{Number(d.net_kg).toLocaleString()} kg · {wbFormatDate(d.weigh_date)} · {d.registration_text||"No vehicle"}</Text>{Number(d.linked_field_kg)>0?<Text style={{color:C.primaryDark}}>Combined truck: WB {Number(d.own_slip_kg).toLocaleString()} kg + {d.linked_manual_slips} {Number(d.linked_field_kg).toLocaleString()} kg</Text>:null}
 <Text style={{color:C.textSecondary}}>{d.reason.join(", ")||"No matching indicators — verify manually"}</Text>
 </Pressable>)}
 {!choices.length?<Text>No available dispatches match the search. Clear the search to see all.</Text>:null}
 </ScrollView>
 <View style={{marginTop:12,paddingTop:9,borderTopWidth:1,borderColor:C.border}}>
 <Text style={{color:C.textSecondary,marginBottom:8}}>{chosen?"Selected DNote: "+(loads.find(d=>d.source_type+":"+d.source_id===chosen)?.dnote_number||"—"):"Select one DNote above before confirming."}</Text>
 <Btn label={busy?"Confirming…":current.document_type==="customer_dnote"?"Attach Customer DNote to dispatch":"Confirm match and update delivery"} press={confirm} disabled={busy||!chosen||(current.document_type==="customer_dnote"&&!customerDnote.trim())}/>
 </View>
 </View>
 <View style={{flex:1,minWidth:480,backgroundColor:"white",padding:12,borderRadius:7}}>
 <Text style={{fontWeight:"bold",fontSize:17,marginBottom:9}}>Original scanned document</Text>
 {preview?React.createElement("iframe" as any,{src:preview,title:"Customer document PDF",style:{width:"100%",height:790,border:"1px solid #d5d9df",borderRadius:5}}):<Text>Loading PDF preview…</Text>}
 <Btn label="Open PDF separately" press={viewPdf}/>
 </View>
 </View>
 </>}
 </ScrollView>;
}