import {WbAdminSignIn} from '../components/jspl/WbAdminSignIn';
import {WbModuleHeader} from '../components/jspl/WbModuleHeader';
import {WbLastSync} from '../components/jspl/WbLastSync';
import {WbAddDnotes} from '../components/jspl/WbAddDnotes';
import {JsplSearchCombo} from '../components/jspl/JsplSearchCombo';
import {wbFormatDate} from '../utils/wb-date';
import {DnoteLoad,RegisterRaw,groupDnoteLoads,dnoteCsv} from '../utils/wb-dnote-register';
import {jsplColors as C} from '../constants/jspl-design';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Platform,Pressable,ScrollView,Text,View} from 'react-native';
import {supabase} from '../supabase';

const n=(x:number)=>Number(x).toLocaleString('en-US',{maximumFractionDigits:2});
export default function DailyDnotes(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[season,setSeason]=useState('all'),[day,setDay]=useState('all'),[trace,setTrace]=useState('all');
 const [data,setData]=useState<RegisterRaw[]>([]),[seasonNames,setSeasonNames]=useState<{season_id:number;season_name:string}[]>([]);
 const [sortCol,setSortCol]=useState('date'),[sortAsc,setSortAsc]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [missing,setMissing]=useState(true),[editor,setEditor]=useState(false),[notice,setNotice]=useState(''),[refreshKey,setRefreshKey]=useState(0);
 const generation=useRef(0);
 useEffect(()=>{if(Platform.OS!=='web'){setAllowed(false);return;}let alive=true;(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!alive)return;if(!user){setAllowed(false);return;}const r=await supabase.rpc('wb_admin_allowed');if(alive){setAllowed(r.data===true&&!r.error);if(r.error)setError(r.error.message);}})();return()=>{alive=false;};},[]);
 const refresh=useCallback(async()=>{
  const id=++generation.current;setLoading(true);
  try{
   const rows:RegisterRaw[]=[];
   // Fetch every page. A fixed 20,000-row truncation could falsely mark notes missing.
   for(let from=0;;from+=1000){
    const r=await supabase.from('wb_daily_dnote_register_v').select('*').order('report_date',{ascending:false}).order('expected_id',{nullsFirst:false}).order('source').order('source_id').order('tracecode_id').range(from,from+999);
    if(r.error)throw r.error;
    const page=(r.data||[]) as RegisterRaw[];rows.push(...page);if(page.length<1000)break;
   }
   const s=await supabase.from('season').select('season_id,season_name');if(s.error)throw s.error;
   if(id===generation.current){setData(rows);setSeasonNames(s.data||[]);setRefreshKey(key=>key+1);setError('');}
  }catch(e){if(id===generation.current)setError((e as {message?:string}).message||'Unable to refresh DNotes. Previously loaded data is retained.');throw e;}
  finally{if(id===generation.current)setLoading(false);}
 },[]);
 useEffect(()=>{if(!allowed)return;const update=()=>{void refresh().catch(()=>{});};update();const timer=setInterval(update,30000);const focus=()=>{if(document.visibilityState==='visible')update();};if(typeof document!=='undefined')document.addEventListener('visibilitychange',focus);return()=>{clearInterval(timer);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',focus);generation.current++;};},[allowed,refresh]);
 const allLoads=useMemo(()=>groupDnoteLoads(data),[data]);
 const inSeason=(l:DnoteLoad)=>l.missing||season==='all'||l.seasons.includes(Number(season));
 const inTrace=(l:DnoteLoad)=>l.missing||trace==='all'||l.alloc.some(a=>String(a.id)===trace);
 const availableSeasons=useMemo(()=>{const ids=new Set(allLoads.filter(l=>(day==='all'||l.date===day)&&inTrace(l)).flatMap(l=>l.seasons));return seasonNames.filter(s=>ids.has(s.season_id)).sort((a,b)=>b.season_id-a.season_id);},[allLoads,seasonNames,day,trace]);
 const dates=useMemo(()=>[...new Set(allLoads.filter(l=>inSeason(l)&&inTrace(l)).map(l=>l.date))].sort((a,b)=>b.localeCompare(a)),[allLoads,season,trace]);
 const traces=useMemo(()=>{const m=new Map<number,string>();for(const l of allLoads.filter(l=>inSeason(l)&&(day==='all'||l.date===day)))for(const a of l.alloc)m.set(a.id,a.name);return [...m].sort((a,b)=>a[1].localeCompare(b[1],undefined,{numeric:true}));},[allLoads,season,day]);
 useEffect(()=>{if(!loading&&season!=='all'&&!availableSeasons.some(s=>String(s.season_id)===season))setSeason('all');},[availableSeasons,season,loading]);
 useEffect(()=>{if(!loading&&day!=='all'&&!dates.includes(day))setDay('all');},[dates,day,loading]);
 useEffect(()=>{if(!loading&&trace!=='all'&&!traces.some(([id])=>String(id)===trace))setTrace('all');},[traces,trace,loading]);
 const base=allLoads.filter(l=>inSeason(l)&&inTrace(l)&&(day==='all'||l.date===day));
 const loads=base.filter(l=>l.missing===missing).sort((a,b)=>{
  const value=(x:DnoteLoad)=>sortCol==='date'?x.date:sortCol==='dnote'?x.dnote:sortCol==='wb'?x.wbSlip:sortCol==='source'?x.source:sortCol==='crop'?x.crop+' '+x.movement:sortCol==='truck'?x.registration:sortCol==='kg'||sortCol==='tonnes'?x.kg??-1:x.alloc.map(t=>t.name).join(', ');
  const x=value(a),y=value(b);const diff=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true,sensitivity:'base'});return (sortAsc?diff:-diff)||b.date.localeCompare(a.date);
 });
 const missingCount=new Set(base.filter(l=>l.missing).map(l=>l.expectedId!=null?'note:'+l.expectedId:l.key)).size;
 const noteCount=new Set(base.map(l=>l.expectedId!=null?'note:'+l.expectedId:l.key)).size;
 const total=loads.reduce((sum,l)=>sum+(l.kg||0),0),allocated=loads.reduce((sum,l)=>sum+l.alloc.reduce((s,a)=>s+(trace==='all'||String(a.id)===trace?a.kg:0),0),0);
 function exportCsv(){if(typeof document==='undefined')return;const url=URL.createObjectURL(new Blob(['\ufeff',dnoteCsv(loads)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`Daily_DNotes_${day}_${missing?'Missing':'Not_missing'}.csv`;a.click();URL.revokeObjectURL(url);}
 function changeSort(key:string){if(sortCol===key)setSortAsc(v=>!v);else{setSortCol(key);setSortAsc(true);}}
 const btn=(label:string,action:()=>void)=><Pressable accessibilityRole="button" onPress={action} style={{padding:12,backgroundColor:C.primary,borderRadius:6,marginRight:9}}><Text style={{color:'white',fontWeight:'700'}}>{label}</Text></Pressable>;
 if(Platform.OS!=='web')return <Text>Desktop web only.</Text>;
 if(allowed===null)return <Text style={{padding:24}}>Checking Admin access…</Text>;
 if(!allowed)return <WbAdminSignIn onAuthenticated={()=>setAllowed(true)}/>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:22,minWidth:1020}}>
  <WbModuleHeader title="Daily DNotes" right={<WbLastSync refreshKey={refreshKey}/>}/>
  <Text style={{fontSize:26,fontWeight:'bold',marginBottom:6}}>Daily DNotes — Tonnage &amp; Trace Allocations</Text>
  <Text style={{color:'#667085',marginBottom:14}}>Field D-Note books are the source of expected notes. Missing WB slips are red. Existing WB details and field allocations remain alongside each note.</Text>
  <View style={{flexDirection:'row',gap:12,flexWrap:'wrap',marginBottom:16,alignItems:'flex-end'}}>
   <View style={{width:195}}><JsplSearchCombo label="Season" selector="product" value={season} options={[{id:'all',label:'All seasons'},...availableSeasons.map(s=>({id:String(s.season_id),label:s.season_name}))]} onChange={v=>setSeason(String(v??'all'))}/></View>
   <View style={{width:195}}><JsplSearchCombo label="Date" selector="product" value={day} options={[{id:'all',label:'All dates — latest first'},...dates.map(d=>({id:d,label:wbFormatDate(d)}))]} onChange={v=>setDay(String(v??'all'))}/></View>
   <View style={{width:240}}><JsplSearchCombo label="TraceCode" selector="trace" value={trace} options={[{id:'all',label:'All TraceCodes',active:true},...traces.map(([id,name])=>({id:String(id),label:name,active:true}))]} onChange={v=>setTrace(String(v??'all'))}/></View>
   {btn('Add DNotes',()=>setEditor(true))}{btn('Refresh',()=>{void refresh().catch(()=>{});})}{btn('Print',()=>window.print())}{btn('Excel / CSV',exportCsv)}
  </View>
  <View accessibilityRole="tablist" style={{flexDirection:'row',marginBottom:14,gap:8}}>{[true,false].map(value=><Pressable key={String(value)} accessibilityRole="tab" accessibilityState={{selected:missing===value}} onPress={()=>setMissing(value)} style={{paddingVertical:11,paddingHorizontal:22,borderWidth:1,borderColor:C.primary,borderRadius:6,backgroundColor:missing===value?C.primary:C.surface}}><Text style={{fontWeight:'700',color:missing===value?'white':C.primary}}>{value?'Missing':'Not missing'}</Text></Pressable>)}</View>
  {error?<Text accessibilityRole="alert" style={{color:'#b42318',marginBottom:10}}>{error}</Text>:null}
  {notice?<Text accessibilityLiveRegion="polite" style={{color:C.primary,marginBottom:10}}>{notice}</Text>:null}
  <View style={{flexDirection:'row',marginBottom:16,gap:12}}>{[['DNotes',String(noteCount)],['Missing WB slips',String(missingCount)],['Nett tonnes',(total/1000).toFixed(3)+' t'],[trace==='all'?'Allocated tonnes':'Selected TraceCode tonnes',(allocated/1000).toFixed(3)+' t']].map(([label,value])=><View key={label} style={{backgroundColor:C.surface,padding:15,borderRadius:6,minWidth:170}}><Text style={{color:'#667085'}}>{label}</Text><Text style={{fontSize:21,fontWeight:'bold'}}>{value}</Text></View>)}</View>
  <ScrollView horizontal><View style={{backgroundColor:C.surface,borderWidth:1,borderColor:C.border}}>
   <View style={{flexDirection:'row',backgroundColor:'#f4e96b',paddingVertical:12}}>{[['Date',110,'date'],['Field DNote',130,'dnote'],['WB Slip',110,'wb'],['Source',100,'source'],['Crop / Movement',210,'crop'],['Truck',120,'truck'],['Nett kg',110,'kg'],['Nett t',100,'tonnes'],['TraceCode allocations (kg)',300,'allocation']].map(([label,width,key])=><Pressable key={key} onPress={()=>changeSort(String(key))} style={{width:Number(width),paddingHorizontal:10}}><Text style={{fontWeight:'700'}}>{label}{sortCol===key?(sortAsc?' ↑':' ↓'):' ↕'}</Text></Pressable>)}</View>
   {loads.map(l=><View key={l.key} style={{flexDirection:'row',paddingVertical:10,borderBottomWidth:1,borderColor:'#e7eaf0',backgroundColor:l.missing?'#fee4e2':C.surface}}>
    <Text style={{width:110,paddingHorizontal:10}}>{wbFormatDate(l.date)}</Text>
    <Text style={{width:130,paddingHorizontal:10,fontWeight:'700',color:l.missing?'#b42318':C.text}}>{l.dnote||'—'}</Text>
    <View style={{width:110,paddingHorizontal:10}}><Text style={l.missing?{color:'#b42318',fontWeight:'700'}:{}}>{l.wbSlip||'Missing'}</Text>{l.matchCount>1?<Text style={{color:'#b54708'}}>{l.matchCount} WB slips</Text>:null}</View>
    <Text style={{width:100,paddingHorizontal:10}}>{l.source||'—'}</Text>
    <Text style={{width:210,paddingHorizontal:10}}>{l.crop}{l.movement?'\n'+l.movement:''}</Text>
    <Text style={{width:120,paddingHorizontal:10}}>{l.registration||'—'}</Text>
    <Text style={{width:110,paddingHorizontal:10,textAlign:'right'}}>{l.kg==null?'—':n(l.kg)}</Text>
    <Text style={{width:100,paddingHorizontal:10,textAlign:'right'}}>{l.kg==null?'—':(l.kg/1000).toFixed(3)}</Text>
    <View style={{width:300,paddingHorizontal:10}}>{l.alloc.length?l.alloc.map(a=><Text key={a.id} style={trace!=='all'&&String(a.id)===trace?{fontWeight:'700',color:C.primary}:{}}>{a.name}: {n(a.kg)} kg</Text>):<Text style={{color:l.missing?'#b42318':'#667085'}}>{l.missing?'Awaiting WB slip':'No field allocation'}</Text>}
     {l.kg!=null&&l.alloc.length>0&&Math.abs(l.alloc.reduce((s,a)=>s+a.kg,0)-l.kg)>.01?<Text style={{color:'#b42318'}}>Allocation difference: {n(l.kg-l.alloc.reduce((s,a)=>s+a.kg,0))} kg</Text>:null}</View>
   </View>)}
   {!loading&&loads.length===0?<Text style={{padding:16,color:'#667085'}}>{missing?'No missing WB slips for these filters. Use Add DNotes to enter a book range.':'No matched WB slips for these filters.'}</Text>:null}
  </View></ScrollView>
  <Text style={{marginTop:12,color:'#667085'}}>{loading?'Refreshing…':`${loads.length} displayed rows · ${(total/1000).toFixed(3)} tonnes.`} Loads count once across multiple field allocations. Missing D-Notes remain visible when filtering by season or field. Delayed WB syncs update the original D-Note date; stock-to-customer dispatches are excluded. Refreshes automatically every 30 seconds.</Text>
  {editor?<WbAddDnotes onClose={()=>setEditor(false)} onSaved={async(date,count)=>{setSeason('all');setTrace('all');setDay(date);await refresh();setNotice(`${count} D-Notes saved for ${wbFormatDate(date)}. Use Missing / Not missing to review their WB slips.`);}}/>:null}
 </ScrollView>;
}

