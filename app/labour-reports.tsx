import {useEffect,useMemo,useState} from "react";
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {Picker} from "@react-native-picker/picker";
import {router,useLocalSearchParams} from "expo-router";
import {supabase} from "@/supabase";
import {jsplColors as C,formatJsplDate,formatJsplNumber} from "@/constants/jspl-design";
import {labourExportCSV,labourPrintReport} from "@/lib/labour-report-export";

type ReportMode="daily"|"weekly"|"ao";
type ReportRow={source_type?:string;source_id?:number;labour_date?:string;labour_week?:string;report_farm?:string;farm_name?:string;tracecode_name:string;crop_name:string;activity_name:string;labour_qty?:number;total_labour_qty?:number;kgs?:number|null;total_kgs?:number|null;unit_cost:number;avg_kgs_per_person?:number|null;total_cost:number};
type Column={label:string;field:string};
const money=(value:number)=>"$"+formatJsplNumber(value);
const dailyCols:Column[]=[{label:"Field",field:"tracecode_name"},{label:"Crop",field:"crop_name"},{label:"LabourActivity",field:"activity_name"},{label:"Qty",field:"labour_qty"},{label:"Kgs",field:"kgs"},{label:"Unit",field:"unit_cost"},{label:"Value",field:"total_cost"}];
const weeklyCols:Column[]=[{label:"Field",field:"tracecode_name"},{label:"Crop",field:"crop_name"},{label:"Activity",field:"activity_name"},{label:"Labour Qty",field:"total_labour_qty"},{label:"Kgs",field:"total_kgs"},{label:"Unit Cost",field:"unit_cost"},{label:"Kgs/Person",field:"avg_kgs_per_person"},{label:"Value",field:"total_cost"}];
function value(row:ReportRow,key:string):string{
 const n=(row as any)[key];
 if(n==null)return "";
 if(["labour_qty","total_labour_qty","kgs","total_kgs"].includes(key))return formatJsplNumber(Number(n),0);
 if(["unit_cost","total_cost"].includes(key))return money(Number(n));
 if(key==="avg_kgs_per_person")return formatJsplNumber(Number(n));
 return String(n);
}
export default function LabourReports(){
 const params=useLocalSearchParams<{mode?:string}>();
 const incoming=(params.mode==="weekly"||params.mode==="ao")?params.mode:"daily";
 const [mode,setMode]=useState<ReportMode>(incoming);
 const [dates,setDates]=useState<string[]>([]),[weeks,setWeeks]=useState<string[]>([]);
 const [date,setDate]=useState(""),[week,setWeek]=useState("");
 const [rows,setRows]=useState<ReportRow[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{setMode(incoming);setLoaded(false);setRows([])},[incoming]);
 useEffect(()=>{let alive=true;(async()=>{
  const [d,w]=await Promise.all([
   supabase.from("labour_v2_date_options").select("labour_date").order("labour_date",{ascending:false}).limit(2000),
   supabase.from("labour_v2_week_options").select("labour_week").order("labour_week",{ascending:false}).limit(300)
  ]);
  if(!alive)return;
  if(d.error||w.error){setError(d.error?.message||w.error?.message||"Unable to load Access dates/weeks");return;}
  const ds=(d.data||[]).map(x=>x.labour_date);
  const ws=(w.data||[]).map(x=>x.labour_week);
  setDates(ds);setWeeks(ws);setDate(old=>old||ds[0]||"");setWeek(old=>old||ws[0]||"");
 })();return()=>{alive=false}},[]);
 function choose(valueMode:ReportMode){setMode(valueMode);setLoaded(false);setRows([]);setError("")}
 async function openReport(){
  setBusy(true);setError("");setLoaded(false);setRows([]);
  try{
   const isDaily=mode==="daily";
   if(isDaily&&!date)throw Error("Choose an existing Labour date.");
   if(!isDaily&&!week)throw Error("Choose an existing Labour week.");
   let request=isDaily?
    supabase.from("labour_v2_report_rows").select("source_type,source_id,labour_date,labour_week,report_farm,farm_name,tracecode_name,crop_name,activity_name,labour_qty,kgs,unit_cost,total_cost").eq("labour_date",date):
    supabase.from(mode==="ao"?"labour_v2_weekly_ao_report":"labour_v2_weekly_report").select("labour_week,report_farm,tracecode_name,crop_name,activity_name,total_labour_qty,total_kgs,unit_cost,avg_kgs_per_person,total_cost").eq("labour_week",week);
   const {data,error:dbError}=await request.order("report_farm").order("tracecode_name").order("activity_name").order("unit_cost").limit(2000);
   if(dbError)throw dbError;
   setRows((data||[]) as ReportRow[]);setLoaded(true);
  }catch(e:any){setError(e.message||"Unable to load Labour report")}
  finally{setBusy(false)}
 }
 const groups=useMemo(()=>{
  const out:{farm:string;traces:{name:string;crop:string;lines:ReportRow[]}[];rows:ReportRow[]}[]=[];
  for(const row of rows){
   const farm=mode==="daily"?(row.farm_name==="Florinova"?"Florinova":"Heyshott"):(row.report_farm||"Heyshott");
   let f=out.find(f=>f.farm===farm);if(!f){f={farm,traces:[],rows:[]};out.push(f);}
   f.rows.push(row);
   let t=f.traces.find(t=>t.name===row.tracecode_name&&t.crop===row.crop_name);
   if(!t){t={name:row.tracecode_name,crop:row.crop_name,lines:[]};f.traces.push(t);}
   t.lines.push(row);
  }return out;
 },[rows,mode]);
 const totalQty=rows.reduce((n,r)=>n+Number(mode==="daily"?r.labour_qty||0:r.total_labour_qty||0),0);
 const totalKgs=rows.reduce((n,r)=>n+Number(mode==="daily"?r.kgs||0:r.total_kgs||0),0);
 const totalValue=rows.reduce((n,r)=>n+Number(r.total_cost||0),0);
 const columns=mode==="daily"?dailyCols:weeklyCols;
 const reportTitle=mode==="daily"?"Labour Daily Report — "+formatJsplDate(date)+(rows.length?" · Week "+(rows[0].labour_week||""):""):mode==="ao"?"Agri Orange Weekly Labour Report — "+week:"Weekly Labour Report — "+week;
 // The report/export table includes the original farm group headings and totals.
 const printable=useMemo(()=>{
  const report:Record<string,unknown>[]=[];
  for(const f of groups){
   report.push({tracecode_name:"FARM: "+f.farm});
   for(const t of f.traces){
    report.push({tracecode_name:t.name,crop_name:t.crop});
    for(const line of t.lines)report.push(line);
   }
   report.push({tracecode_name:f.farm+" TOTAL",labour_qty:mode==="daily"?f.rows.reduce((s,r)=>s+Number(r.labour_qty||0),0):undefined,
   total_labour_qty:mode!=="daily"?f.rows.reduce((s,r)=>s+Number(r.total_labour_qty||0),0):undefined,
   kgs:mode==="daily"?f.rows.reduce((s,r)=>s+Number(r.kgs||0),0):undefined,
   total_kgs:mode!=="daily"?f.rows.reduce((s,r)=>s+Number(r.total_kgs||0),0):undefined,
   total_cost:f.rows.reduce((s,r)=>s+Number(r.total_cost||0),0)});
  }return report;
 },[groups,mode]);
 function printReport(){
  if(!loaded||!rows.length){setError("Open a report before printing.");return}
  try{labourPrintReport(reportTitle,columns,printable,totalValue)}catch(e:any){setError(e.message||"Unable to print")}
 }
 function exportExcel(){
  if(!loaded||!rows.length){setError("Open a report before exporting.");return}
  try{labourExportCSV(reportTitle,columns,printable,totalValue)}catch(e:any){setError(e.message||"Unable to export")}
 }
 return <ScrollView contentContainerStyle={styles.page}>
  <View style={styles.header}><View style={{flex:1}}><Text style={styles.head}>{mode==="daily"?"Daily Labour Report":mode==="ao"?"AO Weekly Labour Report":"Weekly Labour Report"}</Text><Text style={styles.headSub}>John Sole (Private) Limited</Text></View><Image style={styles.logo} source={require("../assets/images/jspl_farm_logo.png")}/></View>
  <View style={styles.nav}><Pressable onPress={()=>router.replace("/(tabs)/labour")} style={styles.back}><Text style={styles.backText}>← Labour Main</Text></Pressable></View>
  <View style={styles.selector}>
   <View style={styles.modes}><Pressable onPress={()=>choose("daily")} style={mode==="daily"?styles.selected:styles.switch}><Text style={mode==="daily"?styles.white:styles.dark}>Daily Report</Text></Pressable><Pressable onPress={()=>choose("weekly")} style={mode==="weekly"?styles.selected:styles.switch}><Text style={mode==="weekly"?styles.white:styles.dark}>Weekly Report</Text></Pressable><Pressable onPress={()=>choose("ao")} style={mode==="ao"?styles.selected:styles.switch}><Text style={mode==="ao"?styles.white:styles.dark}>AO Weekly</Text></Pressable></View>
   <Text style={styles.label}>{mode==="daily"?"Date":"Week"}</Text>
   <View style={styles.pick}><Picker selectedValue={mode==="daily"?date:week} onValueChange={x=>{mode==="daily"?setDate(String(x)):setWeek(String(x));setLoaded(false);setRows([])}}>
     <Picker.Item value="" label={mode==="daily"?"Select Date":"Select Week"}/>
     {mode==="daily"?dates.map(d=><Picker.Item key={d} value={d} label={formatJsplDate(d)}/>):weeks.map(w=><Picker.Item key={w} value={w} label={w}/>)}
   </Picker></View>
   <View style={styles.actions}>
    <Pressable style={styles.primary} onPress={openReport} disabled={busy}><Text style={styles.white}>{busy?"Opening…":"Open Report"}</Text></Pressable>
    <Pressable style={styles.button} disabled={!loaded||!rows.length} onPress={printReport}><Text style={[styles.dark,(!loaded||!rows.length)&&styles.disabled]}>Print{mode==="daily"?" Preview":""}</Text></Pressable>
    {mode!=="daily"&&<Pressable style={styles.button} disabled={!loaded||!rows.length} onPress={exportExcel}><Text style={[styles.dark,(!loaded||!rows.length)&&styles.disabled]}>Excel</Text></Pressable>}
   </View>
   {!!error&&<Text style={styles.error}>{error}</Text>}
   {busy&&<ActivityIndicator color={C.primary}/>}
  </View>
  {loaded&&<View style={styles.report}>
   <Text style={styles.reportHead}>{reportTitle}</Text>
   <View style={styles.tableScroll}><View style={[styles.table,{minWidth:mode==="daily"?940:1120}]}>
    <View style={styles.tableHeader}>{columns.map(c=><Text key={c.field} style={[styles.cell,styles.bold,{width:(100/columns.length)+"%"}]}>{c.label}</Text>)}</View>
    {groups.map(f=><View key={f.farm}>
      <View style={styles.farmHeader}><Text style={styles.farmText}>{f.farm}</Text></View>
      {f.traces.map(t=><View key={t.name+":"+t.crop}>
       <View style={styles.traceHeader}><Text style={styles.traceText}>{t.name}  ·  {t.crop}</Text></View>
       {t.lines.map((line,i)=><View key={String(line.source_id||i)+":"+i} style={styles.tableLine}>{columns.map(c=><Text key={c.field} style={[styles.cell,{width:(100/columns.length)+"%"}]}>{value(line,c.field)}</Text>)}</View>)}
      </View>)}
      <View style={styles.subtotal}><Text style={styles.subtotalText}>{f.farm} TOTAL  ·  Qty {formatJsplNumber(f.rows.reduce((n,r)=>n+Number(mode==="daily"?r.labour_qty||0:r.total_labour_qty||0),0),0)}  ·  Kgs {formatJsplNumber(f.rows.reduce((n,r)=>n+Number(mode==="daily"?r.kgs||0:r.total_kgs||0),0),0)}  ·  Value {money(f.rows.reduce((n,r)=>n+Number(r.total_cost||0),0))}</Text></View>
    </View>)}
   </View></View>
   <View style={styles.footer}><Text style={styles.footerText}>TOTAL  ·  Labour Qty {formatJsplNumber(totalQty,0)}  ·  Kgs {formatJsplNumber(totalKgs,0)}  ·  Value {money(totalValue)}</Text></View>
  </View>}
 </ScrollView>;
}
const styles=StyleSheet.create({
 page:{padding:18,gap:12,backgroundColor:C.background,flexGrow:1},
 header:{backgroundColor:C.primaryDark,borderRadius:10,padding:16,flexDirection:"row",alignItems:"center"},
 head:{fontSize:21,fontWeight:"800",color:"#FFF"},headSub:{fontSize:12,color:"#E1EDE4",marginTop:4},
 logo:{width:64,height:64,resizeMode:"contain",backgroundColor:"#FFF",borderRadius:7},
 nav:{flexDirection:"row",justifyContent:"flex-start"},
 back:{padding:10,borderWidth:1,borderColor:C.primary,borderRadius:7},
 backText:{fontWeight:"700",color:C.primaryDark},
 selector:{backgroundColor:"#FFF",borderWidth:1,borderColor:C.border,borderRadius:10,padding:14,gap:10},
 modes:{flexDirection:"row",flexWrap:"wrap",gap:8},
 switch:{borderWidth:1,borderColor:C.primary,borderRadius:7,padding:11},
 selected:{backgroundColor:C.primary,borderRadius:7,padding:12},
 white:{color:"#FFF",fontWeight:"700"},dark:{color:C.primaryDark,fontWeight:"700"},
 label:{fontSize:14,fontWeight:"700",color:C.text},
 pick:{borderWidth:1,borderColor:C.border,borderRadius:7},
 actions:{flexDirection:"row",flexWrap:"wrap",gap:8},
 primary:{backgroundColor:C.primary,padding:12,borderRadius:7,minWidth:115,alignItems:"center"},
 button:{borderWidth:1,borderColor:C.primary,padding:11,borderRadius:7,minWidth:90,alignItems:"center"},
 disabled:{opacity:.35},error:{color:C.danger,fontWeight:"700"},
 report:{padding:15,borderRadius:8,backgroundColor:"#FFF",borderWidth:1,borderColor:C.border,gap:10},
 reportHead:{fontSize:20,fontWeight:"800",color:C.primaryDark},
 tableScroll:{width:"100%",overflow:"scroll"},
 table:{minWidth:840},
 tableHeader:{flexDirection:"row",backgroundColor:"#DFE9E0",paddingVertical:9},
 cell:{width:"14.28%",paddingHorizontal:8,paddingVertical:6,fontSize:12,color:C.text,flexShrink:0},
 bold:{fontWeight:"800",color:C.primaryDark},
 farmHeader:{padding:8,backgroundColor:"#DCEADD"},
 farmText:{fontWeight:"800",color:C.primaryDark},
 traceHeader:{padding:8,backgroundColor:"#F3F7F3"},
 traceText:{fontWeight:"700",color:C.primaryDark},
 tableLine:{flexDirection:"row",borderBottomWidth:1,borderColor:C.border},
 subtotal:{backgroundColor:"#EEF5EF",padding:9},
 subtotalText:{color:C.primaryDark,fontWeight:"800",fontSize:12},
 footer:{backgroundColor:C.primaryDark,padding:13,borderRadius:7},
 footerText:{color:"#FFF",fontWeight:"800"}
});
