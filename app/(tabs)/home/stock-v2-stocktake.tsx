import {useCallback,useEffect,useRef,useState} from 'react';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {ActivityIndicator,Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockSheetPreview} from '@/components/jspl/StockSheetPreview';
import {StockButton as Button,StockField as Field,StockRecovery,stockStyles as S} from '@/components/jspl/StockWorkflowControls';
import {stockRequest,stockMutation} from '@/utils/stock-workflow';
import {displayJsplDate,localISODate} from '@/utils/jspl-input';
import {stockGroupLabel} from '@/utils/stock-sheet';

type Sheet={sheet_id:string|number;take_number:string;take_date:string;groups:string[];status:'draft'|'counted'|'posted';version:number;adjustment_number?:string|null};
type Line={item_code:string;item_name:string;category:string;stock_type:string;position:number;hs:number|null;ao:number|null;delta_hs:number|null;delta_ao:number|null};
type Counts=Record<string,{hs:string;ao:string}>;
const groupNames=(groups:string[])=>groups.map(stockGroupLabel).join(', ');
const sheetLabel=(s:Sheet)=>displayJsplDate(s.take_date.slice(0,10))+' · '+groupNames(s.groups)+' · '+s.take_number;
const countText=(n:number|null)=>n==null?'':String(n);
export default function Stocktakes(){
 const router=useRouter(),params=useLocalSearchParams<{sheetId?:string}>(),opened=useRef('');
 const [canPrint,setCanPrint]=useState(false);
 const [view,setView]=useState<'print'|'input'|'history'>('print'),[groups,setGroups]=useState<string[]>([]),[selected,setSelected]=useState<Record<string,boolean>>({});
 const [pending,setPending]=useState<Sheet[]>([]),[history,setHistory]=useState<Sheet[]>([]),[isAdmin,setIsAdmin]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [sheet,setSheet]=useState<Sheet|null>(null),[rows,setRows]=useState<Line[]>([]),[edits,setEdits]=useState<Counts>({}),[reason,setReason]=useState(''),[audit,setAudit]=useState<{action:string;reason:string|null;created_at:string}[]>([]);
 const [preview,setPreview]=useState<{sheet:Sheet;items:Line[]}|null>(null);
 const refresh=useCallback(async()=>{try{const [g,p]=await Promise.all([stockRequest('?combined_stocktake_groups=1'),stockRequest('?combined_stocktake_list=1')]);setGroups(g.groups??[]);setIsAdmin(g.is_admin);setCanPrint(!!g.can_print);if(!g.can_print)setView(v=>v==='print'?'input':v);setPending(p.rows??[]);if(g.is_admin&&view==='history')setHistory((await stockRequest('?combined_stocktake_list=1&history=1')).rows??[])}catch(e){setError((e as Error).message)}},[view]);
 useFocusEffect(useCallback(()=>{void refresh()},[refresh]));
 const readSheet=async(id:string|number,print=false)=>{const data=await stockRequest('?combined_stocktake_lines=1&sheet_id='+id+(print?'&print=1':''));return data as {sheet:Sheet;rows:Line[];audit:typeof audit;is_admin:boolean;can_print:boolean}};
 const open=async(id:string|number)=>{setBusy(true);setError('');try{const data=await readSheet(id);setSheet(data.sheet);setRows(data.rows);setIsAdmin(data.is_admin);setCanPrint(!!data.can_print);setEdits(Object.fromEntries(data.rows.map(l=>[l.item_code,{hs:countText(l.hs),ao:countText(l.ao)}])));setReason('');setAudit(data.audit??[])}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 useEffect(()=>{if(params.sheetId&&opened.current!==params.sheetId){opened.current=params.sheetId;void open(params.sheetId)}},[params.sheetId]);
 const perform=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn();await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const create=()=>perform(async()=>{const choices=groups.filter(g=>selected[g]);if(!choices.length)throw Error('Select at least one group');const saved=await stockMutation('combined-stocktake',{action:'combined_stocktake_create',groups:choices,take_date:localISODate(new Date())});const data=await readSheet(saved.result.sheet_id,true);setPreview({sheet:data.sheet,items:data.rows})});
 const save=()=>perform(async()=>{if(!sheet)return;const lines=rows.map(l=>{const c=edits[l.item_code];if(!c||c.hs.trim()===''||c.ao.trim()===''||!Number.isFinite(Number(c.hs))||!Number.isFinite(Number(c.ao))||Number(c.hs)<0||Number(c.ao)<0)throw Error('Enter HS and AO counts for '+l.item_name+'; use 0 where none is found');return {item_code:l.item_code,hs:Number(c.hs),ao:Number(c.ao)}});await stockMutation('combined-stocktake',{action:'combined_stocktake_save',sheet_id:sheet.sheet_id,version:sheet.version,reason,lines});setSheet(null);setNotice('Stock take saved');});
 const approve=()=>perform(async()=>{if(!sheet)return;await stockMutation('combined-stocktake',{action:'combined_stocktake_post',sheet_id:sheet.sheet_id,version:sheet.version});setSheet(null);setNotice('Stocktake adjustment applied');});
 const change=(code:string,key:'hs'|'ao',value:string)=>setEdits(e=>({...e,[code]:{...e[code],[key]:value}}));
 const dirty=rows.some(l=>edits[l.item_code]?.hs!==countText(l.hs)||edits[l.item_code]?.ao!==countText(l.ao));
 const tableWidths={category:80,code:110,count:100};
 return <View style={{flex:1,backgroundColor:'#F8FAF9'}}>
 {preview?<StockSheetPreview sheet={{...preview.sheet,combined:true}} items={preview.items} onClose={()=>setPreview(null)}/>:null}
 <ScrollView contentContainerStyle={S.page}><StockV2Header title="Stock Take" onRefresh={()=>void refresh()}/>
 <View style={S.row}>{canPrint?<Button title="Print Stock Take" disabled={busy} onPress={()=>{setView('print');setError('');setNotice('')}}/>:null}<Button title="Input Stock Take" disabled={busy} onPress={()=>{setView('input');setError('');setNotice('')}}/>{isAdmin?<Button title="History" disabled={busy} onPress={()=>{setView('history');setError('');setNotice('')}}/>:null}</View>
 {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="combined-stocktake" onRecovered={()=>{setSheet(null);setView('input');void refresh()}}/></>:null}{notice?<Text>{notice}</Text>:null}
 {view==='print'&&canPrint?<><Text style={S.title}>Select Items for printed Stock Sheet</Text><View style={S.row}>{groups.map(g=><Pressable key={g} accessibilityRole="checkbox" accessibilityLabel={'Stock group: '+g} accessibilityState={{checked:!!selected[g]}} disabled={busy} onPress={()=>setSelected(s=>({...s,[g]:!s[g]}))} style={{padding:12,flexDirection:'row',gap:8,alignItems:'center'}}><Text style={{fontSize:22,color:'#25633A'}}>{selected[g]?'☑':'☐'}</Text><Text>{stockGroupLabel(g)}</Text></Pressable>)}</View><Button title="Print Stock Sheet" disabled={busy||!groups.some(g=>selected[g])} onPress={()=>void create()}/></>:<>
 {view==='history'&&isAdmin?<Button title="Earlier Stock Sheets" onPress={()=>router.push('/stock-v2-stocktake-legacy')}/>:null}
 {(view==='history'?history:pending).map(t=><Pressable key={t.sheet_id} disabled={busy} onPress={()=>void open(t.sheet_id)} style={S.card}><Text>{sheetLabel(t)}</Text></Pressable>)}
 {!(view==='history'?history:pending).length?<Text>{view==='history'?'No saved stock sheets.':'No stock sheets awaiting input.'}</Text>:null}
 </>}{busy?<ActivityIndicator/>:null}</ScrollView>
 <Modal visible={!!sheet&&!preview} onRequestClose={()=>{if(!busy)setSheet(null)}}><ScrollView contentContainerStyle={S.page}><StockV2Header title="Input Stock Take" backLabel="← Stock Takes" onStock={()=>{if(!busy)setSheet(null)}}/>
 {sheet?<><Text style={S.title}>{sheetLabel(sheet)}</Text>{error?<><Text style={S.error}>{error}</Text><StockRecovery scope="combined-stocktake" onRecovered={()=>{setSheet(null);void refresh()}}/></>:null}
 {canPrint?<Button title="Print Stock Sheet" disabled={busy} onPress={()=>void perform(async()=>{const data=await readSheet(sheet.sheet_id,true);setPreview({sheet:data.sheet,items:data.rows})})}/>:null}
 <ScrollView horizontal keyboardShouldPersistTaps="handled"><View style={{minWidth:700,flex:1}}><View style={{flexDirection:'row',gap:8,padding:8,backgroundColor:'#ECF7EE'}}><Text style={{width:tableWidths.category,fontWeight:'700'}}>Category</Text><Text style={{width:tableWidths.code,fontWeight:'700'}}>Pastel Code</Text><Text style={{flex:1,minWidth:230,fontWeight:'700'}}>Product</Text><Text style={{width:tableWidths.count,fontWeight:'700'}}>HS</Text><Text style={{width:tableWidths.count,fontWeight:'700'}}>AO</Text></View>
 {rows.map(l=><View key={l.item_code} style={{flexDirection:'row',alignItems:'center',gap:8,padding:8,borderBottomWidth:1,borderColor:'#ddd',backgroundColor:'#fff'}}><Text style={{width:tableWidths.category}}>{l.category}</Text><Text style={{width:tableWidths.code}}>{l.item_code}</Text><Text style={{flex:1,minWidth:230}}>{l.item_name}</Text><View style={{width:tableWidths.count}}><TextInput accessibilityLabel={'HS '+l.item_code} style={S.input} keyboardType="decimal-pad" value={edits[l.item_code]?.hs??''} onChangeText={v=>change(l.item_code,'hs',v)} editable={!busy}/>{isAdmin&&sheet.status==='counted'&&!dirty?<Text style={S.muted}>Adjustment {l.delta_hs??0}</Text>:null}</View><View style={{width:tableWidths.count}}><TextInput accessibilityLabel={'AO '+l.item_code} style={S.input} keyboardType="decimal-pad" value={edits[l.item_code]?.ao??''} onChangeText={v=>change(l.item_code,'ao',v)} editable={!busy}/>{isAdmin&&sheet.status==='counted'&&!dirty?<Text style={S.muted}>Adjustment {l.delta_ao??0}</Text>:null}</View></View>)}
 </View></ScrollView>
 {sheet.status!=='draft'?<Field label="Reason for correction" value={reason} onChange={setReason}/>:null}
 <View style={S.row}><Button title="Save Stock Take" disabled={busy||(sheet.status!=='draft'&&reason.trim().length<8)} onPress={()=>void save()}/>{isAdmin&&sheet.status==='counted'?<Button title="Approve and Apply Adjustment" disabled={busy||dirty} onPress={()=>void approve()}/>:null}</View>
 {isAdmin&&sheet.adjustment_number?<Text>{sheet.adjustment_number}</Text>:null}
 {isAdmin&&audit.some(a=>a.reason)?<View>{audit.filter(a=>a.reason).map((a,i)=><Text key={i} style={S.muted}>{displayJsplDate(a.created_at.slice(0,10))} · {a.reason}</Text>)}</View>:null}
 </>:null}{busy?<ActivityIndicator/>:null}</ScrollView></Modal>
 </View>;
}
