import {useEffect,useMemo,useState} from 'react';
import {Modal,ScrollView,Text,View,Pressable} from 'react-native';
import {StockV2Header} from './StockV2Header';
import {StockButton,StockSelect,stockStyles as S} from './StockWorkflowControls';
import {labourExportXLSX} from '@/lib/labour-xlsx-export';
import {printStockSheet} from '@/utils/stock-sheet';
import {ReportColumn,reportValue,reportRows,reportOptions,reportTotals,reportHTML} from '@/utils/stock-report';
export function StockReport<Row>({title,rows,columns,measures=[],groupKey}:{title:string;rows:readonly Row[];columns:ReportColumn<Row>[];measures?:string[];groupKey?:string}){
 const [filters,setFilters]=useState<Record<string,string>>({}),[preview,setPreview]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setFilters(old=>{const next={...old};for(const c of columns)if(next[c.key]&&!reportOptions(rows,columns,old,c.key).includes(next[c.key]))delete next[c.key];return JSON.stringify(next)===JSON.stringify(old)?old:next})},[rows,columns]);
 const visible=useMemo(()=>reportRows(rows,columns,filters),[rows,columns,filters]);
 const totals=reportTotals(visible,columns,measures,groupKey);
 const summary=visible.length+' rows'+totals.map(t=>' · '+t.group+' '+measures.map(k=>columns.find(c=>c.key===k)!.title+': '+t.totals[k].toLocaleString('en-GB',{maximumFractionDigits:3})).join(' · ')).join('');
 const data=visible.map(r=>Object.fromEntries(columns.map(c=>[c.key,reportValue(r,c)])));
 const totalRows=totals.map(t=>{const row:Record<string,unknown>={[columns[0].key]:'Total'+(t.group?' · '+t.group:'')};for(const k of measures)row[k]=t.totals[k];return row});
 const html=reportHTML(title,columns,data,summary);
 const run=(fn:()=>void)=>{try{setError('');fn()}catch(e){setError((e as Error).message)}};
 return <View style={{gap:12}}><View style={S.row}><StockButton title="Print" onPress={()=>setPreview(true)}/><StockButton title="Export to Excel (.xlsx)" onPress={()=>run(()=>labourExportXLSX(title,columns.map(c=>({label:c.title,field:c.key})),[...data,...totalRows]))}/><StockButton title="Clear Report Filters" onPress={()=>setFilters({})}/></View><Text>{summary}</Text>{error?<Text style={S.error}>{error}</Text>:null}
 <ScrollView horizontal><View><View style={{flexDirection:'row',alignItems:'flex-start'}}>{columns.map(c=><View key={c.key} style={{width:c.width??155,padding:4}}><Text style={{fontWeight:'700'}}>{c.title}</Text><StockSelect label={'Filter '+c.title} value={filters[c.key]??''} options={[{id:'',label:'All'},...reportOptions(rows,columns,filters,c.key).map(v=>({id:v,label:v}))]} onChange={v=>setFilters(f=>({...f,[c.key]:String(v??'')}))}/></View>)}</View>
 {visible.map((r,i)=><View key={i} style={{flexDirection:'row',backgroundColor:i%2?'#f0f5f1':'#fff'}}>{columns.map(c=><Pressable key={c.key} disabled={!c.onPress} onPress={()=>c.onPress?.(r)} style={{width:c.width??155,padding:8,borderBottomWidth:1,borderColor:'#d5dfd8'}}><Text>{String(reportValue(r,c))}</Text></Pressable>)}</View>)}{!visible.length?<Text>No matching records.</Text>:null}</View></ScrollView>
 <Modal visible={preview} onRequestClose={()=>setPreview(false)}><ScrollView contentContainerStyle={S.page}><StockV2Header title={title+' — Print Preview'} backLabel="Close Preview" onStock={()=>setPreview(false)}/><StockButton title="Print Report" onPress={()=>run(()=>printStockSheet(html,setError))}/>{error?<Text style={S.error}>{error}</Text>:null}{typeof document!=='undefined'?<iframe title={title+' preview'} srcDoc={html} style={{width:'100%',height:'75vh',border:0}}/>:<Text>Open this report in a web browser to print.</Text>}</ScrollView></Modal>
 </View>;
}
