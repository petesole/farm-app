import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {StockButton,StockField,stockStyles} from '@/components/jspl/StockWorkflowControls';
import {stockRequest} from '@/utils/stock-workflow';

const guides={
  buying:[
    {title:'Create a purchase order',body:'Choose the stock owner and add the required parts. For a repair, start from Job Cards to carry the requested parts into the order. Submit the order for admin authorisation.'},
    {title:'Follow the order',body:'After admin authorisation, the order is available in Receiving. If it needs collection in town, admin can assign it to a driver in Town Trips.'},
    {title:'Record the delivery',body:'Select the actual supplier and the lines delivered. Enter only the quantities that arrived. Submit the delivery note or invoice for admin verification before stock is posted.'},
    {title:'Correct a returned receipt',body:'Open Receiving, read the admin’s reason, and choose Correct receipt. Review the restored details before resubmitting.'},
  ],
  cashbook:[
    {title:'Record a transaction',body:'Choose the account and enter the amount, dates and reference. Save a draft for review. A confirmed payment or receipt changes the account balance.'},
    {title:'Transfer between accounts',body:'Choose two accounts in the same currency. Confirming the transfer debits the source and credits the destination.'},
    {title:'Record cash for a trip',body:'In Trip advances, select the trip and the account used. After the trip, reconcile the amount spent and the unused cash returned against the advance.'},
    {title:'Use an existing source',body:'Open Labour payments or Supplier invoices to create a draft linked to the source records. Review the amount and currency before confirming the payment.'},
  ],
} as const;

type GuideName=keyof typeof guides;

export function WorkflowGuide({name,context}:{name:GuideName;context?:string}){
  const [open,setOpen]=useState(false);
  const [step,setStep]=useState(0);
  const [question,setQuestion]=useState('');
  const [answer,setAnswer]=useState('');
  const [error,setError]=useState('');
  const [asking,setAsking]=useState(false);
  const key='jspl-guide-seen:'+name;
  const steps=guides[name];
  useEffect(()=>{
    let active=true;
    AsyncStorage.getItem(key).then(seen=>{
      if(active&&!seen)setOpen(true);
    }).catch(()=>{});
    return ()=>{active=false;};
  },[key]);

  function close(){
    setOpen(false);
    void AsyncStorage.setItem(key,'1').catch(()=>{});
  }

  async function ask(){
    if(asking||!question.trim()||question.trim().length>500)return;
    setAsking(true);setError('');setAnswer('');
    try{setAnswer((await stockRequest('?workflow_help=1',{module:name,question:question.trim()})).answer);}
    catch(failure){setError((failure as Error).message);}
    finally{setAsking(false);}
  }

  if(!open)return <StockButton title="Workflow help" onPress={()=>{setStep(0);setOpen(true);}}/>;
  return <View style={stockStyles.card}>
    <Text style={stockStyles.title}>{steps[step].title}</Text>
    <Text style={stockStyles.text}>{steps[step].body}</Text>
    {context?<Text style={stockStyles.muted}>{context}</Text>:null}
    <View style={stockStyles.row}>
      <StockButton title="Previous" disabled={step===0} onPress={()=>setStep(current=>Math.max(0,current-1))}/>
      {step<steps.length-1?<StockButton title="Next" onPress={()=>setStep(current=>Math.min(steps.length-1,current+1))}/>:null}
      <StockButton title={step===steps.length-1?'Done':'Close guide'} onPress={close}/>
    </View>
    <StockField label="Workflow question" value={question} onChange={setQuestion}/>
    <Text style={stockStyles.muted}>Ask about workflow steps. Leave out names, amounts and references.</Text>
    <StockButton title="Ask a question" disabled={asking||!question.trim()||question.trim().length>500} onPress={()=>void ask()}/>
    {answer?<Text style={stockStyles.text}>{answer}</Text>:null}
    {error?<Text style={stockStyles.error}>{error}</Text>:null}
  </View>;
}
