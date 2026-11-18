import {useCallback,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,FlatList,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useFocusEffect,useLocalSearchParams} from 'expo-router';
import {supabase} from '@/supabase';
import {JsplModuleHeader} from './JsplModuleHeader';
import {JsplSearchCombo} from './JsplSearchCombo';
import {jsplColors as C,formatJsplDate,formatJsplNumber} from '@/constants/jspl-design';
import {labourPrintReport} from '@/lib/labour-report-export';
import {labourExportXLSX} from '@/lib/labour-xlsx-export';
import {labourColumns,LabourMode} from '@/utils/labour-period-report';
import {allocationOptions,buildAllocationReport,loadAllocationReport,repairAllocationFilters,AllocationFilters} from '@/utils/labour-season-report';

const columns=[labourColumns[0],{label:'Company',field:'company'},...labourColumns.slice(1)];
const widths=[115,75,135,150,165,245,85,110,250];
const tableWidth=widths.reduce((a,b)=>a+b,0);
const modes=[{id:'daily',label:'Daily'},{id:'weekly',label:'Weekly'},{id:'monthly',label:'Monthly'}];
const filters=[
 {key:'season',label:'Season',all:'All seasons'},
 {key:'farm',label:'Farm',all:'All farms'},
 {key:'crop',label:'Crop',all:'All crops'},
 {key:'trace',label:'Trace',all:'All traces'},
 {key:'company',label:'Company',all:'AO and JS'},
 {key:'activity',label:'Activity',all:'All activities'},
] as const;
const money=(n:number)=>'$'+formatJsplNumber(n);

export default function LabourSeasonReport(){
 const params=useLocalSearchParams<{mode?:string}>();
 const [selection,setSelection]=useState<AllocationFilters>({
  season:'',farm:'',crop:'',trace:'',company:params.mode==='ao'?'AO':'',activity:'',
  mode:params.mode==='weekly'||params.mode==='ao'?'weekly':params.mode==='monthly'?'monthly':'daily',
 });
 const [entries,setEntries]=useState<Awaited<ReturnType<typeof loadAllocationReport>>>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const generation=useRef(0);
 const refresh=useCallback(async()=>{
  const ticket=++generation.current;
  setLoading(true);
  setError('');
  try{
   const next=await loadAllocationReport(supabase);
   if(ticket!==generation.current)return;
   setEntries(next);
   setSelection(old=>repairAllocationFilters(next,old));
  }catch(e){
   if(ticket===generation.current)setError((e as Error).message);
  }finally{
   if(ticket===generation.current)setLoading(false);
  }
 },[]);
 useFocusEffect(useCallback(()=>{void refresh();return()=>{generation.current++}},[refresh]));
 const options=useMemo(()=>Object.fromEntries(filters.map(({key})=>[key,allocationOptions(entries,selection,key)] as const)),[entries,selection]);
 const report=useMemo(()=>buildAllocationReport(entries,selection),[entries,selection]);
 const t=report.totals,incomplete=!!(t.missingQty||t.missingValue);
 const qty=t.entries&&t.missingQty===t.entries?'Not recorded':formatJsplNumber(t.qty,2);
 const value=t.entries&&t.missingValue===t.entries?'Not recorded':money(t.value);
 const warnings=[t.missingQty?`Missing Qty: ${t.missingQty}`:'',t.missingValue?`Missing Value: ${t.missingValue}`:''].filter(Boolean).join('; ');
 const detail=filters.map(({key})=>options[key].find(x=>x.id===selection[key])?.label).filter(Boolean);
 const title=['Labour',modes.find(m=>m.id===selection.mode)?.label,...detail].join(' — ');
 const exportTitle=title+(incomplete?' — Known amounts only':'');
 const rows=useMemo(()=>[...report.rows,{
  labour_date:'',company:'',report_farm:'',crop_name:'',tracecode_name:'',
  activity_name:incomplete?'Grand total (known amounts)':'Grand total',
  labour_qty:t.entries&&t.missingQty===t.entries?'Not recorded':t.qty,
  total_cost:t.entries&&t.missingValue===t.entries?'Not recorded':t.value,status:warnings,_kind:'subtotal',entries:t.entries,
 }],[report,t,incomplete,warnings]);
 const exportRows=()=>rows.map(row=>({...row,labour_date:selection.mode==='daily'&&row.labour_date?formatJsplDate(row.labour_date):row.labour_date}));
 const excel=()=>{try{labourExportXLSX(exportTitle,columns,exportRows())}catch(e){setError((e as Error).message)}};
 const print=()=>{try{labourPrintReport(exportTitle,columns,exportRows(),t.value,undefined,{summary:`Qty ${qty} · Value ${value}${warnings?' · '+warnings:''}`,landscape:true})}catch(e){setError((e as Error).message)}};
 return <View style={S.page}>
 <JsplModuleHeader title="Labour Reports" backLabel="Back to Labour" backHref="/(tabs)/labour"/>
 <View style={S.card}>
 <View style={S.filters}>
 {filters.map(({key,label,all})=><View key={key} style={S.filter}><JsplSearchCombo label={label} selector="product"
  value={selection[key]||'all'} disabled={loading} options={[{id:'all',label:all},...options[key]]}
  onChange={v=>setSelection(old=>({...old,[key]:v==='all'?'':String(v??'')}))}/></View>)}
 <View style={S.filter}><JsplSearchCombo label="Report period" selector="product" value={selection.mode}
  disabled={loading} options={modes} onChange={v=>setSelection(old=>({...old,mode:(v??'daily') as LabourMode}))}/></View>
 </View>
 <View style={S.actions}>
 <Pressable accessibilityRole="button" style={[S.button,(loading||!report.sourceRows)&&S.disabled]} disabled={loading||!report.sourceRows} onPress={excel}><Text style={S.green}>Export Excel</Text></Pressable>
 <Pressable accessibilityRole="button" style={[S.button,(loading||!report.sourceRows)&&S.disabled]} disabled={loading||!report.sourceRows} onPress={print}><Text style={S.green}>Print Preview</Text></Pressable>
 <Pressable accessibilityRole="button" style={[S.button,loading&&S.disabled]} disabled={loading} onPress={()=>void refresh()}><Text style={S.green}>Refresh</Text></Pressable>
 </View>
 {error?<Text style={S.error}>{error}</Text>:null}
 </View>
 {loading&&!entries.length?<ActivityIndicator color={C.primary}/>:<View style={[S.card,{flex:1,minHeight:0}]}>
 <Text style={S.title}>{title}</Text>
 <Text style={S.total}>{incomplete?'Known totals':'Totals'} · Qty {qty} · Value {value} · {report.sourceRows} allocations</Text>
 {warnings?<Text style={S.error}>{warnings}. Totals include recorded amounts only.</Text>:null}
 {report.missingMaster?<Text style={S.error}>{report.missingMaster} allocations have missing master links.</Text>:null}
 {!report.sourceRows?<Text>No labour matches these filters.</Text>:<ScrollView horizontal style={{flex:1}}>
 <View style={{width:tableWidth,flex:1}}>
 <View style={S.header}>{columns.map((c,i)=><Text key={c.field} style={[S.cell,S.white,{width:widths[i]}]}>{c.label}</Text>)}</View>
 <FlatList data={rows} keyExtractor={(_,i)=>String(i)} initialNumToRender={30} renderItem={({item:row})=><View style={[S.line,row._kind==='subtotal'&&S.subtotal]}>
 {columns.map((c,i)=>{let v=row[c.field as keyof typeof row];if(c.field==='labour_date'&&selection.mode==='daily'&&v)v=formatJsplDate(String(v));if(typeof v==='number')v=c.field==='total_cost'?money(v):formatJsplNumber(v,2);
 return <Text key={c.field} style={[S.cell,{width:widths[i]},(c.field==='labour_qty'||c.field==='total_cost')&&S.numeric,row._kind==='subtotal'&&S.bold]}>{v??''}</Text>})}
 </View>}/>
 </View></ScrollView>}
 </View>}
 </View>;
}
const S=StyleSheet.create({page:{padding:20,gap:14,backgroundColor:C.background,flex:1},card:{backgroundColor:'#FFF',padding:16,borderWidth:1,borderColor:C.border,borderRadius:10,gap:12},filters:{flexDirection:'row',flexWrap:'wrap',gap:16},filter:{flex:1,minWidth:210},actions:{flexDirection:'row',flexWrap:'wrap',gap:10},button:{borderWidth:1,borderColor:C.primary,padding:12,borderRadius:7},white:{color:'#FFF',fontWeight:'700'},green:{color:C.primaryDark,fontWeight:'700'},disabled:{opacity:.4},error:{color:C.danger,fontWeight:'700'},title:{fontSize:18,fontWeight:'800',color:C.primaryDark},total:{fontSize:15,fontWeight:'700',color:C.primaryDark},header:{flexDirection:'row',backgroundColor:C.primaryDark},cell:{fontSize:12,paddingHorizontal:9,paddingVertical:8,color:C.text},line:{flexDirection:'row',borderBottomWidth:1,borderColor:C.border},subtotal:{backgroundColor:'#E9F1EB'},numeric:{textAlign:'right'},bold:{fontWeight:'700'}});
