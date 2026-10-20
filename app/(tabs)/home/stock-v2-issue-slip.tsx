import {useEffect,useMemo,useState} from "react";
import {useLocalSearchParams,useRouter} from "expo-router";
import {ActivityIndicator,Platform,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors,jsplSpacing,jsplRadii} from "@/constants/jspl-design";

const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Line={item_code:string;item_name:string;base_unit:string;quantity:number;rate_per_ha:number|null;mix_instruction:string|null};
type Slip={header:{document_id:number;document_number:string;document_date:string;tracecode_name:string|null;job_id:string|null;water_rate:number|null;sprayer:string|null;spray_type:string|null};lines:Line[]};
const fmt=(v:number,dp=2)=>Number.isFinite(v)?v.toLocaleString("en-GB",{maximumFractionDigits:dp,minimumFractionDigits:dp}):"—";
export default function IssueSlip(){
 const router=useRouter(),params=useLocalSearchParams<{documentId?:string}>();
 const docId=Number(params.documentId);
 const [slip,setSlip]=useState<Slip|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[tankSize,setTankSize]=useState("600");
 useEffect(()=>{let alive=true;(async()=>{try{
  if(!Number.isSafeInteger(docId)||docId<=0)throw Error("Valid issue number required");
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");
  const r=await fetch(endpoint+"?issue_slip="+docId,{headers:{authorization:"Bearer "+session.access_token}});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load stock issue");
  if(alive)setSlip(d);
 }catch(e){if(alive)setError(e instanceof Error?e.message:String(e))}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[docId]);
 const water=Number(slip?.header.water_rate||0),capacity=Number(tankSize);
 const rated=(slip?.lines??[]).filter(l=>Number(l.rate_per_ha)>0);
 const area=useMemo(()=>rated.length?Math.min(...rated.map(l=>Number(l.quantity)/Number(l.rate_per_ha))):0,[rated]);
 const ready=!!slip&&water>0&&capacity>0&&Number.isFinite(capacity)&&rated.length===slip.lines.length&&area>0;
 const totalWater=area*water,full=Math.floor(totalWater/(capacity||Infinity)),part=Math.max(0,totalWater-full*capacity);
 const fullHa=water>0?capacity/water:0,partHa=water>0?part/water:0;
 const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
 const print=()=>{if(!slip||Platform.OS!=="web"||typeof window==="undefined")return;
  const popup=window.open("","_blank","width=460,height=780");
  if(!popup){setError("Please allow pop-ups to print the Epson issue slip.");return;}
  const h=slip.header;
  const date=h.document_date?.slice(8,10)+"/"+h.document_date?.slice(5,7)+"/"+h.document_date?.slice(0,4);
  const rows=slip.lines.map(l=>`<tr><td class="prod">${esc(l.item_name)}${l.mix_instruction?`<div class="mix">${esc(l.mix_instruction)}</div>`:""}</td><td>${fmt(Number(l.quantity),2)}</td><td>${l.rate_per_ha==null?"—":fmt(Number(l.rate_per_ha),2)}</td><td>${ready?fmt(fullHa*Number(l.rate_per_ha),2):"—"}</td><td>${ready&&part>0?fmt(partHa*Number(l.rate_per_ha),2):"—"}</td></tr>`).join("");
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Issue ${esc(h.document_number)}</title><style>
  @page{size:80mm auto;margin:3mm 3mm 4mm}*{box-sizing:border-box}body{margin:0;color:#000;background:white;font-family:Arial,sans-serif;font-size:9px}
  main{width:72mm;margin:0 auto}.company,.heading{text-align:center;font-weight:800}.company{font-size:12px}.heading{font-size:10px;margin-top:3px}
  .rule{border-top:1px dashed #000;margin:6px 0}.trace{text-align:center;font-size:17px;font-weight:900;margin:7px 0;overflow-wrap:anywhere}
  .meta{line-height:1.6}.row{display:flex;justify-content:space-between;gap:4px}.label{font-weight:700}
  table{table-layout:fixed;border-collapse:collapse;width:100%;font-size:8px}th{font-weight:800;border-bottom:1px solid #000;text-align:right;white-space:nowrap}
  th:first-child{text-align:left;width:36%}td{padding:4px 2px;border-bottom:1px dotted #aaa;text-align:right;vertical-align:top;overflow-wrap:anywhere}
  td.prod{text-align:left;font-weight:600}.sign{margin-top:17px;line-height:2.4}.help{font-size:8px;margin-top:7px}.mix{font-size:8px;font-weight:700;margin-top:2px}
  .toolbar{padding:10px;background:#eee;display:flex;gap:8px}.toolbar button{padding:5px 12px} @media print{.toolbar{display:none!important}main{width:72mm}body{margin:0}}
  </style></head><body><div class="toolbar"><button onclick="window.print()">Print Slip</button><button onclick="window.close()">Close</button></div><main>
  <div class="company">JOHN SOLE (PVT) LTD</div><div class="heading">STOCK ISSUE &amp; TANK MIX</div><div class="rule"></div>
  <div class="meta"><div><b>Issue No:</b> ${esc(h.document_number)}</div><div><b>Date:</b> ${esc(date)}</div></div>
  <div class="trace">${esc(h.tracecode_name||"NO TRACECODE")}</div>
  <div class="row"><span>Area: ${ready?fmt(area,2)+" ha":"—"}</span><span>Tank: ${fmt(capacity,0)} L</span></div>
  <div class="row"><span>Water: ${water?fmt(water,0)+" L/ha":"—"}</span><span>Full tanks: ${ready?full:"—"}</span></div>
  <div>Part tank: ${ready?fmt(part,1)+" L":"—"}</div><div class="rule"></div>
  <table><thead><tr><th>Product</th><th>Issue</th><th>Rate/ha</th><th>Full</th><th>Part</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="help">Quantities in product units. Full = per full tank; Part = final partial tank.</div>
  <div class="rule"></div><div class="sign">Issued by: ___________________<br>Received by: _________________</div></main></body></html>`;
  popup.document.open();popup.document.write(html);popup.document.close();popup.focus();
 };
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <Pressable style={styles.button} onPress={()=>router.back()}><ThemedText>← Back</ThemedText></Pressable>
  <ThemedText style={styles.heading}>Epson TM-T20H · Stock Issue Slip</ThemedText>
  {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:slip?<View style={styles.sheet}>
   <ThemedText style={styles.title}>JOHN SOLE (PVT) LTD</ThemedText>
   <ThemedText style={styles.title}>STOCK ISSUE & TANK MIX</ThemedText>
   <ThemedText>Issue No: {slip.header.document_number}</ThemedText>
   <ThemedText>Date: {slip.header.document_date}</ThemedText>
   <ThemedText style={styles.trace}>{slip.header.tracecode_name||"No tracecode"}</ThemedText>
   <ThemedText>Issued products: {slip.lines.length}</ThemedText>
   <ThemedText>Tank capacity (L)</ThemedText>
   <TextInput keyboardType="decimal-pad" style={styles.input} value={tankSize} onChangeText={setTankSize}/>
   {!ready?<ThemedText style={styles.warning}>Tank mix quantities are unavailable for an issue without matching spray rates and a water rate. The posted issue quantities will still print.</ThemedText>:<ThemedText>Area {fmt(area)} ha · Full tanks {full} · Part tank {fmt(part,1)} L</ThemedText>}
   {slip.lines.map(l=><ThemedText key={l.item_code}>{l.item_name}: {fmt(Number(l.quantity))} {l.base_unit} · Rate/ha {l.rate_per_ha==null?"—":fmt(Number(l.rate_per_ha))}{l.mix_instruction?" · "+l.mix_instruction:""}</ThemedText>)}
   <Pressable style={styles.primary} onPress={print}><ThemedText style={{color:"#fff",fontWeight:"700"}}>Print 80 mm Issue Slip</ThemedText></Pressable>
  </View>:null}
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},button:{alignSelf:"flex-start",padding:10,borderRadius:jsplRadii.sm,borderWidth:1,borderColor:jsplColors.border},heading:{fontSize:20,fontWeight:"700",color:jsplColors.primaryDark},sheet:{backgroundColor:"#fff",borderRadius:jsplRadii.md,borderWidth:1,borderColor:jsplColors.border,padding:16,gap:9,maxWidth:480},title:{fontWeight:"700",textAlign:"center"},trace:{fontSize:22,fontWeight:"900",textAlign:"center"},input:{width:140,borderWidth:1,borderColor:jsplColors.border,padding:10},primary:{backgroundColor:jsplColors.primary,padding:12,alignSelf:"flex-start",borderRadius:jsplRadii.sm},warning:{color:jsplColors.danger},error:{color:jsplColors.danger}});
