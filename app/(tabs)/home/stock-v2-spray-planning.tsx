import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "../../../supabase";

type Trace = { tracecode_id: number; tracecode_name: string; tracecode_size: number | null; planned_planting_date?: string | null; actual_planting_date?: string | null };
type InputLine = { key: number; input: string; rate: string };
const monday = (d: Date) => { const x = new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; };
const addWeeks = (d: Date, count: number) => { const x=new Date(d); x.setDate(x.getDate()+count*7); return x; };
const weekLabel = (d: Date) => d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
const fmt = (n: number) => Number.isFinite(n)?n.toLocaleString("en-GB",{maximumFractionDigits:2}):"—";
let nextKey=1;
export default function StockV2SprayPlanningPreview() {
  const { width }=useWindowDimensions();
  const wide=width>=760;
  const [traces,setTraces]=useState<Trace[]>([]);
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
  const selected=useMemo(()=>traces.find(t=>t.tracecode_id===traceId),[traceId,traces]);
  const operationalWeek=addWeeks(monday(new Date()),operationalOffset);
  const budgetWeek=addWeeks(monday(new Date()),budgetOffset);
  useEffect(()=>{ let mounted=true; (async()=>{
    const result=await supabase.from("tracecode").select("tracecode_id,tracecode_name,tracecode_size,planned_planting_date,actual_planting_date").order("tracecode_name");
    if(!mounted)return;
    if(result.error)setError(result.error.message);
    else {const rows=(result.data??[]) as Trace[];setTraces(rows);setTraceId(rows[0]?.tracecode_id??null);}
    setLoading(false);
  })(); return()=>{mounted=false};},[]);
  useEffect(()=>{setArea(selected?.tracecode_size?.toString()??"");setBudgetOffset(0)},[traceId]);
  const addLine=(input="")=>setLines(old=>[...old,{key:nextKey++,input,rate:""}]);
  const changeLine=(key:number,field:"input"|"rate",value:string)=>setLines(old=>old.map(x=>x.key===key?{...x,[field]:value}:x));
  const totalWater=Number(area)*Number(waterRate);
  return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
    <ThemedText type="title">Stock V2 · Weekly Spray Planning</ThemedText>
    <ThemedText style={styles.warning}>Development preview only. No spray plans or stock movements are saved.</ThemedText>
    {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:<View style={styles.traces}>
      <ThemedText style={styles.heading}>Select tracecode</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{traces.map(t=><Pressable key={t.tracecode_id} onPress={()=>setTraceId(t.tracecode_id)} style={[styles.chip,traceId===t.tracecode_id&&styles.selected]}><ThemedText>{t.tracecode_name}</ThemedText></Pressable>)}</ScrollView>
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
        {lines.map(x=><View key={x.key} style={styles.line}><View style={{flex:2}}><ThemedText style={styles.label}>Input</ThemedText><TextInput style={styles.input} value={x.input} onChangeText={v=>changeLine(x.key,"input",v)}/></View><View style={{flex:1}}><ThemedText style={styles.label}>Rate/ha</ThemedText><TextInput style={styles.input} keyboardType="decimal-pad" value={x.rate} onChangeText={v=>changeLine(x.key,"rate",v)}/></View><View style={{flex:1}}><ThemedText style={styles.label}>Required</ThemedText><ThemedText>{fmt(Number(area)*Number(x.rate))}</ThemedText></View><Pressable onPress={()=>setLines(v=>v.filter(y=>y.key!==x.key))}><ThemedText style={styles.error}>Remove</ThemedText></Pressable></View>)}
        <Pressable style={styles.action} onPress={()=>addLine()}><ThemedText>+ Add input</ThemedText></Pressable>
        <ThemedText style={styles.warning}>Saving is disabled until the private Stock V2 API and verified JS/AO ownership mapping are ready.</ThemedText>
      </View>
      <View style={styles.panel}>
        <ThemedText type="subtitle">Crop budget reference</ThemedText>
        <View style={styles.weekNav}><Pressable style={styles.chip} onPress={()=>setBudgetOffset(x=>x-1)}><ThemedText>‹ Previous</ThemedText></Pressable><ThemedText>{weekLabel(budgetWeek)}</ThemedText><Pressable style={styles.chip} onPress={()=>setBudgetOffset(x=>x+1)}><ThemedText>Next ›</ThemedText></Pressable></View>
        <ThemedText style={styles.muted}>Budget weeks move independently of the operational spray week.</ThemedText>
        <View style={styles.empty}><ThemedText style={styles.heading}>Waiting for crop budget import</ThemedText><ThemedText style={styles.muted}>This panel will show DAP-based input names and rates for the selected tracecode. Select an input to copy it to the left. No budget records have been imported yet.</ThemedText></View>
      </View>
    </View>
  </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({
 root:{flex:1},page:{padding:16,gap:14,paddingBottom:50},heading:{fontWeight:"700",fontSize:16},warning:{color:"#aa7318"},muted:{opacity:0.65},error:{color:"#c0392b"},
 traces:{gap:8},chip:{borderWidth:1,borderColor:"#999",paddingHorizontal:12,paddingVertical:8,borderRadius:8,marginRight:6},selected:{backgroundColor:"rgba(44,150,90,.2)"},
 panels:{gap:14},sideBySide:{flexDirection:"row"},stacked:{flexDirection:"column"},panel:{flex:1,borderWidth:1,borderColor:"#777",borderRadius:12,padding:14,gap:9,minWidth:0},
 weekNav:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:4,flexWrap:"wrap"},label:{fontSize:12,opacity:0.75,marginBottom:3},
 input:{borderWidth:1,borderColor:"#999",borderRadius:7,padding:8,minHeight:38,color:"#222",backgroundColor:"#fff"},two:{flexDirection:"row",gap:8},half:{flex:1},
 line:{flexDirection:"row",alignItems:"center",gap:7,flexWrap:"wrap"},action:{borderWidth:1,borderColor:"#999",padding:10,alignItems:"center",borderRadius:8},
 empty:{borderWidth:1,borderStyle:"dashed",borderColor:"#aaa",padding:14,borderRadius:8,gap:8,marginTop:10}
});