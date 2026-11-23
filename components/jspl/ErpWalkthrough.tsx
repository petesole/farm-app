import {useEffect,useState} from 'react';
import {usePathname,router} from 'expo-router';
import {Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StockButton,StockSelect,stockStyles} from './StockWorkflowControls';
import {WorkflowQuestion} from './WorkflowGuide';
import {jsplColors as C} from '@/constants/jspl-design';
import {stockRequest} from '@/utils/stock-workflow';

const topics=[
  {title:'Job Cards',route:'/job-cards',body:'Choose New Job Card, then General, Asset or Irrigation. For equipment, select Vehicle Type and an active owned asset. Add category, part and quantity on each line. The price can be added later. Use + beside an earlier equipment purchase to reuse the part. Outstanding Job Cards shows how many cards are open. Finalising a card moves it to Historical Job Cards.'},
  {title:'Buying',route:'/buying',body:'Start from a Job Card to carry its parts into a purchase order. Admin authorises the order and records payment terms. Enter the actual delivery in Receiving. Admin verifies the receipt before stock changes.'},
  {title:'Town Trips',route:'/town-trips',body:'Admin uses Add New Trip to assign authorised orders to a driver. Drivers open Historical Trips to report collections on their own trips. Outstanding trips appear in red. Collection alone does not change stock.'},
  {title:'Stock Operations',route:'/stock-test',body:'In Awaiting Approval, Admin verifies a physical receipt. For oils and grease, open the Buyer’s Job Card, reserve the quantity, then issue what was handed out. Use Direct Issue for petrol and select the equipment and field or trace.'},
  {title:'Cash Book',route:'/cashbook',body:'Use Quick Cash to capture a date and description. Open the note in Transaction History to reconcile it against a confirmed payment or receipt. The history starts with the latest transaction. Date from and Date to refine the list; the current balance is shown by currency.'},
  {title:'Labour',route:'/labour',body:'Review the recorded labour. In Cash Book, open Labour payments, select the date and source rows, then choose the paying account and payee.'},
  {title:'Outstanding Issues',route:'/outstanding-issues',body:'Open a queue to see the orders, receipts, parts or advances that need attention. Select the item to continue in its own workflow.'},
] as const;

export function ErpWalkthrough(){
  const path=usePathname();
  const insets=useSafeAreaInsets();
  const [open,setOpen]=useState(false),[access,setAccess]=useState<Record<string,boolean>|null>(null);
  const [error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [choice,setChoice]=useState('full'),[index,setIndex]=useState(0);
  useEffect(()=>{setOpen(false);setAccess(null);setError('');},[path]);
  useEffect(()=>{
    if(!open)return;
    let current=true;
    setError('');
    stockRequest('?stock_access=1').then(result=>{if(current)setAccess(result.access);})
      .catch(e=>{if(current)setError(e.message||'Unable to load the walkthrough.');});
    return ()=>{current=false;};
  },[open,retry]);
  if(!/\/(stock(?:-v2|-test|-dashboard)?(?:-|$)|buying$|cashbook$|job-cards$|town-trips$|outstanding-issues$)/.test(path))return null;
  const steps=topics.filter(s=>access?.can_main||(
    s.route==='/job-cards'?(access?.is_buyer||access?.is_stock||access?.is_workshop):
    s.route==='/town-trips'?(access?.is_driver||access?.is_buyer||access?.is_stock):
    s.route==='/buying'?access?.is_buyer:s.route==='/stock-test'?access?.is_stock:false));
  const topic=choice==='full'?steps[index]:steps.find(s=>s.route===choice)??steps[0];
  function launch(){
    const context=topics.find(t=>t.route===path);
    setChoice(context?.route??'full');setIndex(0);setAccess(null);setOpen(true);
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Open walkthrough assistant" onPress={launch}
      style={[s.trigger,{right:Math.max(12,insets.right+8),bottom:Math.max(18,insets.bottom+12)}]}><Text style={s.mark}>?</Text></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
      <View style={[s.overlay,{paddingTop:Math.max(12,insets.top),paddingBottom:Math.max(12,insets.bottom)}]}>
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={()=>setOpen(false)}/>
        <View accessibilityViewIsModal style={s.panel}>
          <View style={s.heading}><Text style={stockStyles.title}>Walkthrough assistant</Text>
            <StockButton title="Close" onPress={()=>setOpen(false)}/></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:12}}>
            {error?<><Text style={stockStyles.error}>{error}</Text><StockButton title="Retry" onPress={()=>setRetry(v=>v+1)}/></>:
              !access?<Text>Loading walkthroughs…</Text>:topic?<>
              <StockSelect label="Choose a walkthrough" value={choice} options={[{id:'full',label:'Full walkthrough'},...steps.map(v=>({id:v.route,label:v.title}))]}
                onChange={v=>{setChoice(String(v??'full'));setIndex(0);}}/>
              <Text style={stockStyles.title}>{topic.title}{choice==='full'?' · '+(index+1)+' of '+steps.length:''}</Text>
              <Text style={stockStyles.text}>{topic.body}</Text>
              <View style={stockStyles.row}>
                {choice==='full'&&index>0?<StockButton title="Previous" onPress={()=>setIndex(i=>i-1)}/>:null}
                {choice==='full'&&index<steps.length-1?<StockButton title="Next" onPress={()=>setIndex(i=>i+1)}/>:null}
                {topic.route!==path?<StockButton title={'Open '+topic.title} onPress={()=>{setOpen(false);router.push({pathname:topic.route,params:{from:'stock-dashboard'}});}}/>:null}
              </View>
              <WorkflowQuestion key={topic.route} name={topic.route==='/cashbook'?'cashbook':'buying'}
                topic={topic.title} guidance={topic.body} canAskOnline={topic.route==='/cashbook'?!!access.can_main:!!(access.is_buyer||access.can_main)}/>
            </>:<Text>No Stock walkthroughs are assigned to this account.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
const s=StyleSheet.create({
  trigger:{position:'absolute',zIndex:10,width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:C.primaryDark,elevation:3},
  mark:{fontSize:24,fontWeight:'700',color:'white'},overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.30)',justifyContent:'flex-end',alignItems:'flex-end',paddingHorizontal:12},
  panel:{width:420,maxWidth:'100%',maxHeight:'88%',padding:16,borderRadius:12,backgroundColor:C.surface,gap:12},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
});
