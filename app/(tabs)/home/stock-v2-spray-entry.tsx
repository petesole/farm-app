import {StockV2Header} from "@/components/jspl/StockV2Header";
import { useEffect, useMemo, useState } from "react";
import { useRouter,useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { JsplSearchCombo } from "@/components/jspl/JsplSearchCombo";
import { jsplColors, jsplRadii, jsplSizes, jsplSpacing, jsplType } from "@/constants/jspl-design";
import { supabase } from "../../../supabase";

type Trace = { tracecode_id: number; tracecode_name: string; tracecode_size: number | null; crop_id: number | null; end_date: string | null; planned_planting_date?: string | null; actual_planting_date?: string | null };
type Crop = { crop_id: number; crop_name: string; active: boolean | null };
type CatalogInput = { input_id: number; inputs_name: string; item_code:string; quantity:number; base_unit:string };
type InputLine = { key: number; input: string; rate: string };
const workflowEndpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
const newRequestId=()=> "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return(c==="x"?r:(r&3)|8).toString(16)});
type BudgetLine={budget_ref_id:number;days_after_planting:number;rate_per_ha:number;item_code:string;item_name:string;base_unit:string};
type SprayType={access_spray_type_id:number;spray_type_name:string;spray_tank_size:number;spray_rate_per_ha:number};
const monday = (d: Date) => { const x = new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; };
const addWeeks = (d: Date, count: number) => { const x=new Date(d); x.setDate(x.getDate()+count*7); return x; };
const weekLabel = (d: Date) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
const fmt = (n: number) => Number.isFinite(n)?n.toLocaleString("en-GB",{maximumFractionDigits:2}):"—";
let nextKey=1;
export default function StockV2SprayPlanningPreview() {
  const router=useRouter();
  const params=useLocalSearchParams<{editJobId?:string}>();
  const editJobId=Number(params.editJobId||0);
  const editing=Number.isSafeInteger(editJobId)&&editJobId>0;
  const { width, height }=useWindowDimensions();
  const wide=width>=760;
  const watermarkSize=Math.min(650,Math.max(240,width-jsplSpacing.xl*2),Math.max(240,height-jsplSpacing.xl*2));
  const [traces,setTraces]=useState<Trace[]>([]);
  const [crops,setCrops]=useState<Crop[]>([]);
  const [cropId,setCropId]=useState<number|null>(null);
  const [catalog,setCatalog]=useState<CatalogInput[]>([]);
  const [sprayTypes,setSprayTypes]=useState<SprayType[]>([]);
  const [budgetLines,setBudgetLines]=useState<BudgetLine[]>([]);
  const [saving,setSaving]=useState(false),[saveError,setSaveError]=useState("");
  const [openLine,setOpenLine]=useState<number|null>(null);
  const [traceId,setTraceId]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [operationalOffset,setOperationalOffset]=useState(0);
  const [budgetOffset,setBudgetOffset]=useState(0);
  const [area,setArea]=useState("");
  const [sprayer,setSprayer]=useState("");
  const [waterRate,setWaterRate]=useState("");
  const [sprayType,setSprayType]=useState("");
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
  const budgetPlantingDate=selected?.actual_planting_date||selected?.planned_planting_date||null;
  const selectedBudgetRows=budgetLines.filter(row=>{if(!budgetPlantingDate)return true;const d=new Date(budgetPlantingDate.slice(0,10)+"T12:00:00");d.setDate(d.getDate()+row.days_after_planting);return monday(d).getTime()===budgetWeek.getTime()});
  const budgetWeek=addWeeks(monday(new Date()),budgetOffset);
  useEffect(()=>{ let mounted=true; (async()=>{
    const [traceResult,cropResult,inputResult]=await Promise.all([
      supabase.from("tracecode").select("tracecode_id,tracecode_name,tracecode_size,crop_id,end_date,planned_planting_date,actual_planting_date").order("tracecode_name"),
      supabase.from("crop").select("crop_id,crop_name,active").order("crop_name"),
      supabase.auth.getSession()
    ]);
    if(!mounted)return;
    const failures=[traceResult.error,cropResult.error].filter(Boolean);
    if(failures.length)setError(failures.map(e=>e?.message).join("; "));
    else {
      setTraces((traceResult.data??[]) as Trace[]);
      setCrops((cropResult.data??[]) as Crop[]);
      if(!inputResult.data.session?.access_token){setError("Sign in to Supabase to load private Stock V2 products.");}else{
        try{const response=await fetch(workflowEndpoint,{headers:{authorization:"Bearer "+inputResult.data.session.access_token}});const data=await response.json();if(!response.ok)throw Error(data.error||"Unable to load Stock V2");
        setCatalog((data.items??[]).map((p:{item_code:string;item_name:string;quantity:number;base_unit:string},i:number)=>({input_id:i+1,inputs_name:p.item_name,item_code:p.item_code,quantity:Number(p.quantity??0),base_unit:p.base_unit})));
        const typeResponse=await fetch(workflowEndpoint+"?spray_types=1",{headers:{authorization:"Bearer "+inputResult.data.session.access_token}});
        const typeData=await typeResponse.json();if(!typeResponse.ok)throw Error(typeData.error||"Unable to load spray types");
        setSprayTypes(typeData.spray_types??[]);
        if(editing){
          const matching=(data.sprays??[]).filter((j:{job_id:number|string})=>Number(j.job_id)===editJobId);
          if(matching.length===0)throw Error("Spray job not found for editing");
          const a=matching[0];if(a.status!=="planned"||matching.some((l:{issued_quantity:number})=>l.issued_quantity>0))throw Error("Cannot edit a spray after any stock has been issued");
          setTraceId(a.external_tracecode_id);setSprayType(a.spray_type);setWaterRate(String(a.water_litres_per_ha??""));
          setPart(a.part_label?.startsWith("Part ")?a.part_label.slice(5).replace(/ ha$/,""):"");
          setSprayer(a.sprayer_asset_code??"");
          const currentMonday=monday(new Date());
          const savedDate=String(a.planned_week_start??"").slice(0,10);
          const savedMonday=/^\d{4}-\d{2}-\d{2}$/.test(savedDate)?new Date(savedDate+"T12:00:00"):new Date(NaN);
          if(!Number.isFinite(savedMonday.getTime()))throw Error("This spray has an invalid planned week; please correct the record before editing.");
          setOperationalOffset(Math.round((monday(savedMonday).getTime()-currentMonday.getTime())/604800000));
          setLines(matching.map((j:{item_name:string;rate_per_ha:number},i:number)=>({key:i+1,input:j.item_name,rate:String(j.rate_per_ha)})));
        }
        const first=typeData.spray_types?.[0];if(first&&!editing){setSprayType(first.spray_type_name);setWaterRate(String(first.spray_rate_per_ha));}
        }catch(e){setError(e instanceof Error?e.message:String(e))}
      }
    }
    setLoading(false);
  })();return()=>{mounted=false};},[editing,editJobId]);
  useEffect(()=>{setArea(selected?.tracecode_size?.toString()??"");setBudgetOffset(0);if(!editing)setLines([])},[traceId,editing]);
  useEffect(()=>{let active=true;(async()=>{if(!traceId){setBudgetLines([]);return}try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)return;const response=await fetch(workflowEndpoint+"?budget_reference=1&tracecode_id="+traceId,{headers:{authorization:"Bearer "+session.access_token}});const data=await response.json();if(!response.ok)throw Error(data.error||"Budget reference unavailable");if(active)setBudgetLines(data.budget??[])}catch(e){if(active)setError(e instanceof Error?e.message:String(e))}})();return()=>{active=false}},[traceId]);
  const addLine=(input="")=>setLines(old=>[...old,{key:nextKey++,input,rate:""}]);
  const copyBudgetInput=(input:string,rate:number)=>setLines(old=>{
    const existing=old.find(x=>x.input===input);
    if(existing)return old; // avoid accidental duplicates on repeated taps
    return [...old,{key:nextKey++,input,rate:String(rate)}];
  });
  const matches=(search:string)=>catalog.filter(p=>p.inputs_name.toLowerCase().includes(search.trim().toLowerCase())).slice(0,30);
  const changeLine=(key:number,field:"input"|"rate",value:string)=>setLines(old=>old.map(x=>x.key===key?{...x,[field]:value}:x));
  const wholeArea=Number(selected?.tracecode_size??0);
  const sprayArea=part.trim()?Number(part):wholeArea;
  const totalWater=sprayArea*Number(waterRate);
  const savePlan=async()=>{
    setSaveError("");
    if(!traceId||!selected||!Number.isFinite(sprayArea)||sprayArea<=0||sprayArea>wholeArea){setSaveError("Choose an active tracecode and a valid Part area not greater than its hectares.");return;}
    if(!sprayType||!Number.isFinite(Number(waterRate))||Number(waterRate)<=0){setSaveError("Choose a spray type and enter a valid water rate.");return;}
    if(lines.length===0||lines.some(l=>!catalog.some(p=>p.inputs_name===l.input)||!Number.isFinite(Number(l.rate))||Number(l.rate)<=0)){setSaveError("Select Stock V2 products and enter valid rates for every line.");return;}
    const unique=new Set(lines.map(l=>l.input));if(unique.size!==lines.length){setSaveError("A product can only appear once per spray job.");return;}
    setSaving(true);
    try{
      const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");
      if(!Number.isFinite(operationalWeek.getTime()))throw Error("Invalid spray week. Select a valid week before saving.");
      const payload={...(editing?{job_id:editJobId}:{}),tracecode_id:traceId,area_ha:sprayArea,part_label:part.trim()?"Part "+part.trim()+" ha":"Whole field",spray_type:sprayType,water_rate:Number(waterRate),planned_week_start:operationalWeek.toISOString().slice(0,10),sprayer_asset_code:sprayer,job_tracking_code:jobCode,lines:lines.map(l=>({item_code:catalog.find(p=>p.inputs_name===l.input)!.item_code,rate_per_ha:Number(l.rate)}))};
      const response=await fetch(workflowEndpoint,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},body:JSON.stringify({action:editing?"spray_edit":"spray",request_id:newRequestId(),payload})});
      const data=await response.json();if(!response.ok)throw Error(data.error||"Unable to save spray plan");
      if(!data.result?.job_id||!Array.isArray(data.result?.lines)||data.result.lines.length!==lines.length)throw Error("Spray job was not fully confirmed by the server");
      router.replace("/stock-v2-spray-planning");
    }catch(e){setSaveError(e instanceof Error?e.message:String(e))}finally{setSaving(false)}
  };
  return <ThemedView style={styles.root}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.watermarkLayer}>
      <Image source={require("../../../assets/images/jspl_farm_watermark.png")} resizeMode="contain" style={[styles.watermark,{width:watermarkSize,height:watermarkSize}]}/>
    </View>
    <ScrollView style={styles.foreground} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <StockV2Header title={editing?"Edit Spray Mix":"New Spray Plan"}/>
    <ThemedText style={styles.muted}>Stock V2 private test workflow • Saving a spray does not move stock. Transfer from the weekly register to issue inputs.</ThemedText>
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
        <ThemedText style={styles.label}>Spray type</ThemedText>{sprayTypes.map(setup=><Pressable key={setup.access_spray_type_id} style={[styles.chip,sprayType===setup.spray_type_name&&styles.selected]} onPress={()=>{setSprayType(setup.spray_type_name);setWaterRate(String(setup.spray_rate_per_ha));}}><ThemedText>{setup.spray_type_name}{sprayType===setup.spray_type_name?" ✓":""}</ThemedText></Pressable>)}
        <ThemedText style={styles.label}>Sprayer / equipment code</ThemedText><TextInput style={styles.input} value={sprayer} onChangeText={setSprayer} placeholder="Select sprayer later"/>
        <View style={styles.two}><View style={styles.half}><ThemedText style={styles.label}>Tracecode area (ha) — fixed</ThemedText><ThemedText style={styles.heading}>{fmt(wholeArea)}</ThemedText></View><View style={styles.half}><ThemedText style={styles.label}>Water rate (L/ha)</ThemedText><TextInput style={styles.input} keyboardType="decimal-pad" value={waterRate} onChangeText={setWaterRate} placeholder="Editable"/></View></View>
        <ThemedText style={styles.muted}>Water required: {fmt(totalWater)} L</ThemedText>
        <View style={styles.two}><View style={styles.half}><ThemedText style={styles.label}>Part (ha) — blank = whole field</ThemedText><TextInput style={styles.input} keyboardType="decimal-pad" value={part} onChangeText={setPart}/></View><View style={styles.half}><ThemedText style={styles.label}>Job code</ThemedText><TextInput style={styles.input} value={jobCode} onChangeText={setJobCode}/></View></View>
        <ThemedText style={styles.heading}>Inputs & rates</ThemedText>
        {lines.map(x=><View key={x.key} style={styles.line}><View style={{flex:2}}><ThemedText style={styles.label}>Input</ThemedText><TextInput style={styles.input} value={x.input} onFocus={()=>setOpenLine(x.key)} onChangeText={v=>{changeLine(x.key,"input",v);setOpenLine(x.key)}} placeholder="Type product name or letters" autoCorrect={false}/>
          {openLine===x.key?<View style={styles.suggestions}><ThemedText style={styles.label}>Matching inputs ({matches(x.input).length}{catalog.length>=1000?"+":""})</ThemedText>
            <ScrollView nestedScrollEnabled style={{maxHeight:190}} keyboardShouldPersistTaps="always">
              {matches(x.input).map(p=><Pressable key={p.input_id} style={styles.suggestion} onPress={()=>{changeLine(x.key,"input",p.inputs_name);setOpenLine(null)}}><ThemedText>{p.inputs_name}</ThemedText></Pressable>)}
              {matches(x.input).length===0?<ThemedText style={styles.muted}>No matching input in the current master.</ThemedText>:null}
            </ScrollView>
            <Pressable onPress={()=>setOpenLine(null)} style={styles.chip}><ThemedText>Close list</ThemedText></Pressable>
          </View>:null}</View><View style={{flex:1}}><ThemedText style={styles.label}>Rate/ha</ThemedText><TextInput style={styles.input} keyboardType="decimal-pad" value={x.rate} onChangeText={v=>changeLine(x.key,"rate",v)}/></View><View style={{flex:1}}><ThemedText style={styles.label}>Required</ThemedText><ThemedText>{fmt(sprayArea*Number(x.rate))}</ThemedText></View><View style={{flex:1}}><ThemedText style={styles.label}>Stock</ThemedText><ThemedText>{catalog.find(p=>p.inputs_name===x.input)?`${fmt(catalog.find(p=>p.inputs_name===x.input)!.quantity)} ${catalog.find(p=>p.inputs_name===x.input)!.base_unit}`:"—"}</ThemedText></View><Pressable onPress={()=>setLines(v=>v.filter(y=>y.key!==x.key))}><ThemedText style={styles.error}>Remove</ThemedText></Pressable></View>)}
        <Pressable style={styles.action} onPress={()=>addLine()}><ThemedText>+ Add input</ThemedText></Pressable>
        {saveError?<ThemedText style={styles.error}>NOT SAVED: {saveError}</ThemedText>:null}
        <Pressable disabled={saving||loading||!!error} style={[styles.saveButton,(saving||loading||!!error)&&{opacity:0.5}]} onPress={savePlan}><ThemedText style={styles.saveText}>{saving?"Saving…":editing?"Save Mix Changes":"Save New Spray"}</ThemedText></Pressable>
        <ThemedText style={styles.muted}>Choose from the imported Access products. Stock quantities come from the Stock V2 test ledger.</ThemedText>
      </View>
      <View style={styles.panel}>
        <ThemedText type="subtitle">Crop budget reference</ThemedText>
        <View style={styles.weekNav}><Pressable style={styles.chip} onPress={()=>setBudgetOffset(x=>x-1)}><ThemedText>‹ Previous</ThemedText></Pressable><ThemedText>{weekLabel(budgetWeek)}</ThemedText><Pressable style={styles.chip} onPress={()=>setBudgetOffset(x=>x+1)}><ThemedText>Next ›</ThemedText></Pressable></View>
        <ThemedText style={styles.muted}>Budget weeks move independently of the operational spray week.</ThemedText>
        <View style={styles.empty}>
          <ThemedText style={styles.heading}>Crop budget reference — {selected?.tracecode_name??"Select trace"}</ThemedText>
          {budgetLines.length===0?<ThemedText style={styles.warning}>No crop budget reference linked to this tracecode yet. No sample products are used.</ThemedText>:null}
          {!budgetPlantingDate&&budgetLines.length>0?<ThemedText style={styles.warning}>Planting date unavailable: showing all budget lines without week filtering.</ThemedText>:null}
          {selectedBudgetRows.map(row=><Pressable key={row.budget_ref_id} style={styles.budgetRow} onPress={()=>copyBudgetInput(row.item_name,row.rate_per_ha)}>
            <View style={{flex:2}}><ThemedText style={styles.label}>DAP {row.days_after_planting}</ThemedText><ThemedText>{row.item_name}</ThemedText></View>
            <ThemedText style={{flex:1}}>{row.rate_per_ha} {row.base_unit}/ha</ThemedText>
            <ThemedText style={styles.copy}>+ Copy</ThemedText>
          </Pressable>)}
          {budgetLines.length>0&&selectedBudgetRows.length===0?<ThemedText style={styles.muted}>No budget applications for this week.</ThemedText>:null}
          <ThemedText style={styles.muted}>Tap a budget item to copy its recorded rate into this spray job.</ThemedText>
        </View>
      </View>
    </View>
  </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({saveButton:{backgroundColor:jsplColors.primary,minHeight:jsplSizes.buttonHeight,paddingHorizontal:jsplSpacing.md,justifyContent:"center",borderRadius:jsplRadii.sm,alignItems:"center"},saveText:{color:"#fff",fontWeight:"700"},stockHomeBack:{alignSelf:"flex-start",backgroundColor:jsplColors.successTint,borderColor:jsplColors.border,borderWidth:1,borderRadius:jsplRadii.md,paddingVertical:10,paddingHorizontal:14},stockHomeBackText:{color:jsplColors.primaryDark,fontWeight:"700"},
 watermarkLayer:{...StyleSheet.absoluteFillObject,zIndex:0,alignItems:"center",justifyContent:"center"},watermark:{opacity:0.08},foreground:{flex:1,zIndex:1,backgroundColor:"transparent"},logo:{width:80,height:80,flexShrink:0},headerText:{flex:1,minWidth:0,gap:jsplSpacing.sm},
 root:{flex:1,backgroundColor:jsplColors.background},header:{flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:jsplSpacing.md},brand:{fontSize:jsplType.caption,fontWeight:"700",color:jsplColors.primary,letterSpacing:1},title:{color:jsplColors.primaryDark},page:{padding:jsplSpacing.lg,gap:jsplSpacing.lg,paddingBottom:50},heading:{fontWeight:"700",fontSize:16},warning:{color:jsplColors.warning},muted:{opacity:0.65},error:{color:jsplColors.danger},
 traces:{gap:8},chip:{borderWidth:1,borderColor:jsplColors.border,paddingHorizontal:12,paddingVertical:8,borderRadius:8,marginRight:6},selected:{backgroundColor:jsplColors.successTint,borderColor:jsplColors.primary},
 panels:{gap:14},sideBySide:{flexDirection:"row"},stacked:{flexDirection:"column"},panel:{flex:1,borderWidth:1,borderColor:jsplColors.border,backgroundColor:"rgba(255,255,255,0.65)",borderRadius:jsplRadii.lg,padding:jsplSpacing.lg,gap:9,minWidth:0},
 weekNav:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:4,flexWrap:"wrap"},label:{fontSize:12,opacity:0.75,marginBottom:3},
 input:{borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.sm,padding:jsplSpacing.sm,minHeight:jsplSizes.inputHeight,color:jsplColors.text,backgroundColor:jsplColors.surface},two:{flexDirection:"row",gap:8},half:{flex:1},
 line:{flexDirection:"row",alignItems:"center",gap:7,flexWrap:"wrap"},action:{minHeight:jsplSizes.buttonHeight,justifyContent:"center",borderWidth:1,borderColor:jsplColors.border,paddingHorizontal:jsplSpacing.md,alignItems:"center",borderRadius:jsplRadii.sm},
 empty:{borderWidth:1,borderStyle:"dashed",borderColor:jsplColors.border,padding:14,borderRadius:8,gap:8,marginTop:10},budgetRow:{paddingVertical:9,borderBottomWidth:1,borderColor:jsplColors.border,flexDirection:"row",gap:8,alignItems:"center"},copy:{fontWeight:"700",color:jsplColors.primary},suggestions:{borderWidth:1,borderColor:jsplColors.border,borderRadius:7,padding:6,backgroundColor:"#fff"},suggestion:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:jsplColors.border}
});
