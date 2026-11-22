import {useCallback, useEffect, useState} from 'react';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {ScrollView, Text, TextInput, View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {JobPartQuotes} from '@/components/jspl/JobPartQuotes';
import {StockButton, StockDateField, StockField, StockRecovery, StockSelect, stockStyles as styles} from '@/components/jspl/StockWorkflowControls';
import {stockMutation, stockRequest} from '@/utils/stock-workflow';
import {displayJsplDate,parseJsplDateInput} from '@/utils/jspl-input';

type Part = {part_id?:number;category_id:number|null;item_code:string;quantity:string;unit_price:string;sample_details:string;line_purpose:string};
type CardType='general'|'asset'|'irrigation';
type Category={category_id:number;catalogue_group:string;category_name:string};
type AssetPurchase = {id:string;part_number?:string;item_code:string;item_name:string;active:boolean;document_date:string;supplier_name:string;receipt:string;unit_price:string|null};
type JobCard = {
  id: string; job_number: number; vehicle_name: string; work_description: string; transaction_date:string; closed_at:string|null; revision:string;card_type:CardType;vehicle_id:number|null;tracecode_id:number|null;
  parts: {category_id:number;line_purpose?:string;part_id: number; owner_code: string; item_code: string; item_name: string; quantity: number; reserved: number; issued: number; repair_cost: number|null; pending_cost: boolean; unit_price:number|null; direct_expense:boolean; part_number?:string; available?: number; unit: string; sample_details?: string}[];
  purchase_orders: {owner_code: string; status: string; order_number?: string; request_number: number}[];
};
type CardData = {
  cards: JobCard[]; can_create: boolean; can_main?: boolean; can_buy?: boolean; can_reserve?: boolean;
  items?: {item_code: string; item_name: string; base_unit: string;part_number:string|null;category_ids:number[]}[];
  categories?:Category[];
  traces?:{id:number;name:string}[];
  vehicles?: {vehicle_id: number; vehicle_name: string; vehicle_type_id:number|null; vehicle_type:string;type_code:string; owner_code:string|null;owner_name:string;catalogue_group:string;farm_name:string|null}[];
};
const newPart = (): Part => ({category_id:null,item_code:'',quantity:'1',unit_price:'',sample_details:'',line_purpose:''});

export default function JobCards() {
  const router = useRouter();
  const {from,view} = useLocalSearchParams<{from?:string;view?:string}>();
  const [data, setData] = useState<CardData>();
  const [editing, setEditing] = useState(false);
  const [editingCard,setEditingCard]=useState<JobCard|null>(null);
  const [confirmClose,setConfirmClose]=useState(false);
  const [lineDetails,setLineDetails]=useState<number|null>(null);
  const [history,setHistory]=useState(view==='history');
  const [opened,setOpened]=useState<string|null>(null);
  const [cardType,setCardType]=useState<CardType>('asset');
  const [irrigationTarget,setIrrigationTarget]=useState<'trace'|'asset'>('trace');
  const [trace,setTrace]=useState<number|null>(null);
  const [priceEdit,setPriceEdit]=useState<{id:number;value:string}|null>(null);
  const [catalogueEdit,setCatalogueEdit]=useState<{mode:'category'|'part';index:number;name:string;number:string;unit:string}|null>(null);
  const [vehicleType,setVehicleType]=useState('');
  const [vehicle, setVehicle] = useState<number|null>(null);
  const [purchaseHistory,setPurchaseHistory]=useState<AssetPurchase[]|null>(null);
  const [historyError,setHistoryError]=useState('');
  const [date,setDate]=useState(()=>new Date().toLocaleDateString('en-GB'));
  const [description, setDescription] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reservationPart, setReservationPart] = useState<number|null>(null);
  const [quotePart,setQuotePart]=useState<number|null>(null);
  const [reservationQuantity, setReservationQuantity] = useState('');

  const load = useCallback(async () => {
    try { setData(await stockRequest('?job_cards=1')); }
    catch (failure) { setError((failure as Error).message); }
  }, []);
  useFocusEffect(useCallback(() => {void load();}, [load]));

  useEffect(()=>{
    let current=true;
    setPurchaseHistory(null);
    setHistoryError('');
    if(editing&&vehicle) {
      stockRequest('?job_asset_purchase_history='+vehicle)
        .then(result=>{if(current)setPurchaseHistory(result.rows);})
        .catch(failure=>{if(current)setHistoryError((failure as Error).message);});
    }
    return ()=>{current=false;};
  },[editing,vehicle]);

  function editPart(index: number, changes: Partial<Part>) {
    setParts(current => current.map((part, offset) => offset === index ? {...part, ...changes} : part));
  }

  function closeForm() {
    setEditing(false);setEditingCard(null);setLineDetails(null);
    setVehicle(null);setVehicleType('');setTrace(null);setCardType('asset');setIrrigationTarget('trace');setCatalogueEdit(null);
    setDescription('');
    setParts([]);
  }

  function openSaved(card:JobCard){
    setEditingCard(card);setCardType(card.card_type);setIrrigationTarget(card.vehicle_id?'asset':'trace');
    setVehicle(card.vehicle_id);setVehicleType(String(data?.vehicles?.find(v=>v.vehicle_id===card.vehicle_id)?.vehicle_type_id??''));setTrace(card.tracecode_id);
    setDate(displayJsplDate(card.transaction_date));setDescription(card.work_description);
    setParts(card.parts.map(p=>({part_id:p.part_id,category_id:p.category_id,item_code:p.item_code,quantity:String(p.quantity),unit_price:String(p.unit_price??''),sample_details:p.sample_details??'',line_purpose:p.line_purpose??''})));
    setHistory(false);setEditing(true);setError('');setConfirmClose(false);
  }
  async function finalise(card:JobCard){
    setBusy(true);setError('');
    try{await stockMutation('job-card',{action:'finalise_job_card',id:card.id,revision:card.revision});setConfirmClose(false);await load();setNotice('Job Card '+card.job_number+' finalised.');}
    catch(failure){setError((failure as Error).message);}finally{setBusy(false);}
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const {result} = await stockMutation('job-card', {
        action:editingCard?'edit_job_card':'create_job_card',
        payload:{...(editingCard?{id:editingCard.id,revision:editingCard.revision}:{}),card_type:cardType,vehicle_id:vehicle,tracecode_id:trace,work_description:description.trim(),transaction_date:parseJsplDateInput(date),parts:parts.map(({quantity,unit_price,...part})=>({...part,quantity:Number(quantity),unit_price:unit_price.trim()?Number(unit_price):null}))},
      });
      closeForm();setHistory(true);setOpened(result.id);
      setNotice('Job Card ' + result.job_number + ' saved.');
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeReservation(partId: number, action: 'reserve'|'release'|'issue') {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const quantity=Number(reservationQuantity);
      const {result}=await stockMutation('job-reservation', action==='issue'
        ? {action:'issue_job_part',part_id:partId,quantity}
        : {action:'reserve_job_part',part_id:partId,quantity_delta:action==='reserve'?quantity:-quantity});
      setReservationPart(null);
      setReservationQuantity('');
      setNotice(action==='issue'?'Stock issued · '+result.document_number:action==='reserve'?'Stock reserved.':'Reservation released.');
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const usingAsset=cardType==='asset'||(cardType==='irrigation'&&irrigationTarget==='asset');
  const isIrrigation=(type:string)=>/pump|pivot/i.test(type);
  const assets=(data?.vehicles??[]).filter(row=>isIrrigation(row.type_code+' '+row.vehicle_type)===(cardType==='irrigation'));
  const asset=assets.find(row=>row.vehicle_id===vehicle);
  const types=[...new Map(assets.map(row=>[String(row.vehicle_type_id??'unclassified'),row.vehicle_type])).entries()];
  const group=cardType==='asset'?(asset?.catalogue_group??'vehicle'):cardType;
  const categories=(data?.categories??[]).filter(category=>category.catalogue_group===group);
  const traces=(data?.traces??[]).filter(entry=>cardType!=='irrigation'||/^IRR/i.test(entry.name));
  const validPrice=(value:string)=>!value.trim()||(Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=999999999);
  const valid=!!parseJsplDateInput(date)&&(usingAsset?!!asset:!!trace)&&description.trim().length>0&&description.trim().length<=1000
    && parts.length>0&&parts.every(part=>part.category_id&&part.item_code&&Number(part.quantity)>=0.000001
      &&Number(part.quantity)<=100000&&validPrice(part.unit_price))
    && new Set(parts.map(part=>part.item_code)).size===parts.length;

  function resetDestination(){
    setVehicleType('');setVehicle(null);setTrace(null);setParts([newPart()]);setCatalogueEdit(null);
  }
  async function saveCatalogue(){
    if(!catalogueEdit||busy)return;
    const entry=catalogueEdit;
    setBusy(true);setError('');
    try{
      if(entry.mode==='category'){
        const {result}=await stockMutation('job-card-category',{action:'create_job_category',payload:{group,name:entry.name}});
        editPart(entry.index,{category_id:result.category_id,item_code:''});
      }else{
        const line=parts[entry.index];
        const {result}=await stockMutation('job-card-catalogue',{action:'save_job_catalogue_part',
          payload:{category_id:line.category_id,name:entry.name,part_number:entry.number,unit:entry.unit}});
        editPart(entry.index,{item_code:result.item_code});
      }
      await load();
      setCatalogueEdit(null);
    }catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }
  async function selectCategory(index:number,value:string|number|null){
    const category_id=value===null?null:Number(value);
    const line=parts[index];
    if(!category_id||!line.item_code||line.category_id){editPart(index,{category_id,item_code:''});return;}
    setBusy(true);setError('');
    try{
      await stockMutation('job-card-catalogue',{action:'save_job_catalogue_part',payload:{category_id,item_code:line.item_code}});
      editPart(index,{category_id});await load();
    }catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }
  async function savePrice(){
    if(!priceEdit||busy||!validPrice(priceEdit.value))return;
    setBusy(true);setError('');
    try{
      await stockMutation('job-card-price',{action:'set_job_part_price',payload:{
        part_id:priceEdit.id,unit_price:priceEdit.value.trim()?Number(priceEdit.value):null}});
      setPriceEdit(null);await load();
    }catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }
  function addHistoricalPart(purchase:AssetPurchase){
    const category_id=categories.find(c=>data?.items?.find(i=>i.item_code===purchase.item_code)?.category_ids.includes(c.category_id))?.category_id??null;
    const line={...newPart(),item_code:purchase.item_code,category_id};
    setParts(lines=>{
      if(lines.some(row=>row.item_code===line.item_code))return lines;
      const empty=lines.findIndex(row=>!row.item_code&&!row.category_id&&!row.unit_price);
      return empty>=0?lines.map((row,index)=>index===empty?line:row):lines.length<30?[...lines,line]:lines;
    });
  }
  const rowStyle={flexDirection:'row' as const,alignItems:'flex-start' as const,gap:8};
  const columns=[185,255,84,105];

  return <ScrollView contentContainerStyle={styles.page}>
    <StockV2Header title={editing?(editingCard?'Edit Job Card':'New Job Card'):history?opened?"Job Card details":"Historical Job Cards":"Job Cards"} dashboard={from!=='buying'&&from!=='stock'} allowMain={data?.can_main}
      backLabel={editing?'← Job Cards':history?(opened?'← Historical Job Cards':'← Job Cards'):from==='buying'?'← Buying':undefined}
      onStock={editing?()=>{if(!busy)closeForm();}:history?()=>{if(opened){setOpened(null);setQuotePart(null);setReservationPart(null);}else setHistory(false);}:from==='buying'?()=>router.replace('/buying'):undefined}/>
    {error ? <><Text style={styles.error}>{error}</Text><StockRecovery scope={reservationPart!==null?'job-reservation':'job-card'} onRecovered={() => void load()}/></> : null}
    {notice ? <Text style={styles.success}>{notice}</Text> : null}
    {data&&!editing&&!history?<View style={styles.row}>
      {data.can_create?<StockButton title="New Job Card" onPress={()=>{setEditing(true);setDate(new Date().toLocaleDateString('en-GB'));setParts([newPart()]);setError('');setNotice('');}}/>:<View><Text style={styles.muted}>The Buyer enters new Job Cards.</Text>{data.can_main?<StockButton title="Assign Buyer access" onPress={()=>router.push("/stock-v2-staff")}/>:null}</View>}
      <StockButton title="Historical Job Cards" onPress={()=>setHistory(true)}/>
    </View>:null}
    {editing ? <View style={styles.card}>
      <StockSelect label="Job Card type" disabled={!!editingCard} value={cardType} options={[{id:'general',label:'General'},{id:'asset',label:'Asset'},{id:'irrigation',label:'Irrigation'}]}
        onChange={value=>{if(value&&value!==cardType){setCardType(value as CardType);resetDestination();}}}/>
      {cardType==='irrigation'?<StockSelect label="Irrigation assignment" disabled={!!editingCard} value={irrigationTarget}
        options={[{id:'trace',label:'General supplies'},{id:'asset',label:'Pump or Pivot'}]}
        onChange={value=>{if(value&&value!==irrigationTarget){setIrrigationTarget(value as 'trace'|'asset');resetDestination();}}}/>:null}
      {usingAsset?<><StockSelect label="Vehicle Type" disabled={!!editingCard} value={vehicleType||null} options={types.map(([id,label])=>({id,label}))}
        onChange={value=>{setVehicleType(String(value??''));setVehicle(null);setParts([newPart()]);setCatalogueEdit(null);}}/>
      <StockSelect label="Vehicle or implement" value={vehicle} disabled={!!editingCard||!vehicleType}
        options={assets.filter(row=>String(row.vehicle_type_id??'unclassified')===vehicleType).map(row=>({id:row.vehicle_id,label:row.vehicle_name}))}
        onChange={value=>{setVehicle(value===null?null:Number(value));}}/></>:<StockSelect label="Open trace" disabled={!!editingCard} value={trace} options={traces.map(entry=>({id:entry.id,label:entry.name}))}
        onChange={value=>setTrace(value===null?null:Number(value))}/>}
      {asset?<Text style={styles.muted}>Owner · {asset.owner_name}{asset.farm_name?' · '+asset.farm_name:''}</Text>:null}
      <StockDateField label="Transaction date" value={date} onChange={setDate}/>
      <StockField label={usingAsset?'Problem description':'Purpose'} value={description} onChange={setDescription}/>
      <ScrollView horizontal keyboardShouldPersistTaps="handled">
        <View style={{gap:8}}>
          <View style={rowStyle}>{['Category','Part','Qty','Unit price'].map((label,index)=><Text key={label} style={[styles.text,{width:columns[index]}]}>{label}</Text>)}</View>
          {parts.map((part,index)=><View key={index} style={rowStyle}>
            <View style={{width:columns[0]}}><StockSelect label={'Category '+(index+1)} value={part.category_id}
              options={categories.map(c=>({id:c.category_id,label:c.category_name}))}
              onChange={value=>void selectCategory(index,value)}
              createLabel="+ Add category" onCreate={name=>setCatalogueEdit({mode:'category',index,name,number:'',unit:''})}/></View>
            <View style={{width:columns[1]}}><StockSelect label={'Part '+(index+1)} value={part.item_code} disabled={!part.category_id}
              options={(data?.items??[]).filter(item=>item.item_code===part.item_code||(part.category_id!==null&&item.category_ids.includes(part.category_id)))
                .map(item=>({id:item.item_code,label:[item.part_number,item.item_name].filter(Boolean).join(' · ')}))}
              onChange={value=>editPart(index,{item_code:String(value??'')})}
              createLabel="+ Add part" onCreate={name=>setCatalogueEdit({mode:'part',index,name,number:'',unit:'each'})}/></View>
            <TextInput accessibilityLabel={'Qty '+(index+1)} value={part.quantity} keyboardType="decimal-pad"
              onChangeText={quantity=>editPart(index,{quantity})} style={[styles.input,{width:columns[2],minWidth:0}]}/>
            <TextInput accessibilityLabel={'Unit price '+(index+1)} value={part.unit_price} keyboardType="decimal-pad"
              placeholder="Optional" onChangeText={unit_price=>editPart(index,{unit_price})} style={[styles.input,{width:columns[3],minWidth:0}]}/>
            <StockButton title="Details" onPress={()=>setLineDetails(lineDetails===index?null:index)}/>
            <StockButton title="Remove" disabled={busy} onPress={()=>{setCatalogueEdit(null);setParts(lines=>lines.filter((_,offset)=>offset!==index));}}/>
          </View>)}
        </View>
      </ScrollView>
      {lineDetails!==null&&parts[lineDetails]?<View style={styles.card}>
        <StockField label={'Line '+(lineDetails+1)+' purpose'} value={parts[lineDetails].line_purpose} onChange={line_purpose=>editPart(lineDetails,{line_purpose})}/>
        <StockField label="Sample or collection instructions" value={parts[lineDetails].sample_details} onChange={sample_details=>editPart(lineDetails,{sample_details})}/>
        <StockButton title="Done" onPress={()=>setLineDetails(null)}/>
      </View>:null}
      {catalogueEdit?<View style={styles.card}>
        <StockField label={catalogueEdit.mode==='category'?'Category name':'Part name'} value={catalogueEdit.name}
          onChange={name=>setCatalogueEdit({...catalogueEdit,name})}/>
        {catalogueEdit.mode==='part'?<>
          {cardType!=='general'?<StockField label="Part number" value={catalogueEdit.number} onChange={number=>setCatalogueEdit({...catalogueEdit,number})}/>:null}
          <StockField label="Unit of measure" value={catalogueEdit.unit} onChange={unit=>setCatalogueEdit({...catalogueEdit,unit})}/>
        </>:null}
        <View style={styles.row}><StockButton title="Save to catalogue" disabled={busy} onPress={()=>void saveCatalogue()}/>
          <StockButton title="Cancel" disabled={busy} onPress={()=>setCatalogueEdit(null)}/></View>
      </View>:null}
      <View style={styles.row}>
        <StockButton title="+ Add line" disabled={busy || parts.length >= 30} onPress={() => setParts(current => [...current,newPart()])}/>
        <StockButton title="Save Job Card" disabled={busy || !valid} onPress={() => void save()}/>
      </View>
      {vehicle?<View style={styles.card}>
        <Text style={styles.title}>Equipment purchase history</Text>
        {historyError?<Text style={styles.error}>{historyError}</Text>:purchaseHistory===null
          ?<Text style={styles.muted}>Loading purchases…</Text>
          :purchaseHistory.length===0?<Text style={styles.muted}>No recorded purchases for this equipment.</Text>
          :purchaseHistory.map(purchase=><View key={purchase.id} style={styles.row}>
            <View style={{flex:1}}>
              <Text style={styles.text}>{purchase.item_name} · {purchase.part_number??purchase.item_code}</Text>
              <Text style={styles.muted}>{displayJsplDate(purchase.document_date)} · {purchase.supplier_name} · {purchase.receipt} · {purchase.unit_price===null?'Price pending':Number(purchase.unit_price).toFixed(2)+' per unit'}</Text>
            </View>
            {purchase.active&&!parts.some(line=>line.item_code===purchase.item_code)
              ?<StockButton title="+" disabled={busy||parts.length>=30} onPress={()=>addHistoricalPart(purchase)}/>
              :<Text style={styles.muted}>{purchase.active?'On card':'Inactive part'}</Text>}
          </View>)}
      </View>:null}
    </View> : null}
    {history&&!opened?data?.cards.map(card=><View key={card.id} style={[styles.card,!card.closed_at&&{borderColor:'#b91c1c'}]}><Text style={!card.closed_at?styles.error:styles.muted}>{card.closed_at?'Finalised':'Outstanding'} · {displayJsplDate(card.transaction_date)}</Text><StockButton title={'Job Card '+card.job_number+' · '+card.vehicle_name} onPress={()=>{setOpened(card.id);setConfirmClose(false);}}/></View>):null}
    {history?data?.cards.filter(card=>card.id===opened).map(card => <View key={card.id} style={styles.card}>
      <Text style={styles.title}>Job Card {card.job_number} · {card.vehicle_name}</Text>
      <Text style={styles.text}>{displayJsplDate(card.transaction_date)} · {card.closed_at?'Finalised':'Open'}</Text><Text style={styles.text}>{card.work_description}</Text>
      {data.can_buy&&!card.closed_at?<View style={styles.row}>
        <StockButton title="Edit Job Card" disabled={busy} onPress={()=>openSaved(card)}/>
        <StockButton title={confirmClose?'Confirm finalisation':'Finalise Job Card'} disabled={busy} onPress={()=>confirmClose?void finalise(card):setConfirmClose(true)}/>
      </View>:null}
      {data.can_buy&&card.parts.length>0?<StockSelect label="Item for purchase history and quotes" value={quotePart}
        options={card.parts.filter(part=>!part.direct_expense).map(part=>({id:part.part_id,label:part.item_name}))}
        onChange={value=>setQuotePart(value==null?null:Number(value))}/>:null}
      {card.parts.map(part => <View key={part.part_id} style={{gap:8}}>
        <Text style={styles.text}>{part.item_name}{part.owner_code?' · '+part.owner_code:''} · {part.quantity} {part.unit}{part.sample_details ? ' · ' + part.sample_details : ''}</Text>
        {part.line_purpose&&part.line_purpose!==card.work_description?<Text style={styles.muted}>{part.line_purpose}</Text>:null}
        {part.part_number?<Text style={styles.muted}>Part number · {part.part_number}</Text>:null}
        <Text style={styles.text}>{part.unit_price===null?'Unit price pending':'Unit price · '+Number(part.unit_price).toFixed(2)}</Text>
        {data.can_buy&&!card.closed_at?(priceEdit?.id===part.part_id?<View style={styles.row}>
          <StockField label="Unit price" value={priceEdit.value} numeric onChange={value=>setPriceEdit({id:part.part_id,value})}/>
          <StockButton title="Save price" disabled={busy||!validPrice(priceEdit.value)} onPress={()=>void savePrice()}/>
          <StockButton title="Cancel" disabled={busy} onPress={()=>setPriceEdit(null)}/>
        </View>:<StockButton title="Edit unit price" disabled={busy} onPress={()=>setPriceEdit({id:part.part_id,value:String(part.unit_price??'')})}/>):null}
        {part.direct_expense?<Text style={styles.muted}>Direct expense</Text>:null}
        <Text style={styles.muted}>{part.reserved} {part.unit} reserved · {part.issued} {part.unit} issued</Text>
        {part.issued>0 ? <Text style={styles.text}>
          {part.repair_cost===null?'Inventory cost pending':'Parts cost '+Number(part.repair_cost).toFixed(2)+(part.pending_cost?' (provisional)':'')}
        </Text> : null}
        {data.can_buy&&!part.direct_expense&&quotePart===part.part_id?<JobPartQuotes key={part.part_id} partId={part.part_id} onUse={quoteId=>router.push({
          pathname:'/stock-v2-purchase-orders',params:{from:'job-card',job:card.id,owner:part.owner_code,part:String(part.part_id),quote:quoteId},
        })}/>:null}
        {data.can_reserve && !card.closed_at && !!part.owner_code && !part.direct_expense && (reservationPart===part.part_id ? <>
          <Text style={styles.muted}>{part.available??0} {part.unit} available to reserve</Text>
          <StockField label="Quantity" value={reservationQuantity} numeric onChange={setReservationQuantity}/>
          <View style={styles.row}>
            <StockButton title="Reserve" disabled={busy||!(Number(reservationQuantity)>0)||Number(reservationQuantity)>Math.min(part.quantity-part.reserved-part.issued,part.available??0)} onPress={()=>void changeReservation(part.part_id,'reserve')}/>
            <StockButton title="Release" disabled={busy||!(Number(reservationQuantity)>0)||Number(reservationQuantity)>part.reserved} onPress={()=>void changeReservation(part.part_id,'release')}/>
            <StockButton title="Issue reserved stock" disabled={busy||!(Number(reservationQuantity)>0)||Number(reservationQuantity)>part.reserved} onPress={()=>void changeReservation(part.part_id,'issue')}/>
            <StockButton title="Close" disabled={busy} onPress={()=>setReservationPart(null)}/>
          </View>
        </> : <StockButton title="Manage reservation" disabled={busy} onPress={()=>{setReservationPart(part.part_id);setReservationQuantity('');}}/>)}
      </View>)}
      {card.purchase_orders.map(order => <Text key={order.request_number} style={styles.muted}>
        {order.order_number ?? 'PO request ' + order.request_number} · {order.owner_code} · {order.status==='applied'?'Authorised':order.status}
      </Text>)}
      {data.can_buy&&!card.closed_at ? [...new Set(card.parts.filter(part=>!part.direct_expense).map(part => part.owner_code))].map(owner => (
        <StockButton key={owner} title={owner?'Purchase parts · '+owner:'Purchase parts · choose owner'} onPress={() => router.push({
          pathname:'/stock-v2-purchase-orders', params:{from:'job-card', job:card.id, owner},
        })}/>
      )) : null}
    </View>):null}
  </ScrollView>;
}
