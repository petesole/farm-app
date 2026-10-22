import {WbAdminSignIn} from "../components/jspl/WbAdminSignIn";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import {PDFDocument} from "pdf-lib";
import {useEffect,useMemo,useState} from "react";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
type Load={source_type:string;source_id:string|null;slip_number:string;dnote_number:string|null;weigh_date:string;net_kg:number;customer_id:number|null};
type DocumentRow={source_type:string;source_id:string;document_type:string;storage_path:string;original_filename?:string|null;created_at?:string;uploaded_at?:string};
type Kind="customer_dnote"|"outgoing_wb"|"customer_wb"|"grv";
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
 const [selected,setSelected]=useState<string[]>([]),[enabled,setEnabled]=useState<Kind[]>(kinds.map(k=>k.id));
 const [customer,setCustomer]=useState("all"),[search,setSearch]=useState(""),[mode,setMode]=useState<"combined"|"perload">("combined");
 const [error,setError]=useState(""),[info,setInfo]=useState(""),[busy,setBusy]=useState(false);
 async function load(){
  setBusy(true);setError("");
  const [l,d,s,cs]=await Promise.all([
   supabase.from("wb_customer_dispatch_v").select("source_type,source_id,slip_number,dnote_number,weigh_date,net_kg,customer_id").order("weigh_date",{ascending:false}).limit(5000),
   supabase.from("wb_customer_document").select("source_type,source_id,document_type,storage_path,original_filename,uploaded_at").order("uploaded_at",{ascending:false}).limit(5000),
   supabase.from("wb_scan_document").select("linked_source_type,linked_source_id,document_type,storage_path,original_filename,created_at").not("linked_source_id","is",null).order("created_at",{ascending:false}).limit(5000),
   supabase.from("wb_customer").select("customer_id,customer_name")
  ]);
  setBusy(false);
  const failed=[l,d,s,cs].find(x=>x.error);
  if(failed?.error){setError(failed.error.message);return;}
  setLoads(((l.data||[]) as Load[]).filter(x=>!!x.source_id&&x.source_type!=="farm_slip"));
  const scans=(s.data||[]).map((x:any)=>({source_type:x.linked_source_type,source_id:x.linked_source_id,document_type:x.document_type,storage_path:x.storage_path,original_filename:x.original_filename,created_at:x.created_at}));
  const found=new Map<string,DocumentRow>();
  for(const row of [...((d.data||[]) as DocumentRow[]),...scans]){
   if(!row.source_type||!row.source_id||!row.storage_path)continue;
   const k=key(row)+":"+row.document_type;
   if(!found.has(k))found.set(k,row);
  }
  setDocs([...found.values()]);
  setCustomers((cs.data||[]) as any);
 }
 useEffect(()=>{if(Platform.OS!=="web"){setAllowed(false);return;}let active=true;(async()=>{const u=await supabase.auth.getUser();if(!active)return;if(!u.data.user){setAllowed(false);return;}const r=await supabase.rpc("wb_admin_allowed");if(active)setAllowed(!r.error&&r.data===true)})();return()=>{active=false}},[]);
 useEffect(()=>{if(allowed)load()},[allowed]);
 const available=useMemo(()=>new Map(docs.map(d=>[key(d)+":"+d.document_type,d])),[docs]);
 const filtered=useMemo(()=>loads.filter(l=>(customer==="all"||String(l.customer_id)===customer)&&[l.slip_number,l.dnote_number,l.weigh_date].join(" ").toLowerCase().includes(search.toLowerCase())),[loads,customer,search]);
 const chosen=loads.filter(l=>selected.includes(key(l)));
 const missing=chosen.flatMap(l=>enabled.filter(k=>!available.has(key(l)+":"+k)).map(k=>l.slip_number+" — "+kinds.find(x=>x.id===k)?.label));
 async function build(){
  if(!chosen.length||!enabled.length||busy)return;
  setError("");setInfo("");setBusy(true);
  let count=0;
  try{
   const result:{name:string;bytes:Uint8Array}[]=[];
   const batches=mode==="combined"?[chosen]:chosen.map(l=>[l]);
   for(const batch of batches){
    const pdf=await PDFDocument.create();
    let added=0;
    for(const l of batch){
     for(const kind of kinds.filter(k=>enabled.includes(k.id))){
      const documentRow=available.get(key(l)+":"+kind.id);
      if(!documentRow)continue;
      const response=await supabase.storage.from("wb-customer-documents").download(documentRow.storage_path);
      if(response.error||!response.data)throw new Error(l.slip_number+" "+kind.label+": "+(response.error?.message||"File not available"));
      const blob=response.data;
      const buffer=await blob.arrayBuffer();
      const filename=documentRow.original_filename?.toLowerCase()||"";
      const mime=blob.type.toLowerCase();
      if(mime.includes("pdf")||filename.endsWith(".pdf")){
       const original=await PDFDocument.load(buffer);
       const pages=await pdf.copyPages(original,original.getPageIndices());
       for(const page of pages)pdf.addPage(page);
       added+=pages.length;
      }else if(mime.includes("png")||filename.endsWith(".png")){
       const img=await pdf.embedPng(buffer);const page=pdf.addPage([595.28,841.89]);const scale=Math.min(555/img.width,801/img.height);page.drawImage(img,{x:(595.28-img.width*scale)/2,y:(841.89-img.height*scale)/2,width:img.width*scale,height:img.height*scale});added++;
      }else if(mime.includes("jpeg")||mime.includes("jpg")||/\.jpe?g$/.test(filename)){
       const img=await pdf.embedJpg(buffer);const page=pdf.addPage([595.28,841.89]);const scale=Math.min(555/img.width,801/img.height);page.drawImage(img,{x:(595.28-img.width*scale)/2,y:(841.89-img.height*scale)/2,width:img.width*scale,height:img.height*scale});added++;
      }else{throw new Error("Unsupported source format: "+(documentRow.original_filename||mime)+". Upload PDF, JPG or PNG.");}
     }
    }
    if(!added)continue;
    const filename=mode==="combined"?"JSPL_WB_Delivery_Documents.pdf":"JSPL_"+clean(batch[0].slip_number)+"_Documents.pdf";
    result.push({name:filename,bytes:await pdf.save()});count+=added;
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
  <View style={{flexDirection:"row",gap:16,alignItems:"flex-start"}}>
   <View style={{flex:1,backgroundColor:"white",padding:13,borderRadius:8}}>
    <Text style={{fontSize:17,fontWeight:"bold",marginBottom:9}}>Deliveries ({filtered.length})</Text>
    <Text style={{color:"#65736d",marginBottom:7}}>D = DNote · O = Outgoing WB · C = Customer WB · G = GRV</Text>
    <ScrollView style={{maxHeight:510}}>{filtered.map(l=>{
     const id=key(l),checked=selected.includes(id);
     return <Pressable key={id} onPress={()=>setSelected(xs=>checked?xs.filter(x=>x!==id):[...xs,id])} style={{padding:9,borderBottomWidth:1,borderColor:"#e7ebe8",backgroundColor:checked?"#e0f0e5":"white"}}>
      <Text style={{fontWeight:"bold"}}>{checked?"☑":"☐"} {l.slip_number} · {(Number(l.net_kg)/1000).toFixed(3)} t · {l.weigh_date}</Text>
      <Text style={{fontSize:12,color:"#50645b"}}>Field DNote: {l.dnote_number||"—"}  ·  {kinds.map(k=>(available.has(id+":"+k.id)?"✓":"—")+k.label.slice(0,1)).join("  ")}</Text>
     </Pressable>
    })}</ScrollView>
   </View>
   <View style={{width:390,backgroundColor:"white",padding:16,borderRadius:8}}>
    <Text style={{fontSize:18,fontWeight:"bold",marginBottom:12}}>PDF options · {chosen.length} selected loads</Text>
    {kinds.map(k=><Pressable key={k.id} onPress={()=>setEnabled(v=>v.includes(k.id)?v.filter(x=>x!==k.id):[...v,k.id])} style={{paddingVertical:8}}><Text style={{fontSize:15}}>{enabled.includes(k.id)?"☑":"☐"}  {k.label}</Text></Pressable>)}
    <Text style={{fontWeight:"bold",marginTop:14,marginBottom:7}}>Packaging</Text>
    <Pressable onPress={()=>setMode("combined")} style={{padding:8}}><Text>{mode==="combined"?"◉":"○"} One combined PDF for all loads</Text></Pressable>
    <Pressable onPress={()=>setMode("perload")} style={{padding:8,marginBottom:10}}><Text>{mode==="perload"?"◉":"○"} Separate PDF per delivery</Text></Pressable>
    <Text style={{fontWeight:"bold",color:missing.length?"#93511b":"#176541",marginBottom:4}}>Missing source documents: {missing.length}</Text>
    <ScrollView style={{maxHeight:115,marginBottom:12}}>{missing.slice(0,30).map((m,i)=><Text key={i} style={{fontSize:12,color:"#93511b"}}>{m}</Text>)}</ScrollView>
    <Button label={busy?"Generating…":"Generate PDF attachment(s)"} click={build} disabled={busy||!chosen.length||!enabled.length}/>
    <Text style={{fontSize:12,color:"#586a60",marginTop:9}}>Downloads are prepared locally in your browser. Attach them using your normal email application. Missing types are skipped and listed above.</Text>
   </View>
  </View>
 </ScrollView>;
}
