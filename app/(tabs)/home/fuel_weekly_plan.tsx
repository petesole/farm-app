// app/(tabs)/home/fuel_weekly_plan.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "../../../supabase";

type Field = {tracecode_id:number;tracecode_name:string;tracecode_size:number|null;fuel_budget_name:string|null};
type Programme = {fuel_budget_activity_id:number;description:string|null;sequence_no:number;tracecode_id:number;vehicle_job_id:number;vehicle_job_name:string;target_dap:number|null;calculated_quantity:number|null;planned_operations:number|null;total_budget_litres:number|null;budget_work_litres:number|null;budget_trip_litres:number|null;trip_litres_per_trip:number|null;budget_trip_count:number|null;class_code:string|null;fuel_plan_method:string|null;fuel_plan_unit:string|null;standard_ha_per_day:number|null;effective_hectares:number|null};
type Schedule = {tracecode_id:number;crop_id:number|null;planned_planting_date:string|null;actual_planting_date:string|null};
type Crop = {crop_id:number;crop_name:string};
type Actual = {tracecode_id:number;vehicle_job_id:number;actual_litres:number|null;completed_operations:number|null};
type Cleared = {tracecode_id:number;vehicle_job_id:number;target_dap:number;sequence_no:number};
type SelectedJob = Cleared & {week_start:string};
const clearedKey=(r:Cleared)=>`${r.tracecode_id}:${r.vehicle_job_id}:${r.target_dap}:${r.sequence_no}`;
type Row = Programme & {key:string;cropId:number|null;fieldName:string;fieldHa:number;scheduledDate:string;actualLitres:number;remainingOperations:number;overdue:boolean};
const toDate = (value:string) => {const parts=value.slice(0,10).split("-").map(Number);return new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));};
const iso = (date:Date) => date.toISOString().slice(0,10);
const shift = (value:string, days:number) => {const d=toDate(value);d.setUTCDate(d.getUTCDate()+days);return iso(d);};
const monday = (value:string) => {const d=toDate(value);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return iso(d);};
const fmt=(v:number,dp=1)=>v.toLocaleString(undefined,{minimumFractionDigits:dp,maximumFractionDigits:dp});
const n=(v:number|null|undefined)=>Number(v??0);
const unit=(r:Programme)=>r.fuel_plan_method==="HA"?"ha":r.fuel_plan_unit||"units";
// Harvesting is scheduled under its own machinery filter while retaining
// the Large Tractor rates already calculated by the Supabase budget view.
const displayClass=(r:Programme)=>/^harvest/i.test(r.vehicle_job_name?.trim()||"")?"Harvester":r.class_code||"Unassigned";

export default function FuelWeeklyPlanScreen() {
  const [week,setWeek]=useState(()=>monday(iso(new Date())));
  const [fields,setFields]=useState<Field[]>([]);
  const [programmes,setProgrammes]=useState<Programme[]>([]);
  const [schedules,setSchedules]=useState<Schedule[]>([]);
  const [crops,setCrops]=useState<Crop[]>([]);
  const [actuals,setActuals]=useState<Actual[]>([]);
  const [cleared,setCleared]=useState<Cleared[]>([]);
  const [chosen,setChosen]=useState<SelectedJob[]>([]);
  const [planReady,setPlanReady]=useState(false);
  const [planMessage,setPlanMessage]=useState<string|null>(null);
  const [planSaving,setPlanSaving]=useState<string|null>(null);
  const [planView,setPlanView]=useState<"budget"|"chosen">("budget");
  const [canClear,setCanClear]=useState(false);
  const [clearError,setClearError]=useState<string|null>(null);
  const [savingKey,setSavingKey]=useState<string|null>(null);
  const [confirmKey,setConfirmKey]=useState<string|null>(null);
  const [saveMessage,setSaveMessage]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [version,setVersion]=useState(0);
  const [cropFilter,setCropFilter]=useState<number|null>(null);
  const [traceFilter,setTraceFilter]=useState<number|null>(null);
  const [jobFilter,setJobFilter]=useState<number|null>(null);
  const [classFilter,setClassFilter]=useState<string>("ALL");
  const [sortBy,setSortBy]=useState<"date"|"trace"|"job"|"class">("date");
  const refresh=useCallback(()=>setVersion(x=>x+1),[]);
  useEffect(()=>{
    let active=true;
    (async()=>{
      setLoading(true);setError(null);
      const [f,p,s,a,h,m,cr,sel,descs]=await Promise.all([
        supabase.from("fuel_tracecode_budget_summary_v").select("tracecode_id,tracecode_name,tracecode_size,fuel_budget_name"),
        supabase.from("fuel_budget_activity_v").select("fuel_budget_activity_id,sequence_no,tracecode_id,vehicle_job_id,vehicle_job_name,target_dap,calculated_quantity,planned_operations,total_budget_litres,budget_work_litres,budget_trip_litres,trip_litres_per_trip,budget_trip_count,class_code,fuel_plan_method,fuel_plan_unit,standard_ha_per_day,effective_hectares").limit(10000),
        supabase.from("tracecode").select("tracecode_id,crop_id,planned_planting_date,actual_planting_date").limit(10000),
        supabase.from("fuel_tracecode_activity_summary_v").select("tracecode_id,vehicle_job_id,actual_litres,completed_operations").limit(10000),
        supabase.from("fuel_historical_completion").select("tracecode_id,vehicle_job_id,target_dap,sequence_no").limit(10000),
        supabase.from("fuel_plan_admin").select("user_id").limit(1),
        supabase.from("crop").select("crop_id,crop_name").order("crop_name"),
        supabase.from("fuel_weekly_selected_job").select("week_start,tracecode_id,vehicle_job_id,target_dap,sequence_no").eq("week_start",week).limit(10000),
        supabase.from("fuel_budget_activity").select("fuel_budget_activity_id,description").limit(10000),
      ]);
      // Description lives on the budget activity, not the calculation view.
      // Match by unique activity ID so multiple applications remain distinct.
      const descriptions=new Map<number,string|null>((descs.data??[]).map(d=>[d.fuel_budget_activity_id,d.description]));
      const planResult=p;
      if(!active)return;
      setPlanReady(!sel.error);
      setPlanMessage(sel.error?("Weekly selection unavailable: "+sel.error.message+". Run the weekly selected jobs Supabase migration."):null);
      setChosen(sel.error?[]:(sel.data??[]) as SelectedJob[]);
      setCanClear(!m.error && (m.data?.length??0)>0);
      setClearError(h.error?.message??m.error?.message??null);
      setCleared(h.error?[]:(h.data??[]) as Cleared[]);
      const err=f.error||planResult.error||s.error||a.error||cr.error||descs.error;
      if(err){setError(err.message);setFields([]);setProgrammes([]);setSchedules([]);setActuals([]);}
      else{setFields((f.data??[]) as Field[]);setProgrammes(((planResult.data??[]) as Partial<Programme>[]).map(r=>({...r,description:descriptions.get(r.fuel_budget_activity_id!)??null})) as Programme[]);setSchedules((s.data??[]) as Schedule[]);setCrops((cr.data??[]) as Crop[]);setActuals((a.data??[]) as Actual[]);}
      setLoading(false);
    })();
    return()=>{active=false;};
  },[version,week]);

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
  const toggleChosen=async(r:Row)=>{
    if(!planReady||planSaving)return;
    const k=clearedKey({...r,target_dap:r.target_dap!});
    const existing=chosen.some(j=>clearedKey(j)===k);
    const record={week_start:week,tracecode_id:r.tracecode_id,vehicle_job_id:r.vehicle_job_id,
      target_dap:r.target_dap!,sequence_no:r.sequence_no};
    setPlanSaving(k);setPlanMessage(null);
    const result=existing
      ?await supabase.from("fuel_weekly_selected_job").delete().match(record)
      :await supabase.from("fuel_weekly_selected_job").upsert(record,{onConflict:"week_start,tracecode_id,vehicle_job_id,target_dap,sequence_no"});
    setPlanSaving(null);
    if(result.error){setPlanMessage("Unable to save weekly job: "+result.error.message);return;}
    setChosen(previous=>existing?previous.filter(j=>clearedKey(j)!==k):[...previous,record]);
  };
  const weekEnd=shift(week,6);
  const scheduled=useMemo(()=>{
    const fieldMap=new Map(fields.map(f=>[f.tracecode_id,f]));
    const dateMap=new Map(schedules.map(d=>[d.tracecode_id,d.actual_planting_date||d.planned_planting_date]));
    const cropMap=new Map(schedules.map(d=>[d.tracecode_id,d.crop_id]));
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
          cropId:cropMap.get(p.tracecode_id)??null,fieldName:field.tracecode_name,fieldHa:n(field.tracecode_size),
          scheduledDate:date,actualLitres:actualMap.get(k)||0,
          remainingOperations:remaining,overdue:date<week});
      }
    }
    return rows;
  },[fields,programmes,schedules,actuals,cleared,weekEnd]);
  // Every option list reflects the other selected dimensions.
  const matches=(r:Row,skip:"crop"|"trace"|"job"|"class"|null=null)=>
    (skip==="crop"||cropFilter===null||r.cropId===cropFilter)&&
    (skip==="trace"||traceFilter===null||r.tracecode_id===traceFilter)&&
    (skip==="job"||jobFilter===null||r.vehicle_job_id===jobFilter)&&
    (skip==="class"||classFilter==="ALL"||displayClass(r)===classFilter);
  const cropOptions=useMemo(()=>{
    const ids=new Set(scheduled.filter(r=>matches(r,"crop")).map(r=>r.cropId));
    return crops.filter(cr=>ids.has(cr.crop_id));
  },[scheduled,crops,traceFilter,jobFilter,classFilter]);
  const traceOptions=useMemo(()=>{
    const ids=new Set(scheduled.filter(r=>matches(r,"trace")).map(r=>r.tracecode_id));
    return fields.filter(f=>ids.has(f.tracecode_id)).sort((a,b)=>a.tracecode_name.localeCompare(b.tracecode_name));
  },[scheduled,fields,cropFilter,jobFilter,classFilter]);
  const jobOptions=useMemo(()=>[...new Map(scheduled.filter(r=>matches(r,"job")).map(r=>[r.vehicle_job_id,r.vehicle_job_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1])),[scheduled,cropFilter,traceFilter,classFilter]);
  const classOptions=useMemo(()=>[...new Set(scheduled.filter(r=>matches(r,"class")).map(r=>displayClass(r)))].sort(),[scheduled,cropFilter,traceFilter,jobFilter]);
  const filtered=useMemo(()=>scheduled.filter(r=>matches(r))
      .sort((a,b)=>{
        if(sortBy==="trace")return a.fieldName.localeCompare(b.fieldName)||a.scheduledDate.localeCompare(b.scheduledDate);
        if(sortBy==="job")return a.vehicle_job_name.localeCompare(b.vehicle_job_name)||a.scheduledDate.localeCompare(b.scheduledDate);
        if(sortBy==="class")return (displayClass(a)).localeCompare(displayClass(b))||a.scheduledDate.localeCompare(b.scheduledDate);
        return Number(b.overdue)-Number(a.overdue)||a.scheduledDate.localeCompare(b.scheduledDate);
      }),[scheduled,cropFilter,traceFilter,jobFilter,classFilter,sortBy]);
  const selectedKeys=new Set(chosen.map(clearedKey));
  const chosenRows=filtered.filter(r=>selectedKeys.has(clearedKey({...r,target_dap:r.target_dap!})));
  const remainingFraction=(r:Row)=>n(r.planned_operations)>0?r.remainingOperations/n(r.planned_operations):1;
  const hoursFor=(r:Row)=>{
    const ha=n(r.effective_hectares)>0?n(r.effective_hectares):r.fieldHa;
    const rate=n(r.standard_ha_per_day);
    if(rate<=0)return null;
    return ha*remainingFraction(r)/rate*12;
  };
  const hoursByClass=useMemo(()=>{
    const result=new Map<string,{jobs:number;hours:number;unknown:number;litres:number}>();
    for(const r of chosenRows){
      const k=displayClass(r),old=result.get(k)||{jobs:0,hours:0,unknown:0,litres:0};
      const hours=hoursFor(r);
      old.jobs++;old.hours+=hours??0;old.unknown+=hours==null?1:0;
      old.litres+=n(r.total_budget_litres)*remainingFraction(r);
      result.set(k,old);
    }
    return [...result.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  },[chosenRows]);
  const chosenLitres=chosenRows.reduce((sum,r)=>sum+n(r.total_budget_litres)*(n(r.planned_operations)>0?r.remainingOperations/n(r.planned_operations):1),0);
  const litresRemaining=(r:Row)=>n(r.total_budget_litres)*remainingFraction(r);
  const total=filtered.reduce((sum,r)=>sum+litresRemaining(r),0);
  const overdueRows=filtered.filter(r=>r.overdue);
  const thisWeekRows=filtered.filter(r=>!r.overdue);
  const missingDates=useMemo(()=>{
    const dates=new Map(schedules.map(s=>[s.tracecode_id,s.actual_planting_date || s.planned_planting_date]));
    return fields.filter(f=>!dates.get(f.tracecode_id));
  },[fields,schedules]);
  const byClass=useMemo(()=>{
    const grouped=new Map<string,{litres:number;jobs:number}>();
    for(const r of filtered){const key=displayClass(r);const current=grouped.get(key)||{litres:0,jobs:0};current.litres+=litresRemaining(r);current.jobs++;grouped.set(key,current);}
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
      <ThemedText style={s.small}>Budget jobs are calculated from planting dates and DAP. Select the jobs you actually intend to do this week; your choices are saved for that week without changing the budget.</ThemedText>
    </ThemedView>
    <ThemedView style={s.card}>
      <ThemedText type="subtitle">Filter and sort</ThemedText>
      <ThemedText style={s.small}>Machinery class</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.nav}>
        <Choice label="All classes" selected={classFilter==="ALL"} onPress={()=>setClassFilter("ALL")}/>
        {classOptions.map(name=><Choice key={name} label={name} selected={classFilter===name} onPress={()=>setClassFilter(name)}/>)}
      </View></ScrollView>
      <ThemedText style={s.small}>Field</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.nav}>
        <Choice label="All fields" selected={traceFilter===null} onPress={()=>setTraceFilter(null)}/>
        {traceOptions.map(f=><Choice key={f.tracecode_id} label={f.tracecode_name} selected={traceFilter===f.tracecode_id} onPress={()=>setTraceFilter(f.tracecode_id)}/>)}
      </View></ScrollView>
      <ThemedText style={s.small}>Job</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.nav}>
        <Choice label="All jobs" selected={jobFilter===null} onPress={()=>setJobFilter(null)}/>
        {jobOptions.map(([id,name])=><Choice key={id} label={name} selected={jobFilter===id} onPress={()=>setJobFilter(id)}/>)}
      </View></ScrollView>
      <ThemedText style={s.small}>Crop</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.nav}>
        <Choice label="All crops" selected={cropFilter===null} onPress={()=>setCropFilter(null)}/>
        {cropOptions.map(cr=><Choice key={cr.crop_id} label={cr.crop_name} selected={cropFilter===cr.crop_id} onPress={()=>setCropFilter(cr.crop_id)}/>)}
      </View></ScrollView>
      <Pressable style={s.button} onPress={()=>{setCropFilter(null);setTraceFilter(null);setJobFilter(null);setClassFilter("ALL");}}><ThemedText>Clear all filters</ThemedText></Pressable>
      <ThemedText style={s.small}>Sort order</ThemedText>
      <View style={[s.nav,{flexWrap:"wrap"}]}>
        {(["date","trace","job","class"] as const).map(k=><Choice key={k} label={k==="date"?"Due date":k==="trace"?"TraceCode":k==="job"?"Job":"Tractor class"} selected={sortBy===k} onPress={()=>setSortBy(k)}/>)}
      </View>
    </ThemedView>
    <ThemedView style={s.card}>
      <ThemedText type="subtitle">Actual fuel plan for this week</ThemedText>
      <ThemedText style={s.bold}>{chosen.length} jobs selected · {fmt(chosenLitres)} L shown with current filters</ThemedText>
      <View style={s.nav}>
        <Choice label="Budget jobs" selected={planView==="budget"} onPress={()=>setPlanView("budget")}/>
        <Choice label="My weekly plan" selected={planView==="chosen"} onPress={()=>setPlanView("chosen")}/>
      </View>
      <ThemedText style={s.small}>Select jobs from the budget list, including overdue jobs. Job selection does not issue fuel or mark an operation complete. Change the week to maintain a separate plan for that week.</ThemedText>
      {planMessage?<ThemedText style={s.error}>{planMessage}</ThemedText>:null}
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
      {planView==="chosen"?<>
      <ThemedView style={s.card}>
        <ThemedText type="subtitle">Weekly operations and machinery hours</ThemedText>
        <ThemedText style={s.small}>Estimated machine-hours = hectares remaining ÷ standard hectares per day × 12 hours. These are machine-hours, not elapsed clock time.</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={[s.tableRow,s.tableHeader]}>
              <ThemedText style={[s.tableCell,{width:110},s.bold]}>Field</ThemedText>
              <ThemedText style={[s.tableCell,{width:140},s.bold]}>Job</ThemedText>
              <ThemedText style={[s.tableCell,{width:95},s.bold]}>Class</ThemedText>
              <ThemedText style={[s.tableCell,{width:70},s.bold]}>Ha left</ThemedText>
              <ThemedText style={[s.tableCell,{width:85},s.bold]}>Ha/day</ThemedText>
              <ThemedText style={[s.tableCell,{width:75},s.bold]}>Hours</ThemedText>
              <ThemedText style={[s.tableCell,{width:85},s.bold]}>Fuel L</ThemedText>
            </View>
            {chosenRows.map(r=><View key={r.key} style={s.tableRow}>
              <ThemedText style={[s.tableCell,{width:110}]}>{r.fieldName}</ThemedText>
              <ThemedText style={[s.tableCell,{width:140}]}>{r.vehicle_job_name}{r.description?" · "+r.description:""}</ThemedText>
              <ThemedText style={[s.tableCell,{width:95}]}>{displayClass(r)}</ThemedText>
              <ThemedText style={[s.tableCell,{width:70}]}>{fmt((n(r.effective_hectares)>0?n(r.effective_hectares):r.fieldHa)*remainingFraction(r))}</ThemedText>
              <ThemedText style={[s.tableCell,{width:85}]}>{n(r.standard_ha_per_day)>0?fmt(n(r.standard_ha_per_day)):"—"}</ThemedText>
              <ThemedText style={[s.tableCell,{width:75}]}>{hoursFor(r)==null?"Set rate":fmt(hoursFor(r)!,1)}</ThemedText>
              <ThemedText style={[s.tableCell,{width:85}]}>{fmt(litresRemaining(r))}</ThemedText>
            </View>)}
          </View>
        </ScrollView>
        <ThemedText type="subtitle">Totals by machinery class</ThemedText>
        {hoursByClass.map(([name,v])=><View key={name} style={s.summary}><ThemedText>{name} · {v.jobs} jobs</ThemedText><ThemedText style={s.bold}>{fmt(v.hours,1)} hours{v.unknown?" + "+v.unknown+" unset":""} · {fmt(v.litres)} L</ThemedText></View>)}
      </ThemedView>
      <ThemedView style={s.card}>
        <ThemedText type="subtitle">Selected jobs for {week} ({chosenRows.length})</ThemedText>
        {chosenRows.length===0?<ThemedText>No jobs selected for this week with the current filters. Switch to Budget jobs to select them.</ThemedText>:chosenRows.map(r=><JobLine key={r.key} r={r} estimate={litresRemaining(r)} chosen selectedDisabled={!planReady||!!planSaving} onSelect={()=>toggleChosen(r)}/>)}
      </ThemedView></>:<>
      <ThemedView style={s.card}>
        <ThemedText type="subtitle">Overdue jobs carried forward ({overdueRows.length})</ThemedText>
        <ThemedText style={s.small}>Unfinished jobs scheduled before this week. Fuel issued does not count as completion.</ThemedText>
        {overdueRows.length===0?<ThemedText>No overdue jobs recorded.</ThemedText>:overdueRows.map(r=><JobLine key={r.key} r={r} estimate={litresRemaining(r)} admin={canClear} saving={savingKey===clearedKey({...r,target_dap:r.target_dap!})} confirming={confirmKey===clearedKey({...r,target_dap:r.target_dap!})} onComplete={()=>setConfirmKey(clearedKey({...r,target_dap:r.target_dap!}))} onCancel={()=>setConfirmKey(null)} onConfirm={()=>changeClear(r,true)} chosen={selectedKeys.has(clearedKey({...r,target_dap:r.target_dap!}))} selectedDisabled={!planReady||!!planSaving} onSelect={()=>toggleChosen(r)} />)}
      </ThemedView>
      <ThemedView style={s.card}>
        <ThemedText type="subtitle">Jobs scheduled this week ({thisWeekRows.length})</ThemedText>
        {thisWeekRows.length===0?<ThemedText>No scheduled jobs for this week.</ThemedText>:thisWeekRows.map(r=><JobLine key={r.key} r={r} estimate={litresRemaining(r)} chosen={selectedKeys.has(clearedKey({...r,target_dap:r.target_dap!}))} selectedDisabled={!planReady||!!planSaving} onSelect={()=>toggleChosen(r)} />)}
      </ThemedView>
      </>}
      <ThemedText style={s.small}>Fuel actuals are cumulative for the job/field. Carry-forward uses recorded completed_operations (allocated to earliest passes first); manually completed or skipped jobs not captured there still need explicit status controls. Remaining litres are estimates proportional to unfinished operations.</ThemedText>
    </>}
  </ScrollView>;
}
function Choice({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){
  return <Pressable onPress={onPress} style={[s.button,selected&&s.selected]}><ThemedText style={selected?s.bold:undefined}>{label}</ThemedText></Pressable>;
}
function JobLine({r,estimate,admin=false,saving=false,confirming=false,onComplete,onCancel,onConfirm,chosen=false,selectedDisabled=false,onSelect}:{r:Row;estimate:number;admin?:boolean;saving?:boolean;confirming?:boolean;onComplete?:()=>void;onCancel?:()=>void;onConfirm?:()=>void;chosen?:boolean;selectedDisabled?:boolean;onSelect?:()=>void}){
  return <View style={s.job}>
    <View style={s.line}><ThemedText style={s.bold}>{r.fieldName} · {r.vehicle_job_name}</ThemedText><ThemedText>{r.scheduledDate}{r.overdue?" · Overdue":""}</ThemedText></View>
    {onSelect?<Pressable disabled={selectedDisabled} style={[s.button,chosen&&s.selected]} onPress={onSelect}><ThemedText style={chosen?s.bold:undefined}>{chosen?"✓ Selected for this week — tap to remove":"＋ Add to this week's actual plan"}</ThemedText></Pressable>:null}
    {r.description?.trim()?<ThemedText>{r.description.trim()}</ThemedText>:null}
    <ThemedText style={s.small}>Field {fmt(r.fieldHa)} ha · DAP {r.target_dap} · {displayClass(r)} · {fmt(n(r.calculated_quantity))} {unit(r)}</ThemedText>
    <View style={s.fuelBreakdown}>
      <ThemedText>Fieldwork: <ThemedText style={s.bold}>{fmt(n(r.budget_work_litres)* (n(r.planned_operations)>0?r.remainingOperations/n(r.planned_operations):1))} L</ThemedText></ThemedText>
      <ThemedText>Travel fuel</ThemedText>
      <ThemedText style={s.small}>Trips: {fmt(n(r.budget_trip_count)*(n(r.planned_operations)>0?r.remainingOperations/n(r.planned_operations):1),1)} · Litres/trip: {fmt(n(r.trip_litres_per_trip),1)} L</ThemedText>
      <ThemedText>Travel total: <ThemedText style={s.bold}>{fmt(n(r.budget_trip_litres)*(n(r.planned_operations)>0?r.remainingOperations/n(r.planned_operations):1))} L</ThemedText></ThemedText>
      <ThemedText style={s.bold}>Total remaining: {fmt(estimate)} L</ThemedText>
      <ThemedText style={s.small}>Original budget: {fmt(n(r.budget_work_litres))} L work + {fmt(n(r.budget_trip_litres))} L travel = {fmt(n(r.total_budget_litres))} L · {fmt(n(r.budget_trip_count),1)} trips</ThemedText>
    </View>
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
  tableRow:{flexDirection:"row",borderBottomWidth:1,borderColor:"rgba(120,120,120,.2)",alignItems:"center"},
  tableHeader:{backgroundColor:"rgba(120,120,120,.1)"},
  tableCell:{paddingHorizontal:6,paddingVertical:9,fontSize:12},
  line:{flexDirection:"row",justifyContent:"space-between",flexWrap:"wrap",gap:10},
  fuelBreakdown:{padding:10,borderRadius:8,backgroundColor:"rgba(120,120,120,.08)",gap:4},
  confirm:{borderWidth:1,borderColor:"rgba(120,120,120,.4)",borderRadius:8,padding:10,gap:8},
  error:{color:"red"},selected:{borderWidth:2,backgroundColor:"rgba(120,120,120,.12)"},
});
