import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { Picker } from "@react-native-picker/picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "../../../supabase";

type Budget={fuel_budget_id:number;fuel_budget_name:string;crop_id:number|null;active:boolean;notes:string|null};
type Crop={crop_id:number;crop_name:string;active:boolean};
type Job={vehicle_job_id:number;vehicle_job_name:string};
type Tractor={tractor_class_id:number;class_name:string;class_code:string};
type Activity={
 fuel_budget_activity_id:number;fuel_budget_id:number;vehicle_job_id:number;tractor_class_id:number|null;
 target_dap:number|null;sequence_no:number|null;planned_operations:number|null;include_trip_fuel:boolean;
 notes:string|null;description:string|null;budget_qty:number|null;load_capacity_tonnes:number|null;
 input_tonnes_per_ha:number|null;hectares_per_trip:number|null;people_per_ha:number|null;
 people_per_load:number|null;area_fraction:number|null;
};
const numericFields=["target_dap","planned_operations","budget_qty","load_capacity_tonnes","input_tonnes_per_ha","hectares_per_trip","people_per_ha","people_per_load","area_fraction"] as const;
const labels:Record<string,string>={target_dap:"DAP",planned_operations:"Operations / passes",budget_qty:"Budget quantity",load_capacity_tonnes:"Load capacity (t)",input_tonnes_per_ha:"Inputs (t/ha)",hectares_per_trip:"Hectares per trip",people_per_ha:"People per ha",people_per_load:"People per load",area_fraction:"Area fraction"};

export default function FuelBudgetManage(){
 const [budgets,setBudgets]=useState<Budget[]>([]);
 const [crops,setCrops]=useState<Crop[]>([]);
 const [jobs,setJobs]=useState<Job[]>([]);
 const [tractors,setTractors]=useState<Tractor[]>([]);
 const [selected,setSelected]=useState<number|null>(null);
 const [rows,setRows]=useState<Activity[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 const [name,setName]=useState("");
 const [notes,setNotes]=useState("");
 const [cropId,setCropId]=useState<number|null>(null);
 const [active,setActive]=useState(false);
 const [copyName,setCopyName]=useState("");
 const [copySource,setCopySource]=useState<Budget|null>(null);
 const [jobSort,setJobSort]=useState<"job"|"dap"|"class">("job");
 const [jobDescending,setJobDescending]=useState(false);
 const [jobFilter,setJobFilter]=useState<number|null>(null);
 const [dapFilter,setDapFilter]=useState<number|null>(null);
 const [classFilter,setClassFilter]=useState<number|null>(null);
 const [creating,setCreating]=useState(false);
 const [editing,setEditing]=useState<number|null>(null);
 const [removingId,setRemovingId]=useState<number|null>(null);
 const [draft,setDraft]=useState<Partial<Activity>>({});
 const [newJob,setNewJob]=useState<number|null>(null);
 const [newClass,setNewClass]=useState<number|null>(null);
 const [filterCrop,setFilterCrop]=useState<number|null>(null);

 const reload=useCallback(async()=>{
  setLoading(true);setError(null);
  const [b,c,j,t]=await Promise.all([
   supabase.from("fuel_budget").select("fuel_budget_id,fuel_budget_name,crop_id,active,notes").order("fuel_budget_name"),
   supabase.from("crop").select("crop_id,crop_name,active").order("crop_name"),
   supabase.from("vehicle_job").select("vehicle_job_id,vehicle_job_name").order("vehicle_job_name"),
   supabase.from("tractor_class").select("tractor_class_id,class_name,class_code").order("class_name")
  ]);
  if(b.error||c.error||j.error||t.error){setError(b.error?.message||c.error?.message||j.error?.message||t.error?.message||"Unable to load");}
  else{setBudgets(b.data as Budget[]);setCrops(c.data as Crop[]);setJobs(j.data as Job[]);setTractors(t.data as Tractor[]);}
  setLoading(false);
 },[]);
 useEffect(()=>{reload();},[reload]);
 const selectedBudget=budgets.find(b=>b.fuel_budget_id===selected);
 const loadDetail=useCallback(async(id:number)=>{
  setLoading(true);setError(null);setMessage(null);setEditing(null);
  const result=await supabase.from("fuel_budget_activity").select("*").eq("fuel_budget_id",id).order("sequence_no").order("target_dap");
  if(result.error)setError(result.error.message);
  else setRows((result.data||[]) as Activity[]);
  setLoading(false);
 },[]);
 const choose=(b:Budget)=>{
  setSelected(b.fuel_budget_id);setName(b.fuel_budget_name);setNotes(b.notes||"");setCropId(b.crop_id);setActive(b.active);
  loadDetail(b.fuel_budget_id);
 };
 const onSaveHeader=async()=>{
  if(selected==null||!name.trim()){setError("Budget name is required.");return;}
  setBusy(true);setError(null);
  const r=await supabase.from("fuel_budget").update({fuel_budget_name:name.trim(),crop_id:cropId,active,notes:notes.trim()||null}).eq("fuel_budget_id",selected);
  setBusy(false);
  if(r.error)setError(r.error.message);else{setMessage("Budget details saved.");reload();}
 };
 const copy=async()=>{
  if(!copySource||!copyName.trim()||busy)return;
  setBusy(true);setError(null);setMessage(null);
  const r=await supabase.rpc("copy_fuel_budget",{p_source_id:copySource.fuel_budget_id,p_new_name:copyName.trim()});
  if(r.error){setBusy(false);setError(r.error.message);return;}
  const id=Number(r.data);
  // The copy RPC creates the new budget inactive, without altering the source.
  const check=await supabase.from("fuel_budget").select("fuel_budget_id,active").eq("fuel_budget_id",id).single();
  if(check.error||check.data?.active!==false){
   setBusy(false);setError(check.error?.message??"Could not verify that the copied budget is inactive.");return;
  }
  setCopySource(null);setCopyName("");setBusy(false);
  await reload();
  setMessage("Budget and all jobs copied. The new budget is inactive.");
 };
 const startCreate=()=>{
  setSelected(null);setCreating(true);setName("");setNotes("");setCropId(filterCrop);setActive(false);
  setError(null);setMessage(null);setEditing(null);setRows([]);
 };
 const createBudget=async()=>{
  if(!name.trim()){setError("Enter a budget name.");return;}
  if(cropId==null){setError("Select a crop for the budget.");return;}
  setBusy(true);setError(null);setMessage(null);
  const result=await supabase.from("fuel_budget")
   .insert({fuel_budget_name:name.trim(),crop_id:cropId,active,notes:notes.trim()||null})
   .select("fuel_budget_id,fuel_budget_name,crop_id,active,notes").single();
  setBusy(false);
  if(result.error){setError(result.error.message);return;}
  setCreating(false);
  await reload();
  choose(result.data as Budget);
  setMessage("Fuel budget created. Add jobs below to build the programme.");
 };
 const startEdit=(a:Activity)=>{setEditing(a.fuel_budget_activity_id);setDraft({...a});setError(null);};
 const updateField=(k:string,v:any)=>setDraft(d=>({...d,[k]:v}));
 const saveJob=async()=>{
  if(editing==null||!draft.vehicle_job_id)return;
  const payload:any={};
  for(const key of numericFields){
   const val=(draft as any)[key];
   payload[key]=val===null||val===undefined||String(val).trim()===""?null:Number(val);
   if(payload[key]!=null&&!Number.isFinite(payload[key])){setError("Invalid number: "+labels[key]);return;}
  }
  Object.assign(payload,{vehicle_job_id:draft.vehicle_job_id,tractor_class_id:draft.tractor_class_id??null,include_trip_fuel:!!draft.include_trip_fuel,description:draft.description?.trim()||null,notes:draft.notes?.trim()||null});
  setBusy(true);setError(null);
  const result=await supabase.from("fuel_budget_activity").update(payload).eq("fuel_budget_activity_id",editing);
  setBusy(false);
  if(result.error)setError(result.error.message);else{setEditing(null);setMessage("Budget job saved.");if(selected)loadDetail(selected);}
 };
 const removeJob=async(a:Activity)=>{
  if(selected==null||busy)return;
  setBusy(true);setError(null);setMessage(null);
  const result=await supabase.from("fuel_budget_activity").delete()
    .eq("fuel_budget_activity_id",a.fuel_budget_activity_id)
    .eq("fuel_budget_id",selected)
    .select("fuel_budget_activity_id");
  setBusy(false);setRemovingId(null);
  if(result.error){setError("Could not remove job: "+result.error.message);return;}
  if(!result.data?.length){setError("Job was not removed. Check your access permissions.");return;}
  if(editing===a.fuel_budget_activity_id)setEditing(null);
  setMessage("Job removed from this budget. Other budgets are unchanged.");
  await loadDetail(selected);
 };
 const addJob=async()=>{
  if(selected==null||newJob==null){setError("Choose a job to add.");return;}
  setBusy(true);setError(null);
  const result=await supabase.from("fuel_budget_activity").insert({
   fuel_budget_id:selected,vehicle_job_id:newJob,tractor_class_id:newClass,
   sequence_no:rows.reduce((max,r)=>Math.max(max,Number(r.sequence_no||0)),0)+1,
   target_dap:0,planned_operations:1,include_trip_fuel:true
  }).select("fuel_budget_activity_id").single();
  setBusy(false);
  if(result.error)setError(result.error.message);else if(selected){setMessage("Job added; edit its details below.");await loadDetail(selected);if(result.data){const newRow=await supabase.from("fuel_budget_activity").select("*").eq("fuel_budget_activity_id",result.data.fuel_budget_activity_id).single();if(newRow.data)startEdit(newRow.data as Activity);}}
 };
 const visibleJobs=useMemo(()=>{
  const list=rows.filter(a=>(jobFilter==null||a.vehicle_job_id===jobFilter)&&(dapFilter==null||a.target_dap===dapFilter)&&(classFilter==null||a.tractor_class_id===classFilter));
  list.sort((a,b)=>{
   const va=jobSort==="job"?jobs.find(j=>j.vehicle_job_id===a.vehicle_job_id)?.vehicle_job_name??"":jobSort==="class"?tractors.find(t=>t.tractor_class_id===a.tractor_class_id)?.class_name??"":a.target_dap;
   const vb=jobSort==="job"?jobs.find(j=>j.vehicle_job_id===b.vehicle_job_id)?.vehicle_job_name??"":jobSort==="class"?tractors.find(t=>t.tractor_class_id===b.tractor_class_id)?.class_name??"":b.target_dap;
   const cmp=typeof va==="number"&&typeof vb==="number"?va-vb:String(va??"").localeCompare(String(vb??""),undefined,{numeric:true,sensitivity:"base"});
   return jobDescending?-cmp:cmp;
  });
  return list;
 },[rows,jobFilter,dapFilter,classFilter,jobSort,jobDescending,jobs,tractors]);
 const filtered=useMemo(()=>budgets.filter(b=>crops.some(c=>c.crop_id===b.crop_id&&c.active)&&(filterCrop==null||b.crop_id===filterCrop)),[budgets,crops,filterCrop]);
 const cropName=(id:number|null)=>crops.find(c=>c.crop_id===id)?.crop_name||"Crop not set";
 const jobName=(id:number)=>jobs.find(j=>j.vehicle_job_id===id)?.vehicle_job_name||String(id);
 const className=(id:number|null)=>tractors.find(t=>t.tractor_class_id===id)?.class_code||"No class";
 return <ScrollView contentContainerStyle={s.page}>
      <JsplModuleHeader title="Fuel Budget Management" />
  <View style={s.line}><ThemedText type="title">Fuel Budgets</ThemedText><Pressable style={s.button} onPress={reload}><ThemedText>Refresh</ThemedText></Pressable></View>
  {error?<ThemedView style={s.card}><ThemedText style={s.error}>{error}</ThemedText></ThemedView>:null}
  {message?<ThemedView style={s.card}><ThemedText>{message}</ThemedText></ThemedView>:null}
  {loading?<ActivityIndicator/>:creating?<>
   <Pressable style={s.button} onPress={()=>{setCreating(false);setError(null);}}><ThemedText>← All Fuel Budgets</ThemedText></Pressable>
   <ThemedView style={s.card}>
    <ThemedText type="subtitle">New Fuel Budget</ThemedText>
    <ThemedText>Budget name</ThemedText>
    <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. 26 Seed Maize Standard"/>
    <ThemedText>Crop</ThemedText>
    <View style={s.picker}><Picker selectedValue={cropId} onValueChange={setCropId}><Picker.Item label="Select crop" value={null}/>{crops.filter(cr=>cr.active).map(cr=><Picker.Item key={cr.crop_id} label={cr.crop_name} value={cr.crop_id}/>)}</Picker></View>
    <ThemedText>Notes</ThemedText><TextInput style={s.input} value={notes} onChangeText={setNotes} placeholder="Optional"/>
    <Pressable style={[s.button,active&&s.selected]} onPress={()=>setActive(v=>!v)}><ThemedText>Active: {active?"Yes":"No"} (click to change)</ThemedText></Pressable>
    <ThemedText style={s.small}>After creating the budget, you can add and edit its jobs.</ThemedText>
    <Pressable style={s.button} disabled={busy||!name.trim()||cropId==null} onPress={createBudget}><ThemedText style={s.bold}>{busy?"Creating…":"Create Fuel Budget"}</ThemedText></Pressable>
   </ThemedView>
  </>:selectedBudget?<>
   <Pressable style={s.button} onPress={()=>{setSelected(null);setEditing(null);setError(null);}}><ThemedText>← All Fuel Budgets</ThemedText></Pressable>
   <ThemedView style={s.card}>
    <ThemedText type="subtitle">Edit Budget #{selectedBudget.fuel_budget_id}</ThemedText>
    <ThemedText>Name</ThemedText><TextInput style={s.input} value={name} onChangeText={setName}/>
    <ThemedText>Crop</ThemedText>
    <View style={s.picker}><Picker selectedValue={cropId} onValueChange={setCropId}><Picker.Item label="Select crop" value={null}/>{crops.filter(c=>c.active||c.crop_id===cropId).map(c=><Picker.Item key={c.crop_id} label={c.crop_name} value={c.crop_id}/>)}</Picker></View>
    <ThemedText>Notes</ThemedText><TextInput style={s.input} value={notes} onChangeText={setNotes}/>
    <Pressable style={[s.button,active&&s.selected]} onPress={()=>setActive(!active)}><ThemedText>Active: {active?"Yes":"No"} (click to change)</ThemedText></Pressable>
    <Pressable style={s.button} disabled={busy} onPress={onSaveHeader}><ThemedText style={s.bold}>Save Budget Details</ThemedText></Pressable>
   </ThemedView>
   <ThemedView style={s.card}>
    <ThemedText type="subtitle">Budget Jobs ({visibleJobs.length} of {rows.length})</ThemedText>
    <View style={s.filterLine}>
      <View style={s.compactPicker}><Picker selectedValue={jobSort} onValueChange={v=>{setJobSort(v);setJobDescending(false);}}>
       <Picker.Item label="Sort: Job A–Z" value="job"/><Picker.Item label="Sort: DAP" value="dap"/><Picker.Item label="Sort: Tractor class" value="class"/>
      </Picker></View>
      <Pressable style={s.button} onPress={()=>setJobDescending(v=>!v)}><ThemedText>{jobDescending?"Z–A / High–Low":"A–Z / Low–High"} ⇅</ThemedText></Pressable>
      <View style={s.compactPicker}><Picker selectedValue={dapFilter} onValueChange={setDapFilter}><Picker.Item label="All DAP" value={null}/>{[...new Set(rows.map(a=>a.target_dap).filter((x):x is number=>x!=null))].sort((a,b)=>a-b).map(v=><Picker.Item key={v} label={String(v)} value={v}/>)}</Picker></View>
      <View style={s.compactPicker}><Picker selectedValue={jobFilter} onValueChange={setJobFilter}><Picker.Item label="All Jobs" value={null}/>{jobs.filter(j=>rows.some(a=>a.vehicle_job_id===j.vehicle_job_id)).map(j=><Picker.Item key={j.vehicle_job_id} label={j.vehicle_job_name} value={j.vehicle_job_id}/>)}</Picker></View>
      <View style={s.compactPicker}><Picker selectedValue={classFilter} onValueChange={setClassFilter}><Picker.Item label="All Tractor Sizes" value={null}/>{tractors.filter(t=>rows.some(a=>a.tractor_class_id===t.tractor_class_id)).map(t=><Picker.Item key={t.tractor_class_id} label={t.class_name} value={t.tractor_class_id}/>)}</Picker></View>
    </View>
    {visibleJobs.map(a=><View key={a.fuel_budget_activity_id} style={s.jobRow}>
     <View style={s.jobSummary}>
      <ThemedText style={[s.bold,s.jobSeq]}>{a.sequence_no??"—"}</ThemedText>
      <ThemedText style={[s.bold,s.jobName]} numberOfLines={1}>{jobName(a.vehicle_job_id)}</ThemedText>
      <ThemedText style={s.jobData}>DAP {a.target_dap??"—"}</ThemedText>
      <ThemedText style={s.jobData}>{className(a.tractor_class_id)}</ThemedText>
      <ThemedText style={s.jobData}>Passes {a.planned_operations??"—"}</ThemedText>
      <ThemedText style={s.jobDescription} numberOfLines={1}>{a.description??""}</ThemedText>
      <Pressable style={s.tinyButton} disabled={busy} onPress={()=>startEdit(a)}><ThemedText>Edit</ThemedText></Pressable>
      <Pressable style={s.tinyButton} disabled={busy} onPress={()=>setRemovingId(a.fuel_budget_activity_id)}><ThemedText style={s.error}>Remove</ThemedText></Pressable>
     </View>
     {editing===a.fuel_budget_activity_id?<>
      <View style={s.editGrid}>
       <View style={s.editFieldWide}><ThemedText style={s.small}>Job</ThemedText><View style={s.picker}><Picker selectedValue={draft.vehicle_job_id} onValueChange={v=>updateField("vehicle_job_id",v)}>{jobs.map(j=><Picker.Item key={j.vehicle_job_id} value={j.vehicle_job_id} label={j.vehicle_job_name}/>)}</Picker></View></View>
       <View style={s.editField}><ThemedText style={s.small}>Tractor Class</ThemedText><View style={s.picker}><Picker selectedValue={draft.tractor_class_id??null} onValueChange={v=>updateField("tractor_class_id",v)}><Picker.Item label="None" value={null}/>{tractors.map(t=><Picker.Item key={t.tractor_class_id} value={t.tractor_class_id} label={t.class_name}/>)}</Picker></View></View>
       <View style={s.editFieldWide}><ThemedText style={s.small}>Description</ThemedText><TextInput style={s.input} value={draft.description||""} onChangeText={v=>updateField("description",v)} placeholder="e.g. Pre Land Prep"/></View>
       {numericFields.map(k=><View key={k} style={s.editField}><ThemedText style={s.small}>{labels[k]}</ThemedText><TextInput style={s.input} keyboardType="numeric" value={String((draft as any)[k]??"")} onChangeText={v=>updateField(k,v)}/></View>)}
       <View style={s.editField}><ThemedText style={s.small}>Notes</ThemedText><TextInput style={s.input} value={draft.notes||""} onChangeText={v=>updateField("notes",v)}/></View>
       <Pressable style={[s.button,draft.include_trip_fuel&&s.selected]} onPress={()=>updateField("include_trip_fuel",!draft.include_trip_fuel)}><ThemedText>Travel fuel: {draft.include_trip_fuel?"Yes":"No"}</ThemedText></Pressable>
      </View>
      <View style={s.line}><Pressable style={s.button} disabled={busy} onPress={saveJob}><ThemedText style={s.bold}>Save Job</ThemedText></Pressable><Pressable style={s.button} onPress={()=>setEditing(null)}><ThemedText>Cancel</ThemedText></Pressable></View>
     </>:null}
     {removingId===a.fuel_budget_activity_id?<View style={s.block}>
      <ThemedText>Remove {jobName(a.vehicle_job_id)} from this budget? This cannot be undone.</ThemedText>
      <View style={s.line}>
       <Pressable style={s.button} disabled={busy} onPress={()=>removeJob(a)}><ThemedText style={s.error}>Yes, Remove Job</ThemedText></Pressable>
       <Pressable style={s.button} disabled={busy} onPress={()=>setRemovingId(null)}><ThemedText>Cancel</ThemedText></Pressable>
      </View>
     </View>:null}
    </View>)}
    <ThemedText type="subtitle">Add Job</ThemedText>
    <View style={s.picker}><Picker selectedValue={newJob} onValueChange={setNewJob}><Picker.Item label="Select job" value={null}/>{jobs.map(j=><Picker.Item key={j.vehicle_job_id} label={j.vehicle_job_name} value={j.vehicle_job_id}/>)}</Picker></View>
    <View style={s.picker}><Picker selectedValue={newClass} onValueChange={setNewClass}><Picker.Item label="Select tractor class" value={null}/>{tractors.map(t=><Picker.Item key={t.tractor_class_id} label={t.class_name} value={t.tractor_class_id}/>)}</Picker></View>
    <Pressable style={s.button} disabled={busy||newJob==null} onPress={addJob}><ThemedText style={s.bold}>Add Job to Budget</ThemedText></Pressable>
   </ThemedView>
  </>:<>
   <ThemedView style={s.card}>
    <View style={s.line}><ThemedText type="subtitle">Existing Fuel Budgets</ThemedText><Pressable style={s.button} onPress={startCreate}><ThemedText style={s.bold}>+ New Fuel Budget</ThemedText></Pressable></View>
    <View style={s.cropFilters}>
      <Pressable style={[s.cropButton,filterCrop===null&&s.selected]} onPress={()=>setFilterCrop(null)}><ThemedText style={s.bold}>All</ThemedText></Pressable>
      {crops.filter(c=>c.active).map(c=><Pressable key={c.crop_id} style={[s.cropButton,filterCrop===c.crop_id&&s.selected]} onPress={()=>setFilterCrop(c.crop_id)}><ThemedText style={s.bold}>{c.crop_name}</ThemedText></Pressable>)}
    </View>
    {copySource?<View style={s.copyDialog}>
      <ThemedText style={s.bold}>Copy {copySource.fuel_budget_name}</ThemedText>
      <ThemedText style={s.small}>Crop: {cropName(copySource.crop_id)} · All budget jobs will be copied · New budget inactive</ThemedText>
      <TextInput style={s.input} placeholder="New budget name" value={copyName} onChangeText={setCopyName}/>
      <View style={s.line}>
        <Pressable style={s.button} disabled={busy||!copyName.trim()} onPress={copy}><ThemedText style={s.bold}>{busy?"Copying…":"Confirm Copy"}</ThemedText></Pressable>
        <Pressable style={s.button} disabled={busy} onPress={()=>setCopySource(null)}><ThemedText>Cancel</ThemedText></Pressable>
      </View>
    </View>:null}
    <View style={s.budgetList}>
      {filtered.map(b=><View key={b.fuel_budget_id} style={s.budgetRow}>
        <Pressable style={s.budgetOpen} onPress={()=>choose(b)}>
          <ThemedText style={s.budgetCrop}>{cropName(b.crop_id)}</ThemedText>
          <ThemedText style={[s.budgetTitle,s.bold]} numberOfLines={1}>{b.fuel_budget_name}</ThemedText>
          <ThemedText style={s.budgetStatus}>{b.active?"Active":"Inactive"}</ThemedText>
        </Pressable>
        <Pressable style={s.tinyButton} onPress={()=>{setCopySource(b);setCopyName(b.fuel_budget_name+" Copy");setError(null);}}><ThemedText>Copy</ThemedText></Pressable>
      </View>)}
    </View>
    {filtered.length===0?<ThemedText>No budgets found.</ThemedText>:null}
   </ThemedView>
  </>}
 </ScrollView>;
}
const s=StyleSheet.create({
 cropFilters:{flexDirection:"row",flexWrap:"wrap",gap:6,marginVertical:2},
 cropButton:{borderWidth:1,borderColor:"rgba(120,120,120,.35)",borderRadius:7,paddingHorizontal:12,paddingVertical:7},
 budgetList:{gap:0},
 budgetRow:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:7,paddingHorizontal:9,borderBottomWidth:1,borderBottomColor:"rgba(120,120,120,.25)"},
 budgetOpen:{flex:1,flexDirection:"row",alignItems:"center",gap:10},
 copyDialog:{padding:12,borderRadius:8,borderWidth:1,borderColor:"#99B7A1",gap:9,backgroundColor:"#F3F8F4"},
 filterLine:{flexDirection:"row",flexWrap:"wrap",gap:8,alignItems:"center"},
 editGrid:{flexDirection:"row",flexWrap:"wrap",gap:9,marginTop:10,marginBottom:8,alignItems:"flex-end"},
 editField:{minWidth:115,flexGrow:1,maxWidth:165},editFieldWide:{minWidth:180,flexGrow:2,maxWidth:285},
 compactPicker:{minWidth:145,flexGrow:1,maxWidth:215,borderWidth:1,borderColor:"#D1D5DB",borderRadius:6},
 jobRow:{borderBottomWidth:1,borderBottomColor:"#D1D5DB",paddingVertical:5},
 jobSummary:{flexDirection:"row",alignItems:"center",gap:9,flexWrap:"wrap"},
 jobName:{minWidth:130,flex:1},jobData:{minWidth:72,fontSize:13},jobDescription:{flex:1,minWidth:110,fontSize:12},
 tinyButton:{borderWidth:1,borderColor:"#CBD5E1",paddingVertical:5,paddingHorizontal:9,borderRadius:6},
 budgetCrop:{width:120,fontSize:13},
 budgetTitle:{flex:1,fontSize:14},
 budgetStatus:{width:66,fontSize:12,opacity:0.7},
 page:{padding:18,paddingBottom:45,gap:12},card:{borderWidth:1,borderColor:"rgba(120,120,120,.35)",borderRadius:12,padding:14,gap:10},
 block:{borderWidth:1,borderColor:"rgba(120,120,120,.24)",borderRadius:9,padding:12,gap:8},
 line:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8},
 button:{borderWidth:1,borderColor:"rgba(120,120,120,.35)",borderRadius:9,paddingHorizontal:12,paddingVertical:9,alignSelf:"flex-start"},
 selected:{backgroundColor:"rgba(100,140,120,.16)",borderWidth:2},
 input:{borderWidth:1,borderColor:"rgba(120,120,120,.4)",borderRadius:8,paddingHorizontal:10,paddingVertical:9,fontSize:15},
 picker:{borderWidth:1,borderColor:"rgba(120,120,120,.35)",borderRadius:8,overflow:"hidden"},
 small:{fontSize:12,opacity:.72},bold:{fontWeight:"700"},error:{color:"red"}
});
