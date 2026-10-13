// app/(tabs)/home/fuel_weekly_plan.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "../../../supabase";

type Field = {tracecode_id:number;tracecode_name:string;tracecode_size:number|null;fuel_budget_name:string|null};
type Programme = {tracecode_id:number;vehicle_job_id:number;vehicle_job_name:string;target_dap:number|null;calculated_quantity:number|null;planned_operations:number|null;total_budget_litres:number|null;budget_trip_count:number|null;class_code:string|null;fuel_plan_method:string|null;fuel_plan_unit:string|null};
type Schedule = {tracecode_id:number;planned_planting_date:string|null;actual_planting_date:string|null};
type Actual = {tracecode_id:number;vehicle_job_id:number;actual_litres:number|null};
type Row = Programme & {key:string;fieldName:string;fieldHa:number;scheduledDate:string;actualLitres:number};
const toDate = (value:string) => {const parts=value.slice(0,10).split("-").map(Number);return new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));};
const iso = (date:Date) => date.toISOString().slice(0,10);
const shift = (value:string, days:number) => {const d=toDate(value);d.setUTCDate(d.getUTCDate()+days);return iso(d);};
const monday = (value:string) => {const d=toDate(value);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return iso(d);};
const fmt=(v:number,dp=1)=>v.toLocaleString(undefined,{minimumFractionDigits:dp,maximumFractionDigits:dp});
const n=(v:number|null|undefined)=>Number(v??0);
const unit=(r:Programme)=>r.fuel_plan_method==="HA"?"ha":r.fuel_plan_unit||"units";

export default function FuelWeeklyPlanScreen() {
  const [week,setWeek]=useState(()=>monday(iso(new Date())));
  const [fields,setFields]=useState<Field[]>([]);
  const [programmes,setProgrammes]=useState<Programme[]>([]);
  const [schedules,setSchedules]=useState<Schedule[]>([]);
  const [actuals,setActuals]=useState<Actual[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [version,setVersion]=useState(0);
  const refresh=useCallback(()=>setVersion(x=>x+1),[]);
  useEffect(()=>{
    let active=true;
    (async()=>{
      setLoading(true);setError(null);
      const [f,p,s,a]=await Promise.all([
        supabase.from("fuel_tracecode_budget_summary_v").select("tracecode_id,tracecode_name,tracecode_size,fuel_budget_name"),
        supabase.from("fuel_budget_activity_v").select("tracecode_id,vehicle_job_id,vehicle_job_name,target_dap,calculated_quantity,planned_operations,total_budget_litres,budget_trip_count,class_code,fuel_plan_method,fuel_plan_unit").limit(10000),
        supabase.from("tracecode").select("tracecode_id,planned_planting_date,actual_planting_date").limit(10000),
        supabase.from("fuel_tracecode_activity_summary_v").select("tracecode_id,vehicle_job_id,actual_litres").limit(10000),
      ]);
      if(!active)return;
      const err=f.error||p.error||s.error||a.error;
      if(err){setError(err.message);setFields([]);setProgrammes([]);setSchedules([]);setActuals([]);}
      else{setFields((f.data??[]) as Field[]);setProgrammes((p.data??[]) as Programme[]);setSchedules((s.data??[]) as Schedule[]);setActuals((a.data??[]) as Actual[]);}
      setLoading(false);
    })();
    return()=>{active=false;};
  },[version]);

  const weekEnd=shift(week,6);
  const scheduled=useMemo(()=>{
    const fieldMap=new Map(fields.map(f=>[f.tracecode_id,f]));
    const dateMap=new Map(schedules.map(s=>[s.tracecode_id,s.actual_planting_date || s.planned_planting_date]));
    const actualMap=new Map<string,number>();
    for(const a of actuals){const key=`${a.tracecode_id}:${a.vehicle_job_id}`;actualMap.set(key,(actualMap.get(key)||0)+n(a.actual_litres));}
    const rows:Row[]=[];
    programmes.forEach((p,i)=>{
      const field=fieldMap.get(p.tracecode_id), start=dateMap.get(p.tracecode_id);
      if(!field||!start||p.target_dap==null)return;
      const date=shift(start,p.target_dap);
      if(date<week||date>weekEnd)return;
      const key=`${p.tracecode_id}:${p.vehicle_job_id}`;
      rows.push({...p,key:`${key}:${p.target_dap}:${i}`,fieldName:field.tracecode_name,fieldHa:n(field.tracecode_size),scheduledDate:date,actualLitres:actualMap.get(key)||0});
    });
    return rows.sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate)||a.fieldName.localeCompare(b.fieldName));
  },[fields,programmes,schedules,actuals,week,weekEnd]);
  const total=scheduled.reduce((sum,r)=>sum+n(r.total_budget_litres),0);
  const missingDates=useMemo(()=>{
    const dates=new Map(schedules.map(s=>[s.tracecode_id,s.actual_planting_date || s.planned_planting_date]));
    return fields.filter(f=>!dates.get(f.tracecode_id));
  },[fields,schedules]);
  const byClass=useMemo(()=>{
    const grouped=new Map<string,{litres:number;jobs:number}>();
    for(const r of scheduled){const key=r.class_code||"Unassigned";const current=grouped.get(key)||{litres:0,jobs:0};current.litres+=n(r.total_budget_litres);current.jobs++;grouped.set(key,current);}
    return [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  },[scheduled]);
  return <ScrollView contentContainerStyle={s.page}>
    <View style={s.header}>
      <ThemedText type="title">Weekly Fuel Planning</ThemedText>
      <Pressable style={s.button} onPress={refresh}><ThemedText>Refresh</ThemedText></Pressable>
    </View>
    <ThemedView style={s.card}>
      <ThemedText type="subtitle">Planning week</ThemedText>
      <View style={s.nav}>
        <Pressable style={s.button} onPress={()=>setWeek(v=>shift(v,-7))}><ThemedText>← Previous</ThemedText></Pressable>
        <View style={s.dates}><ThemedText style={s.bold}>{week} to {weekEnd}</ThemedText><Pressable onPress={()=>setWeek(monday(iso(new Date())))}><ThemedText style={s.small}>Current week</ThemedText></Pressable></View>
        <Pressable style={s.button} onPress={()=>setWeek(v=>shift(v,7))}><ThemedText>Next →</ThemedText></Pressable>
      </View>
      <ThemedText style={s.small}>Read-only draft plan: actual planting date takes priority when recorded; otherwise planned planting date drives DAP scheduling. Changing either date recalculates the plan on refresh.</ThemedText>
    </ThemedView>
    {loading?<ActivityIndicator/>:error?<ThemedView style={s.card}><ThemedText style={s.error}>{error}</ThemedText></ThemedView>:<>
      <ThemedView style={s.card}>
        <ThemedText type="subtitle">Weekly requirement: {fmt(total)} L</ThemedText>
        <ThemedText>{scheduled.length} scheduled activity entries across {new Set(scheduled.map(r=>r.tracecode_id)).size} fields</ThemedText>
        {byClass.map(([name,v])=><View key={name} style={s.summary}><ThemedText>{name}</ThemedText><ThemedText style={s.bold}>{fmt(v.litres)} L · {v.jobs} jobs</ThemedText></View>)}
      </ThemedView>
      {missingDates.length>0?<ThemedView style={s.card}><ThemedText style={s.error}>{missingDates.length} field(s) have neither a planned nor an actual planting date and cannot be scheduled.</ThemedText><ThemedText style={s.small}>{missingDates.map(f=>f.tracecode_name).join(", ")}</ThemedText></ThemedView>:null}
      <ThemedView style={s.card}>
        <ThemedText type="subtitle">Jobs scheduled this week</ThemedText>
        {scheduled.length===0?<ThemedText>No jobs scheduled for this week from the available planting dates and DAP values.</ThemedText>:scheduled.map(r=><View key={r.key} style={s.job}>
          <View style={s.line}><ThemedText style={s.bold}>{r.fieldName} · {r.vehicle_job_name}</ThemedText><ThemedText>{r.scheduledDate}</ThemedText></View>
          <ThemedText style={s.small}>Field {fmt(r.fieldHa)} ha · DAP {r.target_dap} · {r.class_code||"Class unassigned"} · {fmt(n(r.calculated_quantity))} {unit(r)}</ThemedText>
          <View style={s.line}><ThemedText>Estimated incl. budgeted travel: <ThemedText style={s.bold}>{fmt(n(r.total_budget_litres))} L</ThemedText></ThemedText></View>
          <ThemedText style={s.small}>Job / field actual to date: {fmt(r.actualLitres)} L · {fmt(n(r.budget_trip_count),0)} budget trips</ThemedText>
        </View>)}
      </ThemedView>
      <ThemedText style={s.small}>Actual fuel above is the job/field total to date, not fuel issued specifically for this week. Issuing against a plan and completion tracking will be connected separately; no fuel is issued by this screen.</ThemedText>
    </>}
  </ScrollView>;
}
const s=StyleSheet.create({
  page:{padding:18,paddingBottom:40,gap:12},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"},
  card:{borderWidth:1,borderColor:"rgba(120,120,120,.35)",borderRadius:12,padding:14,gap:10},
  button:{borderWidth:1,borderRadius:9,paddingHorizontal:12,paddingVertical:8},
  nav:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"},
  dates:{alignItems:"center",gap:4},bold:{fontWeight:"700"},small:{fontSize:12,opacity:.72},
  summary:{flexDirection:"row",justifyContent:"space-between",borderTopWidth:1,borderColor:"rgba(120,120,120,.2)",paddingTop:8},
  job:{borderTopWidth:1,borderColor:"rgba(120,120,120,.25)",paddingTop:12,gap:5},
  line:{flexDirection:"row",justifyContent:"space-between",flexWrap:"wrap",gap:10},
  error:{color:"red"},
});
