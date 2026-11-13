import {useState,useCallback} from 'react';
import {useFocusEffect} from 'expo-router';
import {ScrollView,Text,View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockButton as Button,StockField as Field,StockSelect as Select,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {stockRequest} from '@/utils/stock-workflow';
export default function StockStaff(){
 const [rows,setRows]=useState<any[]>([]),[user,setUser]=useState<string|null>(null),[role,setRole]=useState('clerk'),[active,setActive]=useState('yes'),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{setBusy(true);try{setRows((await stockRequest('?stock_staff=1')).rows);}catch(e){setError((e as Error).message)}finally{setBusy(false)}},[]);useFocusEffect(useCallback(()=>{void load()},[load]));
 const save=async()=>{setBusy(true);setError('');try{await stockRequest('',{action:'stock_staff_assign',user_id:user,role_name:role,active:active==='yes',reason});setUser(null);setReason('');await load();setNotice('Stock access updated and audited');}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <ScrollView contentContainerStyle={S.page}><StockV2Header title="Stock Staff Access" onRefresh={()=>void load()}/><Text style={S.text}>Assign Stock or sprayer-phone access to an existing sign-in. This keeps their other module responsibilities. Global Admin users retain Admin access.</Text>{error?<Text style={S.error}>{error}</Text>:null}{notice?<Text style={S.success}>{notice}</Text>:null}
 <Select label="User" value={user} options={rows.map(r=>({id:r.id,label:r.email}))} onChange={v=>{setUser(v==null?null:String(v));const r=rows.find(r=>r.id===v);setRole(r?.role_name??'clerk');setActive(r?.active===false?'no':'yes')}}/>
 {user?<View style={S.card}><Select label="Staff responsibility" value={role} options={[{id:'clerk',label:'Clerk'},{id:'stock',label:'Stock operator'},{id:'supervisor',label:'Stock supervisor'},{id:'admin',label:'Stock Admin'},{id:'sprayer',label:'Sprayer phone only'}]} onChange={v=>setRole(String(v??'clerk'))}/><Select label="Access status" value={active} options={[{id:'yes',label:'Active'},{id:'no',label:'Disabled'}]} onChange={v=>setActive(String(v??'yes'))}/><Field label="Reason" value={reason} onChange={setReason}/><Button title="Save Access" disabled={busy} onPress={()=>void save()}/></View>:null}
 {rows.filter(r=>r.role_name||r.global_admin).map(r=><View style={S.card} key={r.id}><Text>{r.email} · {r.global_admin?'Global Admin':r.role_name} · {r.global_admin||r.active?'Active':'Disabled'}</Text></View>)}
 </ScrollView>;
}
