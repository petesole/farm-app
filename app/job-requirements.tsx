import {useCallback,useEffect,useMemo,useState} from 'react';
import {useFocusEffect,useLocalSearchParams,router} from 'expo-router';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockReport} from '@/components/jspl/StockReport';
import {StockButton as Button,StockField as Field,StockDateField,StockSelect as Select,StockRecovery,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {stockMutation,stockRequest} from '@/utils/stock-workflow';
import {displayJsplDate,parseJsplDateInput} from '@/utils/jspl-input';
import type {ReportColumn} from '@/utils/stock-report';
import {stockParent} from '@/utils/stock-navigation';

type Row={key:string;job_id:string;job_number:number;card_type:string;destination:string;kind:'part'|'sample'|'repair';description:string;ref:string|null;category_name:string;part_number:string|null;
 quantity:string;remaining:string;unit_price:string|null;supplier_id:string|null;supplier_name:string|null;owner_code:string|null;sent_on:string|null;declined_on:string|null;returned_on:string|null;verified_quantity:string;quote_ref:string|null;quote_work:string|null};
type Option={id:string;label:string};
type Portion={key:string;stage:string;qty:number;po:string|null;trip:number|null;invoice:string|null;receipt_date:string|null;price:number|null;supplier:string|null;source:boolean;job_id:string;job_number:number;card_type:string;destination:string;category_name:string;description:string;ref:string|null};
type ReportRow=Portion&{requirement?:Row};
type Data={rows:Row[];progress?:Portion[];suppliers:Option[];owners:Option[];access:{is_admin:boolean;is_buyer:boolean;is_stock:boolean}};
const today=()=>new Date().toLocaleDateString('en-GB');
function status(r:Row){
 if(r.declined_on)return r.sent_on&&!r.returned_on?'Awaiting return':'Declined';
 if(Number(r.verified_quantity)>=Number(r.quantity))return 'Received';
 if(Number(r.remaining)<=0)return 'Covered';
 if(r.kind!=='part'&&!r.sent_on)return 'Awaiting dispatch';
 if(r.kind==='repair'&&!r.quote_ref)return 'At supplier — awaiting quote';
 if(r.kind==='sample'&&!r.part_number)return 'At supplier — match from sample';
 return r.supplier_id?'Ready to order':'Choose supplier';
}
function canOrder(r:Row){return Number(r.remaining)>0&&!r.declined_on&&!!r.supplier_id&&(r.kind==='part'||!!r.sent_on)&&(r.kind!=='repair'||(!!r.quote_ref&&r.unit_price!=null));}
export default function JobRequirements(){
 const params=useLocalSearchParams<{job?:string;returnTo?:string}>();
 const [data,setData]=useState<Data>();const [job,setJob]=useState('');const [scope,setScope]=useState('outstanding');
 const [stage,setStage]=useState('');
 const [selected,setSelected]=useState<Record<string,{qty:string;owner:string}>>({});
 const [edit,setEdit]=useState<Row|null>(null),[review,setReview]=useState(false);
 const [supplier,setSupplier]=useState(''),[price,setPrice]=useState(''),[date,setDate]=useState(today);
 const [reference,setReference]=useState(''),[work,setWork]=useState(''),[number,setNumber]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setJob(params.job??'')},[params.job]);
 const load=useCallback(async()=>{setData(await stockRequest('?job_requirements=1'));},[]);
 useFocusEffect(useCallback(()=>{void load().catch(e=>setError(e.message));},[load]));
 const buy=data?.access.is_buyer||data?.access.is_admin;
 const portions=useMemo<ReportRow[]>(()=>{
  const requirements=new Map((data?.rows??[]).map(r=>[r.key,r]));
  const progress=data?.progress??(data?.rows??[]).map(r=>({...r,stage:status(r),qty:Number(r.remaining),po:null,trip:null,invoice:null,receipt_date:null,price:r.unit_price==null?null:Number(r.unit_price),supplier:r.supplier_name,source:Number(r.remaining)>0}));
  return progress.filter(p=>(!job||p.job_id===job)&&((scope==='received')===(p.stage==='Received'))).map(p=>({...p,requirement:requirements.get(p.key)}));
 },[data,job,scope]);
 const statuses=useMemo(()=>[...new Set(portions.map(p=>p.stage))].sort(),[portions]);
 useEffect(()=>{if(stage&&!statuses.includes(stage))setStage('')},[stage,statuses]);
 const visible=useMemo(()=>portions.filter(p=>!stage||p.stage===stage),[portions,stage]);
 const chosen=(data?.rows??[]).filter(r=>selected[r.key]);
 const groups=new Map<string,Row[]>();
 chosen.forEach(r=>{
  const groupKey=JSON.stringify([r.supplier_id,selected[r.key].owner]);
  const group=groups.get(groupKey);
  if(group)group.push(r);else groups.set(groupKey,[r]);
 });
 const open=useCallback((r:Row)=>{setEdit(r);setSupplier(String(r.supplier_id??''));setPrice(String(r.unit_price??''));setReference(r.quote_ref??'');setWork(r.quote_work??'');setNumber(r.part_number??'');setDate(today());setError('');setNotice('');},[]);
 const columns=useMemo<ReportColumn<ReportRow>[]>(()=>[
  ...(scope==='outstanding'?[{key:'pick',title:'Order',width:78,filterable:false,onPress:()=>{},value:()=>''}]:[]),
  {key:'stage',title:'Status',width:180,value:r=>r.stage},{key:'quantity',title:'Qty',width:85,kind:'number',value:r=>Number(r.qty)},
  {key:'card',title:'Job Card',width:104,value:r=>String(r.job_number)},{key:'type',title:'Job type',width:110,value:r=>r.card_type},
  {key:'destination',title:'Asset / trace',width:170,value:r=>r.destination},{key:'item',title:'Item',width:210,value:r=>r.description},
  {key:'category',title:'Category',width:135,value:r=>r.category_name},{key:'supplier',title:'Supplier',width:160,value:r=>r.supplier??''},
  {key:'price',title:'Unit price',width:110,value:r=>r.price==null?'':Number(r.price).toFixed(2)},
  {key:'po',title:'PO',width:115,value:r=>r.po??''},{key:'trip',title:'Town list',width:110,value:r=>r.trip?'TL-'+r.trip:''},
  {key:'ref',title:'Sample / repair',width:150,value:r=>r.ref??''},
  ...(scope==='received'?[{key:'date',title:'Receipt date',width:130,value:(r:ReportRow)=>r.receipt_date?displayJsplDate(r.receipt_date):''},{key:'invoice',title:'Invoice',width:130,value:(r:ReportRow)=>r.invoice??''}]:
  [{key:'manage',title:'Details',width:100,value:(r:ReportRow)=>r.source?'Open':'',onPress:(r:ReportRow)=>{if(r.source&&r.requirement)open(r.requirement)}}])
 ],[scope,open]);
 const toggle=(r:Row)=>setSelected(old=>{const next={...old};if(next[r.key])delete next[r.key];else next[r.key]={qty:String(Number(r.remaining)),owner:r.owner_code??(data?.owners.length===1?data.owners[0].id:'')};return next;});
 async function save(command:string){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   const payload=command==='submit'?{date:parseJsplDateInput(date),lines:chosen.map(r=>({key:r.key,quantity:Number(selected[r.key].qty),owner:selected[r.key].owner,unit_price:r.unit_price,supplier_id:r.supplier_id}))}:
     {key:edit?.key,supplier_id:supplier||null,unit_price:price.trim()?Number(price):null,reference,work,part_number:number,date:parseJsplDateInput(date)};
   const res=await stockMutation('job-requirements',{action:'job_requirement',command,payload});
   if(command==='submit'){setReview(false);setSelected({});setNotice('Sent to Admin · PO request '+res.result.requests.join(', '));}
   else{setEdit(null);setNotice('Job Card requirement updated.');}
   await load();
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 const validDate=!!parseJsplDateInput(date);
 const back=()=>{if(busy)return;if(edit)setEdit(null);else if(review)setReview(false);else router.replace(params.returnTo?stockParent({returnTo:params.returnTo}).href:'/buying');};
 return <ScrollView contentContainerStyle={S.page}><StockV2Header title={edit?(edit.ref||'Job Card '+edit.job_number):review?'Review supplier POs':'Job Card Requirements'} backLabel={edit||review?'← Requirements':params.returnTo?stockParent({returnTo:params.returnTo}).label:'← Buying'} onStock={back}/>
 {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="job-requirements" onRecovered={load}/></>:null}{notice?<Text style={S.success}>{notice}</Text>:null}
 {edit?<><Text style={S.title}>Job Card {edit.job_number} · {edit.destination}</Text><Text>{edit.description} · {status(edit)}</Text>
 {edit.sent_on?<Text>Sent {displayJsplDate(edit.sent_on)} · {edit.supplier_name}</Text>:null}
 {buy&&!edit.declined_on&&Number(edit.remaining)>0?<><Select label="Supplier" options={data?.suppliers??[]} value={supplier||null} disabled={!!edit.sent_on||busy} onChange={v=>setSupplier(String(v??''))}/>
 {edit.kind!=='part'&&!edit.sent_on?<><StockDateField label="Dispatch date" value={date} onChange={setDate}/><Button title="Record dispatch to supplier" disabled={busy||!supplier||!validDate} onPress={()=>void save('dispatch')}/></>:null}
 {edit.kind==='part'||edit.sent_on?<><Field label="Unit price" numeric value={price} onChange={setPrice}/>
 {edit.kind==='repair'?<><Field label="Supplier quote reference" value={reference} onChange={setReference}/><Field label="Quoted repair work" value={work} onChange={setWork}/></>:null}
 {edit.kind==='sample'?<Field label="Part number (if known)" value={number} onChange={setNumber}/>:null}
 <Button title={edit.kind==='repair'?'Save repair quote':'Save supplier / price'} disabled={busy||!supplier||!!price&&(!Number.isFinite(Number(price))||Number(price)<0)||edit.kind==='repair'&&(!price||!reference.trim()||!work.trim())} onPress={()=>void save(edit.kind==='part'?'source':'quote')}/></>:null}
 {edit.kind!=='part'?<Button title={edit.sent_on?'Decline quote / request return':'Cancel unsent requirement'} disabled={busy} onPress={()=>void save('decline')}/>:null}</>:null}
 {edit.declined_on&&edit.sent_on&&!edit.returned_on&&data?.access.is_stock?<><StockDateField label="Returned on" value={date} onChange={setDate}/><Button title="Record item returned" disabled={!validDate||busy} onPress={()=>void save('return_item')}/></>:null}
 </>:review?<><StockDateField label="Order date" value={date} onChange={setDate}/>
 {[...groups].map(([groupKey,rows])=><View style={S.card} key={groupKey}><Text style={S.title}>{rows[0].supplier_name} · {selected[rows[0].key].owner||'Choose company'}</Text>{rows.map(r=><View key={r.key}><Text>JC-{r.job_number} · {r.ref??r.description} · {r.description}</Text>{r.quote_work?<Text>{r.quote_ref} · {r.quote_work}</Text>:null}
 <View style={S.row}><Field label="Order quantity" numeric value={selected[r.key].qty} onChange={qty=>setSelected(old=>({...old,[r.key]:{...old[r.key],qty}}))}/>{!r.owner_code?<Select label="Purchasing company" value={selected[r.key].owner||null} options={data?.owners??[]} onChange={v=>setSelected(old=>({...old,[r.key]:{...old[r.key],owner:String(v??'')}}))}/>:null}
 <Text>{r.unit_price==null?'Price pending':'Unit price '+Number(r.unit_price).toFixed(2)}</Text></View></View>)}
 <Text>{rows.some(r=>r.unit_price==null)?'Priced subtotal':'Total'} · {rows.reduce((v,r)=>v+Number(r.unit_price??0)*Number(selected[r.key].qty),0).toFixed(2)}</Text></View>)}
 <Button title="Send to Admin for authorisation" disabled={busy||!validDate||!chosen.length||chosen.some(r=>!canOrder(r)||!selected[r.key].owner||!(Number(selected[r.key].qty)>0&&Number(selected[r.key].qty)<=Number(r.remaining)))} onPress={()=>void save('submit')}/></>:data?<>
 <Select label="Show requirements" value={scope} options={[{id:'outstanding',label:'Outstanding'},{id:'received',label:'Received'}]} onChange={v=>{setScope(String(v??'outstanding'));setStage('')}}/>
 {scope==='outstanding'?<Select label="Line status" value={stage||null} options={[{id:'',label:'All statuses'},...statuses.map(id=>({id,label:id}))]} onChange={v=>setStage(String(v??''))}/>:null}
 {job?<Button title="Show all Job Cards" onPress={()=>setJob('')}/>:null}
 {buy&&scope==='outstanding'?<Button title={'Review selected lines ('+chosen.length+')'} disabled={!chosen.length} onPress={()=>{setDate(today());setReview(true)}}/>:null}
 <StockReport title={scope==='received'?'Received Job Card items':'Outstanding Job Card items'} columns={columns} measures={['quantity']} rows={visible} renderCell={p=>{
  const r=p.requirement;if(!p.source||!r||!canOrder(r))return null;
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={'Select '+(r.ref??r.description)+' for PO'} accessibilityState={{checked:!!selected[r.key],disabled:!buy}} disabled={!buy} onPress={()=>toggle(r)}><Text style={S.title}>{selected[r.key]?'☑':'☐'}</Text></Pressable>;
 }}/>
 </>:null}</ScrollView>;
}
