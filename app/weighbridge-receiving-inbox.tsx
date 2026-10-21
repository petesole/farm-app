import {wbParseDate,wbFormatDate,wbToday} from "../utils/wb-date";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import {useEffect,useState} from "react";
import {router} from "expo-router";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
type Scan={batch_id:string;scan_document_id:string;document_type:string;page_start:number;page_end:number;extraction_status:string;extracted_data:Record<string,unknown>|null;original_filename:string;storage_path:string};
type Receipt={received_id:string;scan_document_id:string;document_type:string;document_number:string;document_date:string;net_kg:number;delivery_note:string|null;vehicle_reg:string|null;customer_wb_id:string|null;source_id:string|null};
const blue=C.primary;
function Button({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}){return <Pressable disabled={disabled} onPress={onPress} style={{padding:10,backgroundColor:disabled?"#a9b2bc":blue,borderRadius:5,marginRight:8,marginBottom:8}}><Text style={{color:"white",fontWeight:"bold"}}>{label}</Text></Pressable>}
const val=(x:unknown)=>x===null||x===undefined?"":String(x);
const date=wbParseDate;
export default function ReceiptInbox(){
 const [testBatchIds,setTestBatchIds]=useState<string[]>([]);const [authorized,setAuthorized]=useState<boolean|null>(null),[scans,setScans]=useState<Scan[]>([]),[receipts,setReceipts]=useState<Receipt[]>([]),[active,setActive]=useState<string|null>(null),[edit,setEdit]=useState<Record<string,string>>({}),[grvLink,setGrvLink]=useState<string>(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[info,setInfo]=useState("");
 async function refresh(){const [a,b,batches]=await Promise.all([supabase.from("wb_scan_document").select("*").order("created_at",{ascending:false}).limit(500),supabase.from("wb_received_document").select("*").order("created_at",{ascending:false}).limit(500),supabase.from("wb_scan_batch").select("batch_id").eq("is_test",true)]);if(a.error||b.error||batches.error){setError(a.error?.message||b.error?.message||batches.error?.message||"Loading failed");return;}setScans(a.data as Scan[]||[]);setReceipts(b.data as Receipt[]||[]);setTestBatchIds((batches.data||[]).map(x=>x.batch_id));}
 useEffect(()=>{let alive=true;(async()=>{const u=await supabase.auth.getUser();if(!u.data.user){if(alive)setAuthorized(false);return;}const a=await supabase.rpc("wb_admin_allowed");if(alive)setAuthorized(a.data===true)})();return()=>{alive=false}},[]);
 useEffect(()=>{if(authorized)refresh()},[authorized]);
 function start(s:Scan){const d=s.extracted_data||{};setActive(s.scan_document_id);setError("");setInfo("");setEdit({document_number:val(s.document_type==="grv"?d.grv_number:d.wb_number),document_date:wbFormatDate(val(d.receipt_date)),net_kg:val(s.document_type==="grv"?(d.accepted_kg??d.net_kg):d.net_kg),delivery_note:val(d.delivery_note),vehicle_reg:val(d.vehicle_reg),trailer_reg:val(d.trailer_reg),moisture_pct:val(d.moisture_pct),defects_pct:val(d.defects_pct),extraneous_matter_pct:val(d.extraneous_matter_pct),test_density:val(d.test_density),wheat_grade:val(d.wheat_grade),customer:val(d.customer),depot:val(d.depot)});setGrvLink("");}
 async function openScan(s:Scan){const a=await supabase.storage.from("wb-customer-documents").createSignedUrl(s.storage_path,120);if(a.error){setError(a.error.message);return;}if(typeof window!=="undefined"&&a.data?.signedUrl)window.open(a.data.signedUrl,"_blank");}
 async function save(s:Scan){
 if(busy)return;
 const posted=receipts.find(r=>r.scan_document_id===s.scan_document_id);
 if(posted?.source_id){setError("This document is already matched to a dispatch. Use the Delivery Report for corrections.");return;}
 if(testBatchIds.includes(s.batch_id)){setError("Sample documents cannot be saved as live receipts.");return;}
 if(s.extraction_status!=="reviewed"){setError("Review and save the AI reading in Batch Scanner before posting.");return;}
 const num=edit.document_number.trim(),dt=date(edit.document_date.trim()),net=Number(edit.net_kg);
 if(!num||!dt||edit.net_kg.trim()===""||!Number.isFinite(net)||net<0){setError("Document number, valid DD/MM/YYYY date (or DD/MM for this year) and nett/accepted kg are required.");return;}
 const existing=receipts.find(r=>r.scan_document_id===s.scan_document_id);
 const fields:any={scan_document_id:s.scan_document_id,document_type:s.document_type,document_number:num,document_date:dt,net_kg:net,delivery_note:edit.delivery_note||null,vehicle_reg:edit.vehicle_reg||null,trailer_reg:edit.trailer_reg||null,moisture_pct:edit.moisture_pct?Number(edit.moisture_pct):null,defects_pct:edit.defects_pct?Number(edit.defects_pct):null,extraneous_matter_pct:edit.extraneous_matter_pct?Number(edit.extraneous_matter_pct):null,test_density:edit.test_density?Number(edit.test_density):null,wheat_grade:edit.wheat_grade||null,customer:edit.customer||null,depot:edit.depot||null};
 if(s.document_type==="grv")fields.customer_wb_id=grvLink||null;
 for(const k of ["moisture_pct","defects_pct","extraneous_matter_pct","test_density"]){if(fields[k]!==null&&(!Number.isFinite(fields[k])||fields[k]<0||(k!=="test_density"&&fields[k]>100))){setError("Check the percentage and density readings.");return;}}
 setBusy(true);setError("");
 try{const r=existing?await supabase.from("wb_received_document").update(fields).eq("received_id",existing.received_id):await supabase.from("wb_received_document").insert(fields);if(r.error)throw r.error;setInfo(existing?"Receiving record updated. Match it to a dispatch to update statuses.":"Receiving record saved. Next: Match live documents to a farm dispatch.");setActive(null);await refresh();}
 catch(e:any){setError(e.message||"Could not save");}finally{setBusy(false)}
 }
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;if(authorized===null)return <Text>Checking access…</Text>;if(!authorized)return <Text>WB Admin only.</Text>;
 return <ScrollView style={{backgroundColor:C.background,flex:1}} contentContainerStyle={{padding:20,minWidth:900}}>
 <WbModuleHeader title="Receiving Documents"/>
 <Text style={{fontSize:25,fontWeight:"bold",marginBottom:8}}>Customer Receiving Documents</Text>
 <Text style={{color:"#526173",marginBottom:12}}>Review and save live customer WB and GRV documents, then use Match Live Documents to confirm the original farm DNote. Matching independently updates outstanding WB and GRV statuses. Sample documents are excluded.</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}><Button label="Match live documents" onPress={()=>router.push("/weighbridge-live-matching")}/><Button label="Back to Batch Scanner" onPress={()=>router.push("/weighbridge-batch-scanner")}/><Button label="Delivery Report" onPress={()=>router.push("/weighbridge-delivery-report")}/><Button label="Refresh" onPress={refresh}/></View>
 {error?<Text style={{color:"#b42318",marginBottom:10}}>{error}</Text>:null}{info?<Text style={{color:"#166534",marginBottom:10}}>{info}</Text>:null}
 {scans.filter(s=>s.document_type==="customer_wb"||s.document_type==="grv").map(s=>{const saved=receipts.find(r=>r.scan_document_id===s.scan_document_id);const isOpen=active===s.scan_document_id;return <View key={s.scan_document_id} style={{backgroundColor:"white",padding:13,borderRadius:6,marginBottom:8}}>
 <Text style={{fontWeight:"bold"}}>{testBatchIds.includes(s.batch_id)?"[SAMPLE — not live] ":"[LIVE] "}{s.document_type==="grv"?"GRV":"Customer WB"} · {s.original_filename} · page {s.page_start}{s.page_end!==s.page_start?"–"+s.page_end:""}</Text>
 <Text style={{color:"#526173",marginBottom:5}}>{saved?"Saved: "+saved.document_number+" · "+Number(saved.net_kg).toLocaleString()+" kg":s.extraction_status==="reviewed"?"Reviewed — ready to save":"Review extraction in Batch Scanner first"}</Text>
 <View style={{flexDirection:"row"}}><Button label="View PDF" onPress={()=>openScan(s)}/><Button label={saved?.source_id?"Matched — locked":saved?"Edit saved record":"Create receiving record"} disabled={testBatchIds.includes(s.batch_id)||!!saved?.source_id} onPress={()=>{start(s);if(saved){setEdit(v=>({...v,document_number:saved.document_number,document_date:wbFormatDate(saved.document_date),net_kg:String(saved.net_kg),delivery_note:saved.delivery_note||"",vehicle_reg:saved.vehicle_reg||""}));setGrvLink(saved.customer_wb_id||"")}}}/></View>
 {isOpen?<View style={{backgroundColor:"#f4f7fa",padding:12}}>
 {([["document_number",s.document_type==="grv"?"GRV number":"Customer WB number"],["document_date","Date (DD/MM/YYYY or DD/MM)"],["net_kg",s.document_type==="grv"?"Accepted kg":"Received nett kg"],["delivery_note","DNote"],["vehicle_reg","Truck registration"],["trailer_reg","Trailer registration"],["moisture_pct","Moisture %"],["defects_pct","Defects %"],["extraneous_matter_pct","Extraneous matter %"],["test_density","Test density"],["wheat_grade","Wheat grade"],["customer","Customer"],["depot","Depot"]] as [string,string][]).map(([k,label])=><View key={k} style={{flexDirection:"row",alignItems:"center",marginBottom:7}}><Text style={{width:195}}>{label}</Text><TextInput value={edit[k]||""} onChangeText={v=>setEdit(x=>({...x,[k]:v}))} style={{borderWidth:1,borderColor:"#b9c6d3",backgroundColor:"white",padding:8,width:280}}/></View>)}
 {s.document_type==="grv"?<View style={{padding:8,marginBottom:10,backgroundColor:"#e9f1f9"}}><Text style={{fontWeight:"bold"}}>Match to Customer WB (optional)</Text><Text style={{marginBottom:5}}>Choose a saved Customer WB only when you're confident it belongs to this GRV.</Text><View style={{flexDirection:"row",flexWrap:"wrap"}}><Button label={grvLink?"Clear WB link":"No link yet"} onPress={()=>setGrvLink("")}/>{receipts.filter(r=>r.document_type==="customer_wb").map(r=><Pressable key={r.received_id} onPress={()=>setGrvLink(r.received_id)} style={{padding:8,marginRight:7,marginBottom:7,borderWidth:1,borderColor:grvLink===r.received_id?"#166534":"#b7c4ce",backgroundColor:grvLink===r.received_id?"#def5e4":"white"}}><Text>{r.document_number} · {Number(r.net_kg).toLocaleString()} kg {grvLink===r.received_id?"✓":""}</Text></Pressable>)}</View></View>:null}
 <View style={{flexDirection:"row"}}><Button label={busy?"Saving…":"Save receiving record"} disabled={busy} onPress={()=>save(s)}/><Button label="Cancel" onPress={()=>setActive(null)}/></View>
 </View>:null}
 </View>})}
 </ScrollView>;
}