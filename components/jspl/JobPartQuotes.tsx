import {useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {StockButton,StockField,StockRecovery,StockSelect,stockStyles as styles} from '@/components/jspl/StockWorkflowControls';
import {displayJsplDate,parseJsplDateInput} from '@/utils/jspl-input';
import {stockMutation,stockRequest} from '@/utils/stock-workflow';

type Quote={id:string;supplier_name:string;quote_reference:string;quote_date:string;currency:string;unit_price:string};
type Details={
  quotes:Quote[];
  history:{receipt:string;document_date:string;supplier_name:string;unit_price:string}[];
  suppliers:{supplier_id:string;supplier_name:string}[];
};
const blank={supplier_id:'',reference:'',date:'',currency:'',unit_price:''};

export function JobPartQuotes({partId,onUse}:{partId:number;onUse:(quoteId:string)=>void}){
  const [details,setDetails]=useState<Details>();
  const [draft,setDraft]=useState(blank);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const query='?job_part_quotes='+partId;
  useEffect(()=>{
    let active=true;
    stockRequest(query).then(data=>{if(active)setDetails(data);}).catch(failure=>{if(active)setError(failure.message);});
    return ()=>{active=false;};
  },[query]);

  const date=parseJsplDateInput(draft.date);
  const edit=(key:keyof typeof blank,value:string)=>setDraft(current=>({...current,[key]:value}));
  async function save(){
    if(busy||!date)return;
    setBusy(true);setError('');
    try{
      await stockMutation('job-quote',{action:'record_job_quote',payload:{...draft,part_id:partId,quote_date:date}});
      setDetails(await stockRequest(query));setDraft(blank);
    }catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }

  return <View style={styles.card}>
    {error?<><Text style={styles.error}>{error}</Text><StockRecovery scope="job-quote" onRecovered={()=>{
      void stockRequest(query).then(setDetails).catch(failure=>setError(failure.message));
    }}/></>:null}
    {details?<><Text style={styles.title}>Last three priced receipts</Text>
      {details.history.length?details.history.map((receipt,index)=><Text key={receipt.receipt+':'+index} style={styles.text}>
        {displayJsplDate(receipt.document_date)} · {receipt.supplier_name} · {receipt.receipt} · {receipt.unit_price} per unit
      </Text>):<Text style={styles.muted}>No priced receipts for this part and stock owner.</Text>}
      <Text style={styles.title}>Supplier quotations</Text>
      {details.quotes.map(quote=><View key={quote.id} style={styles.row}>
        <Text style={styles.text}>{quote.supplier_name} · {quote.quote_reference} · {displayJsplDate(quote.quote_date)} · {quote.currency} {quote.unit_price} per unit</Text>
        <StockButton title="Use quotation" disabled={busy} onPress={()=>onUse(quote.id)}/>
      </View>)}
      <StockSelect label="Quote supplier" value={draft.supplier_id} options={details.suppliers.map(record=>({id:record.supplier_id,label:record.supplier_name}))}
        onChange={value=>edit('supplier_id',String(value??''))}/>
      <StockField label="Quote reference" value={draft.reference} onChange={value=>edit('reference',value)}/>
      <StockField label="Quote date (dd/mm/yyyy)" value={draft.date} onChange={value=>edit('date',value)}/>
      <StockSelect label="Quote currency" value={draft.currency} options={['USD','ZiG'].map(id=>({id,label:id}))}
        onChange={value=>edit('currency',String(value??''))}/>
      <StockField label="Quoted unit price" value={draft.unit_price} numeric onChange={value=>edit('unit_price',value)}/>
      <StockButton title="Save quotation" disabled={busy||!draft.supplier_id||!draft.reference.trim()||!date||!draft.currency||!(Number(draft.unit_price)>0)}
        onPress={()=>void save()}/>
    </>:null}
  </View>;
}
