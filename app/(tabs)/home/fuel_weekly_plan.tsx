// app/(tabs)/home/fuel_weekly_plan.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "../../../supabase";

type Field = {tracecode_id:number;tracecode_name:string;tracecode_size:number|null;fuel_budget_name:string|null};
type Programme = {description:string|null;sequence_no:number;tracecode_id:number;vehicle_job_id:number;vehicle_job_name:string;target_dap:number|null;calculated_quantity:number|null;planned_operations:number|null;total_budget_litres:number|null;budget_trip_count:number|null;class_code:string|null;fuel_plan_method:string|null;fuel_plan_unit:string|null};
type Schedule = {tracecode_id:number;planned_planting_date:string|null;actual_planting_date:string|null};
type Actual = {tracecode_id:number;vehicle_job_id:number;actual_litres:number|null;completed_operations:number|null};
type Cleared = {tracecode_id:number;vehicle_job_id:number;target_dap:number;sequence_no:number};
const clearedKey=(r:Cleared)=>`${r.tracecode_id}:${r.vehicle_job_id}:${r.target_dap}:${r.sequence_no}`;
type Row = Programme & {key:string;fieldName:string;fieldHa:number;scheduledDate:string;actualLitres:number;remainingOperations:number;overdue:boolean};
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
  const [cleared,setCleared]=useState<Cleared[]>([]);
  const [canClear,setCanClear]=useState(false);
  const [clearError,setClearError]=useState<string|null>(null);
  const [savingKey,setSavingKey]=useState<string|null>(null);
  const [confirmKey,setConfirmKey]=useState<string|null>(null);
  const [saveMessage,setSaveMessage]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [version,setVersion]=useState(0);
  const [traceFilter,setTraceFilter]=useState<number|null>(null);
  const [jobFilter,setJobFilter]=useState<number|null>(null);
  const [classFilter,setClassFilter]=useState<string>("ALL");
  const [sortBy,setSortBy]=useState<"date"|"trace"|"job"|"class">("date");
  const refresh=useCallback(()=>setVersion(x=>x+1),[]);
  useEffect(()=>{
    let active=true;
    (async()=>{
      setLoading(true);setError(null);
      const [f,p,s,a,h,m]=await Promise.all([
        supabase.from("fuel_tracecode_budget_summary_v").select("tracecode_id,tracecode_name,tracecode_size,fuel_budget_name"),
        supabase.from("fuel_budget_activity_v").select("description,sequence_no,tracecode_id,vehicle_job_id,vehicle_job_name,target_dap,calculated_quantity,planned_operations,total_budget_litres,budget_trip_count,class_code,fuel_plan_method,fuel_plan_unit").limit(10000),
        supabase.from("tracecode").select("tracecode_id,planned_planting_date,actual_planting_date").limit(10000),
        supabase.from("fuel_tracecode_activity_summary_v").select("tracecode_id,vehicle_job_id,actual_litres,completed_operations").limit(10000),
        supabase.from("fuel_historical_completion").select("tracecode_id,vehicle_job_id,target_dap,sequence_no").limit(10000),
        supabase.from("fuel_plan_admin").select("user_id").limit(1),
      ]);
      // Older Supabase deployments may not have description exposed on this view yet.
      // Retry without that optional column so weekly scheduling does not fail.
      let planResult=p;
      if(p.error && /description/i.test(p.error.message)){
        planResult=await supabase.from("fuel_budget_activity_v")
          .select("sequence_no,tracecode_id,vehicle_job_id,vehicle_job_name,target_dap,calculated_quantity,planned_operations,total_budget_litres,budget_trip_count,class_code,fuel_plan_method,fuel_plan_unit").limit(10000);
      }
      if(!active)return;
      setCanClear(!m.error && (m.data?.length??0)>0);
      setClearError(h.error?.message??m.error?.message??null);
      setCleared(h.error?[]:(h.data??[]) as Cleared[]);
      const err=f.error||planResult.error||s.error||a.error;
      if(err){setError(err.message);setFields([]);setProgrammes([]);setSchedules([]);setActuals([]);}
      else{setFields((f.data??[]) as Field[]);setProgrammes(((planResult.data??[]) as Partial<Programme>[]).map(r=>({...r,description:r.description??null})) as Programme[]);setSchedules((s.data??[]) as Schedule[]);setActuals((a.data??[]) as Actual[]);}
      setLoading(false);
    })();
    return()=>{active=false;};
  },[version]);

  const changeClear=async (r:Row, mark:boolean)=>{
    if(!canClear)return;
    const k=clearedKey({...r,target_dap:r.target_dap!});
    setSavingKey(k);
    setSaveMessage(null);
    const record={tracecode_id:r.tracecode_id,vehicle_job_id:r.vehicle_job_id,target_dap:r.target_dap!,sequence_no:r.sequence_no};
    const response=mark?await supabase.from("fuel_historical_completion").insert(record):await supabase.from("fuel_historical_completion").delete().match(record);
    setSavingKey(null);
    if(response.error){setSaveMessage("Unable to save: "+response.error.message);return;}
    setConfirmKey(null);
    setSaveMessage("Historical job marked complete.");
    refresh();
  };
  const weekEnd=shift(week,6);
  const scheduled=useMemo(()=>{
    const fieldMap=new Map(fields.map(f=>[f.tracecode_id,f]));
    const dateMap=new Map(schedules.map(d=>[d.tracecode_id,d.actual_planting_date||d.planned_planting_date]));
    const actualMap=new Map<string,number>();
    const doneMap=new Map<string,number>();
    for(const a of actuals){
      const k=`${a.tracecode_id}:${a.vehicle_job_id}`;
      actualMap.set(k,(actualMap.get(k)||0)+n(a.actual_litres));
      doneMap.set(k,(doneMap.get(k)||0)+n(a.completed_operations));
    }
    const grouped=new Map<string,{p:Programme;date:string;index:number}[]>();
    programmes.forEach((p,index)=>{
      const start=dateMap.get(p.tracecode_id);
      if(!fieldMap.has(p.tracecode_id)||!start||p.target_dap==null)return;
      const date=shift(start,p.target_dap);
      if(date>weekEnd)return;
      const k=`${p.tracecode_id}:${p.vehicle_job_id}`;
      grouped.set(k,[...(grouped.get(k)||[]),{p,date,index}]);
    });
    const rows:Row[]=[];
    for(const [k,items] of grouped){
      let done=doneMap.get(k)||0;
      items.sort((a,b)=>a.date.localeCompare(b.date)||a.index-b.index);
      for(const {p,date,index} of items){
        if(cleared.some(h=>clearedKey(h)===clearedKey({...p,target_dap:p.target_dap!})))continue;
        const field=fieldMap.get(p.tracecode_id)!;
        const count=Math.max(0,n(p.planned_operations));
        const completed=Math.min(count,done);
        done=Math.max(0,done-completed);
        const remaining=count-completed;
        if(count>0&&remaining<=0)continue;
        rows.push({...p,key:`${k}:${p.target_dap}:${index}`,
          fieldName:field.tracecode_name,fieldHa:n(field.tracecode_size),
          scheduledDate:date,actualLitres:actualMap.get(k)||0,
          remainingOperations:remaining,overdue:date<week});
      }
    }
    return rows;
  },[fields,programmes,schedules,actuals,cleared,weekEnd]);
  const jobOptions=useMemo(()=>[...new Map(programmes.map(p=>[p.vehicle_job_id,p.vehicle_job_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1])),[programmes]);
  const classOptions=useMemo(()=>[...new Set(programmes.map(p=>p.class_code||"Unassigned"))].sort(),[programmes]);
  const filtered=useMemo(()=>{
    return scheduled.filter(r=>(traceFilter==null||r.tracecode_id===traceFilter)&&(jobFilter==null||r.vehicle_job_id===jobFilter)&&(classFilter==="ALL"||(r.class_code||"Unassigned")===classFilter))
      .sort((a,b)=>{
        if(sortBy==="trace")return a.fieldName.localeCompare(b.fieldName)||a.scheduledDate.localeCompare(b.scheduledDate);
        if(sortBy==="job")return a.vehicle_job_name.localeCompare(b.vehicle_job_name)||a.scheduledDate.localeCompare(b.scheduledDate);
        if(sortBy==="class")return (a.class_code||"").localeCompare(b.class_code||"")||a.scheduledDate.localeCompare(b.scheduledDate);
        return Number(b.overdue)-Number(a.overdue)||a.scheduledDate.localeCompare(b.scheduledDate);
      });
  },[scheduled,traceFilter,jobFilter,classFilter,sortBy]);
  const litresRemaining=(r:Row)=>n(r.total_budget_litres)*(n(r.planned_operations)>0?r.remainingOperations/n(r.planned_operations):1);
  const total=filtered.reduce((sum,r)=>sum+litresRemaining(r),0);
  const overdueRows=filtered.filter(r=>r.overdue);
  const thisWeekRows=filtered.filter(r=>!r.overdue);
  const missingDates=useMemo(()=>{
    const dates=new Map(schedules.map(s=>[s.tracecode_id,s.actual_planting_date || s.planned_planting_date]));
    return fields.filter(f=>!dates.get(f.tracecode_id));
  },[fields,schedules]);
  const byClass=useMemo(()=>{
    const grouped=new Map<string,{litres:number;jobs:number}>();
    for(const r of filtered){const key=r.class_code||"Unassigned";const current=grouped.get(key)||{litres:0,jobs:0};current.litres+=litresRemaining(r);current.jobs++;grouped.set(key,current);}
    return [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  },[filtered]);
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
    <ThemedView style={s.card}>
      <ThemedText type="subtitle">Filter and sort</ThemedText>
      <ThemedText style={s.small}>TraceCode</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.nav}>
        <Choice label="All fields" selected={traceFilter===null} onPress={()=>setTraceFilter(null)}/>
        {fields.map(f=><Choice key={f.tracecode_id} label={f.tracecode_name} selected={traceFilter===f.tracecode_id} onPress={()=>setTraceFilter(f.tracecode_id)}/>)}
      </View></ScrollView>
      <ThemedText style={s.small}>Job</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.nav}>
        <Choice label="All jobs" selected={jobFilter===null} onPress={()=>setJobFilter(null)}/>
        {jobOptions.map(([id,name])=><Choice key={id} label={name} selected={jobFilter===id} onPress={()=>setJobFilter(id)}/>)}
      </View></ScrollView>
      <ThemedText style={s.small}>Tractor class</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.nav}>
        <Choice label="All classes" selected={classFilter==="ALL"} onPress={()=>setClassFilter("ALL")}/>
        {classOptions.map(name=><Choice key={name} label={name} selected={classFilter===name} onPress={()=>setClassFilter(name)}/>)}
      </View></ScrollView>
      <ThemedText style={s.small}>Sort order</ThemedText>
      <View style={[s.nav,{flexWrap:"wrap"}]}>
        {(["date","trace","job","class"] as const).map(k=><Choice key={k} label={k==="date"?"Due date":k==="trace"?"TraceCode":k==="job"?"Job":"Tractor class"} selected={sortBy===k} onPress={()=>setSortBy(k)}/>)}
      </View>
    </ThemedView>
    {loading?<ActivityIndicator/>:error?<ThemedView style={s.card}><ThemedText style={s.error}>{error}</ThemedText></ThemedView>:<>
      <ThemedView style={s.card}>
        <ThemedText type="subtitle">Weekly requirement: {fmt(total)} L</ThemedText>
        <ThemedText>{scheduled.length} scheduled activity entries across {new Set(scheduled.map(r=>r.tracecode_id)).size} fields</ThemedText>
        {byClass.map(([name,v])=><View key={name} style={s.summary}><ThemedText>{name}</ThemedText><ThemedText style={s.bold}>{fmt(v.litres)} L · {v.jobs} jobs</ThemedText></View>)}
      </ThemedView>
      {missingDates.length>0?<ThemedView style={s.card}><ThemedText style={s.error}>{missingDates.length} field(s) have neither a planned nor an actual planting date and cannot be scheduled.</ThemedText><ThemedText style={s.small}>{missingDates.map(f=>f.tracecode_name).join(", ")}</ThemedText></ThemedView>:null}
      {saveMessage?<ThemedView style={s.card}><ThemedText>{saveMessage}</ThemedText></ThemedView>:null}
      {clearError?<ThemedView style={s.card}><ThemedText style={s.error}>Historical completion unavailable: {clearError}. The database migration and admin membership must be configured.</ThemedText></ThemedView>:null}
      <ThemedView style={s.card}>
        <ThemedText type="subtitle">Overdue jobs carried forward ({overdueRows.length})</ThemedText>
        <ThemedText style={s.small}>Unfinished jobs scheduled before this week. Fuel issued does not count as completion.</ThemedText>
        {overdueRows.length===0?<ThemedText>No overdue jobs recorded.</ThemedText>:overdueRows.map(r=><JobLine key={r.key} r={r} estimate={litresRemaining(r)} admin={canClear} saving={savingKey===clearedKey({...r,target_dap:r.target_dap!})} confirming={confirmKey===clearedKey({...r,target_dap:r.target_dap!})} onComplete={()=>setConfirmKey(clearedKey({...r,target_dap:r.target_dap!}))} onCancel={()=>setConfirmKey(null)} onConfirm={()=>changeClear(r,true)} />)}
      </ThemedView>
      <ThemedView style={s.card}>
        <ThemedText type="subtitle">Jobs scheduled this week ({thisWeekRows.length})</ThemedText>
        {thisWeekRows.length===0?<ThemedText>No scheduled jobs for this week.</ThemedText>:thisWeekRows.map(r=><JobLine key={r.key} r={r} estimate={litresRemaining(r)} />)}
      </ThemedView>
      <ThemedText style={s.small}>Fuel actuals are cumulative for the job/field. Carry-forward uses recorded completed_operations (allocated to earliest passes first); manually completed or skipped jobs not captured there still need explicit status controls. Remaining litres are estimates proportional to unfinished operations.</ThemedText>
    </>}
  </ScrollView>;
}
function Choice({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){
  return <Pressable onPress={onPress} style={[s.button,selected&&s.selected]}><ThemedText style={selected?s.bold:undefined}>{label}</ThemedText></Pressable>;
}
function JobLine({r,estimate,admin=false,saving=false,confirming=false,onComplete,onCancel,onConfirm}:{r:Row;estimate:number;admin?:boolean;saving?:boolean;confirming?:boolean;onComplete?:()=>void;onCancel?:()=>void;onConfirm?:()=>void}){
  return <View style={s.job}>
    <View style={s.line}><ThemedText style={s.bold}>{r.fieldName} · {r.vehicle_job_name}</ThemedText><ThemedText>{r.scheduledDate}{r.overdue?" · Overdue":""}</ThemedText></View>
    {r.description?.trim()?<ThemedText>{r.description.trim()}</ThemedText>:null}
    <ThemedText style={s.small}>Field {fmt(r.fieldHa)} ha · DAP {r.target_dap} · {r.class_code||"Unassigned"} · {fmt(n(r.calculated_quantity))} {unit(r)}</ThemedText>
    <ThemedText>Estimated fuel remaining: <ThemedText style={s.bold}>{fmt(estimate)} L</ThemedText></ThemedText>
    <ThemedText style={s.small}>Planned operations: {fmt(n(r.planned_operations),0)} · Unfinished: {fmt(r.remainingOperations,0)} · Job/field fuel actual to date: {fmt(r.actualLitres)} L</ThemedText>
    {admin&&r.overdue&&onComplete?(confirming?<View style={s.confirm}><ThemedText style={s.bold}>Confirm historical completion for this field and job?</ThemedText><ThemedText style={s.small}>Removes this programme entry from the backlog. Fuel actuals are unchanged.</ThemedText><View style={s.nav}><Pressable disabled={saving} style={s.button} onPress={onCancel}><ThemedText>Cancel</ThemedText></Pressable><Pressable disabled={saving} style={s.button} onPress={onConfirm}><ThemedText style={s.bold}>{saving?"Saving…":"Confirm completed"}</ThemedText></Pressable></View></View>:<Pressable disabled={saving} style={s.button} onPress={onComplete}><ThemedText style={s.bold}>Mark historical job completed</ThemedText></Pressable>):null}
  </View>;
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
  confirm:{borderWidth:1,borderColor:"rgba(120,120,120,.4)",borderRadius:8,padding:10,gap:8},
  error:{color:"red"},selected:{borderWidth:2,backgroundColor:"rgba(120,120,120,.12)"},
});
