import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {useFocusEffect,useLocalSearchParams} from 'expo-router';
import {supabase} from '@/supabase';
import {JsplModuleHeader} from './JsplModuleHeader';
import {jsplColors as C,formatJsplDate,formatJsplNumber} from '@/constants/jspl-design';
import {labourPrintReport} from '@/lib/labour-report-export';
import {labourExportXLSX} from '@/lib/labour-xlsx-export';
import {labourColumns,LabourMode} from '@/utils/labour-period-report';
import {buildSeasonReport,loadLabourLists,loadSeasonEntries,reconcileSeason,seasonOptions,LabourLists,SeasonSelection} from '@/utils/labour-season-report';
const empty:LabourLists={seasons:[],farms:[],crops:[],fields:[],traces:[]};
const widths=[115,135,150,165,245,85,110,290],modes=[{id:'daily',label:'Daily'},{id:'weekly',label:'Weekly'},{id:'monthly',label:'Monthly'}];
const money=(n:number)=>'$'+formatJsplNumber(n);
export default function LabourSeasonReport(){
 const params=useLocalSearchParams<{mode?:string}>();
 const [selection,setSelection]=useState<SeasonSelection>({season:'',farm:'',crop:'',trace:'',mode:params.mode==='weekly'?'weekly':params.mode==='monthly'?'monthly':'daily'});
 const [lists,setLists]=useState<LabourLists>(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [report,setReport]=useState<ReturnType<typeof buildSeasonReport>|null>(null),[opened,setOpened]=useState<SeasonSelection|null>(null);
 const generation=useRef(0),alive=useRef(true);
 useEffect(()=>()=>{alive.current=false;generation.current++},[]);
 const refresh=useCallback(async()=>{const ticket=++generation.current;setLoading(true);setBusy(false);setError('');setReport(null);setOpened(null);
  try{const next=await loadLabourLists(supabase);if(!alive.current||ticket!==generation.current)return;setLists(next);setSelection(old=>reconcileSeason(next,old))}catch(e){if(alive.current&&ticket===generation.current){setLists(empty);setError((e as Error).message)}}finally{if(alive.current&&ticket===generation.current)setLoading(false)}
 },[]);
 useFocusEffect(useCallback(()=>{alive.current=true;void refresh();return()=>{generation.current++}},[refresh]));
 const change=(key:keyof SeasonSelection,value:string)=>{generation.current++;setReport(null);setOpened(null);setError('');setBusy(false);setSelection(old=>key==='season'?{...old,season:value,farm:'',crop:'',trace:''}:{...old,[key]:value})};
 const open=async()=>{if(!selection.season)return;const ticket=++generation.current,chosen={...selection};setBusy(true);setReport(null);setOpened(null);setError('');
  try{const rows=await loadSeasonEntries(supabase,lists,chosen);if(!alive.current||ticket!==generation.current)return;setReport(buildSeasonReport(rows,lists,chosen));setOpened(chosen)}catch(e){if(alive.current&&ticket===generation.current)setError((e as Error).message)}finally{if(alive.current&&ticket===generation.current)setBusy(false)}
 };
 const label=(key:'season'|'farm'|'crop'|'trace',value:string)=>key==='season'?lists.seasons.find(s=>String(s.season_id)===value)?.season_name:key==='farm'?lists.farms.find(f=>String(f.farm_id)===value)?.farm_name:key==='crop'?lists.crops.find(c=>String(c.crop_id)===value)?.crop_name:lists.traces.find(t=>String(t.tracecode_id)===value)?.tracecode_name;
 const title=opened?`Labour — ${label('season',opened.season)} — ${modes.find(m=>m.id===opened.mode)?.label} — ${label('farm',opened.farm)||'All farms'} — ${label('crop',opened.crop)||'All crops'} — ${label('trace',opened.trace)||'All traces'}`:'';
 const t=report?.totals,incomplete=!!(t&&(t.missingQty||t.missingValue));
 const qty=t?(t.entries&&t.missingQty===t.entries?'Not recorded':formatJsplNumber(t.qty,2)):'',value=t?(t.entries&&t.missingValue===t.entries?'Not recorded':money(t.value)):'';
 const warnings=t?[t.missingQty?`Missing Qty: ${t.missingQty}`:'',t.missingValue?`Missing Value: ${t.missingValue}`:''].filter(Boolean).join('; '):'';
 const rows=report?[...report.rows,{labour_date:'',report_farm:'',crop_name:'',tracecode_name:'',activity_name:incomplete?'Grand total (known amounts)':'Grand total',labour_qty:t!.entries&&t!.missingQty===t!.entries?'Not recorded':t!.qty,total_cost:t!.entries&&t!.missingValue===t!.entries?'Not recorded':t!.value,status:warnings,_kind:'subtotal'}]:[];
 const exportTitle=title+(incomplete?' — Known amounts only; missing values flagged':'')+(report?.missingMaster?' — Unassigned master links flagged':'');
 const excel=()=>{if(!report?.sourceRows)return;try{labourExportXLSX(exportTitle,labourColumns,rows)}catch(e){setError((e as Error).message)}};
 const print=()=>{if(!report?.sourceRows)return;try{labourPrintReport(exportTitle,labourColumns,rows,t!.value,undefined,{summary:`${incomplete?'Known totals':'Totals'}: Qty ${qty} · Value ${value}${warnings?' — '+warnings:''}`,landscape:true})}catch(e){setError((e as Error).message)}};
 const locked=loading||busy,seasonReady=lists.seasons.some(s=>String(s.season_id)===selection.season);
 const picker=(label:string,value:string,options:ReadonlyArray<{id:string|number;label:string}>,onChange:(value:string)=>void,disabled:boolean)=><View style={S.filter}><Text style={S.label}>{label}</Text><View style={S.picker}><Picker selectedValue={value} enabled={!disabled} onValueChange={v=>onChange(String(v))} style={S.pickerControl}>{options.map(option=><Picker.Item key={String(option.id)} label={option.label} value={String(option.id)}/>)}</Picker></View></View>;
 return <ScrollView contentContainerStyle={S.page}>
 <JsplModuleHeader title="Labour Reports" backLabel="Back to Labour" backHref="/(tabs)/labour"/>
 <View style={S.card}>
 {picker('Season',selection.season,[{id:'',label:'Choose season'},...[...lists.seasons].sort((a,b)=>a.season_name.localeCompare(b.season_name,'en',{numeric:true})).map(s=>({id:String(s.season_id),label:s.season_name}))],v=>change('season',v),locked)}
 <View style={S.filters}>
 {picker('Farm',selection.farm||'all',[{id:'all',label:'All farms'},...seasonOptions(lists,selection,'farm')],v=>change('farm',v==='all'?'':v),locked||!selection.season)}
 {picker('Crop',selection.crop||'all',[{id:'all',label:'All crops'},...seasonOptions(lists,selection,'crop')],v=>change('crop',v==='all'?'':v),locked||!selection.season)}
 {picker('Trace',selection.trace||'all',[{id:'all',label:'All traces'},...seasonOptions(lists,selection,'trace')],v=>change('trace',v==='all'?'':v),locked||!selection.season)}
 </View>
 <View style={S.filter}>{picker('Report period',selection.mode,modes,v=>change('mode',v as LabourMode),locked||!selection.season)}</View>
 <Text style={S.hint}>Daily, Weekly and Monthly group all recorded labour for the selected season. Farm, Crop and Trace come from their existing lists and saved links. Completed traces are included in season reports.</Text>
 <View style={S.actions}>
 <Pressable accessibilityRole="button" style={[S.primary,(locked||!seasonReady)&&S.disabled]} disabled={locked||!seasonReady} onPress={()=>void open()}><Text style={S.white}>{busy?'Opening…':'Open Report'}</Text></Pressable>
 <Pressable accessibilityRole="button" style={[S.button,(locked||!report?.sourceRows)&&S.disabled]} disabled={locked||!report?.sourceRows} onPress={excel}><Text style={S.green}>Export Excel</Text></Pressable>
 <Pressable accessibilityRole="button" style={[S.button,(locked||!report?.sourceRows)&&S.disabled]} disabled={locked||!report?.sourceRows} onPress={print}><Text style={S.green}>Print Preview</Text></Pressable>
 <Pressable accessibilityRole="button" style={[S.button,locked&&S.disabled]} disabled={locked} onPress={()=>void refresh()}><Text style={S.green}>Refresh Lists</Text></Pressable>
 </View>{locked?<ActivityIndicator color={C.primary}/>:null}{error?<Text style={S.error}>{error}</Text>:null}
 </View>
 {report?<View style={S.card}><Text style={S.title}>{title}</Text><Text style={S.total}>{incomplete?'Known totals':'Totals'} · Qty {qty} · Value {value} · {report.sourceRows} entries</Text>{warnings?<Text style={S.error}>{warnings}. Totals include recorded amounts only.</Text>:null}{report.missingMaster?<Text style={S.error}>{report.missingMaster} entries have an unassigned Farm or Crop link. They remain included and are flagged in the report.</Text>:null}
 {!report.sourceRows?<Text>No labour recorded for this season and selection.</Text>:<ScrollView horizontal><View style={{minWidth:widths.reduce((a,b)=>a+b,0)}}><View style={S.header}>{labourColumns.map((c,i)=><Text key={c.field} style={[S.cell,S.white,{width:widths[i]}]}>{c.label}</Text>)}</View>
 {rows.map((row,n)=><View key={n} style={[S.line,row._kind==='subtotal'&&S.subtotal]}>{labourColumns.map((c,i)=>{let v=(row as any)[c.field];if(c.field==='labour_date'&&opened?.mode==='daily'&&v)v=formatJsplDate(v);if(typeof v==='number')v=c.field==='total_cost'?money(v):formatJsplNumber(v,2);return <Text key={c.field} style={[S.cell,{width:widths[i]},(i===5||i===6)&&S.numeric,row._kind==='subtotal'&&S.bold]}>{v??''}</Text>})}</View>)}
 </View></ScrollView>}</View>:null}
 </ScrollView>;
}
const S=StyleSheet.create({page:{padding:20,gap:14,backgroundColor:C.background,flexGrow:1},card:{backgroundColor:'#FFF',padding:16,borderWidth:1,borderColor:C.border,borderRadius:10,gap:12},filters:{flexDirection:'row',flexWrap:'wrap',gap:16},filter:{flex:1,minWidth:210},label:{fontSize:14,fontWeight:'700',color:C.text},picker:{borderWidth:1,borderColor:C.border,borderRadius:7,backgroundColor:'#FFF',minHeight:50,justifyContent:'center'},pickerControl:{height:50,width:'100%',color:C.text},actions:{flexDirection:'row',flexWrap:'wrap',gap:10},primary:{backgroundColor:C.primary,padding:12,borderRadius:7},button:{borderWidth:1,borderColor:C.primary,padding:12,borderRadius:7},white:{color:'#FFF',fontWeight:'700'},green:{color:C.primaryDark,fontWeight:'700'},disabled:{opacity:.4},hint:{fontSize:12,color:C.textSecondary},error:{color:C.danger,fontWeight:'700'},title:{fontSize:18,fontWeight:'800',color:C.primaryDark},total:{fontSize:15,fontWeight:'700',color:C.primaryDark},header:{flexDirection:'row',backgroundColor:C.primaryDark},cell:{fontSize:12,paddingHorizontal:9,paddingVertical:8,color:C.text},line:{flexDirection:'row',borderBottomWidth:1,borderColor:C.border},subtotal:{backgroundColor:'#E9F1EB'},numeric:{textAlign:'right'},bold:{fontWeight:'700'}});
