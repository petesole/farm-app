import {useCallback,useEffect,useRef,useState} from 'react';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {ActivityIndicator,ScrollView,Text,View} from 'react-native';
import {StockReceiptVerification} from '@/components/jspl/StockReceiptVerification';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockButton as Button,StockField as Field,StockSelect as Select,StockRecovery,StockDocumentSummary,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {stockLocation} from '@/utils/stock-navigation';
import {ApprovalDocument,WorkflowContext,documentLabel,stockContext,stockMutation} from '@/utils/stock-workflow';
import {displayJsplDate} from '@/utils/jspl-input';

export default function Approvals(){
 const router=useRouter();
 const {from,view,review,returnTo}=useLocalSearchParams<{from?:string;view?:string;review?:string;returnTo?:string}>();
 const [context,setContext]=useState<WorkflowContext|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [kind,setKind]=useState('all'),[selected,setSelected]=useState<ApprovalDocument|null>(null);
 const [reason,setReason]=useState(''),[paymentTerms,setPaymentTerms]=useState('');
 const [approvedPO,setApprovedPO]=useState(false);
 const scroll=useRef<ScrollView>(null);
 const restored=useRef('');
 const load=useCallback(async()=>{
   setBusy(true);
   try{setContext(await stockContext());}catch(e){setError((e as Error).message);}
   finally{setBusy(false);}
 },[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 useEffect(()=>setKind(view||'all'),[from,view]);
 const openReview=useCallback((doc:ApprovalDocument)=>{
   setSelected(doc);setReason('');setPaymentTerms(doc.payload.payment_terms??'');
   setError('');setNotice('');setApprovedPO(false);
   scroll.current?.scrollTo({y:0,animated:false});
 },[]);
 useEffect(()=>{
   if(!review){restored.current='';return;}
   if(!context||restored.current===review)return;
   restored.current=review;
   const doc=context.documents.find(d=>(d.id===review||(d.kind==='po'&&String(d.request_number)===review))&&(view!=='po'||d.kind==='po'));
   if(doc?.status==='pending')openReview(doc);
   else {
     setSelected(null);
     setNotice(doc?documentLabel(doc)+' is no longer awaiting approval.':'This request is unavailable.');
   }
 },[context,view,review,openReview]);

 const approvalLocation=stockLocation('/stock-v2-approvals',{from,view:kind,returnTo,review:selected?.id});
 const editPO=(d:ApprovalDocument)=>router.push({pathname:'/stock-v2-purchase-orders',params:{edit:d.id,from:'approval',returnTo:approvalLocation}});
 const terms=paymentTerms.trim();
 const validTerms=terms.length>0&&terms.length<=200;
 async function decide(command:'approve'|'reject'){
   if(!selected||busy||!context?.access.is_admin)return;
   const approvingPO=selected.kind==='po'&&command==='approve';
   if(approvingPO&&!validTerms)return;
   setBusy(true);setError('');
   try{
     const {result}=await stockMutation('approval',{action:'workflow_command',command:approvingPO?'authorise_po':command,
       data:{id:selected.id,version:selected.version,reason,...(approvingPO?{payment_terms:terms}:{})}});
     setSelected(null);setReason('');setPaymentTerms('');setApprovedPO(approvingPO);
     setNotice(approvingPO?(result?.target_order_id?'PO-'+result.target_order_id:documentLabel(selected))+' approved and available for receiving.'
       :command==='reject'?'Returned for correction.':'Credit approved, applied and locked.');
     await load();
   }catch(e){setError((e as Error).message);}
   finally{setBusy(false);}
 }
 const postCount=async(t:any)=>{setBusy(true);setError('');try{await stockMutation('stocktake-approval',{action:'stocktake_post',take_id:t.take_id,owner_code:t.owner_code,location_code:t.location_code,adjustments:(t.lines??[]).filter((l:any)=>Number(l.counted_quantity)!==Number(l.system_quantity)).map((l:any)=>({item_code:l.item_code,delta:Number(l.counted_quantity)-Number(l.system_quantity)}))});await load();setNotice('Count approved and stock adjustment posted');}catch(e){setError((e as Error).message)}finally{setBusy(false)}};

 const pending=(context?.documents??[]).filter(d=>d.status==='pending'&&(kind==='all'||d.kind===kind));
 const poQueue=kind==='po';
 return <ScrollView ref={scroll} contentContainerStyle={S.page}>
   <StockV2Header title={poQueue?'Approve Purchase Orders':kind==='receipt'?'Verify Receipts':'Awaiting Approval'} onRefresh={()=>void load()}/>
   {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="approval" onRecovered={()=>{setSelected(null);void load();}}/><StockRecovery scope="stocktake-approval" onRecovered={()=>void load()}/></>:null}
   {notice?<View style={{gap:10}}><Text style={S.success}>{notice}</Text>
     {approvedPO?<Button title="View Authorised POs" onPress={()=>router.push({pathname:'/stock-v2-purchase-orders',params:{status:'applied',from:'approval',returnTo:approvalLocation}})}/>:null}
   </View>:null}
   {busy?<ActivityIndicator/>:null}
   {context&&!context.access.is_admin?<Text style={S.text}>Admin access is required to approve documents.</Text>:null}
   {context?.access.is_admin?<>
     {!selected&&kind!=='receipt'?<Text style={S.title}>{poQueue?(pending.length===0?'No purchase orders awaiting approval.':pending.length+' purchase order'+(pending.length===1?'':'s')+' awaiting approval'):context.awaiting+' awaiting approval'}</Text>:null}
     {view!=='po'&&!selected?<Select label="Document type" value={kind} onChange={v=>setKind(String(v??'all'))} options={[{id:'all',label:'All documents'},{id:'po',label:'Purchase orders'},{id:'credit',label:'Credit notes'},{id:'count',label:'Stocktakes'},{id:'receipt',label:'Receipts'}]}/>:null}
     {selected?<View style={S.card}>
       <StockDocumentSummary document={selected}/>
       {selected.kind==='po'?<Field label="Payment terms (required)" value={paymentTerms} onChange={setPaymentTerms}/>:null}
       {selected.kind==='po'&&terms.length>200?<Text style={S.error}>Use up to 200 characters for payment terms.</Text>:null}
       <Button title={selected.kind==='po'?'Approve Purchase Order':'Approve and Apply Credit'} disabled={busy||(selected.kind==='po'&&!validTerms)} onPress={()=>void decide('approve')}/>
       {selected.kind==='po'&&!selected.payload.job_requirements?<Button title="Edit PO" disabled={busy} onPress={()=>editPO(selected)}/>:null}
       <Field label="Reason for returning" value={reason} onChange={setReason}/>
       <View style={S.row}>
         <Button title="Return for Correction" disabled={busy} onPress={()=>void decide('reject')}/>
         <Button title="Close Review" disabled={busy} onPress={()=>{setSelected(null);if(review)router.setParams({review:''});}}/>
       </View>
     </View>:pending.map(d=><View style={S.card} key={d.id}>
       <StockDocumentSummary document={d}/>
       <Button title={d.kind==='po'?'Review & Approve':'Review'} disabled={busy} onPress={()=>openReview(d)}/>
     </View>)}
 {!selected&&(kind==='all'||kind==='receipt')?<StockReceiptVerification onChanged={load}/>:null}
 {!selected&&(kind==='all'||kind==='count')?context.stocktakes.map(t=><View style={S.card} key={t.take_id}><Text style={S.title}>{t.take_number} · Stocktake</Text><Text>{t.owner_code} · {displayJsplDate(t.take_date.substring(0,10))} · {t.notes}</Text>{(t.lines??[]).map((l:any)=><Text key={l.item_code}>{l.item_name}: sheet {l.system_quantity} · counted {l.counted_quantity} · current {l.current_quantity} · variance {Number(l.counted_quantity)-Number(l.system_quantity)}</Text>)}<Button title="Approve Count and Apply Adjustment" disabled={busy} onPress={()=>void postCount(t)}/></View>):null}
 </>:null}
 </ScrollView>;
}
