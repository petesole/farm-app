import {WbAdminSignIn} from "../components/jspl/WbAdminSignIn";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
// Use the self-contained UMD build: Metro's ESM resolution breaks pdf-lib's nested tslib dependency.
const {PDFDocument}=require("pdf-lib/dist/pdf-lib.js") as typeof import("pdf-lib");
import {useEffect,useMemo,useRef,useState} from "react";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
type Load={source_type:string;source_id:string|null;slip_number:string;dnote_number:string|null;weigh_date:string;net_kg:number;customer_id:number|null};
type DocumentRow={source_type:string;source_id:string;document_type:string;storage_path:string;original_filename?:string|null;created_at?:string;uploaded_at?:string};
type Kind="customer_dnote"|"outgoing_wb"|"customer_wb"|"grv";
type Combined={source_type:string;source_id:string;source_signature:string;storage_path:string;created_at:string};
const circle=(present:boolean)=><View style={{width:27,height:27,borderRadius:14,backgroundColor:present?"#15803d":"#b42318",alignItems:"center",justifyContent:"center",alignSelf:"center"}}><Text style={{color:"white",fontWeight:"800",fontSize:16}}>{present?"✓":"−"}</Text></View>;
const widths=[39,120,110,110,105,45,45,45,45,100,110];

const kinds:{id:Kind;label:string}[]=[
 {id:"customer_dnote",label:"DNote"},{id:"outgoing_wb",label:"Outgoing WB slip"},
 {id:"customer_wb",label:"Customer WB slip"},{id:"grv",label:"GRV"}
];
const key=(x:{source_type:string;source_id:string|null})=>x.source_type+":"+x.source_id;
const clean=(s:string)=>s.replace(/[^a-z0-9-_.]/gi,"_").slice(0,75);
function Button({label,click,disabled=false}:{label:string;click:()=>void;disabled?:boolean}){return <Pressable disabled={disabled} onPress={click} style={{backgroundColor:disabled?"#91a49a":C.primary,padding:10,borderRadius:6,marginRight:9,marginBottom:8}}><Text style={{color:"white",fontWeight:"bold"}}>{label}</Text></Pressable>}
export default function DocumentDispatch(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[loads,setLoads]=useState<Load[]>([]),[docs,setDocs]=useState<DocumentRow[]>([]);
 const [customers,setCustomers]=useState<{customer_id:number;customer_name:string}[]>([]);
 const [combined,setCombined]=useState<Combined[]>([]);
 const [autoErrors,setAutoErrors]=useState<Record<string,string>>({});
 const pending=useRef(new Set<string>());

 const [selected,setSelected]=useState<string[]>([]),[enabled,setEnabled]=useState<Kind[]>(kinds.map(k=>k.id));
 const [customer,setCustomer]=useState("all"),[search,setSearch]=useState(""),[mode,setMode]=useState<"combined"|"perload">("combined");
 const [error,setError]=useState(""),[info,setInfo]=useState(""),[busy,setBusy]=useState(false);
 async function load(){
  setBusy(true);setError("");
  const [l,d,s,cs,packs,receipts]=await Promise.all([
   supabase.from("wb_customer_dispatch_v").select("source_type,source_id,slip_number,dnote_number,weigh_date,net_kg,customer_id").order("weigh_date",{ascending:false}).limit(5000),
   supabase.from("wb_customer_document").select("source_type,source_id,document_type,storage_path,original_filename,uploaded_at").order("uploaded_at",{ascending:false}).limit(5000),
   supabase.from("wb_scan_document").select("scan_document_id,linked_source_type,linked_source_id,document_type,storage_path,original_filename,created_at").order("created_at",{ascending:false}).limit(5000),
   supabase.from("wb_customer").select("customer_id,customer_name"),
   supabase.from("wb_dispatch_combined").select("source_type,source_id,source_signature,storage_path,created_at").order("created_at",{ascending:false}).limit(5000),
   supabase.from("wb_received_document").select("source_type,source_id,scan_document_id,document_type").not("source_id","is",null).limit(5000)
  ]);
  setBusy(false);
  const failed=[l,d,s,cs,packs,receipts].find(x=>x.error);
  if(failed?.error){setError(failed.error.message);return;}
  setLoads(((l.data||[]) as Load[]).filter(x=>!!x.source_id&&x.source_type!=="farm_slip"));
  const scans=(s.data||[]).map((x:any)=>({source_type:x.linked_source_type,source_id:x.linked_source_id,document_type:x.document_type,storage_path:x.storage_path,original_filename:x.original_filename,created_at:x.created_at}));
  const scanById=new Map((s.data||[]).map((x:any)=>[x.scan_document_id,x]));
  const viaReceipts=(receipts.data||[]).map((r:any)=>{
   const doc:any=scanById.get(r.scan_document_id);
   return doc?{source_type:r.source_type,source_id:r.source_id,document_type:r.document_type,storage_path:doc.storage_path,original_filename:doc.original_filename,created_at:doc.created_at}:null;
  }).filter(Boolean) as DocumentRow[];
  const found=new Map<string,DocumentRow>();
  for(const row of [...((d.data||[]) as DocumentRow[]),...viaReceipts,...scans]){
   if(!row.source_type||!row.source_id||!row.storage_path)continue;
   const k=key(row)+":"+row.document_type;
   if(!found.has(k))found.set(k,row);
  }
  setDocs([...found.values()]);
  setCustomers((cs.data||[]) as any);
  setCombined((packs.data||[]) as Combined[]);
 }
 useEffect(()=>{if(Platform.OS!=="web"){setAllowed(false);return;}let active=true;(async()=>{const u=await supabase.auth.getUser();if(!active)return;if(!u.data.user){setAllowed(false);return;}const r=await supabase.rpc("wb_admin_allowed");if(active)setAllowed(!r.error&&r.data===true)})();return()=>{active=false}},[]);
 useEffect(()=>{if(allowed)load()},[allowed]);
 const available=useMemo(()=>new Map(docs.map(d=>[key(d)+":"+d.document_type,d])),[docs]);
 const signature=(l:Load)=>kinds.map(k=>available.get(key(l)+":"+k.id)?.storage_path||"").join("|");
 const ready=(l:Load)=>kinds.every(k=>available.has(key(l)+":"+k.id));
 const saved=(l:Load)=>combined.find(c=>c.source_type===l.source_type&&c.source_id===l.source_id&&c.source_signature===signature(l));
 const filtered=useMemo(()=>loads.filter(l=>(customer==="all"||String(l.customer_id)===customer)&&[l.slip_number,l.dnote_number,l.weigh_date].join(" ").toLowerCase().includes(search.toLowerCase())),[loads,customer,search]);
 const chosen=loads.filter(l=>selected.includes(key(l)));
 const missing=chosen.flatMap(l=>enabled.filter(k=>!available.has(key(l)+":"+k)).map(k=>l.slip_number+" — "+kinds.find(x=>x.id===k)?.label));

 async function createMerged(batch:Load[],requireComplete:boolean){
  const pdf=await PDFDocument.create();let pagesAdded=0;
  for(const l of batch)for(const kind of kinds.filter(k=>requireComplete||enabled.includes(k.id))){
   const documentRow=available.get(key(l)+":"+kind.id);
   if(!documentRow){if(requireComplete)throw new Error(l.slip_number+": "+kind.label+" missing");continue;}
   const response=await supabase.storage.from("wb-customer-documents").download(documentRow.storage_path);
   if(response.error||!response.data)throw new Error(l.slip_number+" "+kind.label+": "+(response.error?.message||"Document download failed"));
   const buffer=await response.data.arrayBuffer();const filename=documentRow.original_filename?.toLowerCase()||"";
   const mime=response.data.type.toLowerCase();
   if(mime.includes("pdf")||filename.endsWith(".pdf")){
    const original=await PDFDocument.load(buffer);const pages=await pdf.copyPages(original,original.getPageIndices());
    pages.forEach(p=>pdf.addPage(p));pagesAdded+=pages.length;
   }else if(mime.includes("png")||filename.endsWith(".png")||mime.includes("jpeg")||mime.includes("jpg")||/\.jpe?g$/.test(filename)){
    const img=mime.includes("png")||filename.endsWith(".png")?await pdf.embedPng(buffer):await pdf.embedJpg(buffer);
    const page=pdf.addPage([595.28,841.89]);const scale=Math.min(555/img.width,801/img.height);
    page.drawImage(img,{x:(595.28-img.width*scale)/2,y:(841.89-img.height*scale)/2,width:img.width*scale,height:img.height*scale});pagesAdded++;
   }else throw new Error("Unsupported document format "+(documentRow.original_filename||mime));
  }
  if(!pagesAdded)throw new Error("No source PDF pages");
  return {bytes:await pdf.save(),pagesAdded};
 }
 async function storeCombined(l:Load){
  if(!l.source_id||!ready(l)||saved(l))return;
  const id=key(l);if(pending.current.has(id))return;pending.current.add(id);
  try{
   const sig=signature(l);
   const generated=await createMerged([l],true);
   const path="combined/"+l.source_type+"/"+l.source_id+"/"+Date.now()+"-complete.pdf";
   const bytes=new Uint8Array(generated.bytes.length);bytes.set(generated.bytes);
   const upload=await supabase.storage.from("wb-customer-documents").upload(path,bytes,{contentType:"application/pdf",upsert:false});
   if(upload.error)throw upload.error;
   const inserted=await supabase.from("wb_dispatch_combined").insert({source_type:l.source_type,source_id:l.source_id,source_signature:sig,storage_path:path}).select("source_type,source_id,source_signature,storage_path,created_at").single();
   if(inserted.error)throw inserted.error;
   setCombined(xs=>[inserted.data as Combined,...xs]);
   setAutoErrors(e=>{const copy={...e};delete copy[id];return copy});
  }catch(e:any){setAutoErrors(prev=>({...prev,[id]:String(e?.message||e)}));}
  finally{pending.current.delete(id);}
 }
 // Build one ready delivery at a time while this screen is open.
 useEffect(()=>{
  if(!allowed||busy)return;
  const next=loads.find(l=>ready(l)&&!saved(l)&&!autoErrors[key(l)]&&!pending.current.has(key(l)));
  if(next)void storeCombined(next);
 },[allowed,loads,docs,combined,autoErrors,busy]);
 async function openCombined(l:Load){
  const pack=saved(l);if(!pack)return;
  const r=await supabase.storage.from("wb-customer-documents").createSignedUrl(pack.storage_path,300);
  if(r.error){setError(r.error.message);return;}window.open(r.data.signedUrl,"_blank");
 }
 async function downloadToFolder(){
  if(busy||!chosen.length)return;
  setError("");setInfo("");
  let dir:any;
  try{
   if(typeof (window as any).showDirectoryPicker==="function")dir=await (window as any).showDirectoryPicker({mode:"readwrite"});
  }catch(e:any){if(e?.name==="AbortError")return;setError("Folder selection failed: "+(e?.message||String(e)));return;}
  setBusy(true);
  try{
   let count=0;
   for(const l of chosen){
    const pack=saved(l);
    if(!pack)continue;
    const file=await supabase.storage.from("wb-customer-documents").download(pack.storage_path);
    if(file.error||!file.data)throw new Error(l.slip_number+": "+(file.error?.message||"Unable to download PDF"));
    const name="JSPL_"+clean(l.slip_number)+"_Complete.pdf";
    if(dir){
     const handle=await dir.getFileHandle(name,{create:true});
     const stream=await handle.createWritable();
     await stream.write(file.data);await stream.close();
    }else{
     const url=URL.createObjectURL(file.data);
     const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
     setTimeout(()=>URL.revokeObjectURL(url),15000);
    }
    count++;
   }
   setInfo(count+" completed PDF pack(s) "+(dir?"saved to the selected folder.":"downloaded using your browser settings.")+" Missing/incomplete packs were skipped.");
   if(!count)setError("No completed PDFs among the selected deliveries. All four documents must be present before a combined PDF can be saved.");
  }catch(e:any){setError("Folder export failed: "+(e?.message||String(e)));}
  finally{setBusy(false);}
 }
 async function build(){
  if(!chosen.length||!enabled.length||busy)return;
  setError("");setInfo("");setBusy(true);
  let count=0;
  try{
   const result:{name:string;bytes:Uint8Array}[]=[];
   const batches=mode==="combined"?[chosen]:chosen.map(l=>[l]);
   for(const batch of batches){
    const generated=await createMerged(batch,false);
    const added=generated.pagesAdded;
    if(!added)continue;
    const filename=mode==="combined"?"JSPL_WB_Delivery_Documents.pdf":"JSPL_"+clean(batch[0].slip_number)+"_Documents.pdf";
    result.push({name:filename,bytes:generated.bytes});count+=added;
   }
   if(!result.length){setError("No stored source documents found for the selected loads and document types.");return;}
   for(const file of result){
    const bytes=new Uint8Array(file.bytes.length);bytes.set(file.bytes);
    const url=URL.createObjectURL(new Blob([bytes.buffer],{type:"application/pdf"}));
    const anchor=document.createElement("a");anchor.href=url;anchor.download=file.name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
   }
   setInfo("Generated "+result.length+" PDF file(s), "+count+" source pages. Missing documents were skipped. Attach the downloaded PDF(s) to your email.");
  }catch(e:any){setError("PDF generation failed: "+(e?.message||String(e)));}
  finally{setBusy(false);}
 }
 if(Platform.OS!=="web")return <Text style={{padding:20}}>Document Dispatch is available on desktop web.</Text>;
 if(allowed===null)return <Text style={{padding:20}}>Checking WB access…</Text>;
 if(!allowed)return <WbAdminSignIn onAuthenticated={()=>setAllowed(true)}/>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:22,minWidth:1050}}>
  <WbModuleHeader title="Document Dispatch"/>
  <Text style={{fontSize:25,fontWeight:"bold",color:C.primaryDark,marginBottom:7}}>Weighbridge Document Dispatch Centre</Text>
  <Text style={{marginBottom:12,color:"#586a60"}}>Choose deliveries, select documents and create PDF attachments. Only original saved documents are merged; missing documents are never fabricated.</Text>
  {error?<Text style={{color:"#b42318",marginBottom:10}}>{error}</Text>:null}
  {info?<Text style={{color:"#176541",marginBottom:10}}>{info}</Text>:null}
  <View style={{flexDirection:"row",flexWrap:"wrap",marginBottom:12}}>
   <TextInput value={search} onChangeText={setSearch} placeholder="Search WB slip, Field DNote or date" style={{borderWidth:1,borderColor:"#cfd7d2",padding:10,borderRadius:6,backgroundColor:"white",minWidth:280,marginRight:10,marginBottom:8}}/>
   <Button label="Refresh" click={load} disabled={busy}/>
   <Button label="Select visible" click={()=>setSelected(x=>[...new Set([...x,...filtered.map(key)])])}/>
   <Button label="Clear selection" click={()=>setSelected([])}/>
  </View>
  <Text style={{fontWeight:"bold",marginBottom:5}}>Customer filter</Text>
  <View style={{flexDirection:"row",flexWrap:"wrap",marginBottom:12}}>{[{customer_id:0,customer_name:"All customers"},...customers].map(c=><Pressable key={c.customer_id} onPress={()=>setCustomer(c.customer_id?String(c.customer_id):"all")} style={{padding:8,marginRight:7,marginBottom:6,borderRadius:5,backgroundColor:customer===(c.customer_id?String(c.customer_id):"all")?"#bfd9cb":"white"}}><Text>{c.customer_name}</Text></Pressable>)}</View>
  <View style={{backgroundColor:"white",padding:12,borderRadius:8,marginBottom:14}}>
   <Text style={{fontSize:17,fontWeight:"bold",marginBottom:7}}>Delivery documents ({filtered.length})</Text>
   <Text style={{color:"#586a60",marginBottom:10}}>D = Delivery Note  ·  O = Outgoing WB  ·  C = Customer WB  ·  G = GRV  ·  Combined = saved four-document PDF. Green ✓ = available, red − = missing.</Text>
   <ScrollView horizontal>
    <View>
     <View style={{flexDirection:"row",paddingVertical:11,backgroundColor:"#e4eee7",borderBottomWidth:1,borderColor:"#bdd0c2"}}>
      {["Select","WB Slip","Field DNote","Date","Nett (t)","D","O","C","G","Combined","Action"].map((label,i)=><Text key={label} style={{width:widths[i],textAlign:i>=5&&i<=9?"center":"left",paddingHorizontal:5,fontWeight:"800",color:C.primaryDark}}>{label}</Text>)}
     </View>
     <ScrollView style={{maxHeight:500}}>
     {filtered.map(l=>{
      const id=key(l),checked=selected.includes(id),pack=saved(l),complete=ready(l);
      return <View key={id} style={{flexDirection:"row",alignItems:"center",minHeight:50,borderBottomWidth:1,borderColor:"#e7ebe8",backgroundColor:checked?"#e8f4eb":"white"}}>
       <Pressable onPress={()=>setSelected(xs=>checked?xs.filter(x=>x!==id):[...xs,id])} style={{width:widths[0],alignItems:"center"}}><Text style={{fontSize:20,color:C.primary}}>{checked?"☑":"☐"}</Text></Pressable>
       <Text style={{width:widths[1],paddingHorizontal:5,fontWeight:"700"}}>{l.slip_number}</Text>
       <Text style={{width:widths[2],paddingHorizontal:5}}>{l.dnote_number||"—"}</Text>
       <Text style={{width:widths[3],paddingHorizontal:5}}>{l.weigh_date}</Text>
       <Text style={{width:widths[4],paddingHorizontal:5}}>{(Number(l.net_kg)/1000).toFixed(3)}</Text>
       {kinds.map((k,i)=><View key={k.id} style={{width:widths[5+i]}}>{circle(available.has(id+":"+k.id))}</View>)}
       <View style={{width:widths[9],alignItems:"center"}}>{pack?circle(true):complete&&!autoErrors[id]?<Text style={{fontSize:11,color:"#80600e"}}>Building…</Text>:circle(false)}</View>
       <View style={{width:widths[10],alignItems:"center"}}>
        {pack?<Pressable onPress={()=>void openCombined(l)} style={{padding:7}}><Text style={{color:C.primary,fontWeight:"800"}}>Open PDF</Text></Pressable>
        :complete&&autoErrors[id]?<Pressable onPress={()=>setAutoErrors(e=>{const x={...e};delete x[id];return x})} style={{padding:6}}><Text style={{color:"#b42318",fontWeight:"700"}}>Retry</Text></Pressable>
        :<Text style={{color:"#85928a",fontSize:11}}>{complete?"Generating":"Waiting"}</Text>}
       </View>
      </View>;
     })}
     {!filtered.length?<Text style={{padding:14}}>No deliveries found.</Text>:null}
     </ScrollView>
    </View>
   </ScrollView>
   {Object.keys(autoErrors).length>0?<Text style={{marginTop:9,color:"#b42318"}}>Combined PDF errors: {Object.entries(autoErrors).slice(0,3).map(([id,msg])=>id+": "+msg).join(" | ")}</Text>:null}
  </View>
  <View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
   <Text style={{fontWeight:"bold",fontSize:18,marginBottom:8}}>Email attachment export · {chosen.length} selected deliveries</Text>
   <Text style={{color:"#586a60",marginBottom:8}}>Complete deliveries automatically generate and save a combined PDF when this screen is open. Select deliveries and save their completed PDFs to a Windows folder, then attach them in your normal email application.</Text>
   <View style={{flexDirection:"row",flexWrap:"wrap"}}>{kinds.map(k=><Pressable key={k.id} onPress={()=>setEnabled(v=>v.includes(k.id)?v.filter(x=>x!==k.id):[...v,k.id])} style={{padding:9,marginRight:15}}><Text>{enabled.includes(k.id)?"☑":"☐"} {k.label}</Text></Pressable>)}</View>
   <View style={{flexDirection:"row",flexWrap:"wrap"}}><Pressable onPress={()=>setMode("combined")} style={{padding:9}}><Text>{mode==="combined"?"◉":"○"} One PDF for selected loads</Text></Pressable><Pressable onPress={()=>setMode("perload")} style={{padding:9}}><Text>{mode==="perload"?"◉":"○"} One PDF per load</Text></Pressable></View>
   <Text style={{marginVertical:8,color:missing.length?"#93511b":"#176541"}}>Missing selected documents: {missing.length}{missing.length?" · "+missing.slice(0,4).join("; "):""}</Text>
   <Button label="Save completed PDFs to folder" click={downloadToFolder} disabled={busy||!chosen.some(saved)}/>
   <Button label={busy?"Generating…":"Download custom PDF(s)"} click={build} disabled={busy||!chosen.length||!enabled.length}/>
  </View>
 </ScrollView>;
}
