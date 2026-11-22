import {useState} from 'react';
import {Text,View} from 'react-native';
import {stockRequest} from '@/utils/stock-workflow';
import {StockField,StockButton,stockStyles as styles} from './StockWorkflowControls';

const answers=[
  {name:'Cash Book',words:/quick cash|cash note|reconcil.*note/i,text:'Select Quick Cash, enter the date and description, then Save Quick Cash. In Transaction History, open the note and select the confirmed payment or receipt to reconcile it. Recording the note does not change the balance.'},
  {name:'Cash Book',words:/history|balance|date range/i,text:'Open Transaction History. The newest entry appears first. Use Date from or Date to to narrow the list. Current balances include confirmed transactions across the Cash Book and are shown separately by currency.'},
  {name:'Cash Book',words:/supplier|invoice/i,text:'Open Supplier invoices, select the verified invoice, paying account, amount and date, then save the payment draft. Open the draft in Transaction History to confirm it.'},
  {name:'Job Cards',words:/admin|buyer|open|new|create/i,text:'Admin and Buyer can both open Job Cards. Select New Job Card, choose General, Asset or Irrigation, then enter the issue and the parts required.'},
  {name:'Job Cards',words:/history|filter|reuse|part number/i,text:'Choose the equipment. Below the entry lines, Equipment purchase history lists the latest purchases first with supplier and price. Press + beside a part to add it to this Job Card.'},
];
export function WorkflowQuestion({name,topic,guidance,canAskOnline}:{name:'buying'|'cashbook';topic:string;guidance:string;canAskOnline:boolean}){
  const [question,setQuestion]=useState(''),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false);
  async function ask(){
    if(busy||!question.trim())return;
    const local=answers.find(a=>a.name===topic&&a.words.test(question));
    if(local){setAnswer(local.text);return;}
    if(!canAskOnline){setAnswer(guidance);return;}
    setBusy(true);setAnswer('');
    try{setAnswer((await stockRequest('?workflow_help=1',{module:name,question:topic+' — '+question.trim()})).answer);}
    catch{setAnswer('Live answers are unavailable. '+guidance);}
    finally{setBusy(false);}
  }
  return <View style={{gap:8}}>
    <StockField label="Workflow question" value={question} onChange={setQuestion}/>
    <Text style={styles.muted}>Ask about the steps. Leave out names, amounts and references.</Text>
    <StockButton title="Ask" disabled={busy||!question.trim()||question.trim().length+topic.length+3>500} onPress={()=>void ask()}/>
    {answer?<Text accessibilityLiveRegion="polite" style={styles.text}>{answer}</Text>:null}
  </View>;
}
