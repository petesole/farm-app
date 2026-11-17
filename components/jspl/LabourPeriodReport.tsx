import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams} from 'expo-router';
import {supabase} from '@/supabase';
import {JsplModuleHeader} from './JsplModuleHeader';
import {JsplSearchCombo} from './JsplSearchCombo';
import {jsplColors as C,formatJsplDate,formatJsplNumber} from '@/constants/jspl-design';
import {labourPrintReport} from '@/lib/labour-report-export';
import {labourExportXLSX} from '@/lib/labour-xlsx-export';
import {buildLabourReport,labourColumns,labourEntryColumns,labourIndexColumns,labourOptions,loadLabourPages,repairLabourSelection,LabourIndex,LabourSelection,LabourMode} from '@/utils/labour-period-report';

const widths=[115,135,150,165,245,85,110,290];
const money=(v:number)=>'$'+formatJsplNumber(v);
const periodLabel=(value:string,mode:LabourMode)=>mode==='daily'?formatJsplDate(value):mode==='weekly'?'Week '+value:new Date(value+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
export default function LabourPeriodReport(){
 const params=useLocalSearchParams<{mode?:string}>();
 const initial=():LabourSelection=>({mode:params.mode==='monthly'?'monthly':params.mode==='weekly'||params.mode==='ao'?'weekly':'daily',period:'',farm:params.mode==='ao'?'AgriOrange':'',crop:'',trace:''});
 const [selection,setSelection]=useState<LabourSelection>(initial),[index,setIndex]=useState<LabourIndex[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [report,setReport]=useState<ReturnType<typeof buildLabourReport>|null>(null),[opened,setOpened]=useState<LabourSelection|null>(null);
 const generation=useRef(0),alive=useRef(true);
 useEffect(()=>()=>{alive.current=false;generation.current++},[]);
 const refresh=useCallback(async()=>{
  const id=++generation.current;setLoading(true);setBusy(false);setReport(null);setOpened(null);setError('');
  try{const rows=await loadLabourPages(supabase,labourIndexColumns);if(!alive.current||id!==generation.current)return;setIndex(rows);setSelection(old=>{const next=repairLabourSelection(rows,old);const periods=labourOptions(rows,next,'period');return {...next,period:periods.some(p=>p.id===next.period)?next.period:periods[0]?.id??''}})}
  catch(e){if(alive.current&&id===generation.current){setIndex([]);setError((e as Error).message)}}finally{if(alive.current&&id===generation.current)setLoading(false)}
 },[]);
 useFocusEffect(useCallback(()=>{alive.current=true;void refresh();return()=>{generation.current++}},[refresh]));
 const change=(key:'period'|'farm'|'crop'|'trace',value:string)=>{
  generation.current++;setReport(null);setOpened(null);setError('');setBusy(false);
  setSelection(old=>{
   let next={...old,[key]:value};if(key==='farm'){next.crop='';next.trace=''}else if(key==='crop')next.trace='';
   if(key==='period')next=repairLabourSelection(index,next);
   return next;
  });
 };
 const changeMode=(mode:LabourMode)=>{generation.current++;setReport(null);setOpened(null);setError('');setBusy(false);setSelection(old=>{const next={...old,mode,period:''};return {...next,period:labourOptions(index,next,'period')[0]?.id??''}})};
 const openReport=async()=>{
  const id=++generation.current,chosen={...selection};setBusy(true);setError('');setReport(null);setOpened(null);
  try{const rows=await loadLabourPages(supabase,labourEntryColumns,chosen);if(!alive.current||id!==generation.current)return;setReport(buildLabourReport(rows,chosen));setOpened(chosen)}
  catch(e){if(alive.current&&id===generation.current)setError((e as Error).message)}finally{if(alive.current&&id===generation.current)setBusy(false)}
 };
 const title=opened?'Labour '+periodLabel(opened.period,opened.mode)+' — '+(opened.farm||'All farms')+' — '+(opened.crop||'All crops')+' — '+(index.find(r=>String(r.tracecode_id)===opened.trace)?.tracecode_name||'All traces'):'';
 const totals=report?.totals;
 const quantity=totals?(totals.missingQty===totals.entries&&totals.entries?'Not recorded':formatJsplNumber(totals.qty,2)):'';
 const value=totals?(totals.missingValue===totals.entries&&totals.entries?'Not recorded':money(totals.value)):'';
 const incomplete=!!(totals&&(totals.missingQty||totals.missingValue));
 const warnings=totals?[totals.missingQty?`${totals.missingQty} entries have no recorded quantity`:'',totals.missingValue?`${totals.missingValue} entries have no recorded value`:''].filter(Boolean).join('; '):'';
 const exportRows=report?[
  ...report.rows,
  {labour_date:'',report_farm:'',crop_name:'',tracecode_name:'',activity_name:incomplete?'Grand total (known amounts)':'Grand total',labour_qty:totals!.missingQty===totals!.entries?'Not recorded':totals!.qty,total_cost:totals!.missingValue===totals!.entries?'Not recorded':totals!.value,status:[totals!.missingQty?`Missing Qty: ${totals!.missingQty}`:'',totals!.missingValue?`Missing Value: ${totals!.missingValue}`:''].filter(Boolean).join('; '),_kind:'subtotal'}
 ]:[];
 const exportTitle=title+(incomplete?' — Incomplete costs/quantities; totals show recorded amounts':'');
 const excel=()=>{if(!report?.sourceRows)return;try{labourExportXLSX(exportTitle,labourColumns,exportRows)}catch(e){setError((e as Error).message)}};
 const print=()=>{if(!report?.sourceRows)return;try{labourPrintReport(exportTitle,labourColumns,exportRows,totals!.value,undefined,{summary:`${incomplete?'Known totals':'Totals'}: Qty ${quantity} · Value ${value}${warnings?' — '+warnings:''}`,landscape:true})}catch(e){setError((e as Error).message)}};
 const locked=loading||busy;
 const selector=(key:'farm'|'crop'|'trace',label:string,all:string)=><View style={S.filter}><JsplSearchCombo label={label} selector="product" value={selection[key]||'all'} disabled={locked} options={[{id:'all',label:all},...labourOptions(index,selection,key)]} onChange={v=>change(key,v==='all'?'':String(v??''))}/></View>;
 return <ScrollView contentContainerStyle={S.page}>
 <JsplModuleHeader title="Labour Reports" backLabel="Back to Labour" backHref="/(tabs)/labour"/>
 <View style={S.card}>
 <View style={S.filters}><View style={S.filter}><JsplSearchCombo label="Report period" selector="product" value={selection.mode} disabled={locked} options={[{id:'daily',label:'Daily'},{id:'weekly',label:'Weekly'},{id:'monthly',label:'Monthly'}]} onChange={v=>changeMode((v??'daily') as LabourMode)}/></View>
 <View style={S.filter}><JsplSearchCombo label={selection.mode==='daily'?'Date':selection.mode==='weekly'?'Week':'Month'} selector="product" value={selection.period||null} disabled={locked} options={labourOptions(index,selection,'period').map(p=>({...p,label:periodLabel(p.id,selection.mode)}))} onChange={v=>change('period',String(v??''))}/></View></View>
 <View style={S.filters}>{selector('farm','Farm','All farms')}{selector('crop','Crop','All crops')}{selector('trace','Trace','All traces')}</View>
 <Text style={S.hint}>Only matching choices are listed. Historical records are included for the selected period. Weekly reports follow the existing labour weeks; monthly reports use calendar months.</Text>
 <View style={S.actions}>
 <Pressable accessibilityRole="button" disabled={locked||!selection.period} style={[S.primary,(locked||!selection.period)&&S.disabled]} onPress={()=>void openReport()}><Text style={S.white}>{busy?'Opening…':'Open Report'}</Text></Pressable>
 <Pressable accessibilityRole="button" disabled={locked||!report?.sourceRows} style={[S.button,(locked||!report?.sourceRows)&&S.disabled]} onPress={excel}><Text style={S.green}>Export Excel</Text></Pressable>
 <Pressable accessibilityRole="button" disabled={locked||!report?.sourceRows} style={[S.button,(locked||!report?.sourceRows)&&S.disabled]} onPress={print}><Text style={S.green}>Print Preview</Text></Pressable>
 <Pressable accessibilityRole="button" disabled={locked} style={[S.button,locked&&S.disabled]} onPress={()=>void refresh()}><Text style={S.green}>Refresh Records</Text></Pressable>
 </View>{locked?<ActivityIndicator color={C.primary}/>:null}{loading?<Text style={S.hint}>Loading available report choices…</Text>:null}
 {error?<Text style={S.error}>{error}</Text>:null}
 </View>
 {report?<View style={S.card}><Text style={S.title}>{title}</Text>
 <Text style={S.total}>{incomplete?'Known totals':'Totals'} · Qty {quantity} · Value {value} · {report.sourceRows} entries</Text>
 {warnings?<Text style={S.error}>{warnings}. Missing amounts are not treated as zero; totals include recorded amounts only.</Text>:null}
 {!report.sourceRows?<Text>No labour records match this selection.</Text>:<>
 <Text style={S.hint}>{opened?.mode==='daily'?'Dated labour entries':'Combined totals by allocation'} with trace, crop and farm subtotals. Value is recorded labour cost in USD.</Text>
 <ScrollView horizontal><View style={{minWidth:widths.reduce((a,b)=>a+b,0)}}>
 <View style={S.header}>{labourColumns.map((c,i)=><Text key={c.field} style={[S.cell,S.headerText,{width:widths[i]}]}>{c.label}</Text>)}</View>
 {exportRows.map((row,n)=><View key={n} style={[S.line,row._kind==='subtotal'&&S.subtotal]}>{labourColumns.map((c,i)=>{let v=(row as any)[c.field];if(c.field==='labour_date')v=opened?.mode==='daily'&&v?formatJsplDate(v):v;if(typeof v==='number')v=c.field==='total_cost'?money(v):formatJsplNumber(v,2);return <Text key={c.field} style={[S.cell,{width:widths[i]},i===5||i===6?S.numeric:null,row._kind==='subtotal'&&S.bold]}>{v??''}</Text>})}</View>)}
 </View></ScrollView></>}
 </View>:null}
 </ScrollView>;
}
const S=StyleSheet.create({page:{padding:20,gap:14,backgroundColor:C.background,flexGrow:1},card:{backgroundColor:'#FFF',padding:16,borderWidth:1,borderColor:C.border,borderRadius:10,gap:12},filters:{flexDirection:'row',flexWrap:'wrap',gap:16},filter:{flex:1,minWidth:210},actions:{flexDirection:'row',flexWrap:'wrap',gap:10},primary:{backgroundColor:C.primary,padding:12,borderRadius:7},button:{borderWidth:1,borderColor:C.primary,padding:12,borderRadius:7},white:{color:'#FFF',fontWeight:'700'},green:{color:C.primaryDark,fontWeight:'700'},disabled:{opacity:.4},hint:{fontSize:12,color:C.textSecondary},error:{color:C.danger,fontWeight:'700'},title:{fontSize:18,fontWeight:'800',color:C.primaryDark},total:{fontSize:15,fontWeight:'700',color:C.primaryDark},header:{flexDirection:'row',backgroundColor:C.primaryDark},headerText:{color:'#FFF',fontWeight:'700'},cell:{fontSize:12,paddingHorizontal:9,paddingVertical:8,color:C.text},line:{flexDirection:'row',borderBottomWidth:1,borderColor:C.border},subtotal:{backgroundColor:'#E9F1EB'},numeric:{textAlign:'right'},bold:{fontWeight:'700'}});
