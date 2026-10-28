import {StockV2Header} from "@/components/jspl/StockV2Header";
import {useEffect,useMemo,useState} from "react";
import {useLocalSearchParams,useRouter} from "expo-router";
import {ActivityIndicator,Platform,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors,jsplSpacing,jsplRadii,jsplSizes} from "@/constants/jspl-design";

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
 const displayDate=slip?.header.document_date?`${slip.header.document_date.slice(8,10)}/${slip.header.document_date.slice(5,7)}/${slip.header.document_date.slice(0,4)}`:"—";
 const issueNumber=slip?.header.document_id?String(slip.header.document_id):"—";
 const rated=(slip?.lines??[]).filter(l=>Number(l.rate_per_ha)>0);
 const area=useMemo(()=>rated.length?Math.min(...rated.map(l=>Number(l.quantity)/Number(l.rate_per_ha))):0,[rated]);
 const ready=!!slip&&water>0&&capacity>0&&Number.isFinite(capacity)&&rated.length===slip.lines.length&&area>0;
 const totalWater=area*water,full=ready?Math.floor((totalWater+1e-7)/capacity):0,part=ready?Math.max(0,Number((totalWater-full*capacity).toFixed(6))):0;
 const fullHa=water>0?capacity/water:0,partHa=water>0?part/water:0;
 const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
 const print=()=>{if(!slip||Platform.OS!=="web"||typeof window==="undefined")return;
  const popup=window.open("","_blank","width=460,height=780");
  if(!popup){setError("Please allow pop-ups to print the Epson issue slip.");return;}
  const h=slip.header;
  const date=h.document_date?.slice(8,10)+"/"+h.document_date?.slice(5,7)+"/"+h.document_date?.slice(0,4);
  const rows=slip.lines.map(l=>`<tr><td class="prod">${esc(l.item_name)}${l.mix_instruction?`<div class="mix">${esc(l.mix_instruction)}</div>`:""}</td><td>${fmt(Number(l.quantity),2)}</td><td>${l.rate_per_ha==null?"—":fmt(Number(l.rate_per_ha),2)}</td><td>${ready?fmt(fullHa*Number(l.rate_per_ha),2):"—"}</td><td>${ready&&part>0?fmt(partHa*Number(l.rate_per_ha),2):"—"}</td></tr>`).join("");
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Issue ${esc(h.document_number)}</title><style>
  @page{size:80mm auto;margin:3mm 3mm 4mm}*{box-sizing:border-box}body{margin:0;color:#000;background:white;font-family:Arial,sans-serif;font-size:11px}
  main{width:72mm;margin:0 auto}.company,.heading{text-align:center;font-weight:800}.company{font-size:14px}.heading{font-size:12px;margin-top:3px}
  .rule{border-top:1px dashed #000;margin:6px 0}.trace{text-align:center;font-size:17px;font-weight:900;margin:7px 0;overflow-wrap:anywhere}
  .meta{line-height:1.7;font-size:11px}.areaWater{font-size:13px;font-weight:800;margin:6px 0}.label{font-weight:700}
  table{table-layout:fixed;border-collapse:collapse;width:100%;font-size:11px}th{font-weight:800;border-bottom:1px solid #000;text-align:right;white-space:nowrap;font-size:10px}thead .tankHeader th{border:1px solid #888;text-align:center;font-size:11px;padding:4px 0}
  th:first-child{text-align:left;width:36%}td{font-size:11px;padding:7px 2px;border-bottom:1px dotted #aaa;text-align:right;vertical-align:top;overflow-wrap:anywhere}
  td.prod{text-align:left;font-weight:700}.sign{margin-top:17px;line-height:2.4}.help{font-size:8px;margin-top:7px}.mix{font-size:8px;font-weight:700;margin-top:2px}
  .toolbar{padding:10px;background:#eee;display:flex;gap:8px}.toolbar button{padding:5px 12px} @media print{.toolbar{display:none!important}main{width:72mm}body{margin:0}}
  </style></head><body><div class="toolbar"><button onclick="window.print()">Print Slip</button><button onclick="window.close()">Close</button></div><main>
  <div class="company">JOHN SOLE (PVT) LTD</div><div class="heading">STOCK ISSUE &amp; TANK MIX</div><div class="rule"></div>
  <div class="meta"><div><b>Issue No:</b> ${esc(h.document_id)}</div><div><b>Date:</b> ${esc(date)}</div></div>
  <div class="trace">${esc(h.tracecode_name||"NO TRACECODE")}</div>
  <div class="areaWater">Area: ${ready?fmt(area,2)+" ha":"—"} &nbsp; Water: ${water?fmt(water,0)+" L/ha":"—"}</div><div class="rule"></div>
  <table><colgroup><col style="width:36%"><col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:16%"></colgroup><thead><tr class="tankHeader"><th colspan="3"></th><th>Qty: ${ready?full:"—"}</th><th>${ready?(part>0?1:0):"—"}</th></tr><tr class="tankHeader"><th colspan="3"></th><th>${fmt(capacity,0)} L</th><th>${ready?fmt(part,0)+" L":"—"}</th></tr><tr><th>Product</th><th>Issue</th><th>Rate/ha</th><th>Full</th><th>Part</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="help">Full and Part show product quantity per tank.</div>
  <div class="rule"></div><div class="sign">Issued by: ___________________<br>Received by: _________________</div></main></body></html>`;
  popup.document.open();popup.document.write(html);popup.document.close();popup.focus();
 };
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <StockV2Header title="Stock Issue Slip"/>

  <ThemedText style={styles.heading}>Epson TM-T20H · Stock Issue Slip</ThemedText>
  {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:slip?<View style={styles.slipWrap}><View style={styles.sheet}>
   <ThemedText style={styles.title}>JOHN SOLE (PVT) LTD</ThemedText>
   <ThemedText style={styles.title}>STOCK ISSUE & TANK MIX</ThemedText>
   <View style={styles.rule}/>
   <ThemedText style={styles.small}>Issue No: {issueNumber}</ThemedText>
   <ThemedText style={styles.small}>Date: {displayDate}</ThemedText>
   <ThemedText style={styles.trace}>{slip.header.tracecode_name||"NO TRACECODE"}</ThemedText>
   <ThemedText style={styles.areaWater}>Area: {ready?fmt(area)+" ha":"—"} · Water: {water?fmt(water,0)+" L/ha":"—"}</ThemedText>
   <View style={styles.rule}/>
   <View style={styles.tableRow}><View style={styles.productHead}/><View style={styles.numHead}/><View style={styles.numHead}/><ThemedText style={styles.numHead}>Qty: {ready?full:"—"}</ThemedText><ThemedText style={styles.numHead}>{ready?(part>0?1:0):"—"}</ThemedText></View>
   <View style={styles.tableRow}><View style={styles.productHead}/><View style={styles.numHead}/><View style={styles.numHead}/><ThemedText style={styles.numHead}>{fmt(capacity,0)} L</ThemedText><ThemedText style={styles.numHead}>{ready?fmt(part,0)+" L":"—"}</ThemedText></View>
   <View style={styles.tableRow}><ThemedText style={styles.productHead}>Product</ThemedText><ThemedText style={styles.numHead}>Issue</ThemedText><ThemedText style={styles.numHead}>Rate/ha</ThemedText><ThemedText style={styles.numHead}>Full</ThemedText><ThemedText style={styles.numHead}>Part</ThemedText></View>
   {slip.lines.map(l=><View key={l.item_code} style={styles.tableRow}>
     <View style={styles.productCell}><ThemedText style={styles.smallBold}>{l.item_name}</ThemedText>{l.mix_instruction?<ThemedText style={styles.small}>{l.mix_instruction}</ThemedText>:null}</View>
     <ThemedText style={styles.numCell}>{fmt(Number(l.quantity))}</ThemedText>
     <ThemedText style={styles.numCell}>{l.rate_per_ha==null?"—":fmt(Number(l.rate_per_ha))}</ThemedText>
     <ThemedText style={styles.numCell}>{ready?fmt(fullHa*Number(l.rate_per_ha)):"—"}</ThemedText>
     <ThemedText style={styles.numCell}>{ready&&part>0?fmt(partHa*Number(l.rate_per_ha)):"—"}</ThemedText>
    </View>)}
   <ThemedText style={styles.note}>Full and Part show product quantity per tank.</ThemedText>
   {!ready?<ThemedText style={styles.warning}>Tank calculations need recorded spray rates and water rate. Actual issued quantities still print.</ThemedText>:null}
   <View style={styles.rule}/>
   <ThemedText style={styles.small}>Issued by: ___________________</ThemedText>
   <ThemedText style={styles.small}>Received by: _________________</ThemedText>
   </View>
   <View style={styles.controls}>
    <ThemedText>Tank capacity (L)</ThemedText>
    <TextInput keyboardType="decimal-pad" style={styles.input} value={tankSize} onChangeText={setTankSize}/>
    <Pressable style={styles.primary} onPress={print}><ThemedText style={{color:"#fff",fontWeight:"700"}}>Print 80 mm Issue Slip</ThemedText></Pressable>
   </View></View>:null}
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},
 button:{alignSelf:"flex-start",minHeight:jsplSizes.buttonHeight,justifyContent:"center",paddingHorizontal:jsplSpacing.md,borderRadius:jsplRadii.sm,borderWidth:1,borderColor:jsplColors.border},
 heading:{fontSize:20,fontWeight:"700",color:jsplColors.primaryDark},
 slipWrap:{gap:14,alignItems:"flex-start"},
 sheet:{backgroundColor:"#fff",width:302,borderWidth:1,borderColor:"#ddd",padding:10,gap:4},
 title:{fontSize:12,fontWeight:"900",textAlign:"center",color:"#000",marginVertical:2},
 trace:{fontSize:17,fontWeight:"900",textAlign:"center",color:"#000",marginVertical:6},
 small:{fontSize:11,color:"#000"},areaWater:{fontSize:13,fontWeight:"800",color:"#000",marginVertical:6},
 smallBold:{fontSize:11,fontWeight:"700",color:"#000"},
 rule:{borderTopWidth:1,borderTopColor:"#000",borderStyle:"dashed",marginVertical:5},
 two:{flexDirection:"row",justifyContent:"space-between",gap:4},
 tableRow:{flexDirection:"row",borderBottomWidth:1,borderBottomColor:"#ddd",paddingVertical:6,alignItems:"flex-start"},
 productHead:{width:"36%",fontSize:11,fontWeight:"800",color:"#000"},
 numHead:{width:"16%",fontSize:10,fontWeight:"800",textAlign:"right",color:"#000"},
 productCell:{width:"36%"},
 numCell:{width:"16%",fontSize:11,textAlign:"right",color:"#000"},
 note:{fontSize:8,color:"#000",marginVertical:5},
 controls:{gap:8,backgroundColor:"#fff",padding:14,borderRadius:jsplRadii.sm,borderWidth:1,borderColor:jsplColors.border},
 input:{width:140,minHeight:jsplSizes.inputHeight,borderWidth:1,borderColor:jsplColors.border,paddingHorizontal:jsplSpacing.md,paddingVertical:9,borderRadius:jsplRadii.sm,backgroundColor:jsplColors.surface},
 primary:{backgroundColor:jsplColors.primary,minHeight:jsplSizes.buttonHeight,justifyContent:"center",paddingHorizontal:jsplSpacing.md,alignSelf:"flex-start",borderRadius:jsplRadii.sm},
 warning:{color:jsplColors.danger,fontSize:9},error:{color:jsplColors.danger}
});
