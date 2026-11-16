import {useCallback,useMemo,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {ActivityIndicator,Modal,ScrollView,Text,TextInput,View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockButton as Button,StockField as Field,StockRecovery,StockSelect as Select,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {StockReport} from '@/components/jspl/StockReport';
import {ReportColumn} from '@/utils/stock-report';
import {stockMutation,stockRequest} from '@/utils/stock-workflow';
import {displayJsplDate,localISODate,parseJsplDateInput} from '@/utils/jspl-input';
import {stockGroupLabel} from '@/utils/stock-sheet';

type Pending={sheet_id:number|string;take_number:string;take_date:string;groups:string[];version:number;item_code:string;item_name:string;owner_code:'HS'|'AO';required_quantity:number;base_unit:string};
type History={document_id:number|string;document_number:string;document_date:string;reason:string;lines:number};
type Detail={document_number:string;document_date:string;take_number:string|null;owner_code:string;item_code:string;item_name:string;quantity:number;reason:string};
type Product={owner_code:string;item_code:string;item_name:string;quantity:number};
const key=(r:Pending)=>r.owner_code+':'+r.item_code;
const signed=(n:number)=>n>0?'+'+n:String(n);
export default function StockAdjustments(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[isAdmin,setIsAdmin]=useState(false),[rows,setRows]=useState<Pending[]>([]),[history,setHistory]=useState<History[]>([]),[sheetId,setSheetId]=useState('');
 const [view,setView]=useState<'pending'|'history'>('pending'),[edits,setEdits]=useState<Record<string,string>>({}),[visible,setVisible]=useState<Pending[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [detail,setDetail]=useState<Detail[]|null>(null),[direct,setDirect]=useState(false),[products,setProducts]=useState<Product[]>([]),[owner,setOwner]=useState('HS'),[product,setProduct]=useState(''),[date,setDate]=useState(displayJsplDate(localISODate(new Date()))),[amount,setAmount]=useState(''),[reason,setReason]=useState('');
 const fetchReport=useCallback(async()=>{const d=await stockRequest('?stock_adjustment_report=1');setAllowed(true);setIsAdmin(d.is_admin);setRows(d.rows??[]);setHistory(d.history??[]);setSheetId(old=>(d.rows??[]).some((r:Pending)=>String(r.sheet_id)===old)?old:String(d.rows?.[0]?.sheet_id??''))},[]);
 const load=useCallback(async()=>{setBusy(true);setError('');try{await fetchReport()}catch(e){setAllowed(false);setError((e as Error).message)}finally{setBusy(false)}},[fetchReport]);
 useFocusEffect(useCallback(()=>{void load()},[load]));
 const perform=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const selected=useMemo(()=>rows.filter(r=>String(r.sheet_id)===sheetId),[rows,sheetId]);
 const sheets=useMemo(()=>[...new Map(rows.map(r=>[String(r.sheet_id),r])).values()],[rows]);
 const openHistory=useCallback((r:History)=>{setBusy(true);setError('');void stockRequest('?stock_adjustment_history_lines=1&document_id='+r.document_id).then(d=>setDetail(d.rows??[])).catch(e=>setError(e.message)).finally(()=>setBusy(false))},[]);
 const columns=useMemo<ReportColumn<Pending>[]>(()=>[
  {key:'owner',title:'Owner',width:85,value:r=>r.owner_code},{key:'code',title:'Pastel Code',width:125,value:r=>r.item_code},{key:'product',title:'Product',width:285,value:r=>r.item_name},
  {key:'required',title:'Outstanding Adjustment',kind:'number',width:180,value:r=>signed(r.required_quantity)},
  ...(isAdmin?[{key:'actual',title:'Actual Adjustment',filterable:false,width:175,value:(r:Pending)=>edits[key(r)]??''}]:[])
 ],[isAdmin,edits]);
 const historyColumns=useMemo<ReportColumn<History>[]>(()=>[{key:'date',title:'Date',width:135,value:r=>r.document_date},{key:'number',title:'Adjustment Number',width:175,value:r=>r.document_number},{key:'reason',title:'Explanation',width:330,value:r=>r.reason},{key:'lines',title:'Lines',kind:'number',width:85,value:r=>r.lines},{key:'open',title:'View',width:120,value:()=> 'Open',onPress:openHistory}],[openHistory]);
 const detailColumns=useMemo<ReportColumn<Detail>[]>(()=>[{key:'date',title:'Date',value:r=>r.document_date},{key:'sheet',title:'Stocktake',value:r=>r.take_number??'Individual'},{key:'owner',title:'Owner',width:80,value:r=>r.owner_code},{key:'code',title:'Pastel Code',value:r=>r.item_code},{key:'product',title:'Product',width:260,value:r=>r.item_name},{key:'quantity',title:'Adjustment',kind:'number',value:r=>signed(r.quantity)},{key:'reason',title:'Explanation',width:300,value:r=>r.reason}],[]);
 const save=()=>perform(async()=>{if(!selected.length)return;const lines=visible.filter(r=>(edits[key(r)]??'').trim()!=='').map(r=>{const value=Number(edits[key(r)]);if(!Number.isFinite(value))throw Error('Enter a valid amount for '+r.item_name);return {item_code:r.item_code,owner_code:r.owner_code,quantity:value}}).filter(r=>r.quantity!==0);if(!lines.length)throw Error('Enter at least one adjustment amount');const saved=await stockMutation('stock-adjustments',{action:'stocktake_adjustment_save',sheet_id:selected[0].sheet_id,version:selected[0].version,lines});await fetchReport();setEdits({});setNotice('Stock adjustment '+saved.result.document_number+' saved');});
 const openDirect=()=>perform(async()=>{const d=await stockRequest('?adjustment_stock=1');setProducts(d.rows??[]);setProduct('');setAmount('');setReason('');setDate(displayJsplDate(localISODate(new Date())));setDirect(true)});
 const saveDirect=()=>perform(async()=>{const iso=parseJsplDateInput(date);if(!iso)throw Error('Enter a valid adjustment date');if(!product||!amount.trim()||!Number.isFinite(Number(amount))||Number(amount)===0)throw Error('Select a product and enter a nonzero signed adjustment');if(reason.trim().length<5)throw Error('Enter an explanation');const saved=await stockMutation('stock-adjustments',{action:'individual_adjustment_save',adjustment_date:iso,reason:reason.trim(),lines:[{owner_code:owner,item_code:product,quantity:Number(amount)}]});await fetchReport();setDirect(false);setNotice('Stock adjustment '+saved.result.document_number+' saved');});
 const recovery=<StockRecovery scope="stock-adjustments" onRecovered={()=>{setDirect(false);setEdits({});void load()}}/>;
 return <View style={{flex:1}}><ScrollView contentContainerStyle={S.page}><StockV2Header title="Stock Adjustment" onRefresh={()=>void load()}/>
 {error?<><Text style={S.error}>{error}</Text>{recovery}</>:null}{notice?<Text style={S.success}>{notice}</Text>:null}{busy?<ActivityIndicator/>:null}
 {allowed?<><View style={S.row}><Button title="Outstanding Adjustments" disabled={busy} onPress={()=>setView('pending')}/><Button title="Adjustment History" disabled={busy} onPress={()=>setView('history')}/>{isAdmin?<Button title="Individual Adjustment" disabled={busy} onPress={()=>void openDirect()}/>:null}</View>
 {view==='pending'?<>{sheets.length?<Select label="Stocktake" value={sheetId} disabled={busy} options={sheets.map(r=>({id:String(r.sheet_id),label:displayJsplDate(r.take_date)+' · '+r.groups.map(stockGroupLabel).join(', ')+' · '+r.take_number}))} onChange={v=>{setSheetId(String(v??''));setEdits({})}}/>:null}
 {selected.length?<><Text style={S.title}>Stocktake Date: {displayJsplDate(selected[0].take_date)}</Text><StockReport key={sheetId} title={'Stocktake Adjustments '+selected[0].take_number+' · '+displayJsplDate(selected[0].take_date)} rows={selected} columns={columns} onVisibleRowsChange={setVisible} renderCell={r=><TextInput accessibilityLabel={'Actual adjustment '+r.owner_code+' '+r.item_code} style={S.input} value={edits[key(r)]??''} editable={!busy} keyboardType="numbers-and-punctuation" onChangeText={v=>setEdits(e=>({...e,[key(r)]:v}))}/>}/>{isAdmin?<Button title="Save Adjustments" disabled={busy} onPress={()=>void save()}/>:null}</>:<Text>No outstanding stocktake adjustments.</Text>}</>:<StockReport title="Stock Adjustment History" rows={history} columns={historyColumns}/>}</>:allowed===false&&!error?<Text>Admin or Clerk access required.</Text>:null}
 </ScrollView>
 <Modal visible={!!detail} onRequestClose={()=>setDetail(null)}><ScrollView contentContainerStyle={S.page}><StockV2Header title={detail?.[0]?.document_number??'Stock Adjustment'} backLabel="← Adjustment History" onStock={()=>setDetail(null)}/>{detail?<StockReport title={'Stock Adjustment '+(detail[0]?.document_number??'')} rows={detail} columns={detailColumns}/>:null}</ScrollView></Modal>
 <Modal visible={direct} onRequestClose={()=>{if(!busy)setDirect(false)}}><ScrollView contentContainerStyle={S.page}><StockV2Header title="Individual Stock Adjustment" backLabel="← Stock Adjustment" onStock={()=>{if(!busy)setDirect(false)}}/>{error?<><Text style={S.error}>{error}</Text>{recovery}</>:null}
 <Select label="Owner" value={owner} disabled={busy} options={[{id:'HS',label:'HS'},{id:'AO',label:'AO'}]} onChange={v=>{setOwner(String(v??'HS'));setProduct('')}}/>
 <Text>Adjustment Date</Text><TextInput accessibilityLabel="Adjustment Date" style={S.input} value={date} editable={!busy} onChangeText={setDate} onBlur={()=>{const iso=parseJsplDateInput(date);if(iso)setDate(displayJsplDate(iso))}} placeholder="d/m (year optional)"/>
 <Select label="Product" value={product} disabled={busy} options={products.filter(p=>p.owner_code===(owner==='HS'?'TEST_JS':'TEST_AO')).map(p=>({id:p.item_code,label:p.item_name+' · '+p.item_code}))} onChange={v=>setProduct(String(v??''))}/>
 <Field label="Adjustment Amount (+ / −)" value={amount} onChange={setAmount}/><Field label="Explanation" value={reason} onChange={setReason}/><Button title="Save Individual Adjustment" disabled={busy} onPress={()=>void saveDirect()}/>{busy?<ActivityIndicator/>:null}
 </ScrollView></Modal></View>;
}
