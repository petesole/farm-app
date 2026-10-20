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
  const el=document.createElement("style");el.textContent="@media print { [data-testid='application-actions'] {display:none !important;} body {background:white !important;} @page {size:A4 landscape;margin:12mm;} }";document.head.appendChild(el);return()=>{el.remove()};
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
 const print=()=>{if(!canPrint)return;if(Platform.OS==="web"&&typeof window!=="undefined")window.print()};
 const heading=useMemo(()=>first?isoWeek(first.planned_week_start):"",[first]);
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <View testID="application-actions" style={styles.actions}>
   <Pressable style={styles.button} onPress={()=>router.back()}><ThemedText>← Close</ThemedText></Pressable>
   <Pressable style={[styles.button,styles.print,!canPrint&&{opacity:.5}]} disabled={!canPrint} onPress={print}><ThemedText style={{color:"#fff",fontWeight:"700"}}>Print Application</ThemedText></Pressable>
  </View>
  {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:first?<View style={styles.sheet}>
   <View style={styles.top}>
    <ThemedText style={styles.title}>APPLICATION · Spray #{id}</ThemedText>
    <View style={styles.meta}><ThemedText>Week: {heading}</ThemedText><ThemedText>Trace Code: {first.tracecode_name}</ThemedText><ThemedText>Spray Type: {first.spray_type}</ThemedText><ThemedText>Sprayer: {first.sprayer_asset_code||"—"}</ThemedText><ThemedText>Application Ha: {fmt(area)}</ThemedText><ThemedText>Water Rate: {fmt(water,0)} L/ha</ThemedText><ThemedText>Total Water: {fmt(totalWater,0)} L</ThemedText></View>
    <View style={styles.tankRow}><View><ThemedText style={styles.label}>Tank capacity (L) — confirm before printing</ThemedText><TextInput style={styles.input} value={tankSize} onChangeText={setTankSize} keyboardType="decimal-pad"/></View><View><ThemedText style={styles.bold}>Full Tanks</ThemedText><ThemedText>{validTank?String(full):"—"} × {fmt(capacity,0)} L</ThemedText></View><View><ThemedText style={styles.bold}>Part Tank</ThemedText><ThemedText>{validTank?fmt(rest,1):"—"} L</ThemedText></View></View>
    {!validTank?<ThemedText style={styles.error}>Enter valid tank capacity and spray water rate.</ThemedText>:null}
   </View>
   <View style={styles.header}><ThemedText style={[styles.product,styles.bold]}>Input Name</ThemedText><ThemedText style={[styles.n,styles.bold]}>Rate/ha</ThemedText><ThemedText style={[styles.n,styles.bold]}>Total</ThemedText><ThemedText style={[styles.n,styles.bold]}>Full Tank Mix</ThemedText><ThemedText style={[styles.n,styles.bold]}>Part Tank Mix</ThemedText></View>
   {rows.map((line,i)=><View key={line.item_code+":"+i} style={[styles.line,i%2===1&&styles.alt]}><ThemedText style={styles.product}>{line.item_name}</ThemedText><ThemedText style={styles.n}>{fmt(Number(line.rate_per_ha),3)}</ThemedText><ThemedText style={styles.n}>{fmt(area*Number(line.rate_per_ha),3)} {line.base_unit}</ThemedText><ThemedText style={styles.n}>{validTank?fmt(fullHa*Number(line.rate_per_ha),3):"—"} {line.base_unit}</ThemedText><ThemedText style={styles.n}>{validTank?fmt(partHa*Number(line.rate_per_ha),3):"—"} {line.base_unit}</ThemedText></View>)}
   <ThemedText style={styles.note}>Full Tank Mix quantities are per full tank, not the combined quantity for all full tanks. Part Tank Mix quantities are for the remaining water volume. Confirm tank capacity and sprayer calibration before application.</ThemedText>
  </View>:null}
 </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},actions:{flexDirection:"row",gap:12},button:{borderWidth:1,borderColor:jsplColors.border,paddingHorizontal:15,paddingVertical:10,borderRadius:jsplRadii.sm},print:{backgroundColor:jsplColors.primary},sheet:{backgroundColor:"#fff",borderWidth:1,borderColor:jsplColors.border,padding:14,gap:12},top:{backgroundColor:"#dce4ec",padding:12,gap:10},title:{fontSize:22,fontWeight:"700",color:jsplColors.text},meta:{flexDirection:"row",flexWrap:"wrap",gap:18},tankRow:{flexDirection:"row",alignItems:"flex-end",gap:30,flexWrap:"wrap"},label:{fontSize:12},input:{borderWidth:1,borderColor:jsplColors.border,minWidth:120,padding:8,backgroundColor:"#fff"},bold:{fontWeight:"700"},header:{flexDirection:"row",backgroundColor:"#e8ecf2",padding:8},product:{flex:2,minWidth:150},n:{flex:1,textAlign:"right",paddingHorizontal:6},line:{flexDirection:"row",padding:9},alt:{backgroundColor:"#f1f2f3"},note:{fontSize:12,color:jsplColors.textSecondary,marginTop:10},error:{color:jsplColors.danger}});
