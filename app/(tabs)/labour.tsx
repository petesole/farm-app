import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import { supabase } from "@/supabase";
import { formatJsplDate, formatJsplNumber, jsplColors as C, jsplSpacing as S, jsplRadii as R } from "@/constants/jspl-design";

type Activity = { activity_id: number; activity_name: string; labour_measure: "Kgs" | "Unit"; active: boolean };
type Trace = { tracecode_id: number; tracecode_name: string; tracecode_size: number | null; crop_id: number | null };
type CostLine = { id: number; labour_date: string; tracecode_id: number | null; activity_id: number; activity_name: string; labour_measure: string; labour_qty: number; kgs: number | null; unit_cost: number; total_cost: number; cost_per_ha: number | null };

function localToday(): string {
  const d = new Date();
  return [String(d.getDate()).padStart(2,"0"),String(d.getMonth()+1).padStart(2,"0"),d.getFullYear()].join("/");
}
function isoFromDdMmYyyy(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const day = +m[1], month = +m[2], year = +m[3];
  const test = new Date(Date.UTC(year, month - 1, day));
  if (test.getUTCFullYear() !== year || test.getUTCMonth() + 1 !== month || test.getUTCDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function money(n: number): string { return "$" + formatJsplNumber(n); }

export default function LabourDashboard() {
  const [date,setDate] = useState(localToday());
  const [activityId,setActivityId] = useState("");
  const [traceId,setTraceId] = useState("");
  const [qty,setQty] = useState("");
  const [kgs,setKgs] = useState("");
  const [rate,setRate] = useState("");
  const [activitySearch,setActivitySearch] = useState("");
  const [activities,setActivities] = useState<Activity[]>([]);
  const [traces,setTraces] = useState<Trace[]>([]);
  const [lines,setLines] = useState<CostLine[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [editId,setEditId] = useState<number | null>(null);
  const selected = activities.find(a=>String(a.activity_id)===activityId);
  const total = (selected?.labour_measure === "Kgs" ? Number(kgs) : Number(qty)) * Number(rate);
  const filteredActivities = useMemo(()=>activities.filter(a => a.activity_name.toLowerCase().includes(activitySearch.toLowerCase())),[activities,activitySearch]);
  const validDate = isoFromDdMmYyyy(date);

  async function loadMasters() {
    const [a,t] = await Promise.all([
      supabase.from("labour_v2_activity").select("activity_id,activity_name,labour_measure,active").eq("active",true).order("activity_name"),
      supabase.from("tracecode").select("tracecode_id,tracecode_name,tracecode_size,crop_id").not("start_date","is",null).is("end_date",null).order("tracecode_name")
    ]);
    if (a.error) throw a.error;
    if (t.error) throw t.error;
    setActivities((a.data || []) as Activity[]);
    setTraces((t.data || []) as Trace[]);
  }
  async function loadLines(day: string) {
    const iso = isoFromDdMmYyyy(day);
    if (!iso) { setLines([]); return; }
    const {data,error:e}=await supabase.from("labour_v2_costs")
      .select("id,labour_date,tracecode_id,activity_id,activity_name,labour_measure,labour_qty,kgs,unit_cost,total_cost,cost_per_ha")
      .eq("labour_date",iso).order("id",{ascending:false}).limit(250);
    if(e) throw e;
    setLines((data || []) as CostLine[]);
  }
  useEffect(()=>{ let alive=true; (async()=>{ try { await loadMasters(); if(alive) await loadLines(date); } catch(e:any){if(alive)setError(e.message || "Unable to load labour setup");} finally {if(alive)setLoading(false);} })(); return ()=>{alive=false}; },[]);
  async function changeDate(d:string){setDate(d);if(isoFromDdMmYyyy(d)) {try{await loadLines(d);setError("");}catch(e:any){setError(e.message)}}}
  function resetEntry() { setEditId(null);setActivityId("");setTraceId("");setQty("");setKgs("");setRate("");setActivitySearch(""); }
  function editLine(line:CostLine) {
    setEditId(line.id);setActivityId(String(line.activity_id));setTraceId(line.tracecode_id == null ? "" : String(line.tracecode_id));
    setQty(String(line.labour_qty));setKgs(line.kgs == null ? "" : String(line.kgs));setRate(String(line.unit_cost));setActivitySearch("");
  }
  async function save() {
    if (!validDate) {setError("Enter date as dd/mm/yyyy (e.g. 04/11/2026).");return;}
    if (!selected) {setError("Select a labour activity.");return;}
    const q=Number(qty),k=Number(kgs),p=Number(rate);
    if ((!qty && selected.labour_measure !== "Kgs") || !Number.isFinite(q) || q<0 || (selected.labour_measure==="Unit" && q<=0)) {setError("Enter a valid Labour Qty.");return;}
    if (selected.labour_measure==="Kgs" && (!kgs || !Number.isFinite(k) || k<=0)) {setError("Enter kilograms greater than zero.");return;}
    if (!rate || !Number.isFinite(p) || p<0) {setError("Enter a valid unit cost.");return;}
    setBusy(true);setError("");
    try {
      const payload={labour_date:validDate,tracecode_id:traceId ? Number(traceId):null,activity_id:Number(activityId),labour_qty:q||0,
        kgs:selected.labour_measure==="Kgs"?k:null,unit_cost:p};
      const result=editId ? await supabase.from("labour_v2_transaction").update(payload).eq("id",editId).select("id")
         : await supabase.from("labour_v2_transaction").insert(payload).select("id");
      if(result.error)throw result.error;
      if(!result.data?.length)throw new Error("No record saved. Check your Labour permissions.");
      resetEntry();await loadLines(date);
    }catch(e:any){setError(e.message || "Unable to save labour entry");}finally{setBusy(false);}
  }
  return <ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}><View style={{flex:1}}><Text style={styles.headerTitle}>Labour</Text><Text style={styles.headerSub}>John Sole (Private) Limited · Daily Labour</Text></View><Image source={require("../../assets/images/jspl_farm_logo.png")} resizeMode="contain" style={styles.logo}/></View>
    <View style={styles.top}>
      <Text style={styles.heading}>Daily Labour Entry</Text>
      <Pressable onPress={()=>router.replace("/(tabs)/main-dashboard")} style={styles.outline}><Text style={styles.outlineText}>← Back to Dashboard</Text></Pressable>
    </View>
    {!!error && <View style={styles.error}><Text style={{color:C.danger}}>{error}</Text></View>}
    {loading ? <ActivityIndicator color={C.primary}/> : <>
      <View style={styles.panel}>
        <Text style={styles.label}>Labour Date (dd/mm/yyyy)</Text>
        <TextInput value={date} onChangeText={changeDate} placeholder="dd/mm/yyyy" style={styles.input} keyboardType="numbers-and-punctuation" />
        <Text style={styles.label}>Trace Code (leave blank for general labour)</Text>
        <View style={styles.picker}><Picker selectedValue={traceId} onValueChange={v=>setTraceId(String(v))}>
          <Picker.Item label="General / No Trace Code" value="" />
          {traces.map(t=><Picker.Item key={t.tracecode_id} value={String(t.tracecode_id)} label={t.tracecode_name + (t.crop_id == null ? " · No crop" : "")} />)}
        </Picker></View>
        <Text style={styles.label}>Find Labour Activity</Text>
        <TextInput value={activitySearch} onChangeText={setActivitySearch} placeholder="Search existing Access activities" style={styles.input}/>
        <View style={styles.picker}><Picker selectedValue={activityId} onValueChange={v=>setActivityId(String(v))}>
          <Picker.Item label="Select activity..." value="" />
          {filteredActivities.map(a=><Picker.Item key={a.activity_id} value={String(a.activity_id)} label={a.activity_name} />)}
        </Picker></View>
        <View style={styles.row}>
          <View style={styles.field}><Text style={styles.label}>Labour Qty</Text><TextInput style={styles.input} value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="0"/></View>
          {selected?.labour_measure==="Kgs" && <View style={styles.field}><Text style={styles.label}>Kilograms</Text><TextInput style={styles.input} value={kgs} onChangeText={setKgs} keyboardType="decimal-pad" placeholder="0"/></View>}
          <View style={styles.field}><Text style={styles.label}>Unit Cost ($)</Text><TextInput style={styles.input} value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="0.00"/></View>
        </View>
        <Text style={styles.total}>Calculated Cost: {money(Number.isFinite(total)?total:0)}</Text>
        <Text style={styles.helper}>{selected?.labour_measure==="Kgs" ? "Cost = kilograms × unit cost; kg/person calculated from Labour Qty." : "Cost = Labour Qty × unit cost."}</Text>
        <View style={styles.row}>
          <Pressable disabled={busy} onPress={save} style={[styles.primary,busy && {opacity:0.5}]}><Text style={styles.primaryText}>{busy?"Saving…":editId?"Update Labour Entry":"Save Labour Entry"}</Text></Pressable>
          {editId !== null && <Pressable onPress={resetEntry} style={styles.outline}><Text style={styles.outlineText}>Cancel Edit</Text></Pressable>}
        </View>
      </View>
      <View style={styles.panel}>
        <View style={styles.row}><Text style={styles.heading}>Entries for {validDate ? formatJsplDate(validDate) : "selected date"}</Text>
          <Pressable style={styles.outline} onPress={()=>loadLines(date).catch(e=>setError(e.message))}><Text style={styles.outlineText}>Refresh</Text></Pressable></View>
        {lines.length===0 ? <Text style={styles.helper}>No labour entries for this date.</Text> : lines.map(line=><View style={styles.line} key={line.id}>
          <View style={{flex:1}}><Text style={styles.lineHeading}>{line.activity_name} · {traces.find(t=>t.tracecode_id===line.tracecode_id)?.tracecode_name || "General"}</Text>
          <Text style={styles.helper}>Qty {line.labour_qty} · Kgs {line.kgs ?? "—"} · Rate {money(line.unit_cost)} · {money(line.total_cost)}{line.cost_per_ha == null ? "" : " · "+money(line.cost_per_ha)+"/ha"}</Text></View>
          <Pressable style={styles.outline} onPress={()=>editLine(line)}><Text style={styles.outlineText}>Edit</Text></Pressable>
        </View>)}
      </View>
    </>}
  </ScrollView>;
}
const styles=StyleSheet.create({
  page:{backgroundColor:C.background,padding:S.xl,flexGrow:1,gap:S.lg},
  header:{backgroundColor:C.primaryDark,borderRadius:R.lg,padding:S.lg,flexDirection:"row",alignItems:"center",gap:S.md},
  headerTitle:{fontSize:22,fontWeight:"800",color:C.surface},
  headerSub:{color:"#DCE9DC",fontSize:12,marginTop:5},
  logo:{width:66,height:66,backgroundColor:C.surface,borderRadius:R.sm},
  top:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:S.md,flexWrap:"wrap"},
  heading:{fontSize:19,fontWeight:"800",color:C.primaryDark},
  panel:{backgroundColor:C.surface,padding:S.lg,borderWidth:1,borderColor:C.border,borderRadius:R.lg,gap:S.sm},
  label:{fontSize:13,fontWeight:"700",color:C.text},
  input:{minHeight:44,borderRadius:R.sm,borderWidth:1,borderColor:C.border,paddingHorizontal:S.md,color:C.text,backgroundColor:C.surface},
  picker:{borderWidth:1,borderColor:C.border,borderRadius:R.sm,overflow:"hidden"},
  row:{flexDirection:"row",gap:S.md,flexWrap:"wrap",alignItems:"center"},
  field:{minWidth:140,flex:1,gap:5},
  total:{fontSize:18,color:C.primaryDark,fontWeight:"800",marginTop:S.sm},
  helper:{fontSize:12,color:C.textSecondary},
  primary:{padding:S.md,backgroundColor:C.primary,borderRadius:R.sm,minHeight:44,justifyContent:"center"},
  primaryText:{color:C.surface,fontWeight:"800"},
  outline:{borderWidth:1,borderColor:C.primary,borderRadius:R.sm,paddingHorizontal:S.md,paddingVertical:S.sm,minHeight:40,justifyContent:"center"},
  outlineText:{color:C.primaryDark,fontWeight:"700"},
  error:{backgroundColor:C.dangerTint,borderRadius:R.sm,padding:S.md},
  line:{flexDirection:"row",gap:S.md,alignItems:"center",paddingVertical:S.md,borderBottomWidth:1,borderColor:C.border},
  lineHeading:{fontSize:14,color:C.text,fontWeight:"700"}
});