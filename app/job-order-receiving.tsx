import {useCallback,useState} from 'react';
import {router,useFocusEffect,useLocalSearchParams} from 'expo-router';
import {ScrollView,Text,View,Pressable} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockLineTable} from '@/components/jspl/StockLineTable';
import {StockButton as Button,StockDateField,StockField as Field,StockSelect as Select,StockRecovery,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {stockRequest,stockMutation} from '@/utils/stock-workflow';
import {stockParent} from '@/utils/stock-navigation';
import {displayJsplDate,parseJsplDateInput} from '@/utils/jspl-input';

type Line={order_id:string;order_number:string;supplier_name:string;order_line_id:string;kind:string;ref:string|null;description:string;job_number:number;outstanding:number;ordered_unit_price:number|null;part_number:string|null};
type Input={quantity:string;price:string;marking:string};
type Returned={id:string;town_trip_id?:string;request_number:number;decision_reason:string;payload:{order_id:number;receipt_date:string;invoice_date:string;invoice_number:string;lines:{order_line_id:number;quantity:number;unit_price:number;marking:string|null}[]}};
const dateNow=()=>new Date().toLocaleDateString('en-GB');
export default function JobOrderReceiving(){
 const {order:initialOrder,trip,returnTo}=useLocalSearchParams<{order?:string;trip?:string;returnTo?:string}>();
 const [replaces,setReplaces]=useState<Returned|null>(null);
 const [orders,setOrders]=useState<Line[]>([]),[returned,setReturned]=useState<Returned[]>([]);
 const [order,setOrder]=useState(''),[inputs,setInputs]=useState<Record<string,Input>>({});
 const [date,setDate]=useState(dateNow),[invoiceDate,setInvoiceDate]=useState(dateNow),[invoice,setInvoice]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{const d=await stockRequest('?job_requirements=1');setOrders(d.orders);setReturned(d.returned);},[]);
 useFocusEffect(useCallback(()=>{void load().then(()=>{if(initialOrder)setOrder(String(initialOrder));}).catch(e=>setError(e.message));},[load,initialOrder]));
 const options=[...new Map(orders.map(r=>[r.order_id,{id:r.order_id,label:r.order_number+' · '+r.supplier_name}])).values()];
 const lines=orders.filter(r=>r.order_id===order),chosen=lines.filter(r=>inputs[r.order_line_id]);
 const choose=(id:string)=>{setOrder(id);setReplaces(null);setInputs({});setInvoice('');setDate(dateNow());setInvoiceDate(dateNow());setNotice('');setError('');};
 const edit=(id:string,patch:Partial<Input>)=>setInputs(old=>({...old,[id]:{...old[id],...patch}}));
 const valid=chosen.length>0&&invoice.trim()&&parseJsplDateInput(date)&&parseJsplDateInput(invoiceDate)&&chosen.every(r=>{const v=inputs[r.order_line_id];return Number(v.quantity)>0&&Number(v.quantity)<=Number(r.outstanding)&&v.price.trim()!==''&&Number.isFinite(Number(v.price))&&Number(v.price)>=0;});
 async function save(){if(!valid||busy)return;setBusy(true);setError('');try{
  const {result}=await stockMutation('job-delivery',{action:'job_delivery',command:'receive',payload:{order_id:order,replaces_id:replaces?.id??null,trip_id:replaces?.town_trip_id??trip??null,date:parseJsplDateInput(date),invoice_date:parseJsplDateInput(invoiceDate),invoice_number:invoice.trim(),lines:chosen.map(r=>{const v=inputs[r.order_line_id];return {order_line_id:r.order_line_id,quantity:Number(v.quantity),unit_price:Number(v.price),marking:v.marking};})}});
  choose('');setNotice('Receipt '+result.request_number+' sent for Admin verification.');await load();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <ScrollView contentContainerStyle={S.page}><StockV2Header title="Receive Job Card orders" backLabel={trip?'← Town Trip':'← Receiving'} onStock={()=>router.replace(returnTo?stockParent({returnTo}).href:'/stock-v2-po-receiving')}/>
 {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="job-delivery" onRecovered={load}/></>:null}{notice?<Text style={S.success}>{notice}</Text>:null}
 <Select label="Approved purchase order" value={order||null} options={options} onChange={v=>choose(String(v??''))}/>
 {!orders.length?<Text>No Job Card orders awaiting receipt.</Text>:null}
 {lines.length?<><StockDateField label="Received / returned on" value={date} onChange={setDate}/><StockDateField label="Invoice date" value={invoiceDate} onChange={setInvoiceDate}/>
 <Field label="Supplier invoice number" value={invoice} onChange={setInvoice}/>
 <StockLineTable columns={[{label:'Receive',width:75},{label:'Job / item',width:235,grow:1},{label:'Qty',width:95},{label:'Invoice unit price',width:140},{label:'Marking on item / packaging',width:220}]} rows={lines.map(r=>{const v=inputs[r.order_line_id];return {key:r.order_line_id,cells:[
 <Pressable accessibilityRole="checkbox" accessibilityLabel={'Receive '+(r.ref??r.description)} accessibilityState={{checked:!!v}} disabled={busy} onPress={()=>setInputs(old=>{const next={...old};if(v)delete next[r.order_line_id];else next[r.order_line_id]={quantity:String(Number(r.outstanding)),price:String(r.ordered_unit_price??''),marking:''};return next;})}><Text style={S.title}>{v?'☑':'☐'}</Text></Pressable>,
 <View><Text>JC-{r.job_number} · {r.description}</Text><Text>{r.ref} · {r.outstanding} outstanding</Text></View>,
 v?<Field hideLabel numeric label={'Received quantity '+r.order_line_id} value={v.quantity} onChange={quantity=>edit(r.order_line_id,{quantity})}/>:null,
 v?<Field hideLabel numeric label={'Invoice unit price '+r.order_line_id} value={v.price} onChange={price=>edit(r.order_line_id,{price})}/>:null,
 v&&r.kind==='sample'?<Field hideLabel label={'Observed marking '+r.order_line_id} value={v.marking} onChange={marking=>edit(r.order_line_id,{marking})}/>:null]};})}/>
 <Button title="Submit receipt for verification" disabled={busy||!valid} onPress={()=>void save()}/></>:null}
 {returned.map(r=><View style={S.card} key={r.request_number}><Text style={S.title}>Returned receipt {r.request_number} · {r.payload.invoice_number}</Text><Text>{r.decision_reason}</Text>
 {orders.some(l=>l.order_id===String(r.payload.order_id))?<Button title="Correct receipt" onPress={()=>{choose(String(r.payload.order_id));setReplaces(r);setDate(displayJsplDate(r.payload.receipt_date));setInvoiceDate(displayJsplDate(r.payload.invoice_date));setInvoice(r.payload.invoice_number);setInputs(Object.fromEntries(r.payload.lines.map(l=>[l.order_line_id,{quantity:String(l.quantity),price:String(l.unit_price),marking:l.marking??''}])));}}/>:null}</View>)}
 </ScrollView>;
}
