import {useCallback,useEffect,useState} from 'react';
import {useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {Modal,ScrollView,Text,View} from 'react-native';
import {stockLocation} from '@/utils/stock-navigation';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {StockButton,StockDateField,StockField,StockRecovery,StockSelect,stockStyles as styles} from '@/components/jspl/StockWorkflowControls';
import {TownPlanEditor,TownPlanDetail,type PlanLine,type PlannedTrip,type PlanSave} from '@/components/jspl/TownPlan';
import {jsplColors} from '@/constants/jspl-design';
import {displayJsplDate,parseJsplDateInput} from '@/utils/jspl-input';
import {stockMutation,stockRequest} from '@/utils/stock-workflow';

type Order = {job_requirements?:boolean;order_id:number;order_number:string;supplier:string|null;owner:string;outcome:'pending'|'collected'|'unavailable';can_receive?:boolean;driver_note?:string;payment_terms?:string|null;items:{name:string;quantity:number;remaining:number;unit:string}[]};
type Trip = PlannedTrip & {can_report?:boolean;id:string;trip_number:number;trip_date:string;driver_id:string;driver_name:string;finalised_at:string|null;orders:Order[]};
type TripData = {
  trips:Trip[];line_planning?:boolean;available_lines?:PlanLine[];can_receive_plan?:boolean;can_create?:boolean;can_main?:boolean;can_report?:boolean;can_receive?:boolean;
  drivers?:{id:string;email:string}[];
  orders?:{order_id:number;order_number:string;supplier_name:string|null;payment_terms?:string|null}[];
};

export default function TownTrips(){
  const router=useRouter();
  const {from,view,trip:requestedTrip}=useLocalSearchParams<{from?:string;view?:string;trip?:string}>();
  const [data,setData]=useState<TripData>();
  const [date,setDate]=useState('');
  const [driver,setDriver]=useState('');
  const [orders,setOrders]=useState<number[]>([]);
  const [selected,setSelected]=useState('');
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]);
  const history=mounted&&view==='history';
  const tripId=history?requestedTrip:undefined;
  const showHistory=(trip?:string)=>router.setParams({view:'history',trip:trip??''});
  const [editor,setEditor]=useState<'new'|'edit'|null>(null);
  const [confirmFinalise,setConfirmFinalise]=useState(false);
  const load=useCallback(async()=>{
    try{setData(await stockRequest('?town_trips=1'));}
    catch(failure){setError((failure as Error).message);}
  },[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));

  async function save(payload:Record<string,unknown>){
    if(busy)return;
    setBusy(true);
    setError('');
    setNotice('');
    try{
      const {result}=await stockMutation('town-trip',payload);
      if(payload.action==='create_town_trip'||payload.action==='edit_town_trip'){
        setNotice('Town Trip '+result.trip_number+' saved.');
        setEditor(null);showHistory(result.id);
        setDriver('');setDate('');setOrders([]);
      }else if(payload.action==='finalise_town_trip'){
        setNotice('Town Trip '+result.trip_number+' finalised.');setConfirmFinalise(false);
      }else{
        setNotice('Collection status saved.');
        setSelected('');setNote('');
      }
      await load();
    }catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }

  const planSave:PlanSave=async(command,payload)=>{
    if(busy)return false;
    setBusy(true);setError('');setNotice('');
    try{
      const {result}=await stockMutation('town-trip',{action:'trip_plan',command,payload});
      if(command==='edit'||command==='create'){setEditor(null);showHistory(result.id);}
      setConfirmFinalise(false);
      const message=command==='visit'?'Supplier visit recorded.':command==='confirm'?'Receipt verified and posted.':command==='receive'?'Receipt sent for verification.':command==='close'?'Town list closed. Unreceived quantities are available for another trip.':'Town list TL-'+result.trip_number+' saved.';
      setNotice(message);await load();return true;
    }catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
  };
  const eligible=data?.orders??[];
  const selectedTrip=data?.trips.find(trip=>trip.id===tripId);
  const detail=history?selectedTrip:undefined;
  function openEditor(trip?:Trip){
    setError('');setEditor(trip?'edit':'new');
    setDate(trip?displayJsplDate(trip.trip_date):'');setDriver(trip?.driver_id??'');
    setOrders(trip?.orders.map(order=>Number(order.order_id))??[]);
  }
  const backInTrips=!!detail||(history&&!(from==='outstanding-issues'&&view==='history'));
  const tripDate=parseJsplDateInput(date);
  return <ScrollView contentContainerStyle={styles.page}>
    <StockV2Header title={detail?'Town Trip '+detail.trip_number:history?'Historical Town Trips':'Town Trips'} dashboard allowMain={data?.can_main}
      backLabel={backInTrips?(detail?'← Historical Trips':'← Town Trips'):undefined}
      onStock={backInTrips?()=>{if(busy)return;if(detail)showHistory();else router.setParams({view:'',trip:''});setConfirmFinalise(false);}:undefined}/>
    {error?<><Text style={styles.error}>{error}</Text><StockRecovery scope="town-trip" onRecovered={()=>void load()}/></>:null}
    {notice?<Text style={styles.success}>{notice}</Text>:null}
    {data&&!history?<View style={styles.row}>
      {data.can_create?<StockButton title="Add New Trip" onPress={()=>openEditor()}/>:null}
      <StockButton title="View Historical Trips" onPress={()=>showHistory()}/>
    </View>:null}
    {history&&!detail?data?.trips.map(trip=><View key={trip.id} style={[styles.card,!trip.finalised_at&&{borderColor:jsplColors.danger}]}>
      <Text style={[styles.title,!trip.finalised_at&&{color:jsplColors.danger}]}>Trip {trip.trip_number} · {displayJsplDate(trip.trip_date)} · {trip.finalised_at?'Finalised':'Outstanding'}</Text>
      <StockButton title={'Open Trip '+trip.trip_number} onPress={()=>showHistory(trip.id)}/>
    </View>):null}
    <Modal visible={!!editor} onRequestClose={()=>{if(!busy)setEditor(null);}} animationType="slide">
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>{editor==='edit'?'Edit Town Trip':'New Town Trip'}</Text>
      {error?<Text style={styles.error}>{error}</Text>:null}
      <StockDateField label="Trip date (dd/mm/yyyy)" value={date} onChange={setDate}/>
      <StockSelect label="Driver" value={driver} options={(data?.drivers??[]).map(entry=>({id:entry.id,label:entry.email}))}
        onChange={value=>setDriver(String(value??''))}/>
      {editor&&data?.line_planning&&(editor==='new'||selectedTrip?.line_plan)?<TownPlanEditor key={editor==='new'?'new':tripId} available={data.available_lines??[]} trip={editor==='edit'?selectedTrip:undefined} driver={driver} date={tripDate} busy={busy} save={planSave}/>:<>
      <StockSelect label="Add purchase order" value={null}
        options={eligible.filter(order=>!orders.includes(order.order_id)).map(order=>({id:order.order_id,label:[order.order_number,order.supplier_name??'Supplier to be confirmed',order.payment_terms].filter(Boolean).join(' · ')}))}
        onChange={value=>{if(value!==null)setOrders(current=>[...current,Number(value)]);}} disabled={busy||orders.length>=30}/>
      {orders.map(id=><View key={id} style={styles.row}>
        <Text style={[styles.text,{flex:1}]}>{eligible.find(order=>order.order_id===id)?.order_number??selectedTrip?.orders.find(order=>Number(order.order_id)===id)?.order_number??'Order unavailable'}</Text>
        <StockButton title="Remove" disabled={busy||!!selectedTrip?.orders.some(order=>Number(order.order_id)===id&&order.outcome!=='pending')} onPress={()=>setOrders(current=>current.filter(order=>order!==id))}/>
      </View>)}
      <StockButton title={editor==='edit'?'Save changes':'Assign trip'} disabled={busy||!driver||!tripDate||!orders.length}
        onPress={()=>void save({action:editor==='edit'?'edit_town_trip':'create_town_trip',trip_id:editor==='edit'?tripId:undefined,driver_id:driver,trip_date:tripDate,order_ids:orders})}/></>}
      <StockButton title="Cancel" disabled={busy} onPress={()=>setEditor(null)}/>
    </ScrollView></Modal>
    {detail&&data?[detail].map(trip=><View key={trip.id} style={styles.card}>
      <Text style={styles.title}>{trip.line_plan?'Town List – TL-':'Trip '}{trip.trip_number} · {displayJsplDate(trip.trip_date)}</Text>
      {data.can_create?<Text style={styles.text}>{trip.driver_name}</Text>:null}
      {data.can_create&&!trip.finalised_at?<View style={styles.row}>
        <StockButton title="Edit trip" disabled={busy} onPress={()=>openEditor(trip)}/>
        <StockButton title={confirmFinalise?'Confirm finalisation':'Finalise trip'} disabled={busy||(trip.line_plan?trip.plan_lines.some(l=>Number(l.pending)>0):trip.orders.some(order=>order.outcome==='pending'))}
          onPress={()=>confirmFinalise?(trip.line_plan?void planSave('close',{trip_id:trip.id,version:trip.plan_version}):void save({action:'finalise_town_trip',trip_id:trip.id})):setConfirmFinalise(true)}/>
      </View>:null}
      {trip.line_plan?<TownPlanDetail trip={trip} admin={!!data.can_create} canReceive={!!data.can_receive_plan} busy={busy} save={planSave}/>:null}
      {trip.orders.map(order=>{
        const key=trip.id+':'+order.order_id;
        const report=(outcome:Order['outcome'])=>void save({action:'report_town_trip_order',trip_id:trip.id,order_id:order.order_id,outcome,note:note.trim()});
        return <View key={key} style={styles.card}>
          <Text style={styles.text}>{order.order_number} · {order.owner} · {order.supplier??'Supplier to be confirmed'}</Text>
          {order.payment_terms?<Text style={styles.text}>Payment terms · {order.payment_terms}</Text>:null}
          {order.items.map((item,index)=><Text key={index} style={styles.muted}>{item.name} · {item.quantity} {item.unit} ordered{data.can_receive&&item.remaining!==item.quantity?' · '+item.remaining+' still to receive':''}</Text>)}
          <Text style={styles.text}>{order.outcome==='pending'?'Awaiting collection':order.outcome==='collected'?'Collected':'Could not collect'}</Text>
          {order.driver_note?<Text style={styles.muted}>{order.driver_note}</Text>:null}
          {data.can_receive&&order.can_receive?<StockButton title="Receive order" onPress={()=>router.push({
            pathname:order.job_requirements?'/job-order-receiving':'/stock-v2-po-receiving',params:{from:'town-trip',returnTo:stockLocation('/town-trips',{from,view:'history',trip:trip.id}),trip:trip.id,order:String(order.order_id),owner:order.owner,supplier:order.supplier??''},
          })}/>:null}
          {(trip.can_report??data.can_report)&&!trip.finalised_at&&order.outcome==='pending'?(selected===key?<>
            <StockField label="Collection note" value={note} onChange={setNote}/>
            <View style={styles.row}>
              <StockButton title="Collected" disabled={busy||note.length>500} onPress={()=>report('collected')}/>
              <StockButton title="Could not collect" disabled={busy||!note.trim()||note.length>500} onPress={()=>report('unavailable')}/>
            </View>
          </>:<StockButton title="Update collection" disabled={busy} onPress={()=>{setSelected(key);setNote('');}}/>):null}
        </View>;
      })}
    </View>):null}
    {history&&data&&!data.trips.length?<Text style={styles.text}>No Town Trips assigned.</Text>:null}
  </ScrollView>;
}
