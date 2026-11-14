import {StockDecimalInput} from "@/components/jspl/StockDecimalInput";
import {useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import {allocateTreatment,available,similar,SprayProduct,Treatment,StockChoice} from '@/utils/spray-allocation';
import {stockMutation,stockRequest} from '@/utils/stock-workflow';
import {StockRecovery,stockStyles as S} from './StockWorkflowControls';

const fmt=(n:number)=>n.toLocaleString('en-GB',{minimumFractionDigits:3,maximumFractionDigits:3});
export function SprayStockChoices({treatment:t,products,area,owner,disabled,onChange,onBalances,onBusy}:{treatment:Treatment;products:SprayProduct[];area:number;owner:string;disabled:boolean;onChange:(t:Treatment)=>void;onBusy:(busy:boolean)=>void;onBalances:(items:{item_code:string;quantity:number;ao_quantity:number}[])=>void}){
 const [quantities,setQuantities]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const primary=products.find(p=>p.inputs_name===t.input);if(!primary)return null;
 let allocation:ReturnType<typeof allocateTreatment>|null=null,problem='';try{allocation=allocateTreatment(t,products,area,owner)}catch(e){problem=(e as Error).message}
 const update=(code:string,patch:Partial<StockChoice>)=>onChange({...t,compatibilityConfirmed:false,choices:{...t.choices,[code]:{useUp:false,rate:code===primary.item_code?t.rate:'',...t.choices?.[code],...patch}}});
 const transfer=async(p:SprayProduct)=>{if(busy||disabled)return;setBusy(true);onBusy(true);setError('');try{
  const qty=Number(quantities[p.item_code]);if(!Number.isFinite(qty)||qty<=0||qty>available(p,owner==='AO'?'JS':'AO'))throw Error('Enter a transfer quantity within the other owner’s available balance.');
  const r=await stockMutation('spray-owner-transfer',{action:'ownership_transfer',payload:{owner_code:owner==='AO'?'JS':'AO',to_owner_code:owner,lines:[{item_code:p.item_code,quantity:qty}]}});
  if(!r.result?.document_id)throw Error('Transfer not confirmed. Verify the previous save.');
  const data=await stockRequest();onBalances(data.items??[]);setQuantities(q=>({...q,[p.item_code]:''}));
 }catch(e){setError((e as Error).message)}finally{setBusy(false);onBusy(false)}};
 return <View style={S.card}>
  <Text style={S.muted}>Same / similar active products. Checked products use available {owner==='AO'?'AO':'HS'} stock. The unchecked selected brand covers the remaining treatment; order its shortage through Purchase Orders.</Text>
  {products.filter(p=>similar(primary,p)).sort((a,b)=>a.inputs_name.localeCompare(b.inputs_name)).map(p=>{const c=t.choices?.[p.item_code],selected=p.item_code===primary.item_code;return <View key={p.item_code} style={{gap:6,paddingVertical:10}}>
   <Text style={{fontWeight:'700'}}>{p.inputs_name}{selected?' · selected brand':''}</Text>
   <Text>{p.actives.map(a=>a.name+' '+fmt(a.amount)+' '+a.unit).join(' + ')||'Active details missing — substitution unavailable'}</Text>
   <Text>Formulation: {p.formulation_type||'Not recorded — verify product label'}</Text>
   <Text>HS: {fmt(p.quantity)} {p.base_unit} · AO: {fmt(p.ao_quantity)} {p.base_unit} · Available for spray: {fmt(available(p,owner))} {p.base_unit}</Text>
   <View style={S.row}><Pressable disabled={disabled||busy} accessibilityRole="checkbox" accessibilityLabel={'Use Up Stock '+p.inputs_name} accessibilityState={{checked:!!c?.useUp}} onPress={()=>update(p.item_code,{useUp:!c?.useUp})}><Text>{c?.useUp?'☑':'☐'} Use Up Stock</Text></Pressable>
   {!selected?<><Text>Product rate/ha</Text><StockDecimalInput accessibilityLabel={'Product rate '+p.inputs_name} placeholder="Product rate/ha" style={[S.input,{width:145}]} keyboardType="decimal-pad" value={c?.rate??''} editable={!disabled&&!busy} onChangeText={rate=>update(p.item_code,{rate})}/><Pressable disabled={disabled||busy} onPress={()=>onChange({...t,input:p.inputs_name,rate:c?.rate??'',compatibilityConfirmed:false})}><Text>Use this brand for remainder</Text></Pressable></>:<Text>Product rate/ha: {fmt(Number(t.rate))} {p.base_unit}</Text>}</View>
   {available(p,owner==='AO'?'JS':'AO')>0?<View style={S.row}><StockDecimalInput accessibilityLabel={'Transfer quantity '+p.inputs_name} placeholder="Transfer quantity" style={[S.input,{width:145}]} keyboardType="decimal-pad" value={quantities[p.item_code]??''} editable={!disabled&&!busy} onChangeText={v=>setQuantities(q=>({...q,[p.item_code]:v}))}/><Pressable disabled={disabled||busy} onPress={()=>void transfer(p)}><Text>{busy?'Transferring…':'Complete '+(owner==='AO'?'HS → AO':'AO → HS')+' stock transfer'}</Text></Pressable></View>:null}
  </View>})}
  {Object.entries(t.choices??{}).some(([code,c])=>c.useUp&&code!==primary.item_code)?<Pressable disabled={disabled||busy} accessibilityRole="checkbox" accessibilityState={{checked:!!t.compatibilityConfirmed}} onPress={()=>onChange({...t,compatibilityConfirmed:!t.compatibilityConfirmed})}><Text>{t.compatibilityConfirmed?'☑':'☐'} I verified product labels, formulation and tank-mix compatibility for these brands.</Text></Pressable>:null}
  {problem?<Text style={S.error}>{problem}</Text>:null}
  {allocation?<>{allocation.unallocated>1e-6?<Text style={S.error}>Select an unchecked brand to cover the remaining {fmt(allocation.unallocated)} ha.</Text>:null}<Text>Use-up coverage: {fmt(allocation.covered)} ha · Remaining selected-brand coverage: {fmt(allocation.remaining)} ha</Text>{allocation.rows.map(r=><Text key={r.item_code}>{products.find(p=>p.item_code===r.item_code)?.inputs_name}: Required {fmt(r.quantity)} {products.find(p=>p.item_code===r.item_code)?.base_unit} · Rate/ha {fmt(r.rate_per_ha)} · To order {fmt(r.shortfall)} {products.find(p=>p.item_code===r.item_code)?.base_unit}</Text>)}</>:null}
  {error?<><Text style={S.error}>{error}</Text><StockRecovery scope="spray-owner-transfer" onRecovered={()=>void stockRequest().then(d=>onBalances(d.items??[])).catch(e=>setError(e.message))}/></>:null}
 </View>;
}
