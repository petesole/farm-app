import {StockRecovery} from "@/components/jspl/StockWorkflowControls";
import {StockProductEditor} from '@/components/jspl/StockProductEditor';
import {useState,useCallback,useEffect,useRef} from 'react';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {ActivityIndicator,Modal,ScrollView,Text,View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockButton as Button,StockField as Field,StockSelect as Select,StockDocumentSummary,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {stockContext,stockMutation,stockRequest,stockUUID,ApprovalDocument,WorkflowContext} from '@/utils/stock-workflow';
import {parseJsplDateInput,displayJsplDate} from '@/utils/jspl-input';
type Line={item_code:string;quantity:string;unit_price:string};
const blank=():Line=>({item_code:'',quantity:'',unit_price:''});
export default function PurchaseOrders(){
 const router=useRouter(),params=useLocalSearchParams<{edit?:string;status?:string;from?:string;fromSpray?:string;job?:string;owner?:string;part?:string;quote?:string}>(),openedEdit=useRef('');
 const [sourceSpray,setSourceSpray]=useState<number|null>(null);
 const [sourceJob,setSourceJob]=useState<string|null>(null);
 const [sourceQuote,setSourceQuote]=useState<{id:string;currency:string;reference:string}|null>(null);
 const [newProductLine,setNewProductLine]=useState<number|null>(null);
 const [newProductName,setNewProductName]=useState('');
 const [context,setContext]=useState<WorkflowContext|null>(null),[setup,setSetup]=useState<any>({}),[items,setItems]=useState<any[]>([]),[suppliers,setSuppliers]=useState<any[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState<string>(params.status??'all');
 const [editing,setEditing]=useState<ApprovalDocument|null>(null),[editor,setEditor]=useState(false),[id,setId]=useState(''),[owner,setOwner]=useState(''),[supplier,setSupplier]=useState(''),[date,setDate]=useState(''),[contract,setContract]=useState<number|null>(null),[lines,setLines]=useState<Line[]>([blank()]),[reason,setReason]=useState(''),[cancelling,setCancelling]=useState<ApprovalDocument|null>(null);
 const load=useCallback(async()=>{setBusy(true);try{const [c,s,p,v]=await Promise.all([stockContext(),stockRequest('?stock_setup=1'),stockRequest('?purchasing_feed=1'),stockRequest('?supplier_list=1')]);setContext(c);setSetup(s);setItems(p.items??[]);setSuppliers(v.suppliers??[]);}catch(e){setError(String((e as Error).message))}finally{setBusy(false)}},[]);
 useFocusEffect(useCallback(()=>{void load()},[load]));
 const open=(d:ApprovalDocument|null)=>{setSourceJob(d?.payload.source_job_card_id??null);setSourceQuote(d?.payload.source_quote_id?{id:d.payload.source_quote_id,currency:d.payload.quote_currency,reference:d.payload.quote_reference}:null);setSourceSpray(d?.payload.source_spray_job_id??null);setEditing(d);setId(d?.id??stockUUID());setOwner(d?.payload.owner_code??'');setSupplier(d?.payload.supplier??'');setDate(d?displayJsplDate(d.payload.order_date):new Date().toLocaleDateString('en-GB'));setContract(d?.payload.contract_id??null);setLines(d?d.payload.lines.map((l:any)=>({item_code:l.item_code,quantity:String(l.quantity),unit_price:l.unit_price==null?'':String(l.unit_price)})):[blank()]);setReason('');setError('');setEditor(true)};
 useEffect(()=>{if(params.status)setFilter(params.status)},[params.status]);
 useEffect(()=>{if(!params.edit||!context||openedEdit.current===params.edit)return;const d=context.documents.find(x=>x.id===params.edit&&x.kind==='po');if(d&&!d.received&&d.status!=='cancelled'&&(!['approved','applied'].includes(d.status)||context.access.is_admin)){openedEdit.current=params.edit;open(d)}},[params.edit,context]);
 useEffect(()=>{
  const jobId=Number(params.fromSpray);if(!Number.isSafeInteger(jobId)||jobId<=0||!context||!items.length||openedEdit.current==='spray:'+jobId)return;
  openedEdit.current='spray:'+jobId;
  const existing=context.documents.find(d=>d.kind==='po'&&Number(d.payload.source_spray_job_id)===jobId&&d.status!=='cancelled'&&d.status!=='rejected');
  if(existing){if(existing.received||existing.status==='applied'||(existing.status==='approved'&&!context.access.is_admin)){setNotice('A purchase order already exists for this spray. Review the existing order before raising another.');return;}open(existing);setSourceSpray(jobId);return;}
  void stockRequest().then(data=>{
   const rows=(data.sprays??[]).filter((j:any)=>Number(j.job_id)===jobId);if(!rows.length)throw Error('Saved spray could not be loaded for its shortage PO.');
   const ownerCode=rows[0].owner_code??'JS';
   const shortages=rows.map((j:any)=>{const p=data.items.find((p:any)=>p.item_code===j.item_code);return {item_code:j.item_code,quantity:String(Math.max(0,Number(j.planned_quantity)-Number(j.issued_quantity)-Number(ownerCode==='AO'?p?.ao_quantity??0:p?.quantity??0))),unit_price:''}}).filter((l:Line)=>Number(l.quantity)>0.000001);
   if(!shortages.length){setNotice('This spray now has sufficient owner stock.');return;}
   open(null);setSourceSpray(jobId);setOwner(ownerCode);setLines(shortages);
  }).catch(e=>setError(e.message));
 },[params.fromSpray,context,items]);
 useEffect(()=>{
  const jobId=params.job,ownerCode=params.owner;
  const sourceKey='job:'+jobId+':'+ownerCode+':'+(params.quote??'');
  if(!jobId||!context||openedEdit.current===sourceKey)return;
  openedEdit.current=sourceKey;
  const existing=context.documents.find(d=>d.kind==='po'&&d.payload.source_job_card_id===jobId&&
   d.payload.owner_code===ownerCode&&d.status!=='cancelled'&&(!params.quote||d.payload.source_quote_id===params.quote));
  if(existing){
   if(!existing.received&&(!['applied','approved'].includes(existing.status)||context.access.is_admin))open(existing);
   else setNotice('An authorised purchase order already covers this Job Card and stock owner.');
   return;
  }
  if(params.quote&&params.part){
   void stockRequest('?job_part_quotes='+Number(params.part)).then(data=>{
    const quote=data.quotes.find((entry:{id:string})=>entry.id===params.quote);
    if(!quote||data.part.job_id!==jobId||(data.part.owner_code&&data.part.owner_code!==ownerCode))throw Error('The selected quotation is unavailable for this Job Card.');
    open(null);setSourceJob(jobId);setOwner(ownerCode??'');setSupplier(quote.supplier_name);
    setSourceQuote({id:quote.id,currency:quote.currency,reference:quote.quote_reference});
    setLines([{item_code:data.part.item_code,quantity:String(data.part.quantity),unit_price:quote.unit_price}]);
   }).catch(failure=>setError(failure.message));
   return;
  }
  void stockRequest('?job_cards=1').then(data=>{
   const card=data.cards.find((entry:{id:string})=>entry.id===jobId);
   const requested=card?.parts.filter((part:{owner_code:string;direct_expense?:boolean})=>(part.owner_code??'')===(ownerCode??'')&&!part.direct_expense);
   if(!data.can_buy||!requested?.length)throw Error('No parts are available for this Job Card and stock owner.');
   open(null);setSourceJob(jobId);setOwner(ownerCode??'');
   setLines(requested.map((part:{item_code:string;quantity:number;unit_price?:number|null})=>({item_code:part.item_code,quantity:String(part.quantity),unit_price:String(part.unit_price??'')})));
  }).catch(failure=>setError(failure.message));
 },[params.job,params.owner,params.part,params.quote,context]);
 const closeEditor=()=>{if(busy)return;if(params.from==='approval')router.replace('/stock-v2-approvals');else if(params.fromSpray)router.replace('/stock-v2-spray-planning');else if(params.from==='job-card')router.back();else setEditor(false)};
 const command=async(cmd:string,d:ApprovalDocument,data:any={})=>{setBusy(true);setError('');try{await stockMutation('po',{action:'workflow_command',command:cmd,data:{id:d.id,version:d.version,...data}});setEditor(false);setCancelling(null);await load();setNotice('PO '+(cmd==='finalise'?'finalised':cmd==='cancel'?'cancelled':'saved'));}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const save=async(cmd:'save'|'submit')=>{const iso=parseJsplDateInput(date);if(!iso){setError('Enter a valid date, dd/mm/yyyy');return;}setBusy(true);setError('');try{
  const payload={...(editing?.payload.payment_terms?{payment_terms:editing.payload.payment_terms}:{}),...(sourceSpray?{source_spray_job_id:sourceSpray}:{}),...(sourceJob?{source_job_card_id:sourceJob}:{}),...(sourceQuote?{source_quote_id:sourceQuote.id}:{}),owner_code:owner,supplier,order_date:iso,contract_id:contract,lines:lines.map(l=>({item_code:l.item_code,item_name:items.find(i=>i.item_code===l.item_code)?.item_name,quantity:Number(l.quantity),unit_price:l.unit_price.trim()===''?null:Number(l.unit_price)}))};
  await stockMutation('po',{action:'workflow_command',command:cmd==='save'&&editing?.status==='pending'?'submit':cmd,data:{id,version:editing?.version,kind:'po',payload,reason}});
  setEditor(false);await load();setNotice(cmd==='submit'?'PO submitted for Admin approval':'PO saved');if(params.fromSpray)router.replace('/stock-v2-spray-planning');else if(params.from==='approval')router.replace('/stock-v2-approvals');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const selectedOwner=setup.owners?.find((o:any)=>o.owner_code===owner);
 const change=(n:number,key:keyof Line,v:string)=>setLines(ls=>ls.map((l,i)=>i===n?{...l,[key]:v}:l));
 const docs=(context?.documents??[]).filter(d=>d.kind==='po'&&(filter==='all'||d.status===filter));
 return <ScrollView contentContainerStyle={S.page}><StockV2Header title="Purchase Orders"
 backLabel={params.from==="job-card"?"← Job Cards":params.from==="buying"?"← Buying":undefined}
 onStock={params.from==="job-card"?()=>router.back():params.from==="buying"?()=>router.replace("/buying"):undefined} onRefresh={()=>void load()}/>
 <Text style={S.text}>Stock or Buying submits a purchase order. Admin authorisation makes it available for receiving.</Text>
 {notice?<Text style={S.success}>{notice}</Text>:null}{!editor&&error?<Text style={S.error}>{error}</Text>:null}
 <View style={S.row}><Button title="New Purchase Order" disabled={busy||!(context?.access.is_stock||context?.access.is_buyer)} onPress={()=>open(null)}/></View>
 <Select label="Status" value={filter} onChange={v=>setFilter(String(v??'all'))} options={['all','draft','pending','approved','applied','rejected','cancelled'].map(x=>({id:x,label:x==='all'?'All statuses':x==='approved'?'Approved – ready to finalise':x==='applied'?'Finalised – available for receiving':x}))}/>
 {busy?<ActivityIndicator/>:null}{!busy&&!docs.length?<Text>No purchase orders for this selection.</Text>:null}
 {context?.documents.some(d=>d.kind==='po'&&d.status==='approved')?<Text style={S.muted}>Previously approved orders can be finalised below.</Text>:null}
 {(context?.documents??[]).some(d=>d.kind==='po'&&d.status==='applied')?<View style={S.row}><Button title="Open PO Receiving" onPress={()=>router.push({pathname:'/stock-v2-po-receiving',params:params.from==='buying'?{from:'buying'}:{}})}/></View>:null}
 {docs.map(d=><View style={S.card} key={d.id}><StockDocumentSummary document={d}/>
 {d.payload.payment_terms?<Text style={S.text}>Payment terms · {d.payload.payment_terms}</Text>:null}<View style={S.row}>
 {!d.received&&d.status!=='cancelled'&&(!['approved','applied'].includes(d.status)||context?.access.is_admin)?<Button title="Open / Edit" disabled={busy} onPress={()=>open(d)}/>:null}
 {d.received&&d.status==='applied'&&context?.access.is_admin?<Button title="Cancel Outstanding Balance" disabled={busy} onPress={()=>{setCancelling(d);setReason('');setError('')}}/>:null}
 {d.status==='approved'&&context?.access.is_stock?<Button title="Finalise Order" disabled={busy} onPress={()=>void command('finalise',d)}/>:null}
 </View></View>)}
 <Modal visible={!!cancelling} onRequestClose={()=>{if(!busy)setCancelling(null)}}><ScrollView contentContainerStyle={S.page}><StockV2Header title="Cancel Outstanding PO Balance" backLabel="← Purchase Orders" onStock={()=>{if(!busy)setCancelling(null)}}/>
 {cancelling?<><StockDocumentSummary document={cancelling}/><Text>Only unreceived quantities will be cancelled. Received stock and original order history are preserved.</Text><Field label="Cancellation reason" value={reason} onChange={setReason}/>{error?<><Text style={S.error}>{error}</Text><StockRecovery scope="po" onRecovered={()=>void load()}/></>:null}<Button title="Cancel Outstanding Balance" disabled={busy||reason.trim().length<5} onPress={()=>void command('cancel',cancelling,{reason})}/></>:null}</ScrollView></Modal>
 <Modal visible={editor} onRequestClose={closeEditor}><ScrollView contentContainerStyle={S.page}><StockV2Header title={editing?'Edit Purchase Order':'New Purchase Order'} onStock={closeEditor} backLabel={params.from==='approval'?'← Approvals':'← Purchase Orders'}/>
 {sourceQuote?<Text style={S.text}>Supplier quotation {sourceQuote.reference} · {sourceQuote.currency}</Text>:null}
 {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="po" onRecovered={()=>void load()}/></>:null}
 <Select label="Stock owner" value={owner} options={(setup.owners??[]).filter((o:any)=>o.active).map((o:any)=>({id:o.owner_code,label:o.owner_code+' · '+o.owner_name}))} onChange={v=>{setOwner(String(v??''));setContract(null)}} disabled={!!editing?.target_order_id}/>
 <Select label={owner==="AO"?"Supplier (optional)":"Supplier"} value={supplier} options={suppliers.filter(s=>s.active||s.supplier_name===supplier).map(s=>({id:s.supplier_name,label:s.supplier_name}))} onChange={v=>setSupplier(String(v??''))}/>
 <Field label="Order date (dd/mm/yyyy)" value={date} onChange={setDate}/>
 {selectedOwner?.po_requires_contract?<Select label="Contract" value={selectedOwner.default_contract_id==null?contract:Number(selectedOwner.default_contract_id)} disabled={!!selectedOwner.default_contract_id} options={(setup.contracts??[]).filter((c:any)=>c.active).map((c:any)=>({id:Number(c.contract_id),label:c.contract_code}))} onChange={v=>setContract(v==null?null:Number(v))}/>:null}
 {lines.map((l,n)=><View key={n} style={S.card}><ScrollView horizontal contentContainerStyle={{flexGrow:1}}><View style={{flexDirection:'row',alignItems:'flex-start',gap:12,minWidth:680,flex:1}}>
 <View style={{flex:3,minWidth:260,gap:8}}><Select label={'Product '+(n+1)} value={l.item_code} options={items.filter(i=>i.active&&!lines.some((x,j)=>j!==n&&x.item_code===i.item_code)).map(i=>({id:i.item_code,label:i.item_name+' · '+i.base_unit}))} onChange={v=>change(n,'item_code',String(v??''))} onCreate={context?.access.is_stock?q=>{setNewProductName(q);setNewProductLine(n)}:undefined}/><Button title={'+ New Product for line '+(n+1)} disabled={busy||!context?.access.is_stock} onPress={()=>{setNewProductName('');setNewProductLine(n)}}/></View>
 <View style={{flex:1,minWidth:140}}><Field label="Quantity" numeric value={l.quantity} onChange={v=>change(n,'quantity',v)}/></View>
 <View style={{flex:1,minWidth:150}}><Field label="Unit price (optional)" numeric value={l.unit_price} onChange={v=>change(n,'unit_price',v)}/></View>
 {lines.length>1?<View style={{paddingTop:26}}><Button title="Remove line" disabled={busy} onPress={()=>setLines(ls=>ls.filter((_,i)=>i!==n))}/></View>:null}
 </View></ScrollView></View>)}
 <View style={S.row}><Button title="Add product" disabled={busy||lines.length>=30} onPress={()=>setLines(ls=>[...ls,blank()])}/></View>
 {editing?<Field label="Reason for correction / cancellation" value={reason} onChange={setReason}/>:null}
 <View style={S.row}><Button title={editing?'Save Changes':'Save Draft'} disabled={busy} onPress={()=>void save('save')}/>{!editing||!['approved','applied'].includes(editing.status)?<Button title="Submit for Approval" disabled={busy} onPress={()=>void save('submit')}/>:null}{editing&&context?.access.is_stock?<Button title="Cancel PO" disabled={busy} onPress={()=>void command('cancel',editing,{reason})}/>:null}</View>
 {newProductLine!==null?<StockProductEditor product={null} initialName={newProductName} onCancel={()=>setNewProductLine(null)} onSaved={async product=>{const data=await stockRequest();if(!data.items?.some((p:any)=>p.item_code===product.item_code))throw Error('Product saved; refresh not confirmed. Verify Save to return to this PO.');setItems(data.items);change(newProductLine,'item_code',product.item_code);setNewProductLine(null)}}/>:null}
 </ScrollView></Modal></ScrollView>;
}
