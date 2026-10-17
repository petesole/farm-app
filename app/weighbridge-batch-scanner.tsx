import {useEffect,useState} from "react";
import {router} from "expo-router";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
type Batch={batch_id:string;created_at:string;label:string|null;status:string};
type FileRow={file_id:string;batch_id:string;original_filename:string;storage_path:string;extraction_status:string};
const blue="#175a9e";
function Btn({name,go,disabled=false}:{name:string;go:()=>void;disabled?:boolean}){return <Pressable onPress={go} disabled={disabled} style={{backgroundColor:disabled?"#99a8b8":blue,padding:11,borderRadius:5,marginRight:9,marginBottom:8}}><Text style={{fontWeight:"bold",color:"white"}}>{name}</Text></Pressable>}
export default function BatchScanner(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[name,setName]=useState(""),[batches,setBatches]=useState<Batch[]>([]),[files,setFiles]=useState<FileRow[]>([]),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){const [a,b]=await Promise.all([supabase.from("wb_scan_batch").select("*").order("created_at",{ascending:false}).limit(100),supabase.from("wb_scan_batch_file").select("*").order("uploaded_at",{ascending:false}).limit(1000)]);if(a.error||b.error){setError(a.error?.message||b.error?.message||"Unable to load batches");return;}setBatches((a.data||[]) as Batch[]);setFiles((b.data||[]) as FileRow[]);}
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
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;
 if(allowed===null)return <Text style={{padding:20}}>Checking Admin access…</Text>;
 if(!allowed)return <Text style={{padding:20}}>Batch Scanner — Admin only.</Text>;
 return <ScrollView style={{flex:1,backgroundColor:"#f4f6f9"}} contentContainerStyle={{padding:22,minWidth:860}}>
 <Text style={{fontSize:25,fontWeight:"bold",marginBottom:8}}>Customer WB & GRV — Batch Scanner</Text>
 <Text style={{color:"#64748b",marginBottom:16}}>Stage 1: safely preserve scanned originals. Multiple individual documents or a combined multipage PDF can be uploaded. Automatic splitting and reading will be added next.</Text>
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
 <Text style={{color:"#64748b",marginVertical:5}}>Originals saved · Page separation and extraction not yet run</Text>
 {files.filter(f=>f.batch_id===b.batch_id).map(f=><Pressable key={f.file_id} onPress={()=>openOriginal(f)} style={{paddingVertical:7,borderTopWidth:1,borderColor:"#edf1f5"}}><Text style={{color:blue}}>{f.original_filename} — Open original scan</Text></Pressable>)}
 </View>)}
 {!batches.length?<Text>No batches uploaded yet.</Text>:null}
 </ScrollView>;
}