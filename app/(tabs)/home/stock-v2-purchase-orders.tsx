import {StockRecovery} from "@/components/jspl/StockWorkflowControls";
import {useState,useCallback} from 'react';
import {useFocusEffect} from 'expo-router';
import {ActivityIndicator,Modal,ScrollView,Text,View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockButton as Button,StockField as Field,StockSelect as Select,StockDocumentSummary,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {stockContext,stockMutation,stockRequest,stockUUID,ApprovalDocument,WorkflowContext} from '@/utils/stock-workflow';
import {parseJsplDateInput,displayJsplDate} from '@/utils/jspl-input';
type Line={item_code:string;quantity:string;unit_price:string};
const blank=():Line=>({item_code:'',quantity:'',unit_price:''});
export default function PurchaseOrders(){
 const [context,setContext]=useState<WorkflowContext|null>(null),[setup,setSetup]=useState<any>({}),[items,setItems]=useState<any[]>([]),[suppliers,setSuppliers]=useState<any[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState<string>('all');
 const [editing,setEditing]=useState<ApprovalDocument|null>(null),[editor,setEditor]=useState(false),[id,setId]=useState(''),[owner,setOwner]=useState(''),[supplier,setSupplier]=useState(''),[date,setDate]=useState(''),[contract,setContract]=useState<number|null>(null),[lines,setLines]=useState<Line[]>([blank()]),[reason,setReason]=useState('');
 const load=useCallback(async()=>{setBusy(true);try{const [c,s,p,v]=await Promise.all([stockContext(),stockRequest('?stock_setup=1'),stockRequest(),stockRequest('?supplier_list=1')]);setContext(c);setSetup(s);setItems(p.items??[]);setSuppliers(v.suppliers??[]);}catch(e){setError(String((e as Error).message))}finally{setBusy(false)}},[]);
 useFocusEffect(useCallback(()=>{void load()},[load]));
 const open=(d:ApprovalDocument|null)=>{setEditing(d);setId(d?.id??stockUUID());setOwner(d?.payload.owner_code??'');setSupplier(d?.payload.supplier??'');setDate(d?displayJsplDate(d.payload.order_date):new Date().toLocaleDateString('en-GB'));setContract(d?.payload.contract_id??null);setLines(d?d.payload.lines.map((l:any)=>({item_code:l.item_code,quantity:String(l.quantity),unit_price:l.unit_price==null?'':String(l.unit_price)})):[blank()]);setReason('');setError('');setEditor(true)};
 const command=async(cmd:string,d:ApprovalDocument,data:any={})=>{setBusy(true);setError('');try{await stockMutation('po',{action:'workflow_command',command:cmd,data:{id:d.id,version:d.version,...data}});setEditor(false);await load();setNotice('PO '+(cmd==='finalise'?'finalised':cmd==='cancel'?'cancelled':'saved'));}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const save=async(cmd:'save'|'submit')=>{const iso=parseJsplDateInput(date);if(!iso){setError('Enter a valid date, dd/mm/yyyy');return;}setBusy(true);setError('');try{
  const payload={owner_code:owner,supplier,order_date:iso,contract_id:contract,lines:lines.map(l=>({item_code:l.item_code,item_name:items.find(i=>i.item_code===l.item_code)?.item_name,quantity:Number(l.quantity),unit_price:l.unit_price.trim()===''?null:Number(l.unit_price)}))};
  await stockMutation('po',{action:'workflow_command',command:cmd,data:{id,version:editing?.version,kind:'po',payload,reason}});
  setEditor(false);await load();setNotice(cmd==='submit'?'PO submitted for Admin approval':'PO saved');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const selectedOwner=setup.owners?.find((o:any)=>o.owner_code===owner);
 const change=(n:number,key:keyof Line,v:string)=>setLines(ls=>ls.map((l,i)=>i===n?{...l,[key]:v}:l));
 const docs=(context?.documents??[]).filter(d=>d.kind==='po'&&(filter==='all'||d.status===filter));
 return <ScrollView contentContainerStyle={S.page}><StockV2Header title="Purchase Orders" onRefresh={()=>void load()}/>
 <Text style={S.text}>Stock enters → Admin approves → Stock finalises. A finalised PO is available for receiving. Once any stock is received, the PO is locked.</Text>
 {notice?<Text style={S.success}>{notice}</Text>:null}{!editor&&error?<Text style={S.error}>{error}</Text>:null}
 <View style={S.row}><Button title="New Purchase Order" disabled={busy||!context?.access.is_stock} onPress={()=>open(null)}/></View>
 <Select label="Status" value={filter} onChange={v=>setFilter(String(v??'all'))} options={['all','draft','pending','approved','applied','rejected','cancelled'].map(x=>({id:x,label:x==='all'?'All statuses':x==='applied'?'Finalised':x}))}/>
 {busy?<ActivityIndicator/>:null}{!busy&&!docs.length?<Text>No purchase orders for this selection.</Text>:null}
 {docs.map(d=><View style={S.card} key={d.id}><StockDocumentSummary document={d}/><View style={S.row}>
 {!d.received&&d.status!=='cancelled'&&(!['approved','applied'].includes(d.status)||context?.access.is_admin)?<Button title="Open / Edit" disabled={busy} onPress={()=>open(d)}/>:null}
 {d.status==='approved'?<Button title="Finalise Order" disabled={busy} onPress={()=>void command('finalise',d)}/>:null}
 </View></View>)}
 <Modal visible={editor} onRequestClose={()=>{if(!busy)setEditor(false)}}><ScrollView contentContainerStyle={S.page}><StockV2Header title={editing?'Edit Purchase Order':'New Purchase Order'} onStock={()=>{if(!busy)setEditor(false)}}/>
 {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="po" onRecovered={()=>void load()}/></>:null}
 <Select label="Stock owner" value={owner} options={(setup.owners??[]).filter((o:any)=>o.active).map((o:any)=>({id:o.owner_code,label:o.owner_code+' · '+o.owner_name}))} onChange={v=>{setOwner(String(v??''));setContract(null)}} disabled={!!editing?.target_order_id}/>
 <Select label="Supplier" value={supplier} options={suppliers.filter(s=>s.active||s.supplier_name===supplier).map(s=>({id:s.supplier_name,label:s.supplier_name}))} onChange={v=>setSupplier(String(v??''))}/>
 <Field label="Order date (dd/mm/yyyy)" value={date} onChange={setDate}/>
 {selectedOwner?.po_requires_contract?<Select label="Contract" value={selectedOwner.default_contract_id==null?contract:Number(selectedOwner.default_contract_id)} disabled={!!selectedOwner.default_contract_id} options={(setup.contracts??[]).filter((c:any)=>c.active).map((c:any)=>({id:Number(c.contract_id),label:c.contract_code}))} onChange={v=>setContract(v==null?null:Number(v))}/>:null}
 {lines.map((l,n)=><View key={n} style={S.card}><Select label={'Product '+(n+1)} value={l.item_code} options={items.filter(i=>i.active&&!lines.some((x,j)=>j!==n&&x.item_code===i.item_code)).map(i=>({id:i.item_code,label:i.item_name+' · '+i.base_unit}))} onChange={v=>change(n,'item_code',String(v??''))}/><View style={S.row}><Field label="Quantity" numeric value={l.quantity} onChange={v=>change(n,'quantity',v)}/><Field label="Unit price (optional)" numeric value={l.unit_price} onChange={v=>change(n,'unit_price',v)}/>{lines.length>1?<Button title="Remove line" disabled={busy} onPress={()=>setLines(ls=>ls.filter((_,i)=>i!==n))}/>:null}</View></View>)}
 <View style={S.row}><Button title="Add product" disabled={busy||lines.length>=30} onPress={()=>setLines(ls=>[...ls,blank()])}/></View>
 {editing?<Field label="Reason for correction / cancellation" value={reason} onChange={setReason}/>:null}
 <View style={S.row}><Button title="Save Draft / Changes" disabled={busy} onPress={()=>void save('save')}/>{!editing||!['approved','applied'].includes(editing.status)?<Button title="Submit for Approval" disabled={busy} onPress={()=>void save('submit')}/>:null}{editing?<Button title="Cancel PO" disabled={busy} onPress={()=>void command('cancel',editing,{reason})}/>:null}</View>
 </ScrollView></Modal></ScrollView>;
}
