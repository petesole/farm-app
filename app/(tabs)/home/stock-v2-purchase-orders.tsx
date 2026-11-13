import {StockRecovery} from "@/components/jspl/StockWorkflowControls";
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
 const router=useRouter(),params=useLocalSearchParams<{edit?:string;status?:string;from?:string}>(),openedEdit=useRef('');
 const [context,setContext]=useState<WorkflowContext|null>(null),[setup,setSetup]=useState<any>({}),[items,setItems]=useState<any[]>([]),[suppliers,setSuppliers]=useState<any[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState<string>(params.status??'all');
 const [editing,setEditing]=useState<ApprovalDocument|null>(null),[editor,setEditor]=useState(false),[id,setId]=useState(''),[owner,setOwner]=useState(''),[supplier,setSupplier]=useState(''),[date,setDate]=useState(''),[contract,setContract]=useState<number|null>(null),[lines,setLines]=useState<Line[]>([blank()]),[reason,setReason]=useState(''),[cancelling,setCancelling]=useState<ApprovalDocument|null>(null);
 const load=useCallback(async()=>{setBusy(true);try{const [c,s,p,v]=await Promise.all([stockContext(),stockRequest('?stock_setup=1'),stockRequest(),stockRequest('?supplier_list=1')]);setContext(c);setSetup(s);setItems(p.items??[]);setSuppliers(v.suppliers??[]);}catch(e){setError(String((e as Error).message))}finally{setBusy(false)}},[]);
 useFocusEffect(useCallback(()=>{void load()},[load]));
 const open=(d:ApprovalDocument|null)=>{setEditing(d);setId(d?.id??stockUUID());setOwner(d?.payload.owner_code??'');setSupplier(d?.payload.supplier??'');setDate(d?displayJsplDate(d.payload.order_date):new Date().toLocaleDateString('en-GB'));setContract(d?.payload.contract_id??null);setLines(d?d.payload.lines.map((l:any)=>({item_code:l.item_code,quantity:String(l.quantity),unit_price:l.unit_price==null?'':String(l.unit_price)})):[blank()]);setReason('');setError('');setEditor(true)};
 useEffect(()=>{if(params.status)setFilter(params.status)},[params.status]);
 useEffect(()=>{if(!params.edit||!context||openedEdit.current===params.edit)return;const d=context.documents.find(x=>x.id===params.edit&&x.kind==='po');if(d&&!d.received&&d.status!=='cancelled'&&(!['approved','applied'].includes(d.status)||context.access.is_admin)){openedEdit.current=params.edit;open(d)}},[params.edit,context]);
 const closeEditor=()=>{if(busy)return;if(params.from==='approval')router.replace('/stock-v2-approvals');else setEditor(false)};
 const command=async(cmd:string,d:ApprovalDocument,data:any={})=>{setBusy(true);setError('');try{await stockMutation('po',{action:'workflow_command',command:cmd,data:{id:d.id,version:d.version,...data}});setEditor(false);setCancelling(null);await load();setNotice('PO '+(cmd==='finalise'?'finalised':cmd==='cancel'?'cancelled':'saved'));}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const save=async(cmd:'save'|'submit')=>{const iso=parseJsplDateInput(date);if(!iso){setError('Enter a valid date, dd/mm/yyyy');return;}setBusy(true);setError('');try{
  const payload={owner_code:owner,supplier,order_date:iso,contract_id:contract,lines:lines.map(l=>({item_code:l.item_code,item_name:items.find(i=>i.item_code===l.item_code)?.item_name,quantity:Number(l.quantity),unit_price:l.unit_price.trim()===''?null:Number(l.unit_price)}))};
  await stockMutation('po',{action:'workflow_command',command:cmd==='save'&&editing?.status==='pending'?'submit':cmd,data:{id,version:editing?.version,kind:'po',payload,reason}});
  setEditor(false);await load();setNotice(cmd==='submit'?'PO submitted for Admin approval':'PO saved');if(params.from==='approval')router.replace('/stock-v2-approvals');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const selectedOwner=setup.owners?.find((o:any)=>o.owner_code===owner);
 const change=(n:number,key:keyof Line,v:string)=>setLines(ls=>ls.map((l,i)=>i===n?{...l,[key]:v}:l));
 const docs=(context?.documents??[]).filter(d=>d.kind==='po'&&(filter==='all'||d.status===filter));
 return <ScrollView contentContainerStyle={S.page}><StockV2Header title="Purchase Orders" onRefresh={()=>void load()}/>
 <Text style={S.text}>Stock enters → Admin approves → Purchase Orders (Approved – ready to finalise) → Stock finalises. A finalised PO is available for receiving. Received quantities remain locked. Admin may cancel the outstanding balance with an audited reason.</Text>
 {notice?<Text style={S.success}>{notice}</Text>:null}{!editor&&error?<Text style={S.error}>{error}</Text>:null}
 <View style={S.row}><Button title="New Purchase Order" disabled={busy||!context?.access.is_stock} onPress={()=>open(null)}/></View>
 <Select label="Status" value={filter} onChange={v=>setFilter(String(v??'all'))} options={['all','draft','pending','approved','applied','rejected','cancelled'].map(x=>({id:x,label:x==='all'?'All statuses':x==='approved'?'Approved – ready to finalise':x==='applied'?'Finalised – available for receiving':x}))}/>
 {busy?<ActivityIndicator/>:null}{!busy&&!docs.length?<Text>No purchase orders for this selection.</Text>:null}
 <Text style={S.muted}>{context?.documents.filter(d=>d.kind==='po'&&d.status==='approved').length??0} approved orders ready to finalise. Finalised orders are available on POs Outstanding / Receiving.</Text>
 {(context?.documents??[]).some(d=>d.kind==='po'&&d.status==='applied')?<View style={S.row}><Button title="Open PO Receiving" onPress={()=>router.push('/stock-v2-po-receiving')}/></View>:null}
 {docs.map(d=><View style={S.card} key={d.id}><StockDocumentSummary document={d}/><View style={S.row}>
 {!d.received&&d.status!=='cancelled'&&(!['approved','applied'].includes(d.status)||context?.access.is_admin)?<Button title="Open / Edit" disabled={busy} onPress={()=>open(d)}/>:null}
 {d.received&&d.status==='applied'&&context?.access.is_admin?<Button title="Cancel Outstanding Balance" disabled={busy} onPress={()=>{setCancelling(d);setReason('');setError('')}}/>:null}
 {d.status==='approved'?<Button title="Finalise Order" disabled={busy} onPress={()=>void command('finalise',d)}/>:null}
 </View></View>)}
 <Modal visible={!!cancelling} onRequestClose={()=>{if(!busy)setCancelling(null)}}><ScrollView contentContainerStyle={S.page}><StockV2Header title="Cancel Outstanding PO Balance" backLabel="← Purchase Orders" onStock={()=>{if(!busy)setCancelling(null)}}/>
 {cancelling?<><StockDocumentSummary document={cancelling}/><Text>Only unreceived quantities will be cancelled. Received stock and original order history are preserved.</Text><Field label="Cancellation reason" value={reason} onChange={setReason}/>{error?<><Text style={S.error}>{error}</Text><StockRecovery scope="po" onRecovered={()=>void load()}/></>:null}<Button title="Cancel Outstanding Balance" disabled={busy||reason.trim().length<5} onPress={()=>void command('cancel',cancelling,{reason})}/></>:null}</ScrollView></Modal>
 <Modal visible={editor} onRequestClose={closeEditor}><ScrollView contentContainerStyle={S.page}><StockV2Header title={editing?'Edit Purchase Order':'New Purchase Order'} onStock={closeEditor} backLabel={params.from==='approval'?'← Approvals':'← Purchase Orders'}/>
 {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="po" onRecovered={()=>void load()}/></>:null}
 <Select label="Stock owner" value={owner} options={(setup.owners??[]).filter((o:any)=>o.active).map((o:any)=>({id:o.owner_code,label:o.owner_code+' · '+o.owner_name}))} onChange={v=>{setOwner(String(v??''));setContract(null)}} disabled={!!editing?.target_order_id}/>
 <Select label="Supplier" value={supplier} options={suppliers.filter(s=>s.active||s.supplier_name===supplier).map(s=>({id:s.supplier_name,label:s.supplier_name}))} onChange={v=>setSupplier(String(v??''))}/>
 <Field label="Order date (dd/mm/yyyy)" value={date} onChange={setDate}/>
 {selectedOwner?.po_requires_contract?<Select label="Contract" value={selectedOwner.default_contract_id==null?contract:Number(selectedOwner.default_contract_id)} disabled={!!selectedOwner.default_contract_id} options={(setup.contracts??[]).filter((c:any)=>c.active).map((c:any)=>({id:Number(c.contract_id),label:c.contract_code}))} onChange={v=>setContract(v==null?null:Number(v))}/>:null}
 {lines.map((l,n)=><View key={n} style={S.card}><ScrollView horizontal contentContainerStyle={{flexGrow:1}}><View style={{flexDirection:'row',alignItems:'flex-start',gap:12,minWidth:680,flex:1}}>
 <View style={{flex:3,minWidth:260}}><Select label={'Product '+(n+1)} value={l.item_code} options={items.filter(i=>i.active&&!lines.some((x,j)=>j!==n&&x.item_code===i.item_code)).map(i=>({id:i.item_code,label:i.item_name+' · '+i.base_unit}))} onChange={v=>change(n,'item_code',String(v??''))}/></View>
 <View style={{flex:1,minWidth:140}}><Field label="Quantity" numeric value={l.quantity} onChange={v=>change(n,'quantity',v)}/></View>
 <View style={{flex:1,minWidth:150}}><Field label="Unit price (optional)" numeric value={l.unit_price} onChange={v=>change(n,'unit_price',v)}/></View>
 {lines.length>1?<View style={{paddingTop:26}}><Button title="Remove line" disabled={busy} onPress={()=>setLines(ls=>ls.filter((_,i)=>i!==n))}/></View>:null}
 </View></ScrollView></View>)}
 <View style={S.row}><Button title="Add product" disabled={busy||lines.length>=30} onPress={()=>setLines(ls=>[...ls,blank()])}/></View>
 {editing?<Field label="Reason for correction / cancellation" value={reason} onChange={setReason}/>:null}
 <View style={S.row}><Button title={editing?'Save Changes':'Save Draft'} disabled={busy} onPress={()=>void save('save')}/>{!editing||!['approved','applied'].includes(editing.status)?<Button title="Submit for Approval" disabled={busy} onPress={()=>void save('submit')}/>:null}{editing?<Button title="Cancel PO" disabled={busy} onPress={()=>void command('cancel',editing,{reason})}/>:null}</View>
 </ScrollView></Modal></ScrollView>;
}
