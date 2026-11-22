import AsyncStorage from '@react-native-async-storage/async-storage';
import {router} from 'expo-router';
import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {StockButton,StockSelect,stockStyles as styles} from './StockWorkflowControls';

const allSteps=[
  {title:'Job Cards',route:'/job-cards',description:'The Buyer chooses General, Asset or Irrigation. Select an open trace or active owned equipment, add parts or reuse an earlier purchase, then request a quote or purchase order.'},
  {title:'Buying',route:'/buying',description:'Compare quotes, submit a purchase order, and follow it through admin authorisation. Record what the supplier delivers.'},
  {title:'Town Trips',route:'/town-trips',description:'Assign an authorised order to a driver. Once the driver marks it collected, open it in Receiving.'},
  {title:'Stock',route:'/stock-test',description:'Open Awaiting Approval to verify a receipt. Then reserve and issue the parts from the Job Card to record their cost.'},
  {title:'Labour',route:'/labour',description:'Enter or review the labour records that will be used when preparing a payment in Cash Book.'},
  {title:'Cash Book',route:'/cashbook',description:'Record payments and receipts, prepare a Labour payment, or reconcile a driver advance against what was spent and returned.'},
  {title:'Outstanding Issues',route:'/outstanding-issues',description:'See the approvals, collections and reconciliations that still need attention.'},
] as const;

const storageKey='jspl-guide:erp-walkthrough';
export function ErpWalkthrough({access}:{access:Record<string,boolean>}){
  const steps=allSteps.filter(s=>access.can_main||(
    s.route==='/job-cards'?(access.is_buyer||access.is_stock||access.is_workshop):
    s.route==='/town-trips'?(access.is_driver||access.is_buyer||access.is_stock):
    s.route==='/buying'?access.is_buyer:s.route==='/stock-test'?access.is_stock:false));
  const options=[{id:'full',label:'Full walkthrough'},...steps.map(s=>({id:s.route,label:s.title}))];
  const [index,setIndex]=useState(0);
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState<'full'|'module'>('full');
  useEffect(()=>{
    let mounted=true;
    AsyncStorage.getItem(storageKey).then(saved=>{
      if(!mounted||saved==='done')return;
      const moduleIndex=steps.findIndex(step=>saved==='module:'+step.route);
      if(moduleIndex>=0){
        setIndex(moduleIndex);setMode('module');setOpen(true);
        return;
      }
      const step=Number(saved);
      if(Number.isInteger(step)&&step>=0&&step<steps.length)setIndex(step);
      setOpen(true);
    }).catch(()=>{});
    return ()=>{mounted=false;};
  },[]);

  function move(step:number){
    setIndex(step);
    void AsyncStorage.setItem(storageKey,String(step)).catch(()=>{});
  }

  function choose(value:string|number|null){
    if(value==='full'){
      setMode('full');move(0);setOpen(true);
      return;
    }
    const selected=steps.findIndex(step=>step.route===value);
    if(selected<0)return;
    setMode('module');setIndex(selected);setOpen(true);
    void AsyncStorage.setItem(storageKey,'module:'+steps[selected].route).catch(()=>{});
  }

  function close(){
    setOpen(false);
    void AsyncStorage.setItem(storageKey,'done').catch(()=>{});
  }

  const step=steps[index];
  if(!step)return null;
  return <View style={[styles.card,{marginBottom:16}]}>
    <StockSelect label="Choose a walkthrough" value={open?(mode==='full'?'full':step.route):null} options={options} onChange={choose}/>
    {open?<>
    {mode==='full'?<Text style={styles.muted}>ERP walkthrough · Step {index+1} of {steps.length}</Text>:null}
    <Text style={styles.title}>{step.title}</Text>
    <Text style={styles.text}>{step.description}</Text>
    <Text style={styles.muted}>Return to the Stock dashboard to continue the tour.</Text>
    <View style={styles.row}>
      <StockButton title={'Open '+step.title} onPress={()=>{if(mode==='full')move(index);router.push({pathname:step.route,params:{from:'stock-dashboard'}});}}/>
      {mode==='full'&&index>0?<StockButton title="Previous" onPress={()=>move(index-1)}/>:null}
      {mode==='full'&&index<steps.length-1?<StockButton title="Next step" onPress={()=>move(index+1)}/>:null}
      <StockButton title={mode==='module'||index===steps.length-1?'Finish walkthrough':'Close walkthrough'} onPress={close}/>
    </View>
    </>:null}
  </View>;
}
