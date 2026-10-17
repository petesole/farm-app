import {useEffect,useState} from "react";
import {router} from "expo-router";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
type Dispatch={source_type:string;source_id:string;slip_number:string;dnote_number:string|null;weigh_date:string;dispatched_kg:number;customer_received_kg:number|null;returned_kg:number;unresolved_kg:number;out_dnote:boolean;out_grv:boolean;customer_wb_number:string|null;grv_number:string|null};
type Return={source_type:string;source_id:string;slip_number:string;weigh_date:string;net_kg:number;movement_kind:string};
type Doc={received_id:string;document_type:string;document_number:string;net_kg:number;customer_wb_id:string|null;source_type:string|null;source_id:string|null};
const button=(title:string,fn:()=>void,disabled=false)=><Pressable disabled={disabled} onPress={fn} style={{backgroundColor:disabled?"#9ca3af":"#155b9c",padding:9,borderRadius:5,marginRight:8,marginBottom:8}}><Text style={{color:"white",fontWeight:"bold"}}>{title}</Text></Pressable>;
export default function Reconcile(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[dispatch,setDispatch]=useState<Dispatch[]>([]),[returns,setReturns]=useState<Return[]>([]),[docs,setDocs]=useState<Doc[]>([]),[links,setLinks]=useState<any[]>([]);
 const [sel,setSel]=useState(""),[search,setSearch]=useState(""),[ret,setRet]=useState(""),[wb,setWb]=useState(""),[grv,setGrv]=useState(""),[error,setError]=useState(""),[info,setInfo]=useState(""),[busy,setBusy]=useState(false);
 async function load(){const [a,b,c,d,e]=await Promise.all([supabase.from("wb_dispatch_return_reconciliation_v").select("*").order("weigh_date",{ascending:false}).limit(3000),supabase.from("wb_scale_transaction").select("transaction_id,official_slip_number,local_created_at,net_kg,movement_kind,status").eq("movement_kind","CUSTOMER_RETURN").eq("status","completed"),supabase.from("wb_manual_entries").select("manual_entry_id,slip_number,weigh_date,net_kg,movement_kind,status").eq("movement_kind","CUSTOMER_RETURN").eq("status","completed"),supabase.from("wb_received_document").select("received_id,document_type,document_number,net_kg,customer_wb_id,source_type,source_id").limit(3000),supabase.from("wb_dispatch_return_link").select("*").limit(3000)]);
 const err=[a.error,b.error,c.error,d.error,e.error].find(Boolean);if(err){setError(err.message);return;}
 setDispatch((a.data||[]) as Dispatch[]);setReturns([...(b.data||[]).map((x:any)=>({source_type:"scale",source_id:x.transaction_id,slip_number:String(x.official_slip_number||""),weigh_date:x.local_created_at?.slice(0,10)||"",net_kg:Number(x.net_kg),movement_kind:x.movement_kind})),...(c.data||[]).map((x:any)=>({source_type:"manual",source_id:x.manual_entry_id,slip_number:String(x.slip_number||""),weigh_date:x.weigh_date,net_kg:Number(x.net_kg),movement_kind:x.movement_kind}))]);setDocs((d.data||[]) as Doc[]);setLinks(e.data||[]);
 }
 useEffect(()=>{let live=true;(async()=>{const u=await supabase.auth.getUser();if(!u.data.user){if(live)setAllowed(false);return;}const r=await supabase.rpc("wb_admin_allowed");if(live)setAllowed(r.data===true)})();return()=>{live=false}},[]);
 useEffect(()=>{if(allowed)load()},[allowed]);
 const current=dispatch.find(x=>x.source_type+":"+x.source_id===sel);
 const choices=returns.filter(x=>!links.some(y=>y.return_source_type===x.source_type&&y.return_source_id===x.source_id));
 async function addReturn(){if(!current||!ret||busy)return;const t=choices.find(x=>x.source_type+":"+x.source_id===ret);if(!t)return;setBusy(true);setError("");const r=await supabase.from("wb_dispatch_return_link").insert({dispatch_source_type:current.source_type,dispatch_source_id:current.source_id,return_source_type:t.source_type,return_source_id:t.source_id});setBusy(false);if(r.error){setError(r.error.message);return;}setRet("");setInfo("Actual return slip linked to original dispatch.");await load();}
 async function linkDoc(id:string,kind:"customer_wb"|"grv"){if(!current||busy)return;const d=docs.find(x=>x.received_id===id&&x.document_type===kind);if(!d)return;if(d.source_id&&(d.source_id!==current.source_id||d.source_type!==current.source_type)){setError("This document is already linked to another dispatch.");return;}setBusy(true);setError("");const r=await supabase.from("wb_received_document").update({source_type:current.source_type,source_id:current.source_id}).eq("received_id",id);setBusy(false);if(r.error){setError(r.error.message);return;}setInfo("Document linked. Return weighing was not changed.");await load();}
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;if(allowed===null)return <Text>Checking admin access…</Text>;if(!allowed)return <Text>Weighbridge Admin only.</Text>;
 const matches=dispatch.filter(x=>[x.dnote_number,x.slip_number,x.customer_wb_number].join(" ").toLowerCase().includes(search.toLowerCase())).slice(0,250);
 return <ScrollView style={{backgroundColor:"#f5f7fa",flex:1}} contentContainerStyle={{padding:20,minWidth:950}}>
 <Text style={{fontSize:24,fontWeight:"bold",marginBottom:10}}>Dispatch & Return Reconciliation</Text>
 <Text style={{marginBottom:12}}>A returned load does not clear Out DNote or Out GRV. Customer documentation is required independently. Physical differences use the actual weighed return kilograms.</Text>
 <View style={{flexDirection:"row"}}>{button("Receiving Documents",()=>router.push("/weighbridge-receiving-inbox"))}{button("Delivery Report",()=>router.push("/weighbridge-delivery-report"))}{button("Refresh",load)}</View>
 {error?<Text style={{color:"#b42318",marginBottom:8}}>{error}</Text>:null}{info?<Text style={{color:"#166534",marginBottom:8}}>{info}</Text>:null}
 <TextInput placeholder="Search original DNote, slip or customer WB" value={search} onChangeText={setSearch} style={{backgroundColor:"white",borderWidth:1,borderColor:"#bdc7d4",padding:9,marginBottom:12,maxWidth:460}}/>
 <View style={{flexDirection:"row",gap:12}}>
 <ScrollView style={{width:420,maxHeight:640,backgroundColor:"white"}}>{matches.map(d=><Pressable key={d.source_type+d.source_id} onPress={()=>{setSel(d.source_type+":"+d.source_id);setRet("");setWb("");setGrv("");setError("");}} style={{padding:11,borderBottomWidth:1,borderColor:"#edf0f4",backgroundColor:sel===d.source_type+":"+d.source_id?"#d8eafc":"white"}}>
 <Text style={{fontWeight:"bold"}}>DNote {d.dnote_number||"—"} · Slip {d.slip_number}</Text><Text>{Number(d.dispatched_kg).toLocaleString()} kg dispatched · {d.weigh_date}</Text>
 <Text style={{color:"#64748b"}}>{d.out_dnote?"Out DNote":"Customer WB ✓"} · {d.out_grv?"Out GRV":"GRV ✓"} · Returned {Number(d.returned_kg).toLocaleString()} kg</Text>
 </Pressable>)}</ScrollView>
 <View style={{flex:1,backgroundColor:"white",padding:16}}>
 {!current?<Text>Select the original dispatch to reconcile.</Text>:<>
 <Text style={{fontSize:18,fontWeight:"bold"}}>DNote {current.dnote_number||"—"} · Original slip {current.slip_number}</Text>
 <Text style={{marginTop:8}}>Dispatched: {Number(current.dispatched_kg).toLocaleString()} kg</Text>
 <Text>Customer received: {current.customer_received_kg==null?"Not recorded":Number(current.customer_received_kg).toLocaleString()+" kg"}</Text>
 <Text>Actually returned: {Number(current.returned_kg).toLocaleString()} kg</Text>
 <Text style={{fontWeight:"bold",marginVertical:7}}>Unresolved difference: {current.customer_received_kg==null?"Customer WB outstanding — not final":Number(current.unresolved_kg).toLocaleString()+" kg"}</Text>
 <Text style={{color:current.out_dnote?"#b45309":"#166534"}}>{current.out_dnote?"Out DNote — Customer WB missing":"Customer WB recorded"}</Text>
 <Text style={{color:current.out_grv?"#b45309":"#166534",marginBottom:12}}>{current.out_grv?"Out GRV — GRV missing or not linked":"GRV recorded"}</Text>
 <Text style={{fontWeight:"bold",marginBottom:5}}>Link actual return weighbridge slip</Text>
 <Text style={{color:"#64748b",marginBottom:5}}>Only completed CUSTOMER_RETURN slips can be selected. This does not add to harvested tonnage.</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>{choices.map(x=><Pressable key={x.source_type+x.source_id} onPress={()=>setRet(x.source_type+":"+x.source_id)} style={{padding:8,margin:4,borderWidth:1,borderColor:ret===x.source_type+":"+x.source_id?"#166534":"#cbd5e1",backgroundColor:ret===x.source_type+":"+x.source_id?"#daf5e1":"white"}}><Text>Slip {x.slip_number} · {Number(x.net_kg).toLocaleString()} kg · {x.weigh_date}</Text></Pressable>)}</View>
 {button("Link selected return",addReturn,!ret||busy)}
 <Text style={{fontWeight:"bold",marginTop:9}}>Link approved customer documents</Text>
 <Text style={{color:"#64748b",marginBottom:5}}>Customer WB and GRV must each be linked independently. Select matching numbers after checking the original PDF.</Text>
 <Text style={{fontWeight:"bold"}}>Customer WB</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>{docs.filter(x=>x.document_type==="customer_wb"&&!x.source_id).map(x=><Pressable key={x.received_id} onPress={()=>setWb(x.received_id)} style={{padding:8,margin:4,borderWidth:1,borderColor:wb===x.received_id?"#166534":"#ccc",backgroundColor:wb===x.received_id?"#daf5e1":"white"}}><Text>{x.document_number} · {Number(x.net_kg).toLocaleString()} kg</Text></Pressable>)}</View>
 {button("Link Customer WB",()=>linkDoc(wb,"customer_wb"),!wb||busy)}
 <Text style={{fontWeight:"bold"}}>GRV</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap"}}>{docs.filter(x=>x.document_type==="grv"&&!x.source_id).map(x=><Pressable key={x.received_id} onPress={()=>setGrv(x.received_id)} style={{padding:8,margin:4,borderWidth:1,borderColor:grv===x.received_id?"#166534":"#ccc",backgroundColor:grv===x.received_id?"#daf5e1":"white"}}><Text>{x.document_number} · {Number(x.net_kg).toLocaleString()} kg</Text></Pressable>)}</View>
 {button("Link GRV",()=>linkDoc(grv,"grv"),!grv||busy)}
 </>}</View></View></ScrollView>;
}