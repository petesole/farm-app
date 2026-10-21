import {wbParseDate,wbFormatDate,wbToday} from "../utils/wb-date";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import React,{useEffect,useMemo,useState} from "react";
import {router} from "expo-router";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
type SplitPlan={start:number;end:number;type:string};
type Batch={batch_id:string;created_at:string;label:string|null;status:string;is_test:boolean};
type FileRow={file_id:string;batch_id:string;original_filename:string;storage_path:string;extraction_status:string;page_count:number|null};
type Progress={batch_id:string;workflow_state:string;keep_open:boolean;file_count:number;complete_files:number;doc_count:number;matched_count:number;unmatched_count:number;pending_notices:number};
type Receipt={scan_document_id:string;document_number:string;delivery_note:string|null;document_date:string;customer:string|null;source_id:string|null};
type SplitDoc={archive_resolved:boolean;scan_document_id:string;batch_id:string;file_id:string;page_start:number;page_end:number;document_type:string;storage_path:string;extraction_status:string;extracted_data:Record<string,unknown>|null};
const blue=C.primary;
function Btn({name,go,disabled=false}:{name:string;go:()=>void;disabled?:boolean}){return <Pressable onPress={go} disabled={disabled} style={{backgroundColor:disabled?"#99a8b8":blue,padding:11,borderRadius:5,marginRight:9,marginBottom:8}}><Text style={{fontWeight:"bold",color:"white"}}>{name}</Text></Pressable>}
export default function BatchScanner(){
 const [tab,setTab]=useState<"active"|"awaiting_match"|"archived"|"test">("active"),[search,setSearch]=useState(""),[progress,setProgress]=useState<Progress[]>([]),[receipts,setReceipts]=useState<Receipt[]>([]);
 const [plans,setPlans]=useState<Record<string,SplitPlan[]>>({}),[splitting,setSplitting]=useState("");
 const [reviewId,setReviewId]=useState<string|null>(null),[reviewData,setReviewData]=useState<Record<string,string>>({}),[previewUrl,setPreviewUrl]=useState("");
 const [splitDocs,setSplitDocs]=useState<SplitDoc[]>([]),[activeFile,setActiveFile]=useState<string|null>(null),[startPage,setStartPage]=useState("1"),[endPage,setEndPage]=useState("1"),[kind,setKind]=useState("customer_wb");
 const [allowed,setAllowed]=useState<boolean|null>(null),[name,setName]=useState(""),[batches,setBatches]=useState<Batch[]>([]),[files,setFiles]=useState<FileRow[]>([]),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){const [a,b,d,p,r]=await Promise.all([supabase.from("wb_scan_batch").select("*").order("created_at",{ascending:false}).limit(100),supabase.from("wb_scan_batch_file").select("*").order("uploaded_at",{ascending:false}).limit(1000),supabase.from("wb_scan_document").select("*").order("created_at",{ascending:false}).limit(1000),supabase.from("wb_scan_batch_progress_v").select("*").limit(1000),supabase.from("wb_received_document").select("scan_document_id,document_number,delivery_note,document_date,customer,source_id").limit(3000)]);if(a.error||b.error||d.error||p.error||r.error){setError(a.error?.message||b.error?.message||d.error?.message||p.error?.message||r.error?.message||"Unable to load batches");return;}setBatches((a.data||[]) as Batch[]);setFiles((b.data||[]) as FileRow[]);setSplitDocs((d.data||[]) as SplitDoc[]);setProgress((p.data||[]) as Progress[]);setReceipts((r.data||[]) as Receipt[]);}
 useEffect(()=>{if(Platform.OS!=="web"){setAllowed(false);return;}let active=true;(async()=>{const u=await supabase.auth.getUser();if(!active)return;if(!u.data.user){setAllowed(false);return;}const a=await supabase.rpc("wb_admin_allowed");if(!active)return;setAllowed(a.data===true&&!a.error);if(a.error)setError(a.error.message)})();return()=>{active=false}},[]);
 useEffect(()=>{if(allowed)refresh()},[allowed]);
 function selectFiles(){if(typeof document==="undefined"||busy)return;const input=document.createElement("input");input.type="file";input.multiple=true;input.accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*";input.onchange=async()=>{const chosen=Array.from(input.files||[]);if(!chosen.length)return;
 const allowedTypes=["application/pdf","image/jpeg","image/png","image/webp"];if(chosen.some(f=>!allowedTypes.includes(f.type)||f.size>15*1024*1024)){setError("Only PDF/JPG/PNG/WebP files up to 15 MB each.");return;}
 setBusy(true);setMessage("");setError("");
 try{
 const batch=await supabase.from("wb_scan_batch").insert({label:name.trim()||"Scanned customer documents",is_test:false}).select("batch_id").single();
 if(batch.error||!batch.data)throw new Error(batch.error?.message||"Could not create batch");
 let count=0;const failed:string[]=[];
 for(const f of chosen){
 const path="batches/"+batch.data.batch_id+"/"+Date.now()+"_"+count+"_"+f.name.replace(/[^a-zA-Z0-9._-]/g,"_");
 try{const bytes=await f.arrayBuffer();const up=await supabase.storage.from("wb-customer-documents").upload(path,bytes,{contentType:f.type,upsert:false});if(up.error)throw up.error;
 const rec=await supabase.from("wb_scan_batch_file").insert({batch_id:batch.data.batch_id,original_filename:f.name,storage_path:path,mime_type:f.type,byte_size:f.size});if(rec.error)throw rec.error;count++;
 }catch(e:any){failed.push(f.name+": "+(e?.message||"Upload failed"))}
 }
 setMessage(count+" original file(s) saved in batch. No documents have been separated or read yet.");
 if(failed.length)setError(failed.join("; "));
 await refresh();
 }catch(e:any){setError(e.message||String(e))}finally{setBusy(false)}
 };input.click()}
 async function openOriginal(f:FileRow){const signed=await supabase.storage.from("wb-customer-documents").createSignedUrl(f.storage_path,120);if(signed.error){setError(signed.error.message);return;}if(typeof window!=="undefined"&&signed.data?.signedUrl)window.open(signed.data.signedUrl,"_blank")}
 async function splitPdf(){
 if(!activeFile||busy)return;
 const start=Number(startPage),end=Number(endPage);
 const maxPages=files.find(f=>f.file_id===activeFile)?.page_count;
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||(maxPages!=null&&end>maxPages)){setError("Enter a valid first and last page.");return;}
 if(splitDocs.some(d=>d.file_id===activeFile&&start<=d.page_end&&end>=d.page_start)){setError("These pages have already been saved as an individual document. Choose unused pages.");return;}
 setBusy(true);setError("");setMessage("");
 const result=await supabase.functions.invoke("wb-document-split",{body:{file_id:activeFile,page_start:start,page_end:end,document_type:kind}});
 setBusy(false);if(result.error||result.data?.error){setError(result.data?.error||result.error?.message||"PDF split failed");return;}
 setMessage("Individual PDF saved, pages "+start+"–"+end+". The original batch remains unchanged.");
 await refresh();const pages=Number(result.data?.total_pages)||maxPages;if(pages&&end>=pages){setActiveFile(null);setMessage("All "+pages+" pages have been separated. The complete original PDF is retained.");}else{setStartPage(String(end+1));setEndPage(String(end+1));}
 }
 function prepareAllPages(f:FileRow){
  if(!f.page_count||f.page_count<1){setError("Page count is not available yet. Open the original PDF and use the existing page-range splitter.");return;}
  const occupied=new Set<number>();splitDocs.filter(x=>x.file_id===f.file_id).forEach(x=>{for(let i=x.page_start;i<=x.page_end;i++)occupied.add(i)});
  const next:SplitPlan[]=[];for(let i=1;i<=f.page_count;i++)if(!occupied.has(i))next.push({start:i,end:i,type:"customer_wb"});
  setPlans(old=>({...old,[f.file_id]:next}));setActiveFile(f.file_id);setError("");setMessage("Confirm the document type of each page, and combine neighbouring pages if one document spans more than one page.");
 }
 function updatePlan(fileId:string,index:number,type:string){setPlans(old=>({...old,[fileId]:(old[fileId]||[]).map((p,i)=>i===index?{...p,type}:p)}))}
 function mergeNext(fileId:string,index:number){
  const plan=plans[fileId]||[];if(index>=plan.length-1||plan[index].end+1!==plan[index+1].start)return;
  setPlans(old=>({...old,[fileId]:[...plan.slice(0,index),{...plan[index],end:plan[index+1].end},...plan.slice(index+2)]}));
 }
 function separatePlan(fileId:string,index:number){
  const plan=plans[fileId]||[],item=plan[index];if(!item||item.start===item.end)return;
  const items=Array.from({length:item.end-item.start+1},(_,i)=>({start:item.start+i,end:item.start+i,type:item.type}));
  setPlans(old=>({...old,[fileId]:[...plan.slice(0,index),...items,...plan.slice(index+1)]}));
 }
 async function splitConfirmed(f:FileRow){
  if(busy||!plans[f.file_id]?.length)return;
  const work=plans[f.file_id].filter(p=>p.type!=="skip");if(!work.length){setError("Choose at least one page to split.");return;}
  if(work.some(p=>splitDocs.some(d=>d.file_id===f.file_id&&p.start<=d.page_end&&p.end>=d.page_start))){setError("Some pages have already been split. Refresh and prepare again.");return;}
  setBusy(true);setError("");let count=0;const failed:string[]=[];
  for(const p of work){
   setSplitting("Splitting pages "+p.start+(p.end>p.start?"–"+p.end:"")+" ("+(count+1)+"/"+work.length+")");
   try{const res=await supabase.functions.invoke("wb-document-split",{body:{file_id:f.file_id,page_start:p.start,page_end:p.end,document_type:p.type}});
    if(res.error||res.data?.error)throw new Error(res.data?.error||res.error?.message||"Split failed");count++;
   }catch(e:any){failed.push("Pages "+p.start+"–"+p.end+": "+(e?.message||"Error"));}
  }
  setBusy(false);setSplitting("");setPlans(old=>({...old,[f.file_id]:[]}));setActiveFile(null);await refresh();
  setMessage(count+" of "+work.length+" documents split. "+(failed.length?"Failed pages remain available to retry.":"All confirmed documents saved."));
  if(failed.length)setError(failed.join("; "));
 }
 async function changeType(d:SplitDoc,newType:string){
 if(d.document_type===newType||busy)return;
 setBusy(true);setError("");setMessage("");
 try{
 const result=await supabase.from("wb_scan_document").update({document_type:newType}).eq("scan_document_id",d.scan_document_id).select("scan_document_id").single();
 if(result.error)throw result.error;
 setSplitDocs(old=>old.map(x=>x.scan_document_id===d.scan_document_id?{...x,document_type:newType}:x));
 setMessage("Document type changed to "+(newType==="customer_wb"?"Customer WB":newType==="grv"?"GRV":newType==="rejection_notice"?"Rejection Notice":"Unclassified")+". The existing PDF has not changed.");
 }catch(e:any){setError(e?.message||"Unable to update document type");}finally{setBusy(false)}
 }
 async function readDocument(d:SplitDoc){
 setBusy(true);setError("");setMessage("");
 try {
 const out=await supabase.functions.invoke("wb-document-read",{body:{document_id:d.scan_document_id}});
 if(out.error||out.data?.error){let detail=out.data?.error;const response=out.error?.context;if(!detail&&response?.json){try{const info=await response.json();detail=info?.error||info?.message;}catch{}}throw new Error(detail||out.error?.message||"Unable to read PDF");}
 const data=out.data.extracted_data||{};
 setReviewData(Object.fromEntries(Object.entries(data).filter(([k])=>k!=="uncertain_fields").map(([k,v])=>[k,v==null?"":String(v)])));
 await startReview(d,data);await refresh();
 setMessage("Extraction complete. Check all details against the PDF before saving.");
 }catch(e:any){setError(e?.message||"Unable to read PDF");}finally{setBusy(false)}
 }
 async function startReview(d:SplitDoc,data:Record<string,unknown>|null=d.extracted_data){
 setReviewData(Object.fromEntries(Object.entries(data||{}).filter(([k])=>k!=="uncertain_fields").map(([k,v])=>[k,v==null?"":String(v)])));
 setReviewId(d.scan_document_id);setPreviewUrl("");
 const signed=await supabase.storage.from("wb-customer-documents").createSignedUrl(d.storage_path,3600);
 if(signed.error){setError("Could not load PDF preview: "+signed.error.message);return;}
 setPreviewUrl(signed.data?.signedUrl||"");
 }
 async function saveReview(d:SplitDoc){
 setBusy(true);setError("");
 try{
 const out=await supabase.from("wb_scan_document").update({extracted_data:reviewData,extraction_status:"reviewed"}).eq("scan_document_id",d.scan_document_id);
 if(out.error)throw out.error;
 setReviewId(null);setPreviewUrl("");await refresh();setMessage("Reading approved. Open Awaiting Match → Receiving Documents to save and match this delivery.");setTab("awaiting_match");
 }catch(e:any){setError(e?.message||"Save failed");}finally{setBusy(false)}
 }
 async function reopen(b:Batch,open:boolean){setBusy(true);setError("");const x=await supabase.from("wb_scan_batch").update({keep_open:open}).eq("batch_id",b.batch_id);setBusy(false);if(x.error){setError(x.error.message);return;}setMessage(open?"Batch reopened in Active.":"Batch returned to automatic workflow.");await refresh();}
 async function resolveNotice(d:SplitDoc){if(d.document_type!=="rejection_notice")return;setBusy(true);setError("");const x=await supabase.from("wb_scan_document").update({archive_resolved:!d.archive_resolved}).eq("scan_document_id",d.scan_document_id);setBusy(false);if(x.error){setError(x.error.message);return;}await refresh();}
 const visibleBatches=useMemo(()=>batches.filter(b=>{const state=progress.find(p=>p.batch_id===b.batch_id)?.workflow_state||"active";const docsInBatch=splitDocs.filter(d=>d.batch_id===b.batch_id);const hasReady=docsInBatch.some(d=>d.extraction_status==="reviewed"&&(d.document_type==="customer_wb"||d.document_type==="grv")&&!receipts.some(r=>r.scan_document_id===d.scan_document_id&&r.source_id));if(tab==="awaiting_match"?!hasReady:state!==tab)return false;const s=search.trim().toLowerCase();if(!s)return true;const docs=splitDocs.filter(d=>d.batch_id===b.batch_id);
 const docIds=new Set(docs.map(d=>d.scan_document_id));const joined=[b.label,b.created_at,...files.filter(f=>f.batch_id===b.batch_id).map(f=>f.original_filename),...docs.flatMap(d=>[d.document_type,JSON.stringify(d.extracted_data||{})]),...receipts.filter(r=>docIds.has(r.scan_document_id)).flatMap(r=>[r.document_number,r.delivery_note,r.document_date,r.customer])].join(" ").toLowerCase();
 return joined.includes(s)}),[batches,progress,tab,search,splitDocs,files,receipts]);
 async function openSplit(path:string){const result=await supabase.storage.from("wb-customer-documents").createSignedUrl(path,120);if(result.error){setError(result.error.message);return;}if(typeof window!=="undefined"&&result.data?.signedUrl)window.open(result.data.signedUrl,"_blank");}
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;
 if(allowed===null)return <Text style={{padding:20}}>Checking Admin access…</Text>;
 if(!allowed)return <Text style={{padding:20}}>Batch Scanner — Admin only.</Text>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:22,minWidth:860}}>
 <WbModuleHeader title="Batch Scanner"/>
 <Text style={{fontSize:25,fontWeight:"bold",marginBottom:8}}>Customer WB & GRV — Batch Scanner</Text>
 <Text style={{color:"#64748b",marginBottom:16}}>Upload original batches, then choose page ranges to save as individual Customer WB or GRV PDFs. Automatic separation is not active. Read each saved PDF with AI, then review and correct the values before saving. Nothing is posted automatically to WB or GRV records.</Text>
 <View style={{backgroundColor:"white",padding:16,borderRadius:7,marginBottom:16}}>
 <Text style={{fontWeight:"bold",marginBottom:7}}>Batch label (optional)</Text>
 <TextInput value={name} onChangeText={setName} placeholder="e.g. GMB Concession — 17 October" style={{borderWidth:1,borderColor:"#cbd5e1",padding:9,maxWidth:430,marginBottom:12}}/>
 <View style={{flexDirection:"row"}}><Btn name={busy?"Uploading…":"Choose files and upload batch"} go={selectFiles} disabled={busy}/><Btn name="Refresh" go={refresh}/><Btn name="Receiving Documents" go={()=>router.push("/weighbridge-receiving-inbox")}/><Btn name="Return to WB Admin" go={()=>router.push("/weighbridge")}/></View>
 {message?<Text style={{color:"#166534",marginTop:8}}>{message}</Text>:null}
 {error?<Text style={{color:"#b42318",marginTop:8}}>{error}</Text>:null}
 </View>
 <View style={{flexDirection:"row",flexWrap:"wrap",marginBottom:10}}>{([["active","Active"],["awaiting_match","Awaiting Match"],["archived","History / Archive"],["test","Samples"]] as const).map(([id,label])=><Pressable key={id} onPress={()=>setTab(id)} style={{padding:10,marginRight:8,marginBottom:8,borderRadius:6,backgroundColor:tab===id?C.primaryDark:"white",borderWidth:1,borderColor:C.border}}><Text style={{color:tab===id?"white":C.primaryDark,fontWeight:"bold"}}>{label} ({progress.filter(p=>p.workflow_state===id).length})</Text></Pressable>)}</View>
 <TextInput value={search} onChangeText={setSearch} placeholder="Search DNote, WB / GRV number, customer, filename or date" style={{backgroundColor:"white",borderWidth:1,borderColor:C.border,borderRadius:6,padding:11,marginBottom:14}}/>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:9}}><Text style={{fontSize:19,fontWeight:"bold",flex:1}}>{tab==="archived"?"Archived batches":tab==="test"?"Sample batches":tab==="awaiting_match"?"Ready for dispatch matching":"Active batches"}</Text>{tab==="awaiting_match"?<><Btn name="Receiving Documents — approve readings" go={()=>router.push("/weighbridge-receiving-inbox")}/><Btn name="Match saved documents" go={()=>router.push("/weighbridge-live-matching")}/></>:null}</View>
 {visibleBatches.map(b=><View key={b.batch_id} style={{backgroundColor:"white",borderRadius:6,padding:14,marginBottom:9}}>
 <Text style={{fontWeight:"bold"}}>{b.is_test?"[SAMPLE — excluded from live receiving] ":"[LIVE] "}{b.label||"Scanned batch"} · {new Date(b.created_at).toLocaleString("en-GB",{timeZone:"Africa/Harare",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</Text>
 <Text style={{color:"#64748b",marginVertical:5}}>Original documents remain stored unchanged. {progress.find(p=>p.batch_id===b.batch_id)?.matched_count||0} matched · {progress.find(p=>p.batch_id===b.batch_id)?.unmatched_count||0} awaiting match.</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>{tab==="archived"?<Btn name="Reopen batch" go={()=>reopen(b,true)} disabled={busy}/>:tab==="active"&&b.is_test===false&&progress.find(p=>p.batch_id===b.batch_id)?.keep_open?<Btn name="Resume automatic archiving" go={()=>reopen(b,false)} disabled={busy}/>:null}</View>
 {files.filter(f=>f.batch_id===b.batch_id).map(f=><View key={f.file_id} style={{paddingVertical:8,borderTopWidth:1,borderColor:"#edf1f5"}}>
 <Text style={{fontWeight:"bold",marginBottom:5}}>Original batch file: {f.original_filename}</Text><View style={{flexDirection:"row"}}><Btn name="View complete original PDF" go={()=>openOriginal(f)}/></View>
 {f.page_count!=null&&splitDocs.filter(d=>d.file_id===f.file_id).reduce((n,d)=>n+d.page_end-d.page_start+1,0)>=f.page_count?<Text style={{color:"#166534",fontWeight:"bold",marginVertical:8}}>All {f.page_count} pages separated</Text>:<View style={{flexDirection:"row",marginTop:7}}><Btn name={activeFile===f.file_id?"Hide split options":"Separate PDF pages"} go={()=>{setActiveFile(activeFile===f.file_id?null:f.file_id);setStartPage(String(Math.max(0,...splitDocs.filter(d=>d.file_id===f.file_id).map(d=>d.page_end))+1));setEndPage(String(Math.max(0,...splitDocs.filter(d=>d.file_id===f.file_id).map(d=>d.page_end))+1))}}/></View>}
 {f.page_count!=null&&f.page_count>0&&splitDocs.filter(d=>d.file_id===f.file_id).reduce((n,d)=>n+d.page_end-d.page_start+1,0)<f.page_count?<Btn name="Confirm all pages and split together" go={()=>prepareAllPages(f)} disabled={busy}/>:null}
 {activeFile===f.file_id&&plans[f.file_id]?.length>0?<View style={{padding:12,backgroundColor:"#edf7ed",marginBottom:12,borderWidth:1,borderColor:C.border}}>
 <Text style={{fontSize:16,fontWeight:"bold",marginBottom:8}}>Confirm each document before splitting ({plans[f.file_id].length} groups)</Text>
 <Text style={{color:C.textSecondary,marginBottom:10}}>Each page is a separate Customer WB by default. Change its type; merge consecutive pages if they belong to the same document. Skipped pages remain unsplit.</Text>
 {plans[f.file_id].map((p,i)=><View key={p.start} style={{padding:8,marginBottom:6,backgroundColor:"white",borderRadius:5}}>
 <Text style={{fontWeight:"bold",marginBottom:6}}>Page {p.start}{p.end>p.start?"–"+p.end:""}</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>
 {([["customer_wb","Customer WB"],["grv","GRV"],["rejection_notice","Rejection"],["unknown","Unknown"],["skip","Skip"]] as const).map(([value,label])=><Pressable key={value} onPress={()=>updatePlan(f.file_id,i,value)} style={{padding:8,marginRight:6,marginBottom:6,borderWidth:1,borderRadius:5,borderColor:p.type===value?C.primary:C.border,backgroundColor:p.type===value?C.successTint:"white"}}><Text>{label}{p.type===value?" ✓":""}</Text></Pressable>)}
 </View>
 <View style={{flexDirection:"row"}}>{i<plans[f.file_id].length-1&&p.end+1===plans[f.file_id][i+1].start?<Btn name="Merge with next page" go={()=>mergeNext(f.file_id,i)} disabled={busy}/>:null}{p.end>p.start?<Btn name="Separate pages" go={()=>separatePlan(f.file_id,i)} disabled={busy}/>:null}</View>
 </View>)}
 <View style={{flexDirection:"row",alignItems:"center"}}><Btn name={busy?(splitting||"Processing…"):"Confirm & split all selected documents"} go={()=>splitConfirmed(f)} disabled={busy}/><Btn name="Cancel" go={()=>setPlans(old=>({...old,[f.file_id]:[]}))} disabled={busy}/></View>
 </View>:null}
 {activeFile===f.file_id&&!plans[f.file_id]?.length?<View style={{padding:10,backgroundColor:"#f4f7fc"}}>
 <Text style={{fontWeight:"bold",marginBottom:6}}>Pages in original PDF: {f.page_count??"not yet determined"}</Text><Text style={{marginBottom:8}}>For a five-page scan containing five one-page Customer WB slips, save pages 1, 2, 3, 4 and 5 individually. After each save, the next page is selected automatically. Already saved pages cannot be saved again.</Text>
 <View style={{flexDirection:"row",alignItems:"center",flexWrap:"wrap"}}>
 <Text style={{marginRight:6}}>From page</Text><TextInput value={startPage} onChangeText={setStartPage} style={{borderWidth:1,borderColor:"#bdc8d7",backgroundColor:"white",padding:8,width:60,marginRight:12}}/>
 <Text style={{marginRight:6}}>To page</Text><TextInput value={endPage} onChangeText={setEndPage} style={{borderWidth:1,borderColor:"#bdc8d7",backgroundColor:"white",padding:8,width:60,marginRight:12}}/>
 {["customer_wb","grv","rejection_notice","unknown"].map(x=><Pressable key={x} onPress={()=>setKind(x)} style={{padding:8,marginRight:6,backgroundColor:kind===x?"#cee7ff":"white",borderWidth:1,borderColor:"#cbd5e1"}}><Text>{x==="customer_wb"?"Customer WB":x==="grv"?"GRV":x==="rejection_notice"?"Rejection Notice":"Unclassified"}</Text></Pressable>)}
 </View><View style={{flexDirection:"row",marginTop:10}}><Btn name={busy?"Working…":splitDocs.some(d=>d.file_id===f.file_id&&Number(startPage)<=d.page_end&&Number(endPage)>=d.page_start)?"Pages already saved":"Save these pages as separate document"} go={splitPdf} disabled={busy||splitDocs.some(d=>d.file_id===f.file_id&&Number(startPage)<=d.page_end&&Number(endPage)>=d.page_start)}/></View>
 </View>:null}
 {splitDocs.some(d=>d.file_id===f.file_id)?<Text style={{fontWeight:"bold",marginTop:6}}>Individual documents saved from this batch:</Text>:null}
 {splitDocs.filter(d=>d.file_id===f.file_id&&(tab!=="awaiting_match"||d.extraction_status==="reviewed"&&["customer_wb","grv"].includes(d.document_type)&&!receipts.some(r=>r.scan_document_id===d.scan_document_id&&r.source_id))).sort((a,b)=>a.page_start-b.page_start).map(d=><View key={d.scan_document_id} style={{padding:10,marginTop:5,backgroundColor:"#edf7ed",borderRadius:5}}>
 <Text style={{fontWeight:"bold"}}>Pages {d.page_start}–{d.page_end} · {d.document_type==="customer_wb"?"Customer WB":d.document_type==="grv"?"GRV":d.document_type==="rejection_notice"?"Rejection Notice":"Unclassified"}</Text>
 <View style={{flexDirection:"row",alignItems:"center",flexWrap:"wrap",marginTop:7}}>
 <Btn name="Open individual PDF" go={()=>openSplit(d.storage_path)}/>
 <Text style={{marginRight:8,marginBottom:8}}>Change type:</Text>
 {["customer_wb","grv","unknown"].map(t=><Pressable key={t} disabled={busy||d.document_type===t} onPress={()=>changeType(d,t)} style={{padding:9,marginRight:6,marginBottom:8,borderRadius:4,borderWidth:1,borderColor:d.document_type===t?"#15803d":"#9aabb8",backgroundColor:d.document_type===t?"#d4f4de":"white",opacity:busy?0.6:1}}><Text style={{fontWeight:d.document_type===t?"bold":"normal"}}>{t==="customer_wb"?"Customer WB":t==="grv"?"GRV":t==="rejection_notice"?"Rejection Notice":"Unclassified"}{d.document_type===t?" ✓":""}</Text></Pressable>)}
 </View>
 {d.document_type==="rejection_notice"?<View style={{flexDirection:"row",alignItems:"center",marginTop:7}}><Btn name={d.archive_resolved?"Reopen rejection notice":"Mark rejection notice resolved"} go={()=>resolveNotice(d)} disabled={busy}/><Text style={{color:"#64748b"}}>Resolution does not count as returned stock.</Text></View>:null}
 <View style={{flexDirection:"row",marginTop:5}}>
 <Btn name={busy?"Working…":"Read PDF with AI"} go={()=>readDocument(d)} disabled={busy}/>
 {d.extracted_data?<Btn name="Review reading" go={()=>startReview(d)}/>:null}
 </View>
 {d.extracted_data?.document_type&&d.extracted_data.document_type!==d.document_type?<Text style={{color:"#995a09"}}>Reader classification differs from saved type. Check the PDF and use Change type above if necessary.</Text>:null}
 {reviewId===d.scan_document_id?<View style={{padding:10,backgroundColor:"white"}}>
 <Text style={{fontWeight:"bold",marginBottom:7}}>Check extracted information against the original PDF</Text>
 <View style={{flexDirection:"row",alignItems:"flex-start",gap:16}}><View style={{width:430}}>
 {Object.entries(reviewData).map(([k,v])=><View key={k} style={{flexDirection:"row",alignItems:"center",marginBottom:6}}>
 <Text style={{width:180}}>{k.replace(/_/g," ")}</Text>
 <TextInput value={v} onChangeText={x=>setReviewData(old=>({...old,[k]:x}))} style={{borderWidth:1,borderColor:"#ccc",padding:7,width:300}}/>
 </View>)}
 <Btn name="Save reviewed reading" go={()=>saveReview(d)} disabled={busy}/>
 </View><View style={{flex:1,minWidth:430}}>{previewUrl?React.createElement("iframe" as any,{src:previewUrl,title:"Scanned customer document",style:{width:"100%",height:680,border:"1px solid #cbd5e1",borderRadius:6}}):<Text>Loading document preview…</Text>}<Btn name="Open PDF in new tab" go={()=>openSplit(d.storage_path)}/></View></View>
 </View>:null}
 </View>)}
 </View>)}
 </View>)}
 {!visibleBatches.length?<Text style={{color:C.textSecondary}}>No batches in this view.</Text>:null}
 </ScrollView>;
}