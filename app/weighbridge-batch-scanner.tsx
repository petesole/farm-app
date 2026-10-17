import {useEffect,useState} from "react";
import {router} from "expo-router";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
type Batch={batch_id:string;created_at:string;label:string|null;status:string};
type FileRow={file_id:string;batch_id:string;original_filename:string;storage_path:string;extraction_status:string;page_count:number|null};
type SplitDoc={scan_document_id:string;batch_id:string;file_id:string;page_start:number;page_end:number;document_type:string;storage_path:string;extraction_status:string};
const blue="#175a9e";
function Btn({name,go,disabled=false}:{name:string;go:()=>void;disabled?:boolean}){return <Pressable onPress={go} disabled={disabled} style={{backgroundColor:disabled?"#99a8b8":blue,padding:11,borderRadius:5,marginRight:9,marginBottom:8}}><Text style={{fontWeight:"bold",color:"white"}}>{name}</Text></Pressable>}
export default function BatchScanner(){
 const [splitDocs,setSplitDocs]=useState<SplitDoc[]>([]),[activeFile,setActiveFile]=useState<string|null>(null),[startPage,setStartPage]=useState("1"),[endPage,setEndPage]=useState("1"),[kind,setKind]=useState("customer_wb");
 const [allowed,setAllowed]=useState<boolean|null>(null),[name,setName]=useState(""),[batches,setBatches]=useState<Batch[]>([]),[files,setFiles]=useState<FileRow[]>([]),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){const [a,b,d]=await Promise.all([supabase.from("wb_scan_batch").select("*").order("created_at",{ascending:false}).limit(100),supabase.from("wb_scan_batch_file").select("*").order("uploaded_at",{ascending:false}).limit(1000),supabase.from("wb_scan_document").select("*").order("created_at",{ascending:false}).limit(1000)]);if(a.error||b.error||d.error){setError(a.error?.message||b.error?.message||d.error?.message||"Unable to load batches");return;}setBatches((a.data||[]) as Batch[]);setFiles((b.data||[]) as FileRow[]);setSplitDocs((d.data||[]) as SplitDoc[]);}
 useEffect(()=>{if(Platform.OS!=="web"){setAllowed(false);return;}let active=true;(async()=>{const u=await supabase.auth.getUser();if(!active)return;if(!u.data.user){setAllowed(false);return;}const a=await supabase.rpc("wb_admin_allowed");if(!active)return;setAllowed(a.data===true&&!a.error);if(a.error)setError(a.error.message)})();return()=>{active=false}},[]);
 useEffect(()=>{if(allowed)refresh()},[allowed]);
 function selectFiles(){if(typeof document==="undefined"||busy)return;const input=document.createElement("input");input.type="file";input.multiple=true;input.accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*";input.onchange=async()=>{const chosen=Array.from(input.files||[]);if(!chosen.length)return;
 const allowedTypes=["application/pdf","image/jpeg","image/png","image/webp"];if(chosen.some(f=>!allowedTypes.includes(f.type)||f.size>15*1024*1024)){setError("Only PDF/JPG/PNG/WebP files up to 15 MB each.");return;}
 setBusy(true);setMessage("");setError("");
 try{
 const batch=await supabase.from("wb_scan_batch").insert({label:name.trim()||"Scanned customer documents"}).select("batch_id").single();
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
 async function openSplit(path:string){const result=await supabase.storage.from("wb-customer-documents").createSignedUrl(path,120);if(result.error){setError(result.error.message);return;}if(typeof window!=="undefined"&&result.data?.signedUrl)window.open(result.data.signedUrl,"_blank");}
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;
 if(allowed===null)return <Text style={{padding:20}}>Checking Admin access…</Text>;
 if(!allowed)return <Text style={{padding:20}}>Batch Scanner — Admin only.</Text>;
 return <ScrollView style={{flex:1,backgroundColor:"#f4f6f9"}} contentContainerStyle={{padding:22,minWidth:860}}>
 <Text style={{fontSize:25,fontWeight:"bold",marginBottom:8}}>Customer WB & GRV — Batch Scanner</Text>
 <Text style={{color:"#64748b",marginBottom:16}}>Upload original batches, then choose page ranges to save as individual Customer WB or GRV PDFs. Automatic page recognition and AI field extraction are not connected yet.</Text>
 <View style={{backgroundColor:"white",padding:16,borderRadius:7,marginBottom:16}}>
 <Text style={{fontWeight:"bold",marginBottom:7}}>Batch label (optional)</Text>
 <TextInput value={name} onChangeText={setName} placeholder="e.g. GMB Concession — 17 October" style={{borderWidth:1,borderColor:"#cbd5e1",padding:9,maxWidth:430,marginBottom:12}}/>
 <View style={{flexDirection:"row"}}><Btn name={busy?"Uploading…":"Choose files and upload batch"} go={selectFiles} disabled={busy}/><Btn name="Refresh" go={refresh}/><Btn name="Return to WB Admin" go={()=>router.push("/weighbridge")}/></View>
 {message?<Text style={{color:"#166534",marginTop:8}}>{message}</Text>:null}
 {error?<Text style={{color:"#b42318",marginTop:8}}>{error}</Text>:null}
 </View>
 <Text style={{fontSize:19,fontWeight:"bold",marginBottom:9}}>Saved batches</Text>
 {batches.map(b=><View key={b.batch_id} style={{backgroundColor:"white",borderRadius:6,padding:14,marginBottom:9}}>
 <Text style={{fontWeight:"bold"}}>{b.label||"Scanned batch"} · {new Date(b.created_at).toLocaleString("en-GB")}</Text>
 <Text style={{color:"#64748b",marginVertical:5}}>ORIGINAL BATCH (backup) is retained unchanged. Individual documents are listed below each file.</Text>
 {files.filter(f=>f.batch_id===b.batch_id).map(f=><View key={f.file_id} style={{paddingVertical:8,borderTopWidth:1,borderColor:"#edf1f5"}}>
 <Text style={{fontWeight:"bold",marginBottom:5}}>Original batch file: {f.original_filename}</Text><View style={{flexDirection:"row"}}><Btn name="View complete original PDF" go={()=>openOriginal(f)}/></View>
 {f.page_count!=null&&splitDocs.filter(d=>d.file_id===f.file_id).reduce((n,d)=>n+d.page_end-d.page_start+1,0)>=f.page_count?<Text style={{color:"#166534",fontWeight:"bold",marginVertical:8}}>All {f.page_count} pages separated</Text>:<View style={{flexDirection:"row",marginTop:7}}><Btn name={activeFile===f.file_id?"Hide split options":"Separate PDF pages"} go={()=>{setActiveFile(activeFile===f.file_id?null:f.file_id);setStartPage(String(Math.max(0,...splitDocs.filter(d=>d.file_id===f.file_id).map(d=>d.page_end))+1));setEndPage(String(Math.max(0,...splitDocs.filter(d=>d.file_id===f.file_id).map(d=>d.page_end))+1))}}/></View>}
 {activeFile===f.file_id?<View style={{padding:10,backgroundColor:"#f4f7fc"}}>
 <Text style={{fontWeight:"bold",marginBottom:6}}>Pages in original PDF: {f.page_count??"not yet determined"}</Text><Text style={{marginBottom:8}}>For a five-page scan containing five one-page Customer WB slips, save pages 1, 2, 3, 4 and 5 individually. After each save, the next page is selected automatically. Already saved pages cannot be saved again.</Text>
 <View style={{flexDirection:"row",alignItems:"center",flexWrap:"wrap"}}>
 <Text style={{marginRight:6}}>From page</Text><TextInput value={startPage} onChangeText={setStartPage} style={{borderWidth:1,borderColor:"#bdc8d7",backgroundColor:"white",padding:8,width:60,marginRight:12}}/>
 <Text style={{marginRight:6}}>To page</Text><TextInput value={endPage} onChangeText={setEndPage} style={{borderWidth:1,borderColor:"#bdc8d7",backgroundColor:"white",padding:8,width:60,marginRight:12}}/>
 {["customer_wb","grv","unknown"].map(x=><Pressable key={x} onPress={()=>setKind(x)} style={{padding:8,marginRight:6,backgroundColor:kind===x?"#cee7ff":"white",borderWidth:1,borderColor:"#cbd5e1"}}><Text>{x==="customer_wb"?"Customer WB":x==="grv"?"GRV":"Unclassified"}</Text></Pressable>)}
 </View><View style={{flexDirection:"row",marginTop:10}}><Btn name={busy?"Working…":splitDocs.some(d=>d.file_id===f.file_id&&Number(startPage)<=d.page_end&&Number(endPage)>=d.page_start)?"Pages already saved":"Save these pages as separate document"} go={splitPdf} disabled={busy||splitDocs.some(d=>d.file_id===f.file_id&&Number(startPage)<=d.page_end&&Number(endPage)>=d.page_start)}/></View>
 </View>:null}
 {splitDocs.some(d=>d.file_id===f.file_id)?<Text style={{fontWeight:"bold",marginTop:6}}>Individual documents saved from this batch:</Text>:null}
 {splitDocs.filter(d=>d.file_id===f.file_id).sort((a,b)=>a.page_start-b.page_start).map(d=><Pressable key={d.scan_document_id} onPress={()=>openSplit(d.storage_path)} style={{padding:7,marginTop:4,backgroundColor:"#edf7ed"}}><Text style={{color:blue}}>Saved {d.document_type==="customer_wb"?"Customer WB":d.document_type==="grv"?"GRV":"document"} · pages {d.page_start}–{d.page_end} · Open separated PDF</Text></Pressable>)}
 </View>)}
 </View>)}
 {!batches.length?<Text>No batches uploaded yet.</Text>:null}
 </ScrollView>;
}