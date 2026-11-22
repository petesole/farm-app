import {useEffect,useRef,useState} from 'react';
import {Modal,ScrollView,Text,View} from 'react-native';
import {StockV2Header} from './StockV2Header';
import {StockButton as Button,StockField as Field,StockSelect as Select,stockStyles as S} from './StockWorkflowControls';
import {stockMutation,stockRequest} from '@/utils/stock-workflow';

export type StockProduct={item_code:string;item_name:string;base_unit:string;input_type:string;input_category:string;pastel_stock_code:string|null;version:number;active:boolean;actives:{name:string;amount:string;unit:string}[]};
export function StockProductEditor({product,initialName='',onCancel,onSaved}:{product:StockProduct|null;initialName?:string;onCancel:()=>void;onSaved:(product:StockProduct)=>void|Promise<void>}){
 const [catalog,setCatalog]=useState<{items:StockProduct[];can_create:boolean;can_edit:boolean}|null>(null);
 const [type,setType]=useState(product?.input_type??''),[category,setCategory]=useState(product?.input_category??''),[name,setName]=useState(product?.item_name??initialName),[unit,setUnit]=useState(product?.base_unit??''),[pastel,setPastel]=useState(product?.pastel_stock_code??'');
 const [actives,setActives]=useState(product?.actives??[]),[newActive,setNewActive]=useState(''),[newActiveIndex,setNewActiveIndex]=useState<number|null>(null),[confirmType,setConfirmType]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState<Record<string,unknown>|null>(null);
 const confirmed=useRef<StockProduct|null>(null);
 const load=()=>stockRequest('?product_catalog=1').then(setCatalog).catch(e=>setError(e.message));
 useEffect(()=>{void load()},[]);
 const chemical=/^chemicals?$/i.test(type),locked=busy||!!pending;
 const normalized=(s:string)=>s.trim().replace(/\s+/g,' ').toLowerCase();
 const duplicates=catalog?.items.filter(p=>p.item_code!==product?.item_code&&normalized(p.item_name)===normalized(name))??[];
 const similar=catalog?.items.filter(p=>p.item_code!==product?.item_code&&name.trim().length>=3&&normalized(p.item_name).includes(normalized(name))).slice(0,6)??[];
 const options=(xs:string[])=>[...new Set(xs.filter(Boolean))].sort((a,b)=>a.localeCompare(b)).map(x=>({id:x,label:x}));
 const changeType=(v:string)=>{if(chemical&&!/^chemicals?$/i.test(v)&&actives.length){setConfirmType(v);return;}setType(v);setCategory('')};
 const save=async()=>{
  if(busy)return;setBusy(true);setError('');
  const request=pending??{action:'product_save',payload:{item_code:product?.item_code??null,version:product?.version??0,item_name:name,input_type:type,input_category:category,base_unit:unit,pastel_stock_code:pastel,actives:chemical?actives:[]}};
  try{
   let saved=confirmed.current;
   if(!saved){setPending(request);const response=await stockMutation('product-catalogue',request);saved=response.result.product;confirmed.current=saved;}
   await onSaved(saved!);
  }catch(e){setError((e as Error).message);if((e as {confirmed?:boolean}).confirmed)setPending(null)}finally{setBusy(false)}
 };
 const allowed=product?catalog?.can_edit:catalog?.can_create;
 const valid=!!(type&&category&&name.trim()&&unit&&(product||unit!=='UNVERIFIED')&&!duplicates.length&&(!chemical||(actives.length||product)&&actives.every(a=>a.name.trim()&&Number(a.amount)>0)));
 return <Modal visible onRequestClose={()=>!locked&&onCancel()}><ScrollView contentContainerStyle={S.page} keyboardShouldPersistTaps="handled">
 <StockV2Header title={product?'Edit Product':'New Product'} backLabel="← Return" onStock={()=>!locked&&onCancel()}/>
 {error?<Text style={S.error}>{error}</Text>:null}
 {!catalog?<Button title="Reload product list" disabled={busy} onPress={()=>void load()}/>:null}
 {catalog&&!allowed?<Text style={S.error}>You do not have permission to {product?'edit':'create'} products.</Text>:null}
 <View style={S.card}>
 <Select label="Type" value={type} disabled={locked} options={options([...(catalog?.items.map(p=>p.input_type)??[]),'Chemical','Fertilizer','Seed','Packaging',type])} onChange={v=>changeType(String(v??''))}/>
 <Select label="Category" value={category} disabled={locked||!type} options={options([...(catalog?.items.filter(p=>p.input_type===type).map(p=>p.input_category)??[]),...(type===product?.input_type?[product?.input_category??'']:[])])} onChange={v=>setCategory(String(v??''))}/>
 {!locked?<Field label={product?'Product Name / Rename':'Product Name'} value={name} onChange={setName}/>:<Text>{name}</Text>}
 {duplicates.length?<Text style={S.error}>A product with this name already exists: {duplicates.map(p=>p.item_name).join(', ')}. Use the existing product.</Text>:similar.length?<Text style={S.muted}>Existing matches: {similar.map(p=>p.item_name).join(', ')}</Text>:null}
 <Select label="Unit of Measure" value={unit} disabled={locked||!!product} options={options(['L','kg','Unit',...(catalog?.items.map(p=>p.base_unit).filter(x=>x!=='UNVERIFIED')??[]),unit])} onChange={v=>{const u=String(v??'');setUnit(u);setActives(a=>a.map(x=>({...x,unit:/kg/i.test(u)?'g/kg':'g/L'})))}}/>
 {product?<Text style={S.muted}>The stock unit is retained to preserve existing quantities and history.</Text>:null}
 {chemical?<View style={{gap:12}}><Text style={S.title}>Active Ingredients</Text>{actives.map((a,i)=><View key={i} style={S.card}>
 <Text>Unit: {unit==='UNVERIFIED'?a.unit+' (product unit unconfirmed)':/kg/i.test(unit)?'kg (g/kg)':'L (g/L)'}</Text>
 <Select label={'Active Ingredient '+(i+1)} value={a.name} disabled={locked} options={options([...(catalog?.items.flatMap(p=>p.actives.map(x=>x.name))??[]),...actives.map(x=>x.name)])} onChange={v=>setActives(old=>old.map((x,j)=>j===i?{...x,name:String(v??'')}:x))}/>
 <Button title={'Add New Active Ingredient '+(i+1)} disabled={locked} onPress={()=>{setNewActiveIndex(i);setNewActive('')}}/>
 {newActiveIndex===i?<><Field label="New Active Ingredient Name" value={newActive} onChange={setNewActive}/><Button title="Use Active Ingredient" disabled={locked||!newActive.trim()} onPress={()=>{const existing=catalog?.items.flatMap(p=>p.actives).find(x=>normalized(x.name)===normalized(newActive));setActives(old=>old.map((x,j)=>j===i?{...x,name:existing?.name??newActive.trim()}:x));setNewActiveIndex(null)}}/></>:null}
 {!locked?<Field label={'Quantity (g) '+(i+1)} numeric value={a.amount} onChange={amount=>setActives(old=>old.map((x,j)=>j===i?{...x,amount}:x))}/>:<Text>{a.amount} {a.unit}</Text>}
 <Button title={'Remove Active '+(i+1)} disabled={locked} onPress={()=>setActives(old=>old.filter((_,j)=>j!==i))}/>
 </View>)}<Button title="Add Active Ingredient" disabled={locked||actives.length>=20} onPress={()=>setActives(old=>[...old,{name:'',amount:'',unit:/kg/i.test(unit)?'g/kg':'g/L'}])}/></View>:null}
 {!locked?<Field label="Pastel Stock Code (optional)" value={pastel} onChange={setPastel}/>:<Text>Pastel Stock Code: {pastel||'Not set'}</Text>}
 {confirmType!==null?<View style={S.card}><Text>Changing Type will clear the active ingredients.</Text><Button title="Confirm Type Change" onPress={()=>{setType(confirmType);setCategory('');setActives([]);setConfirmType(null)}}/><Button title="Keep Chemical Type" onPress={()=>setConfirmType(null)}/></View>:null}
 <Text style={S.muted}>Saving product details does not create stock. Receive goods through GRV.</Text>
 <View style={S.row}><Button title={busy?'Saving…':pending?'Verify Save / Return':'Save Product'} disabled={busy||!allowed||(!pending&&!valid)||confirmType!==null} onPress={()=>void save()}/><Button title="Cancel" disabled={locked} onPress={onCancel}/></View>
 {pending&&!busy?<Text style={S.muted}>Your entries are retained. Verify the previous save before changing anything.</Text>:null}
 </View></ScrollView></Modal>;
}
