import {useEffect,useMemo,useState} from "react";
import {useLocalSearchParams,useRouter} from "expo-router";
import {ActivityIndicator,Platform,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors,jsplSpacing,jsplRadii} from "@/constants/jspl-design";

const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Spray={job_id:number|string;tracecode_name:string;planned_week_start:string;area_ha:number;part_label:string|null;spray_type:string;water_litres_per_ha:number|null;sprayer_asset_code:string|null;item_code:string;item_name:string;base_unit:string;rate_per_ha:number};
const fmt=(v:number,dp=2)=>Number.isFinite(v)?v.toLocaleString("en-GB",{minimumFractionDigits:dp,maximumFractionDigits:dp}):"—";
const isoWeek=(date:string)=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+3-((d.getUTCDay()+6)%7));const year=d.getUTCFullYear();const fourth=new Date(Date.UTC(year,0,4));fourth.setUTCDate(fourth.getUTCDate()-((fourth.getUTCDay()+6)%7));return year+"/"+String(1+Math.round((d.getTime()-fourth.getTime())/604800000)).padStart(2,"0")};
export default function ApplicationSheet(){
 const router=useRouter(),params=useLocalSearchParams<{jobId?:string}>();
 const id=Number(params.jobId);
 const [rows,setRows]=useState<Spray[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [tankSize,setTankSize]=useState("600");
 useEffect(()=>{let active=true;(async()=>{try{
  if(!Number.isSafeInteger(id)||id<=0)throw Error("Select a valid spray job");
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");
  const res=await fetch(endpoint,{headers:{authorization:"Bearer "+session.access_token}});
  const data=await res.json();if(!res.ok)throw Error(data.error||"Unable to load spray job");
  const found=(data.sprays??[]).filter((s:Spray)=>Number(s.job_id)===id);
  if(found.length===0)throw Error("Spray job not found in Stock V2");
  if(active)setRows(found);
 }catch(e){if(active)setError(e instanceof Error?e.message:String(e))}finally{if(active)setLoading(false)}})();return()=>{active=false}},[id]);
 useEffect(()=>{if(Platform.OS!=="web"||typeof document==="undefined")return;
  const el=document.createElement("style");el.textContent=`@page { size: A4 landscape; margin: 8mm; } @media print { html,body,#root {width:100% !important;height:auto !important;overflow:visible !important;background:#fff !important;} [data-testid="application-actions"] {display:none !important;} [data-testid="application-print-sheet"] {width:100% !important;max-width:none !important;box-sizing:border-box !important;margin:0 !important;padding:5mm !important;border:0 !important;break-inside:avoid !important;page-break-inside:avoid !important;} [data-testid="application-print-sheet"] * {font-size:9pt !important;line-height:1.15 !important;} [data-testid="application-print-sheet"] input {padding:2px !important;min-height:0 !important;} [data-testid="application-print-sheet"] [data-testid="application-print-title"] {font-size:16pt !important;} [data-testid="application-print-sheet"] [data-testid="application-print-row"] {padding:3px !important;break-inside:avoid !important;} }`;document.head.appendChild(el);return()=>{el.remove()};
 },[]);
 const first=rows[0];
 const area=Number(first?.area_ha??0),water=Number(first?.water_litres_per_ha??0),capacity=Number(tankSize);
 const totalWater=area*water;
 const validTank=capacity>0&&Number.isFinite(capacity)&&water>0;
 const full=Math.floor((totalWater+1e-7)/(validTank?capacity:Infinity));
 const rest=validTank?Math.max(0,totalWater-full*capacity):0;
 const fullHa=validTank?capacity/water:0;
 const partHa=water>0?rest/water:0;
 const canPrint=rows.length>0&&validTank;
 const print=()=>{
  if(!canPrint||!first||Platform.OS!=="web"||typeof window==="undefined")return;
  const popup=window.open("","_blank","width=1100,height=800");
  if(!popup){setError("Allow pop-ups for this site to print the application sheet.");return;}
  const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
  const lineHtml=rows.map(line=>`<tr><td>${esc(line.item_name)}</td><td class="num">${fmt(Number(line.rate_per_ha),3)}</td><td class="num">${fmt(area*Number(line.rate_per_ha),3)} ${esc(line.base_unit)}</td><td class="num">${fmt(fullHa*Number(line.rate_per_ha),3)} ${esc(line.base_unit)}</td><td class="num">${fmt(partHa*Number(line.rate_per_ha),3)} ${esc(line.base_unit)}</td></tr>`).join("");
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Application - Spray ${id}</title><style>
   @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,sans-serif;font-size:10pt}
   main{width:100%;padding:5mm}.heading{background:#dce4ec;padding:8px 10px;margin-bottom:8px}h1{font-size:19pt;margin:0 0 9px}
   .meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 16px;margin-bottom:9px}
   .tanks{display:flex;gap:26px;align-items:center;border-top:1px solid #abb5be;padding-top:7px}
   table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#e7ebf0;text-align:left;font-size:10pt}th,td{padding:5px 7px;border-bottom:1px solid #dedede;vertical-align:top}
   tbody tr:nth-child(even){background:#f3f3f3}.num{text-align:right;white-space:nowrap}th:first-child{width:28%}
   .foot{font-size:8.5pt;margin-top:12px;line-height:1.3}.toolbar{padding:10px;background:#e5e9ee;display:flex;gap:12px}
   .toolbar button{font-size:12pt;padding:6px 16px;cursor:pointer}
   @media print{.toolbar{display:none!important}main{padding:0}thead{display:table-header-group}tr{break-inside:avoid}}
   </style></head><body><div class="toolbar"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div><main>
   <div class="heading"><h1>APPLICATION · Spray #${id}</h1>
   <div class="meta"><div><b>Week:</b> ${esc(heading)}</div><div><b>Trace Code:</b> ${esc(first.tracecode_name)}</div><div><b>Spray Type:</b> ${esc(first.spray_type)}</div><div><b>Sprayer:</b> ${esc(first.sprayer_asset_code||"—")}</div>
   <div><b>Application Ha:</b> ${fmt(area)}</div><div><b>Water Rate:</b> ${fmt(water,0)} L/ha</div><div><b>Total Water:</b> ${fmt(totalWater,0)} L</div><div><b>Tank capacity:</b> ${fmt(capacity,0)} L</div></div>
   <div class="tanks"><div><b>Full Tanks</b> ${full} × ${fmt(capacity,0)} L</div><div><b>Part Tank</b> ${fmt(rest,1)} L</div></div></div>
   <table><thead><tr><th>Input Name</th><th class="num">Rate/ha</th><th class="num">Total</th><th class="num">Full Tank Mix</th><th class="num">Part Tank Mix</th></tr></thead><tbody>${lineHtml}</tbody></table>
   <p class="foot">Full Tank Mix amounts are per full tank. Part Tank Mix amounts are for the remaining water. Confirm tank capacity and sprayer calibration before applying.</p></main></body></html>`;
  popup.document.open();popup.document.write(html);popup.document.close();popup.focus();
 };
 const heading=useMemo(()=>first?isoWeek(first.planned_week_start):"",[first]);
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <View testID="application-actions" style={styles.actions}>
   <Pressable style={styles.button} onPress={()=>router.back()}><ThemedText>← Close</ThemedText></Pressable>
   <Pressable style={[styles.button,styles.print,!canPrint&&{opacity:.5}]} disabled={!canPrint} onPress={print}><ThemedText style={{color:"#fff",fontWeight:"700"}}>Print Application</ThemedText></Pressable>
  </View>
  {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:first?<View testID="application-print-sheet" style={styles.sheet}>
   <View style={styles.top}>
    <ThemedText testID="application-print-title" style={styles.title}>APPLICATION · Spray #{id}</ThemedText>
    <View style={styles.meta}><ThemedText>Week: {heading}</ThemedText><ThemedText>Trace Code: {first.tracecode_name}</ThemedText><ThemedText>Spray Type: {first.spray_type}</ThemedText><ThemedText>Sprayer: {first.sprayer_asset_code||"—"}</ThemedText><ThemedText>Application Ha: {fmt(area)}</ThemedText><ThemedText>Water Rate: {fmt(water,0)} L/ha</ThemedText><ThemedText>Total Water: {fmt(totalWater,0)} L</ThemedText></View>
    <View style={styles.tankRow}><View><ThemedText style={styles.label}>Tank capacity (L) — confirm before printing</ThemedText><TextInput style={styles.input} value={tankSize} onChangeText={setTankSize} keyboardType="decimal-pad"/></View><View><ThemedText style={styles.bold}>Full Tanks</ThemedText><ThemedText>{validTank?String(full):"—"} × {fmt(capacity,0)} L</ThemedText></View><View><ThemedText style={styles.bold}>Part Tank</ThemedText><ThemedText>{validTank?fmt(rest,1):"—"} L</ThemedText></View></View>
    {!validTank?<ThemedText style={styles.error}>Enter valid tank capacity and spray water rate.</ThemedText>:null}
   </View>
   <View style={styles.header}><ThemedText style={[styles.product,styles.bold]}>Input Name</ThemedText><ThemedText style={[styles.n,styles.bold]}>Rate/ha</ThemedText><ThemedText style={[styles.n,styles.bold]}>Total</ThemedText><ThemedText style={[styles.n,styles.bold]}>Full Tank Mix</ThemedText><ThemedText style={[styles.n,styles.bold]}>Part Tank Mix</ThemedText></View>
   {rows.map((line,i)=><View testID="application-print-row" key={line.item_code+":"+i} style={[styles.line,i%2===1&&styles.alt]}><ThemedText style={styles.product}>{line.item_name}</ThemedText><ThemedText style={styles.n}>{fmt(Number(line.rate_per_ha),3)}</ThemedText><ThemedText style={styles.n}>{fmt(area*Number(line.rate_per_ha),3)} {line.base_unit}</ThemedText><ThemedText style={styles.n}>{validTank?fmt(fullHa*Number(line.rate_per_ha),3):"—"} {line.base_unit}</ThemedText><ThemedText style={styles.n}>{validTank?fmt(partHa*Number(line.rate_per_ha),3):"—"} {line.base_unit}</ThemedText></View>)}
   <ThemedText style={styles.note}>Full Tank Mix quantities are per full tank, not the combined quantity for all full tanks. Part Tank Mix quantities are for the remaining water volume. Confirm tank capacity and sprayer calibration before application.</ThemedText>
  </View>:null}
 </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:8,gap:6},actions:{flexDirection:"row",gap:12},button:{borderWidth:1,borderColor:jsplColors.border,paddingHorizontal:15,paddingVertical:10,borderRadius:jsplRadii.sm},print:{backgroundColor:jsplColors.primary},sheet:{backgroundColor:"#fff",borderWidth:1,borderColor:jsplColors.border,padding:8,gap:7},top:{backgroundColor:"#dce4ec",padding:8,gap:6},title:{fontSize:22,fontWeight:"700",color:jsplColors.text},meta:{flexDirection:"row",flexWrap:"wrap",gap:10},tankRow:{flexDirection:"row",alignItems:"flex-end",gap:16,flexWrap:"wrap"},label:{fontSize:12},input:{borderWidth:1,borderColor:jsplColors.border,minWidth:120,padding:8,backgroundColor:"#fff"},bold:{fontWeight:"700"},header:{flexDirection:"row",backgroundColor:"#e8ecf2",padding:5},product:{flex:2,minWidth:150},n:{flex:1,textAlign:"right",paddingHorizontal:6},line:{flexDirection:"row",padding:5},alt:{backgroundColor:"#f1f2f3"},note:{fontSize:12,color:jsplColors.textSecondary,marginTop:10},error:{color:jsplColors.danger}});
