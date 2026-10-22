import {useEffect,useMemo,useState} from "react";
import {router} from "expo-router";
import {Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
import {jsplColors as C} from "../constants/jspl-design";
type Season={season_id:number;season_name:string};
type Entry={entry_id:number;season_id:number;entry_date:string;entry_type:string;source_class:string|null;destination_class:string;quantity_kg:number;reason:string;notes:string;created_at:string};
const classes=[["SEED","Seed Wheat"],["COMMERCIAL","Commercial Wheat"]] as const;
const label=(v:string|null)=>classes.find(x=>x[0]===v)?.[1]||"—";
const fmt=(n:number)=>(n/1000).toLocaleString("en-US",{minimumFractionDigits:3,maximumFractionDigits:3});
function B({text,click,disabled=false}:{text:string;click:()=>void;disabled?:boolean}){return <Pressable onPress={click} disabled={disabled} style={{padding:10,backgroundColor:disabled?"#94a3a3":C.primary,marginRight:9,marginBottom:9,borderRadius:6}}><Text style={{color:"white",fontWeight:"bold"}}>{text}</Text></Pressable>}
export default function WheatStorage(){
 const [ok,setOk]=useState<boolean|null>(null),[seasons,setSeasons]=useState<Season[]>([]),[entries,setEntries]=useState<Entry[]>([]),[withdrawals,setWithdrawals]=useState<{season_id:number|null;slip_number:string;customer_name:string;wheat_class:string;withdrawn_kg:number}[]>([]),[allocated,setAllocated]=useState<{season_id:number;tracecode_name:string;wheat_class:string;allocated_kg:number}[]>([]),[liveBalances,setLiveBalances]=useState<{season_id:number;wheat_class:string;balance_kg:number}[]>([]);
 const [season,setSeason]=useState(""),[mode,setMode]=useState("TRANSFER"),[from,setFrom]=useState("SEED"),[to,setTo]=useState("COMMERCIAL"),[kg,setKg]=useState(""),[day,setDay]=useState(new Date().toISOString().slice(0,10)),[reason,setReason]=useState(""),[notes,setNotes]=useState(""),[error,setError]=useState(""),[success,setSuccess]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){const [s,e,a,b,w]=await Promise.all([supabase.from("season").select("season_id,season_name").order("season_id",{ascending:false}),supabase.from("wheat_storage_classification_entry").select("*").order("entry_date",{ascending:false}).order("entry_id",{ascending:false}).limit(2000),supabase.from("wheat_allocated_storage_v").select("*"),supabase.from("wheat_storage_classification_balance_v").select("*"),supabase.from("wheat_stock_market_withdrawals_v").select("*")]);if(s.error||e.error||a.error||b.error||w.error){setError(s.error?.message||e.error?.message||a.error?.message||b.error?.message||w.error?.message||"Unable to load");return;}setSeasons((s.data||[]) as Season[]);setEntries((e.data||[]) as Entry[]);setAllocated(a.data||[]);setLiveBalances(b.data||[]);setWithdrawals(w.data||[]);}
 useEffect(()=>{let active=true;(async()=>{const u=await supabase.auth.getUser();if(!u.data.user){if(active)setOk(false);return;}const r=await supabase.rpc("wb_admin_allowed");if(active)setOk(r.data===true&&!r.error)})();return()=>{active=false}},[]);
 useEffect(()=>{if(ok)refresh()},[ok]);
 useEffect(()=>{if(!season){const s=seasons.find(x=>x.season_name==="Winter26")||seasons[0];if(s)setSeason(String(s.season_id))}},[seasons,season]);
 const history=useMemo(()=>entries.filter(e=>String(e.season_id)===season),[entries,season]);
 const balances=useMemo(()=>Object.fromEntries(classes.map(([code])=>[code,Number(liveBalances.find(x=>String(x.season_id)===season&&x.wheat_class===code)?.balance_kg||0)])),[liveBalances,season]);
 async function save(){const qty=Number(kg);if(busy)return;if(!season||!day||!Number.isFinite(qty)||qty<=0||!reason.trim()){setError("Provide a season, date, positive quantity (kg), and reason.");return;}if(from===to){setError("Source and destination must be different.");return;}if(balances[from]<qty){setError("Insufficient classified stock in "+label(from)+". Check the opening balance first.");return;}
 setBusy(true);setError("");setSuccess("");const r=await supabase.from("wheat_storage_classification_entry").insert({season_id:Number(season),entry_date:day,entry_type:"TRANSFER",source_class:from,destination_class:to,quantity_kg:qty,reason:reason.trim(),notes:notes.trim()});setBusy(false);if(r.error){setError(r.error.message);return;}setKg("");setReason("");setNotes("");setSuccess("Classification entry saved. Physical total is unchanged by transfers.");await refresh();}
 if(Platform.OS!=="web")return <Text>Desktop web only.</Text>;if(ok===null)return <Text>Checking access…</Text>;if(!ok)return <Text>Admin access required.</Text>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:24,minWidth:860}}>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:12}}><Text style={{fontSize:23,fontWeight:"bold",flex:1,color:C.primaryDark}}>Wheat Storage Classification</Text><B text="Back to WB Dashboard" click={()=>router.push("/weighbridge")}/></View>
 <Text style={{color:C.textSecondary,marginBottom:14}}>Totals come automatically from Supabase field allocations, including WB computer and manual slips. HSCP1 and HSCP2 are Seed by field setting. Use a transfer below to classify some seed receipts as Commercial without changing slips.</Text>
 <Text style={{fontWeight:"bold",marginBottom:6}}>Season</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap",marginBottom:12}}>{seasons.filter(s=>s.season_name==="Winter26"||s.season_name==="Winter25"||history.some(e=>e.season_id===s.season_id)).map(s=><B key={s.season_id} text={s.season_name+(season===String(s.season_id)?" ✓":"")} click={()=>setSeason(String(s.season_id))}/>)}</View>

 <View style={{flexDirection:"row",gap:12,marginBottom:18}}>{classes.map(([id,title])=><View key={id} style={{flex:1,backgroundColor:"white",padding:17,borderRadius:8}}><Text style={{fontWeight:"bold",marginBottom:8}}>{title}</Text><Text style={{fontSize:24,fontWeight:"bold",color:C.primaryDark}}>{fmt(balances[id]||0)} t</Text></View>)}</View>
 <View style={{backgroundColor:"white",padding:18,borderRadius:8,marginBottom:15}}>
 <Text style={{fontSize:18,fontWeight:"bold",marginBottom:9}}>Transfer wheat between classifications</Text>

 <Text style={{color:C.textSecondary,marginBottom:10}}>This adjusts the seed/commercial split only. No opening balances or individual WB slips required.</Text>
 <Text style={{fontWeight:"bold"}}>From</Text><View style={{flexDirection:"row",flexWrap:"wrap"}}>{classes.map(([id,title])=><B key={id} text={title+(from===id?" ✓":"")} click={()=>setFrom(id)}/>)}</View>
 <Text style={{fontWeight:"bold"}}>To</Text><View style={{flexDirection:"row",flexWrap:"wrap"}}>{classes.map(([id,title])=><B key={id} text={title+(to===id?" ✓":"")} click={()=>setTo(id)}/>)}</View>
 <View style={{flexDirection:"row",gap:12,flexWrap:"wrap"}}><View><Text>Date (YYYY-MM-DD)</Text><TextInput value={day} onChangeText={setDay} style={{padding:10,borderWidth:1,borderColor:C.border,width:170}}/></View><View><Text>Quantity (kg)</Text><TextInput value={kg} onChangeText={setKg} keyboardType="decimal-pad" placeholder="e.g. 6000" style={{padding:10,borderWidth:1,borderColor:C.border,width:170}}/></View></View>
 <Text>Reason (required)</Text><TextInput value={reason} onChangeText={setReason} placeholder="e.g. Seed downgraded to commercial" style={{padding:10,borderWidth:1,borderColor:C.border,maxWidth:600,marginBottom:8}}/>
 <Text>Notes</Text><TextInput value={notes} onChangeText={setNotes} placeholder="Optional context" style={{padding:10,borderWidth:1,borderColor:C.border,maxWidth:600,marginBottom:9}}/>
 <B text={busy?"Saving…":"Save classification"} click={save} disabled={busy}/>
 {error?<Text style={{color:"#b42318"}}>{error}</Text>:null}{success?<Text style={{color:C.primary}}>{success}</Text>:null}
 </View>
 <Text style={{fontSize:19,fontWeight:"bold",marginBottom:10}}>Allocated farm receipts by field</Text>
 {allocated.filter(x=>String(x.season_id)===season).map((x,i)=><View key={i} style={{padding:9,backgroundColor:"white",marginBottom:4}}><Text>{x.tracecode_name} · {label(x.wheat_class)} · {fmt(Number(x.allocated_kg))} t</Text></View>)}
 <Text style={{color:"#a16207",marginVertical:12}}>Stock-to-market withdrawals are deducted automatically using the customer: SeedCo = Seed Wheat; every other market = Commercial Wheat. Direct field-to-market deliveries are not subtracted from stock.</Text>
 <Text style={{fontSize:19,fontWeight:"bold",marginBottom:10}}>Stock withdrawals by market</Text>
 {withdrawals.filter(w=>String(w.season_id)===season).map((w,i)=><View key={i} style={{padding:9,backgroundColor:"white",marginBottom:4}}><Text>WB {w.slip_number} · {w.customer_name} · {label(w.wheat_class)} −{fmt(Number(w.withdrawn_kg))} t</Text></View>)}
 {withdrawals.some(w=>w.season_id===null)?<Text style={{color:"#b45309"}}>Some outbound stock slips have no season and are excluded until assigned.</Text>:null}
 <Text style={{fontSize:19,fontWeight:"bold",marginBottom:10}}>Classification history — {history.length} entries</Text>
 {history.map(e=><View key={e.entry_id} style={{backgroundColor:"white",padding:11,marginBottom:5,borderRadius:6}}><Text style={{fontWeight:"bold"}}>{e.entry_date} · Transfer · {fmt(Number(e.quantity_kg))} t</Text><Text>{e.source_class?label(e.source_class)+" → ":""}{label(e.destination_class)} · {e.reason}</Text>{e.notes?<Text style={{color:C.textSecondary}}>{e.notes}</Text>:null}</View>)}
 {!history.length?<Text>No classification entries for this season yet.</Text>:null}
 </ScrollView>;
}