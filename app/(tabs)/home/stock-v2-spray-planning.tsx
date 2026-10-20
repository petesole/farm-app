import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { JsplSearchCombo } from "@/components/jspl/JsplSearchCombo";
import { jsplColors, jsplRadii, jsplSizes, jsplSpacing, jsplType } from "@/constants/jspl-design";
import { supabase } from "../../../supabase";

type Trace = { tracecode_id: number; tracecode_name: string; tracecode_size: number | null; crop_id: number | null; end_date: string | null; planned_planting_date?: string | null; actual_planting_date?: string | null };
type Crop = { crop_id: number; crop_name: string; active: boolean | null };
type CatalogInput = { input_id: number; inputs_name: string };
type InputLine = { key: number; input: string; rate: string };
// Demo-only values from the user's Access example. Not fetched from Supabase.
const exampleBudget = [
  { category: "Seed Dressing", input: "Noble", rate: 0.12, unit: "L/ha" },
  { category: "Seed Dressing", input: "SEED POWER", rate: 0.12, unit: "L/ha" },
  { category: "Herbicide", input: "AMM SUL", rate: 6, unit: "L/ha" },
  { category: "Herbicide", input: "GLYPHOSATE", rate: 5, unit: "L/ha" },
  { category: "Nematicide", input: "Carbosulfan", rate: 6, unit: "L/ha" },
  { category: "Insecticide", input: "Lambda", rate: 0.2, unit: "L/ha" },
  { category: "Water Conditioner", input: "Hybrid Aqua Care SE", rate: 0.36, unit: "L/ha" },
  { category: "Nutrition", input: "Compound D 14:28:14", rate: 300, unit: "kg/ha" },
];
const monday = (d: Date) => { const x = new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; };
const addWeeks = (d: Date, count: number) => { const x=new Date(d); x.setDate(x.getDate()+count*7); return x; };
const weekLabel = (d: Date) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
const fmt = (n: number) => Number.isFinite(n)?n.toLocaleString("en-GB",{maximumFractionDigits:2}):"—";
let nextKey=1;
export default function StockV2SprayPlanningPreview() {
  const { width, height }=useWindowDimensions();
  const wide=width>=760;
  const watermarkSize=Math.min(650,Math.max(240,width-jsplSpacing.xl*2),Math.max(240,height-jsplSpacing.xl*2));
  const [traces,setTraces]=useState<Trace[]>([]);
  const [crops,setCrops]=useState<Crop[]>([]);
  const [cropId,setCropId]=useState<number|null>(null);
  const [catalog,setCatalog]=useState<CatalogInput[]>([]);
  const [openLine,setOpenLine]=useState<number|null>(null);
  const [traceId,setTraceId]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [operationalOffset,setOperationalOffset]=useState(0);
  const [budgetOffset,setBudgetOffset]=useState(0);
  const [area,setArea]=useState("");
  const [sprayer,setSprayer]=useState("");
  const [waterRate,setWaterRate]=useState("");
  const [sprayType,setSprayType]=useState("Boom");
  const [part,setPart]=useState("");
  const [jobCode,setJobCode]=useState("");
  const [lines,setLines]=useState<InputLine[]>([]);
  const visibleTraces=useMemo(()=>traces.filter(t=>{
    const notEnded=!t.end_date || t.end_date.slice(0,10)>=new Date().toISOString().slice(0,10);
    return notEnded && crops.some(c=>c.crop_id===t.crop_id && c.active!==false) && (cropId===null || t.crop_id===cropId);
  }),[traces,crops,cropId]);
  const visibleCrops=useMemo(()=>crops.filter(c=>c.active!==false && traces.some(t=>t.crop_id===c.crop_id && (!t.end_date || t.end_date.slice(0,10)>=new Date().toISOString().slice(0,10)))),[crops,traces]);
  const selected=useMemo(()=>visibleTraces.find(t=>t.tracecode_id===traceId),[traceId,visibleTraces]);
  useEffect(()=>{if(!visibleTraces.some(t=>t.tracecode_id===traceId))setTraceId(visibleTraces[0]?.tracecode_id??null)},[visibleTraces,traceId]);
  const operationalWeek=addWeeks(monday(new Date()),operationalOffset);
  const budgetWeek=addWeeks(monday(new Date()),budgetOffset);
  useEffect(()=>{ let mounted=true; (async()=>{
    const [traceResult,cropResult,inputResult]=await Promise.all([
      supabase.from("tracecode").select("tracecode_id,tracecode_name,tracecode_size,crop_id,end_date,planned_planting_date,actual_planting_date").order("tracecode_name"),
      supabase.from("crop").select("crop_id,crop_name,active").order("crop_name"),
      supabase.from("inputs").select("input_id,inputs_name").order("inputs_name").range(0,999)
    ]);
    if(!mounted)return;
    const failures=[traceResult.error,cropResult.error,inputResult.error].filter(Boolean);
    if(failures.length)setError(failures.map(e=>e?.message).join("; "));
    else {
      setTraces((traceResult.data??[]) as Trace[]);
      setCrops((cropResult.data??[]) as Crop[]);
      setCatalog((inputResult.data??[]) as CatalogInput[]);
    }
    setLoading(false);
  })();return()=>{mounted=false};},[]);
  useEffect(()=>{setArea(selected?.tracecode_size?.toString()??"");setBudgetOffset(0);setLines([])},[traceId]);
  const addLine=(input="")=>setLines(old=>[...old,{key:nextKey++,input,rate:""}]);
  const copyBudgetInput=(input:string,rate:number)=>setLines(old=>{
    const existing=old.find(x=>x.input===input);
    if(existing)return old; // avoid accidental duplicates on repeated taps
    return [...old,{key:nextKey++,input,rate:String(rate)}];
  });
  const matches=(search:string)=>catalog.filter(p=>p.inputs_name.toLowerCase().includes(search.trim().toLowerCase())).slice(0,30);
  const changeLine=(key:number,field:"input"|"rate",value:string)=>setLines(old=>old.map(x=>x.key===key?{...x,[field]:value}:x));
  const totalWater=Number(area)*Number(waterRate);
  return <ThemedView style={styles.root}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.watermarkLayer}>
      <Image source={require("../../../assets/images/jspl_farm_watermark.png")} resizeMode="contain" style={[styles.watermark,{width:watermarkSize,height:watermarkSize}]}/>
    </View>
    <ScrollView style={styles.foreground} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      <View style={styles.headerText}>
        <ThemedText style={styles.brand}>JOHN SOLE (PVT) LTD</ThemedText>
        <ThemedText type="title" style={styles.title}>Stock V2 · Weekly Spray Planning</ThemedText>
      </View>
      <Image source={require("../../../assets/images/jspl_farm_logo.png")} accessibilityLabel="John Sole (Pvt) Ltd" resizeMode="contain" style={styles.logo}/>
    </View>
    <ThemedText style={styles.warning}>Development preview only. No spray plans or stock movements are saved.</ThemedText>
    {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:<View style={styles.traces}>
      <JsplSearchCombo label="Filter by crop" selector="crop"
        options={visibleCrops.map(c=>({id:c.crop_id,label:c.crop_name,active:true}))}
        value={cropId} onChange={value=>setCropId(typeof value==="number"?value:null)}
        placeholder="All active crops — type to search"/>
      <JsplSearchCombo label={`Active tracecodes (${visibleTraces.length})`} selector="trace"
        options={visibleTraces.map(t=>({id:t.tracecode_id,label:t.tracecode_name,active:true}))}
        value={traceId} onChange={value=>setTraceId(typeof value==="number"?value:null)}
        placeholder="Type the beginning of a trace code"/>
      {visibleTraces.length===0?<ThemedText style={styles.muted}>No active tracecodes for this crop.</ThemedText>:null}
    </View>}
    <View style={[styles.panels,wide?styles.sideBySide:styles.stacked]}>
      <View style={styles.panel}>
        <ThemedText type="subtitle">Weekly spray input</ThemedText>
        <View style={styles.weekNav}><Pressable onPress={()=>setOperationalOffset(0)} style={styles.chip}><ThemedText>This week</ThemedText></Pressable><Pressable onPress={()=>setOperationalOffset(1)} style={styles.chip}><ThemedText>Next week</ThemedText></Pressable></View>
        <ThemedText style={styles.muted}>Spray week begins {weekLabel(operationalWeek)}</ThemedText>
        <ThemedText style={styles.label}>Spray type</ThemedText><TextInput style={styles.input} value={sprayType} onChangeText={setSprayType}/>
        <ThemedText style={styles.label}>Sprayer / equipment code</ThemedText><TextInput style={styles.input} value={sprayer} onChangeText={setSprayer} placeholder="Select sprayer later"/>
        <View style={styles.two}><View style={styles.half}><ThemedText style={styles.label}>Area (ha)</ThemedText><TextInput style={styles.input} keyboardType="decimal-pad" value={area} onChangeText={setArea}/></View><View style={styles.half}><ThemedText style={styles.label}>Water rate (L/ha)</ThemedText><TextInput style={styles.input} keyboardType="decimal-pad" value={waterRate} onChangeText={setWaterRate} placeholder="Editable"/></View></View>
        <ThemedText style={styles.muted}>Water required: {fmt(totalWater)} L</ThemedText>
        <View style={styles.two}><View style={styles.half}><ThemedText style={styles.label}>Part of field</ThemedText><TextInput style={styles.input} value={part} onChangeText={setPart}/></View><View style={styles.half}><ThemedText style={styles.label}>Job code</ThemedText><TextInput style={styles.input} value={jobCode} onChangeText={setJobCode}/></View></View>
        <ThemedText style={styles.heading}>Inputs & rates</ThemedText>
        {lines.map(x=><View key={x.key} style={styles.line}><View style={{flex:2}}><ThemedText style={styles.label}>Input</ThemedText><TextInput style={styles.input} value={x.input} onFocus={()=>setOpenLine(x.key)} onChangeText={v=>{changeLine(x.key,"input",v);setOpenLine(x.key)}} placeholder="Type product name or letters" autoCorrect={false}/>
          {openLine===x.key?<View style={styles.suggestions}><ThemedText style={styles.label}>Matching inputs ({matches(x.input).length}{catalog.length>=1000?"+":""})</ThemedText>
            <ScrollView nestedScrollEnabled style={{maxHeight:190}} keyboardShouldPersistTaps="always">
              {matches(x.input).map(p=><Pressable key={p.input_id} style={styles.suggestion} onPress={()=>{changeLine(x.key,"input",p.inputs_name);setOpenLine(null)}}><ThemedText>{p.inputs_name}</ThemedText></Pressable>)}
              {matches(x.input).length===0?<ThemedText style={styles.muted}>No matching input in the current master.</ThemedText>:null}
            </ScrollView>
            <Pressable onPress={()=>setOpenLine(null)} style={styles.chip}><ThemedText>Close list</ThemedText></Pressable>
          </View>:null}</View><View style={{flex:1}}><ThemedText style={styles.label}>Rate/ha</ThemedText><TextInput style={styles.input} keyboardType="decimal-pad" value={x.rate} onChangeText={v=>changeLine(x.key,"rate",v)}/></View><View style={{flex:1}}><ThemedText style={styles.label}>Required</ThemedText><ThemedText>{fmt(Number(area)*Number(x.rate))}</ThemedText></View><Pressable onPress={()=>setLines(v=>v.filter(y=>y.key!==x.key))}><ThemedText style={styles.error}>Remove</ThemedText></Pressable></View>)}
        <Pressable style={styles.action} onPress={()=>addLine()}><ThemedText>+ Add input</ThemedText></Pressable>
        <ThemedText style={styles.warning}>Saving is disabled until the private Stock V2 API and verified JS/AO ownership mapping are ready.</ThemedText>
      </View>
      <View style={styles.panel}>
        <ThemedText type="subtitle">Crop budget reference</ThemedText>
        <View style={styles.weekNav}><Pressable style={styles.chip} onPress={()=>setBudgetOffset(x=>x-1)}><ThemedText>‹ Previous</ThemedText></Pressable><ThemedText>{weekLabel(budgetWeek)}</ThemedText><Pressable style={styles.chip} onPress={()=>setBudgetOffset(x=>x+1)}><ThemedText>Next ›</ThemedText></Pressable></View>
        <ThemedText style={styles.muted}>Budget weeks move independently of the operational spray week.</ThemedText>
        <View style={styles.empty}>
          <ThemedText style={styles.heading}>Sample crop budget (demonstration only)</ThemedText>
          <ThemedText style={styles.warning}>Illustrative Access inputs, NOT the selected tracecode&apos;s actual budget. No budget data has been imported or linked yet.</ThemedText>
          {budgetOffset===0 ? exampleBudget.map((row,i)=><Pressable
            key={i} style={styles.budgetRow} onPress={()=>copyBudgetInput(row.input,row.rate)}>
            <View style={{flex:2}}><ThemedText style={styles.label}>{row.category}</ThemedText><ThemedText>{row.input}</ThemedText></View>
            <ThemedText style={{flex:1}}>{row.rate} {row.unit}</ThemedText>
            <ThemedText style={styles.copy}>+ Copy</ThemedText>
          </Pressable>) : <ThemedText style={styles.muted}>No demonstration inputs for this budget week. Import is pending.</ThemedText>}
          <ThemedText style={styles.muted}>Tap an input to copy its name and rate into the spray job. You can edit the copied rate before saving is enabled.</ThemedText>
        </View>
      </View>
    </View>
  </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({
 watermarkLayer:{...StyleSheet.absoluteFillObject,zIndex:0,alignItems:"center",justifyContent:"center"},watermark:{opacity:0.08},foreground:{flex:1,zIndex:1,backgroundColor:"transparent"},logo:{width:80,height:80,flexShrink:0},headerText:{flex:1,minWidth:0,gap:jsplSpacing.sm},
 root:{flex:1,backgroundColor:jsplColors.background},header:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:jsplSpacing.md},brand:{fontSize:jsplType.caption,fontWeight:"700",color:jsplColors.primary,letterSpacing:1},title:{color:jsplColors.primaryDark},page:{padding:jsplSpacing.lg,gap:jsplSpacing.lg,paddingBottom:50},heading:{fontWeight:"700",fontSize:16},warning:{color:jsplColors.warning},muted:{opacity:0.65},error:{color:jsplColors.danger},
 traces:{gap:8},chip:{borderWidth:1,borderColor:jsplColors.border,paddingHorizontal:12,paddingVertical:8,borderRadius:8,marginRight:6},selected:{backgroundColor:jsplColors.successTint,borderColor:jsplColors.primary},
 panels:{gap:14},sideBySide:{flexDirection:"row"},stacked:{flexDirection:"column"},panel:{flex:1,borderWidth:1,borderColor:jsplColors.border,backgroundColor:"rgba(255,255,255,0.65)",borderRadius:jsplRadii.lg,padding:jsplSpacing.lg,gap:9,minWidth:0},
 weekNav:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:4,flexWrap:"wrap"},label:{fontSize:12,opacity:0.75,marginBottom:3},
 input:{borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.sm,padding:jsplSpacing.sm,minHeight:jsplSizes.inputHeight,color:jsplColors.text,backgroundColor:jsplColors.surface},two:{flexDirection:"row",gap:8},half:{flex:1},
 line:{flexDirection:"row",alignItems:"center",gap:7,flexWrap:"wrap"},action:{borderWidth:1,borderColor:jsplColors.border,padding:10,alignItems:"center",borderRadius:8},
 empty:{borderWidth:1,borderStyle:"dashed",borderColor:jsplColors.border,padding:14,borderRadius:8,gap:8,marginTop:10},budgetRow:{paddingVertical:9,borderBottomWidth:1,borderColor:jsplColors.border,flexDirection:"row",gap:8,alignItems:"center"},copy:{fontWeight:"700",color:jsplColors.primary},suggestions:{borderWidth:1,borderColor:jsplColors.border,borderRadius:7,padding:6,backgroundColor:"#fff"},suggestion:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:jsplColors.border}
});
