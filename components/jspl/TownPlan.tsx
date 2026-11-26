import {useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {StockLineTable} from './StockLineTable';
import {StockButton as Button,StockField as Field,StockSelect as Select,StockDateField,stockStyles as S} from './StockWorkflowControls';
import {displayJsplDate,parseJsplDateInput} from '@/utils/jspl-input';

const methods=['Cash','Transfer','Account'] as const;
const methodOptions=methods.map(id=>({id,label:id}));
type Values={quantity:string;basis:string;note:string;reason:string};
export type PlanLine={order_line_id:number;order_id:number;order_number:string;supplier_name:string;item_name:string;ordered_quantity:number;ordered_unit_price:number|null;payment_terms:string|null;payment_basis:string|null;terms_note:string;available:number;quantity:number;posted:number;pending:number;to_receive:number;visited_at:string|null;kind?:string;ref?:string};
type Receipt={order_line_id:number;qty:number;status:string;basis:string;invoice:string;receipt_date:string};
type Correction={id:string;request_number:number;reason:string;payload:{order_id:number;receipt_date:string;invoice_date:string;invoice_number:string;lines?:Actual[];po_allocations?:Actual[]}};
type Actual={order_line_id:number;quantity:number;unit_price:number;marking?:string};
export type PlannedTrip={id:string;trip_number:number;plan_version:number;line_plan:boolean;plan_lines:PlanLine[];receipts:Receipt[];terms_history:{previous_terms:string;new_terms:string;quantity:number;reason:string;actor:string;order_line_id:number}[];corrections:Correction[];finalised_at:string|null;can_report?:boolean};
export type PlanSave=(command:string,payload:Record<string,unknown>)=>Promise<boolean>;
const text=(v:unknown)=><Text style={S.text}>{String(v??'')}</Text>;
const cost=(v:number|null)=>v==null?'Price pending':Number(v).toFixed(2);
function Tick({label,on,disabled,press}:{label:string;on:boolean;disabled?:boolean;press:()=>void}){
 return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked:on,disabled}} disabled={disabled} onPress={press}><Text style={S.title}>{on?'☑':'☐'}</Text></Pressable>;
}
type Amount={basis:string;qty:number;price:number|null};
function Totals({amounts}:{amounts:Amount[]}){
 return <View style={S.card}><View style={S.row}>{methods.map(m=><Text key={m} style={S.title}>{m==='Cash'?'Cash required':m==='Transfer'?'Transfer value':'On account'} · {amounts.filter(a=>a.basis===m&&a.price!=null).reduce((sum,a)=>sum+a.qty*Number(a.price),0).toFixed(2)}</Text>)}</View>{amounts.some(a=>a.qty>0&&(a.price==null||!a.basis))?<Text style={S.error}>Totals incomplete · price or payment terms pending</Text>:null}</View>;
}
function booked(trip?:PlannedTrip):Amount[]{
 return (trip?.receipts??[]).filter(r=>r.status==='posted').map(r=>({basis:r.basis,qty:Number(r.qty),price:trip?.plan_lines.find(l=>Number(l.order_line_id)===Number(r.order_line_id))?.ordered_unit_price??null}));
}
export function TownPlanEditor({available,trip,driver,date,busy,save}:{available:PlanLine[];trip?:PlannedTrip;driver:string;date:string|null;busy:boolean;save:PlanSave}){
 const previous=new Map((trip?.plan_lines??[]).map(l=>[String(l.order_line_id),l]));
 const lines=new Map<string,PlanLine>([...available,...(trip?.plan_lines??[])].map(l=>[String(l.order_line_id),l]));
 const [supplier,setSupplier]=useState(''),[change,setChange]=useState('');
 const [selected,setSelected]=useState<Record<string,Values>>(()=>Object.fromEntries((trip?.plan_lines??[]).map(l=>[l.order_line_id,{quantity:String(l.quantity),basis:l.payment_basis??'',note:l.terms_note??'',reason:''}])));
 const max=(id:string)=>Number(available.find(l=>String(l.order_line_id)===id)?.available??0)+Number(previous.get(id)?.quantity??0);
 const update=(id:string,patch:Partial<Values>)=>setSelected(old=>({...old,[id]:{...old[id],...patch}}));
 const changed=(l:PlanLine,v:Values)=>v.basis!==(l.payment_basis??'')||v.note.trim()!==(l.terms_note??'');
 const picked=Object.entries(selected);
 const valid=!!driver&&!!date&&picked.length>0&&picked.every(([id,v])=>{const l=lines.get(id);return l&&Number(v.quantity)>0&&Number(v.quantity)<=max(id)&&Number(v.quantity)>=Number(l.posted??0)+Number(l.pending??0)&&v.basis&&(!changed(l,v)||!!v.reason.trim());});
 const amounts=picked.map(([id,v])=>({basis:v.basis,qty:Math.max(0,Number(v.quantity)-Number(previous.get(id)?.posted??0)),price:lines.get(id)?.ordered_unit_price??null})).concat(booked(trip));
 return <><Totals amounts={amounts}/><Select label="Filter by supplier" value={supplier||null} options={[{id:'',label:'All suppliers'},...[...new Set([...lines.values()].map(l=>l.supplier_name))].sort().map(id=>({id,label:id}))]} onChange={v=>setSupplier(String(v??''))}/>
 <StockLineTable columns={[{label:'Select',width:62},{label:'PO',width:92},{label:'Item',width:170},{label:'Supplier',width:160},{label:'Unit price',width:95},{label:'Approved',width:85},{label:'Available',width:85},{label:'Planned qty',width:105},{label:'Payment terms',width:185}]}
 rows={[...lines].filter(([,l])=>!supplier||l.supplier_name===supplier).map(([id,l])=>{const v=selected[id],prior=previous.get(id);
 return {key:id,cells:[<Tick label={'Select '+l.order_number+' '+l.item_name} on={!!v} disabled={busy||!!prior&&(!!prior.visited_at||Number(prior.posted)+Number(prior.pending)>0)} press={()=>setSelected(old=>{const next={...old};if(next[id])delete next[id];else next[id]={quantity:String(max(id)),basis:l.payment_basis??'',note:l.terms_note??'',reason:''};return next;})}/>,text(l.order_number),text(l.item_name),text(l.supplier_name),text(cost(l.ordered_unit_price)),text(Number(l.ordered_quantity)),text(max(id)),
 v?<Field hideLabel numeric label={'Planned quantity '+l.item_name} value={v.quantity} onChange={quantity=>update(id,{quantity})}/>:null,
 <View>{text(v?[v.basis,v.note].filter(Boolean).join(' · ')||'Choose terms':l.payment_terms??'Choose terms')}{v?<Button title="Change terms" disabled={busy||Number(prior?.pending)>0||Number(v.quantity)<=Number(prior?.posted??0)} onPress={()=>setChange(id)}/>:null}</View>]};})}/>
 {change&&selected[change]?<View style={S.card}><Text style={S.title}>{lines.get(change)?.item_name} · payment terms</Text>
 <Select label="Trip payment method" value={selected[change].basis||null} options={methodOptions} onChange={m=>update(change,{basis:String(m??''),note:String(m??'')===lines.get(change)?.payment_basis?lines.get(change)?.terms_note??'':''})}/>
 <Field label="Trip payment details" value={selected[change].note} onChange={note=>update(change,{note})}/>
 <Field label="Reason for change" value={selected[change].reason} onChange={reason=>update(change,{reason})}/><Button title="Done" onPress={()=>setChange('')}/></View>:null}
 <Button title={trip?'Save changes':'Assign trip'} disabled={busy||!valid} onPress={()=>void save(trip?'edit':'create',{trip_id:trip?.id,version:trip?.plan_version,driver_id:driver,date,lines:picked.map(([id,v])=>({id,...v,quantity:Number(v.quantity)}))})}/></>;
}

type ReceiptInput={qty:string;price:string;marking:string;number:string};
function TripReceipt({trip,order,correction,admin,busy,save,close}:{trip:PlannedTrip;order:number;correction?:Correction;admin:boolean;busy:boolean;save:PlanSave;close:()=>void}){
 const lines=trip.plan_lines.filter(l=>Number(l.order_id)===order&&Number(l.to_receive)>0);
 const old=correction?.payload;
 const [inputs,setInputs]=useState<Record<string,ReceiptInput>>(()=>Object.fromEntries((old?.lines??old?.po_allocations??[]).map(l=>[l.order_line_id,{qty:String(l.quantity),price:String(l.unit_price),marking:l.marking??'',number:''}])));
 const today=new Date().toLocaleDateString('en-GB');
 const [date,setDate]=useState(old?displayJsplDate(old.receipt_date):today),[invoiceDate,setInvoiceDate]=useState(old?displayJsplDate(old.invoice_date):today),[invoice,setInvoice]=useState(old?.invoice_number??'');
 const patch=(id:number,v:Partial<ReceiptInput>)=>setInputs(values=>({...values,[id]:{...values[id],...v}}));
 const chosen=lines.filter(l=>inputs[l.order_line_id]);
 const valid=!!parseJsplDateInput(date)&&!!parseJsplDateInput(invoiceDate)&&!!invoice.trim()&&chosen.length>0&&chosen.every(l=>{const v=inputs[l.order_line_id];return Number(v.qty)>0&&Number(v.qty)<=Number(l.to_receive)&&v.price.trim()!==''&&Number.isFinite(Number(v.price))&&Number(v.price)>=0&&(!admin||l.kind!=='sample'||!!v.number.trim());});
 async function submit(){
  const ok=await save(admin?'confirm':'receive',{trip_id:trip.id,order_id:order,replaces_id:correction?.id,date:parseJsplDateInput(date),invoice_date:parseJsplDateInput(invoiceDate),invoice_number:invoice.trim(),
   lines:chosen.map(l=>({order_line_id:l.order_line_id,quantity:Number(inputs[l.order_line_id].qty),unit_price:Number(inputs[l.order_line_id].price),marking:inputs[l.order_line_id].marking})),
   numbers:Object.fromEntries(chosen.filter(l=>l.kind==='sample').map(l=>[l.order_line_id,inputs[l.order_line_id].number]))});
  if(ok)close();
 }
 return <View style={S.card}><Text style={S.title}>{lines[0]?.order_number} · Receive trip items</Text>
 <StockDateField label="Receipt date" value={date} onChange={setDate}/><StockDateField label="Invoice date" value={invoiceDate} onChange={setInvoiceDate}/>
 <Field label="Supplier invoice number" value={invoice} onChange={setInvoice}/>
 <StockLineTable columns={[{label:'Receive',width:70},{label:'Item',width:170},{label:'Outstanding',width:100},{label:'Actual qty',width:105},{label:'Invoice price',width:115},{label:'Marking / part number',width:170}]}
 rows={lines.map(l=>{const id=l.order_line_id,v=inputs[id];return {key:id,cells:[<Tick label={'Receive '+l.item_name} on={!!v} press={()=>setInputs(old=>{const next={...old};if(next[id])delete next[id];else next[id]={qty:String(l.to_receive),price:l.ordered_unit_price==null?'':String(l.ordered_unit_price),marking:'',number:''};return next;})}/>,text([l.item_name,l.ref].filter(Boolean).join(' · ')),text(Number(l.to_receive)),
 v?<Field hideLabel label={'Actual quantity '+l.item_name} numeric value={v.qty} onChange={qty=>patch(id,{qty})}/>:null,v?<Field hideLabel label={'Invoice price '+l.item_name} numeric value={v.price} onChange={price=>patch(id,{price})}/>:null,
 v&&l.kind==='sample'?<View><Field label="Observed marking" value={v.marking} onChange={marking=>patch(id,{marking})}/>{admin?<Field label="Confirm part number" value={v.number} onChange={number=>patch(id,{number})}/>:null}</View>:null]};})}/>
 <Button title={admin?'Confirm receipt and post':'Submit for Admin verification'} disabled={busy||!valid} onPress={()=>void submit()}/><Button title="Close receipt" disabled={busy} onPress={close}/></View>;
}
export function TownPlanDetail({trip,admin,canReceive,busy,save}:{trip:PlannedTrip;admin:boolean;canReceive:boolean;busy:boolean;save:PlanSave}){
 const [receiving,setReceiving]=useState<{order:number;correction?:Correction}|null>(null);
 const suppliers=[...new Set(trip.plan_lines.map(l=>l.supplier_name))];
 const driverOnly=!admin&&!canReceive&&trip.can_report;
 const entries=trip.plan_lines.map(l=>({basis:l.payment_basis??'',qty:Math.max(0,Number(l.quantity)-Number(l.posted)),price:l.ordered_unit_price})).concat(booked(trip));
 return <>{!driverOnly?<Totals amounts={entries}/>:null}
 {suppliers.map(supplier=>{const rows=trip.plan_lines.filter(l=>l.supplier_name===supplier),visited=!!rows[0]?.visited_at;
 return <View style={S.card} key={supplier}><View style={S.row}>{trip.can_report?<Tick label={'Visited '+supplier} on={visited} disabled={visited||busy||!!trip.finalised_at} press={()=>void save('visit',{trip_id:trip.id,supplier})}/>:null}
 <Text style={S.title}>{supplier}</Text>{text(visited?'Visited':'Awaiting visit')}</View>
 <StockLineTable columns={[{label:'PO',width:110},{label:'Item',width:190},{label:'Planned',width:90},...(driverOnly?[]:[{label:'Unit price',width:95},{label:'Terms',width:140},{label:'Verified',width:90},{label:trip.finalised_at?'Unreceived':'To receive',width:100}])]}
 rows={rows.map(l=>({key:l.order_line_id,cells:[text(l.order_number),text(l.item_name),text(Number(l.quantity)),...(driverOnly?[]:[text(cost(l.ordered_unit_price)),text([l.payment_basis,l.terms_note].filter(Boolean).join(' · ')),text(Number(l.posted)),text(Number(l.to_receive))])] }))}/>
 {canReceive&&!trip.finalised_at?[...new Map(rows.filter(l=>Number(l.to_receive)>0).map(l=>[l.order_id,l])).values()].map(l=><Button key={l.order_id} title={'Receive '+l.order_number} disabled={busy} onPress={()=>setReceiving({order:Number(l.order_id)})}/>):null}</View>;})}
 {trip.corrections?.map(c=><View key={c.id} style={S.card}>{text('Receipt '+c.request_number+' · '+c.reason)}{canReceive&&!trip.finalised_at?<Button title="Correct trip receipt" onPress={()=>setReceiving({order:Number(c.payload.order_id),correction:c})}/>:null}</View>)}
 {receiving?<TripReceipt key={receiving.order+'-'+(receiving.correction?.id??'new')} trip={trip} order={receiving.order} correction={receiving.correction} admin={admin} busy={busy} save={save} close={()=>setReceiving(null)}/>:null}
 {trip.receipts?.map((r,i)=><Text key={i} style={S.text}>{r.invoice} · {trip.plan_lines.find(l=>Number(l.order_line_id)===Number(r.order_line_id))?.item_name} · {Number(r.qty)} · {r.basis} · {r.status==='posted'?'Verified':'Awaiting verification'}</Text>)}
 {admin&&trip.terms_history?.map((c,i)=><Text key={i} style={S.text}>{trip.plan_lines.find(l=>Number(l.order_line_id)===Number(c.order_line_id))?.item_name} · {Number(c.quantity)} · {c.previous_terms||'Unspecified'} → {c.new_terms} · {c.reason} · {c.actor}</Text>)}
 </>;
}
