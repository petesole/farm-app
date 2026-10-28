import {WbAdminSignIn} from "../components/jspl/WbAdminSignIn";
import {useEffect,useMemo,useState} from "react";
import {router} from "expo-router";
import {Platform,Pressable,ScrollView,Text,View} from "react-native";
import {supabase} from "../supabase";
import {WbModuleHeader} from "../components/jspl/WbModuleHeader";
import {jsplColors as C} from "../constants/jspl-design";
import {wbFormatDate} from "../utils/wb-date";

type Doc={received_id:string;document_type:string;document_number:string;document_date:string;net_kg:number;delivery_note:string|null;vehicle_reg:string|null;source_type:string|null;source_id:string|null};
type Dispatch={source_type:string;source_id:string;slip_number:string;dnote_number:string|null;weigh_date:string;net_kg:number;registration_text:string|null;receiving_wb_number:string|null;grv_number:string|null};
const norm=(x:string|null|undefined)=>(x||"").replace(/[^A-Z0-9]/gi,"").toUpperCase();
function Button({label,press,disabled=false}:{label:string;press:()=>void;disabled?:boolean}){return <Pressable disabled={disabled} onPress={press} style={{backgroundColor:disabled?"#9aa6a0":C.primary,borderRadius:7,padding:10,marginRight:8,marginBottom:8}}><Text style={{color:"white",fontWeight:"700"}}>{label}</Text></Pressable>}
export default function WbLiveMatching(){
 const [authorized,setAuthorized]=useState<boolean|null>(null),[docs,setDocs]=useState<Doc[]>([]),[loads,setLoads]=useState<Dispatch[]>([]),[selected,setSelected]=useState<string|null>(null),[chosen,setChosen]=useState<string|null>(null),[error,setError]=useState(""),[info,setInfo]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){const [a,b]=await Promise.all([supabase.from("wb_received_document").select("received_id,document_type,document_number,document_date,net_kg,delivery_note,vehicle_reg,source_type,source_id").order("created_at",{ascending:false}).limit(500),supabase.from("wb_unified_dispatch_v").select("source_type,source_id,slip_number,dnote_number,weigh_date,net_kg,registration_text,receiving_wb_number,grv_number").order("weigh_date",{ascending:false}).limit(3000)]);if(a.error||b.error){setError(a.error?.message||b.error?.message||"Failed to load");return;}setDocs((a.data||[]) as Doc[]);setLoads(((b.data||[]) as Dispatch[]).filter(x=>x.source_type==="scale"||x.source_type==="manual"));}
 useEffect(()=>{let live=true;(async()=>{const u=await supabase.auth.getUser();if(!u.data.user){if(live)setAuthorized(false);return;}const r=await supabase.rpc("wb_admin_allowed");if(live)setAuthorized(r.data===true&&!r.error)})();return()=>{live=false}},[]);
 useEffect(()=>{if(authorized)refresh()},[authorized]);
 const doc=docs.find(d=>d.received_id===selected);
 const candidate=useMemo(()=>{if(!doc)return [];return loads.map(d=>{
  let score=0;const why:string[]=[];const dn=norm(doc.delivery_note),fn=norm(d.dnote_number);
  if(dn&&fn&&dn===fn){score+=100;why.push("Exact DNote");}
  else if(dn&&fn&&(dn.includes(fn)||fn.includes(dn))){score+=40;why.push("Similar DNote");}
  if(norm(doc.vehicle_reg)&&norm(doc.vehicle_reg)===norm(d.registration_text)){score+=35;why.push("Same vehicle");}
  const days=Math.abs((Date.parse(doc.document_date)-Date.parse(d.weigh_date))/86400000);
  if(Number.isFinite(days)&&days<=3){score+=15;why.push("Within 3 days");}
  if(doc.document_type==="customer_wb"&&Math.abs(Number(doc.net_kg)-Number(d.net_kg))<=500){score+=10;why.push("Weight within 500 kg");}
  const existing=doc.document_type==="customer_wb"?d.receiving_wb_number:d.grv_number;
  const alreadyTaken=!!existing&&existing!==doc.document_number;
  return {...d,score,why,alreadyTaken};
 }).filter(d=>!d.alreadyTaken).sort((a,b)=>b.score-a.score).slice(0,30)},[doc,loads]);
 async function confirm(){if(!doc||!chosen||busy)return;const load=loads.find(d=>d.source_type+":"+d.source_id===chosen);if(!load)return;setBusy(true);setError("");setInfo("");const r=await supabase.rpc("wb_match_received_document",{p_received_id:doc.received_id,p_source_type:load.source_type,p_source_id:load.source_id});setBusy(false);if(r.error){setError(r.error.message);return;}setInfo(doc.document_type==="grv"?"GRV matched and GRV status updated.":"Customer WB matched and DNote status updated.");setSelected(null);setChosen(null);await refresh();}
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;
 if(authorized===null)return <Text>Checking Admin access…</Text>;
 if(!authorized)return <WbAdminSignIn onAuthenticated={()=>setAuthorized(true)}/>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:24,minWidth:1000}}>
 <WbModuleHeader title="Match Live Customer Documents"/>
 <Text style={{color:C.textSecondary,marginBottom:14}}>Only reviewed and saved live receiving documents appear here. Suggestions are not automatic allocations: confirm the original PDF, DNote and vehicle before linking. Customer WB and GRV clear independently.</Text>
 <View style={{flexDirection:"row",marginBottom:14}}><Button label="Receiving Documents" press={()=>router.push("/weighbridge-receiving-inbox")}/><Button label="Delivery Report" press={()=>router.push("/weighbridge-delivery-report")}/><Button label="Refresh" press={refresh}/></View>
 {error?<Text style={{color:C.danger,marginBottom:10}}>{error}</Text>:null}{info?<Text style={{color:C.primary,marginBottom:10}}>{info}</Text>:null}
 <View style={{flexDirection:"row",alignItems:"flex-start"}}>
 <View style={{width:390,marginRight:16,backgroundColor:C.surface,padding:14,borderRadius:9}}>
 <Text style={{fontWeight:"800",fontSize:17,color:C.primaryDark,marginBottom:10}}>Awaiting match ({docs.filter(d=>!d.source_id).length})</Text>
 {docs.filter(d=>!d.source_id).map(d=><Pressable key={d.received_id} onPress={()=>{setSelected(d.received_id);setChosen(null);}} style={{padding:11,backgroundColor:selected===d.received_id?C.successTint:C.surface,borderBottomWidth:1,borderColor:C.border}}>
 <Text style={{fontWeight:"700",color:C.text}}>{d.document_type==="grv"?"GRV":"Customer WB"} {d.document_number}</Text>
 <Text style={{color:C.textSecondary}}>{wbFormatDate(d.document_date)} · {Number(d.net_kg).toLocaleString()} kg · {d.delivery_note||"No DNote"}</Text></Pressable>)}
 {!docs.some(d=>!d.source_id)?<Text>All saved live documents have been matched.</Text>:null}
 </View>
 <View style={{flex:1,backgroundColor:C.surface,padding:14,borderRadius:9}}>
 {!doc?<Text>Select a customer document to see candidate dispatches.</Text>:<>
 <Text style={{fontWeight:"800",fontSize:18,color:C.primaryDark,marginBottom:6}}>Match {doc.document_type==="grv"?"GRV":"Customer WB"} {doc.document_number}</Text>
 <Text style={{marginBottom:10}}>Document: {Number(doc.net_kg).toLocaleString()} kg · {doc.delivery_note||"No DNote"} · {doc.vehicle_reg||"Vehicle not recorded"}</Text>
 <Text style={{color:C.textSecondary,marginBottom:9}}>Ranked suggestions; low-scoring matches may still be correct. Check against the original documents.</Text>
 {candidate.map(d=><Pressable key={d.source_type+":"+d.source_id} onPress={()=>setChosen(d.source_type+":"+d.source_id)} style={{padding:12,marginBottom:7,borderWidth:1,borderRadius:6,borderColor:chosen===d.source_type+":"+d.source_id?C.primary:C.border,backgroundColor:chosen===d.source_type+":"+d.source_id?C.successTint:C.surface}}>
 <Text style={{fontWeight:"700"}}>DNote {d.dnote_number||"—"} · WB {d.slip_number} · {Number(d.net_kg).toLocaleString()} kg</Text>
 <Text style={{color:C.textSecondary}}>{wbFormatDate(d.weigh_date)} · {d.registration_text||"No truck"} · {d.why.length?d.why.join(", "):"No matching indicators"} (score {d.score})</Text>
 </Pressable>)}
 <Button label={busy?"Matching…":"Confirm selected dispatch match"} disabled={!chosen||busy} press={confirm}/>
 </>}
 </View></View>
 </ScrollView>;
}