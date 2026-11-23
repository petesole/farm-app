import {useCallback,useMemo,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {ActivityIndicator,ScrollView,Text,View} from 'react-native';
import {StockLineTable} from './StockLineTable';
import {StockV2Header} from './StockV2Header';
import {StockButton as Button,StockField as Field,StockSelect as Select,StockRecovery,stockStyles as S} from './StockWorkflowControls';
import {stockMutation,stockRequest} from '@/utils/stock-workflow';
type Owner={owner_code:string;owner_name:string;active:boolean};
type Balance={item_code:string;item_name:string;base_unit:string;owner_code:string;quantity:number};
type Line={id:number;item_code:string;quantity:string};
export default function StockTransfer(){
 const [owners,setOwners]=useState<Owner[]>([]),[balances,setBalances]=useState<Balance[]>([]),[from,setFrom]=useState('JS'),[to,setTo]=useState('AO');
 const [lines,setLines]=useState<Line[]>([{id:1,item_code:'',quantity:''}]),[seq,setSeq]=useState(2),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{setBusy(true);try{const data=await stockRequest('?owner_workflow=1');setOwners(data.owners??[]);setBalances(data.balances??[]);}catch(e){setError((e as Error).message)}finally{setBusy(false)}},[]);
 useFocusEffect(useCallback(()=>{void load()},[load]));
 const activeOwners=owners.filter(o=>o.active),destinations=activeOwners.filter(o=>o.owner_code!==from);
 const available=useMemo(()=>balances.filter(b=>b.owner_code===from&&Number(b.quantity)>0).sort((a,b)=>a.item_name.localeCompare(b.item_name,'en',{sensitivity:'base'})),[balances,from]);
 const reset=()=>{setConfirmed(false);setNotice('')};
 const chooseFrom=(value:string|number|null)=>{const code=String(value??'');setFrom(code);if(to===code||!activeOwners.some(o=>o.owner_code===to))setTo(activeOwners.find(o=>o.owner_code!==code)?.owner_code??'');setLines([{id:seq,item_code:'',quantity:''}]);setSeq(n=>n+1);reset()};
 const change=(id:number,key:'item_code'|'quantity',value:string)=>{setLines(old=>old.map(l=>l.id===id?{...l,[key]:value}:l));reset()};
 const valid=activeOwners.some(o=>o.owner_code===from)&&destinations.some(o=>o.owner_code===to)&&lines.length>0&&new Set(lines.map(l=>l.item_code)).size===lines.length&&lines.every(l=>{const b=available.find(x=>x.item_code===l.item_code);return b&&Number.isFinite(Number(l.quantity))&&Number(l.quantity)>0&&Number(l.quantity)<=Number(b.quantity)});
 const post=async()=>{if(!valid||!confirmed||busy)return;setBusy(true);setError('');try{
  const r=await stockMutation('owner-transfer',{action:'ownership_transfer',payload:{owner_code:from,to_owner_code:to,lines:lines.map(l=>({item_code:l.item_code,quantity:Number(l.quantity)}))}});
  if(!r.result?.document_id)throw Error('Transfer confirmation is missing. Verify the previous save.');
  setLines([{id:seq,item_code:'',quantity:''}]);setSeq(n=>n+1);setConfirmed(false);await load();setNotice('Stock transfer saved. Both owner balances have been updated.');
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <ScrollView contentContainerStyle={S.page}><StockV2Header title="Stock Transfer" onRefresh={()=>void load()}/>
 <Text style={S.text}>Choose the stock owner sending the goods and the receiving owner. Products show the sending owner's available stock.</Text>
 {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="owner-transfer" onRecovered={()=>void load()}/></>:null}{notice?<Text style={S.success}>{notice}</Text>:null}{busy?<ActivityIndicator/>:null}
 <View style={[S.row,{alignItems:'flex-start'}]}><View style={{flex:1,minWidth:250}}><Select label="From stock owner" value={from} options={activeOwners.map(o=>({id:o.owner_code,label:o.owner_code+' · '+o.owner_name}))} onChange={chooseFrom}/></View><View style={{flex:1,minWidth:250}}><Select label="To stock owner" value={to} options={destinations.map(o=>({id:o.owner_code,label:o.owner_code+' · '+o.owner_name}))} onChange={v=>{setTo(String(v??''));reset()}}/></View></View>
 <StockLineTable columns={[
   {label:'Product',width:230,grow:3},{label:'Quantity',width:120,grow:1},
   ...(lines.length>1?[{label:'',width:122}]:[]),
 ]} rows={lines.map((line,index)=>{
   const balance=available.find(item=>item.item_code===line.item_code);
   return {key:line.id,cells:[
     <View><Select hideLabel label={'Product '+(index+1)} value={line.item_code}
       options={available.filter(item=>!lines.some(other=>other.id!==line.id&&other.item_code===item.item_code))
         .map(item=>({id:item.item_code,label:item.item_name+' · '+Number(item.quantity).toLocaleString('en-GB')+' '+item.base_unit}))}
       onChange={value=>change(line.id,'item_code',String(value??''))}/>
       {balance?<Text style={S.muted}>Available from {from}: {balance.quantity} {balance.base_unit}</Text>:null}</View>,
     <Field hideLabel label="Quantity" numeric value={line.quantity} onChange={value=>change(line.id,'quantity',value)}/>,
     ...(lines.length>1?[<Button title="Remove line" disabled={busy} onPress={()=>{setLines(current=>current.filter(other=>other.id!==line.id));reset()}}/>]:[]),
   ]};
 })}/>
 {!available.length&&!busy?<Text>No stock is available for the selected sending owner.</Text>:null}
 <View style={S.row}><Button title="Add product" disabled={busy||lines.length>=30} onPress={()=>{setLines(ls=>[...ls,{id:seq,item_code:'',quantity:''}]);setSeq(n=>n+1);reset()}}/><Button title={confirmed?'✓ Transfer confirmed':'Confirm transfer'} disabled={busy||!valid} onPress={()=>setConfirmed(v=>!v)}/><Button title="Save Stock Transfer" disabled={busy||!valid||!confirmed} onPress={()=>void post()}/></View>
 </ScrollView>;
}
