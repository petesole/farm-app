import {StockRecovery} from "@/components/jspl/StockWorkflowControls";
import {useState,useCallback} from 'react';
import {useFocusEffect} from 'expo-router';
import {ScrollView,Text,View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockButton as Button,StockField as Field,StockSelect as Select,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {stockMutation,stockRequest} from '@/utils/stock-workflow';
import {displayJsplDate} from '@/utils/jspl-input';
export default function GRVCorrections(){
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[mode,setMode]=useState('invoice'),[selection,setSelection]=useState<string|null>(null),[qty,setQty]=useState(''),[price,setPrice]=useState(''),[reason,setReason]=useState('');
 const load=useCallback(async()=>{setBusy(true);try{setData(await stockRequest('?grv_corrections=1'));}catch(e){setError((e as Error).message)}finally{setBusy(false)}},[]);useFocusEffect(useCallback(()=>{void load()},[load]));
 const rows=mode==='invoice'?data?.invoices??[]:data?.receipts??[];
 const key=(r:any)=>r.grv_line_id?'i'+r.grv_line_id:'r'+r.receipt_line_id;
 const row=rows.find((r:any)=>key(r)===selection);
 const select=(value:string|number|null)=>{setSelection(value==null?null:String(value));const r=rows.find((r:any)=>key(r)===value);setQty(r?String(mode==='invoice'?r.invoice_quantity:r.physical_quantity):'');setPrice(r?String(r.unit_price??''):'');setReason('');setError('')};
 const save=async()=>{if(!row)return;setBusy(true);setError('');try{
  const payload=mode==='invoice'?{grv_line_id:row.grv_line_id,receipt_line_id:row.receipt_line_id,invoice_quantity:Number(qty),unit_price:Number(price),expected_quantity:Number(row.invoice_quantity),expected_price:Number(row.unit_price),reason}:{receipt_line_id:row.receipt_line_id,quantity:Number(qty),expected_quantity:Number(row.physical_quantity),reason};
  await stockMutation('grv-correction',{action:mode==='invoice'?'workflow_correct_grv':'workflow_correct_physical',payload});setSelection(null);setReason('');await load();setNotice(mode==='invoice'?'Linked invoice correction saved. Physical stock is unchanged.':'Linked physical stock adjustment posted.');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <ScrollView contentContainerStyle={S.page}><StockV2Header title="GRV Corrections" onRefresh={()=>void load()}/><Text style={S.text}>Admin only. Original documents remain intact. Invoice quantity records the supplier discrepancy; it does not change received stock. A physical receipt mistake needs a separate stock adjustment.</Text>
 {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="grv-correction" onRecovered={()=>void load()}/></>:null}{notice?<Text style={S.success}>{notice}</Text>:null}
 {data?<><Select label="Correction type" value={mode} options={[{id:'invoice',label:'Invoice quantity / price'},{id:'physical',label:'Physical receipt quantity'}]} onChange={v=>{setMode(String(v??'invoice'));setSelection(null);setReason('')}}/>
 <Select label={mode==='invoice'?'Invoiced GRV and product':'Physical receipt and product'} value={selection} options={rows.map((r:any)=>({id:key(r),label:(r.invoice_number??r.delivery_note??r.document_number)+' · '+r.supplier_name+' · '+r.item_name}))} onChange={select}/>
 {row?<View style={S.card}><Text style={S.text}>Physical quantity: {row.physical_quantity}</Text>{mode==='invoice'?<Text style={S.text}>Current invoice: {row.invoice_quantity} × {Number(row.unit_price).toFixed(2)} · {displayJsplDate(row.invoice_date)}</Text>:null}
 <Field label={mode==='invoice'?'Correct invoice quantity':'Correct physical receipt quantity'} numeric value={qty} onChange={setQty}/>{mode==='invoice'?<Field label="Correct invoice unit price" numeric value={price} onChange={setPrice}/>:null}
 {mode==='invoice'?<Text style={S.text}>Invoice discrepancy: {Number(qty)-Number(row.physical_quantity)} · corrected invoice value: {(Number(qty)*Number(price)).toFixed(2)}</Text>:<Text style={S.text}>Stock adjustment: {Number(qty)-Number(row.physical_quantity)}. The system checks issued and transferred stock before posting.</Text>}
 <Field label="Correction reason (at least 8 characters)" value={reason} onChange={setReason}/><Button title={mode==='invoice'?'Save Linked Invoice Correction':'Post Linked Stock Adjustment'} disabled={busy} onPress={()=>void save()}/></View>:null}
 <Text style={S.title}>Recent linked corrections</Text>{(data.history??[]).map((h:any)=><View style={S.card} key={'i'+h.id}><Text>{displayJsplDate(h.created_at.substring(0,10))} · Invoice {h.old_invoice_quantity} → {h.new_invoice_quantity} · Price {h.old_unit_price} → {h.new_unit_price}</Text><Text>Physical {h.physical_quantity} · discrepancy {h.quantity_variance} · {h.reason}</Text></View>)}{(data.physical_history??[]).map((h:any)=><View style={S.card} key={h.operation_id}><Text>{displayJsplDate(h.created_at.substring(0,10))} · Physical {h.old_quantity} → {h.new_quantity} · {h.reason}</Text></View>)}
 </>:null}</ScrollView>;
}
