import { useLocalSearchParams } from "expo-router";
import { JsplSearchCombo } from "@/components/jspl/JsplSearchCombo";
import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {parseJsplDateInput, displayJsplDate} from "@/utils/jspl-input";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import { supabase } from "@/supabase";
import { jsplColors as C, formatJsplDate, formatJsplNumber } from "@/constants/jspl-design";

type HistoryRow={source_type:string;source_id:number;labour_date:string;tracecode_id:number;tracecode_name:string;activity_id:number;activity_name:string;labour_qty:number;kgs:number|null;unit_cost:number;total_cost:number;crop_name:string};
type Activity={activity_id:number;activity_name:string;active:boolean};
type Trace={tracecode_id:number;tracecode_name:string;access_tc_id:number|null};
function iso(s:string):string|null{return parseJsplDateInput(s)}
function amount(n:number|null|undefined){return "$"+formatJsplNumber(Number(n||0))}
export default function LabourHistory(){
 const context=useLocalSearchParams<{date?:string}>();
 const [dates,setDates]=useState<string[]>([]);
 useEffect(()=>{let alive=true;void supabase.from("labour_v2_date_options").select("labour_date").order("labour_date",{ascending:false}).limit(2000).then(r=>{if(!alive)return;if(r.error)setError(r.error.message);else setDates((r.data||[]).map(x=>x.labour_date))});return()=>{alive=false}},[]);
 const [rows,setRows]=useState<HistoryRow[]>([]),[date,setDate]=useState(context.date||""),[loading,setLoading]=useState(false),[error,setError]=useState(""),[isAdmin,setIsAdmin]=useState(false);
 useEffect(()=>{(async()=>{const r=await supabase.rpc("my_farm_app_roles");if(r.error){setError(r.error.message);return;}setIsAdmin((r.data||[]).includes("admin"));})()},[]);
 async function fetchHistory(){setError("");setLoading(true);try{const selected=iso(date.trim());if(date.trim()&&!selected)throw Error("Enter a valid date.");let req=supabase.from("labour_v2_report_rows").select("source_type,source_id,labour_date,tracecode_id,tracecode_name,activity_id,activity_name,labour_qty,kgs,unit_cost,total_cost,crop_name").order("source_id",{ascending:false}).limit(250);if(selected)req=req.eq("labour_date",selected);const {data,error:e}=await req;if(e)throw e;setRows(data||[])}catch(e:any){setError(e.message||"Unable to load history")}finally{setLoading(false)}}
 useFocusEffect(useCallback(()=>{void fetchHistory()},[date]));

 const selectedDate=iso(date);
 const canAdd=isAdmin && !loading && rows.some(row=>row.labour_date===selectedDate);

 return <ScrollView contentContainerStyle={styles.page}>
 <JsplModuleHeader title="Labour Input History" backLabel="Back to Labour" backHref="/(tabs)/labour" />
 {!!error&&<Text style={styles.error}>{error}</Text>}
 <View style={styles.panel}><Text style={styles.label}>Labour Date (dd/mm/yyyy) — leave blank for latest 250</Text><View style={styles.row}><View style={{flex:1,minWidth:180}}><JsplSearchCombo label="Labour Date" selector="product" options={dates.map(d=>({id:displayJsplDate(d),label:displayJsplDate(d)}))} value={date} onChange={v=>setDate(String(v??""))} placeholder="Search dates or clear for latest" /></View><Pressable style={styles.primary} onPress={fetchHistory}><Text style={styles.white}>Search History</Text></Pressable></View>
 {canAdd&&<Pressable accessibilityRole="button" style={styles.button} onPress={()=>router.push({pathname:"/labour-correction",params:{workDate:selectedDate!,historyDate:date}})}><Text style={styles.btn}>Add Line to Saved Date</Text></Pressable>}
 {loading?<ActivityIndicator/>:<Text style={styles.hint}>{rows.length} records displayed · Access originals are retained when Admin saves a correction</Text>}</View>

 <ScrollView horizontal contentContainerStyle={{minWidth:"100%"}}>
  <View style={{minWidth:1050,width:"100%",backgroundColor:"#FFF",borderWidth:1,borderColor:C.border,borderRadius:8}}>
   <View style={styles.historyHeader}>
    <Text style={[styles.historyCell,{width:90}]}>ID</Text>
    <Text style={[styles.historyCell,{width:100}]}>Date</Text>
    <Text style={[styles.historyCell,{width:135}]}>Field</Text>
    <Text style={[styles.historyCell,{width:110}]}>Crop</Text>
    <Text style={[styles.historyCell,{flex:1}]}>Labour Activity</Text>
    <Text style={[styles.historyCell,{width:72}]}>Qty</Text>
    <Text style={[styles.historyCell,{width:75}]}>Kgs</Text>
    <Text style={[styles.historyCell,{width:90}]}>Unit Cost</Text>
    {isAdmin&&<Text style={[styles.historyCell,{width:85}]}>Action</Text>}
   </View>
   {rows.map(r=><View key={r.source_type+":"+r.source_id} style={styles.historyLine}>
    <Text style={[styles.historyCell,{width:90}]}>{r.source_type === "Access" ? r.source_id : "App " + r.source_id}</Text>
    <Text style={[styles.historyCell,{width:100}]}>{formatJsplDate(r.labour_date)}</Text>
    <Text style={[styles.historyCell,{width:135}]}>{r.tracecode_name}</Text>
    <Text style={[styles.historyCell,{width:110}]}>{r.crop_name}</Text>
    <Text style={[styles.historyCell,{flex:1}]}>{r.activity_name}</Text>
    <Text style={[styles.historyCell,{width:72}]}>{r.labour_qty}</Text>
    <Text style={[styles.historyCell,{width:75}]}>{r.kgs??"—"}</Text>
    <Text style={[styles.historyCell,{width:90}]}>{amount(r.unit_cost)}</Text>
    {isAdmin&&<View style={{width:85,padding:4}}>{(r.source_type==="App"||r.source_type==="Access")&&<Pressable accessibilityRole="button" accessibilityLabel={"Edit Labour Line "+r.source_id} style={styles.button} onPress={()=>router.push({pathname:"/labour-correction",params:{recordId:String(r.source_id),source:r.source_type,historyDate:date||displayJsplDate(r.labour_date)}})}><Text style={styles.btn}>Edit</Text></Pressable>}</View>}
   </View>)}
  </View>
 </ScrollView>
 </ScrollView>
}
const styles=StyleSheet.create({historyHeader:{flexDirection:"row",backgroundColor:"#DCEADD",borderBottomWidth:1,borderColor:C.border,paddingVertical:7},historyLine:{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderColor:C.border,minHeight:42},historyCell:{paddingHorizontal:7,color:C.text,fontSize:12,fontWeight:"500"},page:{padding:22,gap:14,backgroundColor:C.background,flexGrow:1},header:{backgroundColor:C.primaryDark,borderRadius:12,padding:18,flexDirection:"row",gap:12,alignItems:"center"},headerTitle:{fontSize:23,fontWeight:"800",color:"#FFF"},sub:{color:"#E2EEE5",marginTop:5},logo:{width:65,height:65,resizeMode:"contain",backgroundColor:"#FFF",borderRadius:8},row:{flexDirection:"row",gap:10,flexWrap:"wrap",alignItems:"center"},panel:{backgroundColor:"#FFF",borderWidth:1,borderColor:C.border,borderRadius:10,padding:15,gap:10},line:{flexDirection:"row",gap:12,alignItems:"center",backgroundColor:"#FFF",borderRadius:8,borderWidth:1,borderColor:C.border,padding:12},title:{color:C.primaryDark,fontWeight:"700",fontSize:15},label:{color:C.text,fontWeight:"700"},hint:{color:C.textSecondary,fontSize:12},input:{borderWidth:1,borderColor:C.border,borderRadius:7,padding:10,minWidth:110,backgroundColor:"#FFF",color:C.text},picker:{borderWidth:1,borderColor:C.border,borderRadius:7,overflow:"hidden"},primary:{backgroundColor:C.primary,borderRadius:7,padding:12},white:{color:"#FFF",fontWeight:"700"},button:{borderWidth:1,borderColor:C.primary,borderRadius:7,padding:11},btn:{color:C.primaryDark,fontWeight:"700"},error:{color:C.danger,fontWeight:"700"}});
