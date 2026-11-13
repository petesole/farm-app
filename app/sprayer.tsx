import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'expo-router';
import * as Network from 'expo-network';
import {ActivityIndicator,Image,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {StockButton as Button,StockSelect as Select,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {jsplColors as C} from '@/constants/jspl-design';
import {PhoneCache,PhoneIdentity,PhoneSpray,emptyPhoneCache,phoneOutstanding,phoneHistory,historyChoices,historyMatches,tankMix,sprayDate,syncDateTime,localCompletion} from '@/utils/sprayer-model';
import {getPhoneIdentity,clearPhoneIdentity} from '@/lib/sprayer-identity';
import {readPhoneCache,queuePhoneCompletion,discardPhoneChange,setPhoneTank} from '@/lib/sprayer-store';
import {phoneConnection,syncPhone} from '@/utils/sprayer-sync';
import {verifyPhoneAccess,SprayerAccessError} from '@/utils/sprayer-api';
import {localISODate,parseJsplDateInput,displayJsplDate} from '@/utils/jspl-input';
import {stockUUID} from '@/utils/stock-workflow';
import {supabase} from '@/supabase';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

const fmt=(n:number)=>Number(n).toLocaleString('en-GB',{maximumFractionDigits:n!==0&&Math.abs(n)<0.001?Math.min(12,Math.ceil(-Math.log10(Math.abs(n)))+2):3});
export default function SprayerPhone(){
 const router=useRouter(),insets=useSafeAreaInsets();
 const [identity,setIdentity]=useState<PhoneIdentity|null>(null),[cache,setCache]=useState<PhoneCache>(emptyPhoneCache),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[connection,setConnection]=useState('Offline'),[wifi,setWifi]=useState(false);
 const [view,setView]=useState<'home'|'detail'|'history'|'queue'>('home'),[selected,setSelected]=useState(''),[capacity,setCapacity]=useState(''),[date,setDate]=useState('');
 const [filters,setFilters]=useState<Record<string,string>>({}),[options,setOptions]=useState(false),[mobile,setMobile]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let alive=true;void(async()=>{try{
  const saved=await getPhoneIdentity();if(!saved){router.replace('/login');return;}
  const network=await phoneConnection().catch(()=>({online:false,wifi:false,label:'Offline'}));let current=saved;
  if(network.online){try{current=await verifyPhoneAccess()}catch(e){if(e instanceof SprayerAccessError){await clearPhoneIdentity();router.replace('/login');return;}if(alive)setNotice('Saved phone data is available. Sync when connected.');}}
  const stored=await readPhoneCache(current.id);if(alive){setIdentity(current);setCache(stored);setConnection(network.label);setWifi(network.wifi)}
 }catch(e){if(alive)setError((e as Error).message)}finally{if(alive)setReady(true)}})();
 const subscription=Network.addNetworkStateListener(()=>{void phoneConnection().then(n=>{if(alive){setConnection(n.label);setWifi(n.wifi)}}).catch(()=>{})});
 return()=>{alive=false;subscription.remove()};},[router]);
 const outstanding=useMemo(()=>phoneOutstanding(cache),[cache]),history=useMemo(()=>phoneHistory(cache),[cache]);
 const visibleHistory=useMemo(()=>history.filter(r=>historyMatches(r,filters)),[history,filters]);
 useEffect(()=>{setFilters(old=>{const next={...old};for(const k of ['date','trace','input'] as const)if(next[k]&&!historyChoices(history,old,k).includes(next[k]))delete next[k];return JSON.stringify(next)===JSON.stringify(old)?old:next})},[history]);
 const job=cache.jobs.find(j=>j.id===selected),queued=cache.outbox.find(o=>o.job_id===selected);
 const mix=job?tankMix(job,Number(capacity)):null;
 const pending=cache.outbox.filter(o=>o.state==='queued').length,reviews=cache.outbox.filter(o=>o.state==='review').length;
 const open=(j:PhoneSpray)=>{setSelected(j.id);setCapacity(cache.tanks[j.id]??(j.tank_capacity?String(j.tank_capacity):''));setDate(displayJsplDate(j.completed_date??cache.outbox.find(o=>o.job_id===j.id)?.completed_date??localISODate(new Date())));setView('detail');setError('');setNotice('')};
 const perform=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError((e as Error).message);if(e instanceof SprayerAccessError){await clearPhoneIdentity();router.replace('/login')}}finally{setBusy(false)}};
 const sync=(full=false)=>perform(async()=>{if(!identity)return;const result=await syncPhone(identity,{allowMobileDownload:mobile,full,onProgress:setCache});setCache(result.cache);const n=result.cache.outbox.filter(o=>o.state==='review').length;setNotice(n?'Synced. '+n+' completion change(s) need review.':'Sync complete');});
 const complete=()=>perform(async()=>{if(!identity||!job)return;if(!job.fully_issued)throw Error('Awaiting stock');const iso=parseJsplDateInput(date);if(!iso)throw Error('Enter a valid completed date');if(iso>localISODate(new Date()))throw Error('Completed date cannot be in the future');if(job.last_issue_date&&iso<job.last_issue_date)throw Error('Completed date cannot precede the last stock issue');
  const next=await queuePhoneCompletion(identity.id,{operation_id:stockUUID(),job_id:job.id,completed_date:iso,base_hash:job.hash,attempted:false,state:'queued',created_at:new Date().toISOString()});setCache(next);setView('home');setNotice('Completion saved on this phone. Awaiting sync.');
 });
 const saveCapacity=()=>{if(identity&&job)void setPhoneTank(identity.id,job.id,capacity).then(setCache).catch(e=>setError(e.message))};
 const logout=()=>perform(async()=>{await clearPhoneIdentity();setIdentity(null);setCache(emptyPhoneCache());await supabase.auth.signOut({scope:'local'});router.replace('/login')});
 const header=<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><View style={{flexDirection:'row',gap:10,alignItems:'center',flex:1,minWidth:0}}><Image source={require('../assets/images/jspl_farm_logo.png')} resizeMode="contain" style={{width:58,height:52}}/><Text style={[S.title,{fontSize:view==='history'?20:22,flexShrink:1}]}>{view==='home'?'Sprays':view==='history'?'Spray History':view==='queue'?'Saved Changes':'Tank Mix'}</Text></View><Button title={view==='home'?'Sign Out':'← Sprays'} disabled={busy} onPress={()=>{if(view==='home')void logout();else{setView('home');setError('');setNotice('')}}}/></View>;
 if(!ready)return <View style={[S.page,{flex:1,justifyContent:'center'}]}><ActivityIndicator/><Text>Opening saved sprays…</Text></View>;
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[S.page,{padding:14,paddingTop:14+insets.top,paddingBottom:18+insets.bottom,gap:12,minHeight:'100%'}]}>{header}
 <View style={{gap:5,paddingBottom:8,borderBottomWidth:1,borderColor:C.border}}><View style={S.row}><Button title={busy?'Syncing…':'Sync'} disabled={busy||!identity} onPress={()=>void sync()}/><Text style={S.muted}>{connection}</Text>{cache.outbox.length?<Pressable disabled={busy} onPress={()=>setView('queue')}><Text style={{color:reviews?C.danger:C.primaryDark,fontWeight:'700'}}>{pending} pending{reviews?' · '+reviews+' review':''}</Text></Pressable>:null}</View><Text style={S.muted}>Last sync: {syncDateTime(cache.lastSync)}</Text></View>
 {busy?<ActivityIndicator/>:null}{error?<Text accessibilityRole="alert" style={S.error}>{error}</Text>:null}{notice?<Text style={S.text}>{notice}</Text>:null}
 {view==='home'?<><View style={S.row}><Button title="Historical" disabled={busy} onPress={()=>{setView('history');setError('');setNotice('')}}/><Button title="Sync Options" disabled={busy} onPress={()=>setOptions(o=>!o)}/></View>
 {options||!cache.ready?<View style={S.card}><Text>{cache.ready?'Sync downloads changes only.':'Use Wi-Fi for the first offline download.'}</Text><Pressable accessibilityRole="checkbox" accessibilityLabel="Allow full download on mobile data" accessibilityState={{checked:mobile}} disabled={busy} onPress={()=>setMobile(v=>!v)}><Text>{mobile?'☑':'☐'} Allow full download on mobile data</Text></Pressable>{cache.ready?<Button title="Full Refresh" disabled={busy||(!wifi&&!mobile)} onPress={()=>void sync(true)}/>:null}</View>:null}
 {!outstanding.length?<Text>{cache.ready?'No sprays awaiting completion.':'Tap Sync to download sprays and history for offline use.'}</Text>:null}
 {outstanding.map(j=><Pressable accessibilityRole="button" accessibilityLabel={'Open spray '+j.id} key={j.id} disabled={busy} onPress={()=>open(j)} style={S.card}><Text style={S.title}>{j.trace}</Text><Text>Spray #{j.id} · {sprayDate(j.week)}</Text><Text>{j.spray_type}{j.part?' · '+j.part:''}</Text><Text style={{fontWeight:'700',color:j.fully_issued?C.primaryDark:C.danger}}>{j.fully_issued?'Issued — ready to spray':'Awaiting stock'}</Text>{cache.outbox.some(o=>o.job_id===j.id&&o.state==='review')?<Text style={S.error}>Completion needs review</Text>:null}</Pressable>)}</>:null}
 {view==='detail'?(job?<><Text style={S.title}>{job.trace} · Spray #{job.id}</Text><Text>{jDetail(job)}</Text><Text style={{fontWeight:'700',color:job.fully_issued?C.primaryDark:C.danger}}>{job.completed_date?'Sprayed '+sprayDate(job.completed_date):job.fully_issued?'Issued — ready to spray':'Awaiting stock'}</Text>
 <View style={{gap:5}}><Text>Tank capacity (L)</Text><TextInput accessibilityLabel="Tank capacity (L)" style={S.input} keyboardType="decimal-pad" value={capacity} editable={!busy} onChangeText={setCapacity} onBlur={saveCapacity}/></View>
 {mix?<View style={S.row}><View><Text style={S.title}>{mix.full}</Text><Text>Full Tank Mix</Text></View><View><Text style={S.title}>{fmt(mix.part)} L</Text><Text>Part Tank Mix</Text></View></View>:<Text>Enter tank capacity to view mix quantities.</Text>}
 {job.lines.map(l=>{const quantities=mix?.lines.find(x=>x.code===l.code);return <View key={l.code} style={S.card}><Text style={{fontSize:18,fontWeight:'700'}}>{l.name}</Text><Text>Rate/Ha: {fmt(l.rate)} {l.unit}</Text>{quantities?<View style={S.row}><Text>Full tank: {fmt(quantities.full_quantity)} {l.unit}</Text><Text>Part tank: {fmt(quantities.part_quantity)} {l.unit}</Text></View>:null}</View>})}
 {!job.completed_date&&job.fully_issued?<View style={S.card}><Text style={S.title}>Completed</Text><Text>Completed Date</Text><TextInput accessibilityLabel="Completed Date" style={S.input} value={date} editable={!busy&&(!queued?.attempted||queued.state==='review')} onChangeText={setDate} onBlur={()=>{const iso=parseJsplDateInput(date);if(iso)setDate(displayJsplDate(iso))}} placeholder="d/m (year optional)"/>{queued?.attempted&&queued.state==='queued'?<Text>Sync to confirm the saved completion before changing its date.</Text>:<Button title={queued?.state==='queued'?'Update Completion Date':'Save Completed Date'} disabled={busy} onPress={()=>void complete()}/>}</View>:null}
 </>:<Text>This spray is no longer available. Return to Sprays.</Text>):null}
 {view==='history'?<><View style={{gap:8}}>{(['date','trace','input'] as const).map(k=><Select key={k} label={k==='date'?'Date':k==='trace'?'Trace':'Input Name'} value={filters[k]??''} disabled={busy} options={[{id:'',label:'All'},...historyChoices(history,filters,k).map(v=>({id:v,label:k==='date'?sprayDate(v):v}))]} onChange={v=>setFilters(f=>({...f,[k]:String(v??'')}))}/>)}</View>
 {visibleHistory.map((r,i)=><Pressable key={r.job_id+':'+r.input+':'+i} style={S.card} disabled={busy} onPress={()=>{const j=cache.jobs.find(x=>x.id===r.job_id);if(j)open(j)}}><Text style={{fontWeight:'700'}}>{sprayDate(r.date)} · {r.trace}</Text><Text style={{fontSize:17}}>{r.input}</Text><Text>Rate/Ha: {fmt(r.rate)} {r.unit}</Text>{r.pending?<Text style={S.muted}>Awaiting sync</Text>:null}</Pressable>)}{!visibleHistory.length?<Text>No completed sprays match these filters.</Text>:null}</>:null}
 {view==='queue'?<>{cache.outbox.map(o=><View key={o.operation_id} style={S.card}><Text style={S.title}>{cache.jobs.find(j=>j.id===o.job_id)?.trace??'Spray #'+o.job_id}</Text><Text>Completed: {sprayDate(o.completed_date)}</Text><Text style={o.state==='review'?S.error:S.text}>{o.error??'Saved on phone — awaiting sync'}</Text>{cache.jobs.some(j=>j.id===o.job_id)?<Button title="View Tank Mix" disabled={busy} onPress={()=>open(cache.jobs.find(j=>j.id===o.job_id)!)}/>:null}{!o.attempted||o.state==='review'?<Button title={o.state==='review'?'Dismiss Rejected Local Change':'Remove Unsynced Completion'} disabled={busy} onPress={()=>void perform(async()=>{if(identity)setCache(await discardPhoneChange(identity.id,o.operation_id))})}/>:null}</View>)}{!cache.outbox.length?<Text>All completion changes are synced.</Text>:null}</>:null}
 </ScrollView>;
}
function jDetail(j:PhoneSpray){return j.spray_type+' · '+fmt(j.area)+' ha'+(j.water_rate?' · '+fmt(j.water_rate)+' L/ha':'');}
