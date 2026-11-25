import {useCallback, useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {Text, View} from 'react-native';
import {StockButton, StockField, StockRecovery, stockStyles} from '@/components/jspl/StockWorkflowControls';
import {displayJsplDate} from '@/utils/jspl-input';
import {stockMutation, stockRequest} from '@/utils/stock-workflow';

type ReceiptLine = {kind?:string;ref?:string;item_name?:string;expected_number?:string|null;marking?:string|null;item_code?: string; order_line_id?: number; line_id?: number; quantity?: number; invoice_quantity?: number; unit_price?: number};
type Receipt = {
  id: string;
  request_number: number;
  receipt_action: string;
  review_lines?: {order_number:string|null;item_name:string|null;unit:string|null;quantity:number;unit_price:number|null}[]|null;
  payload: {
    owner_code: string;
    supplier: string;
    delivery_note?: string;
    invoice_number?: string;
    receipt_date?: string;
    lines?: ReceiptLine[];
    new_receipts?: ReceiptLine[];
    invoice_lines?: ReceiptLine[];
  };
};

export function StockReceiptVerification({onChanged}:{onChanged:()=>Promise<void>}) {
  const [receipts, setReceipts] = useState<Receipt[]|null>(null);
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const [numbers,setNumbers]=useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await stockRequest('?receipt_verification=1');
      setReceipts(response.receipts);
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, []);
  useFocusEffect(useCallback(() => {void load();}, [load]));

  async function decide(receiptId: string, decision: 'verify' | 'return') {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const jobDelivery=receipts?.find(r=>r.id===receiptId)?.receipt_action==='job_delivery';
      await stockMutation('receipt-verification',jobDelivery?{
        action:'job_delivery',command:decision==='verify'?'verify':'return_receipt',payload:{receipt_id:receiptId,numbers,reason},
      }:{
        action: 'decide_receipt', receipt_id: receiptId, decision, ...(decision === 'return' ? {reason: reason.trim()} : {}),
      });
      setSelected('');
      setReason('');
      setNotice(decision === 'verify' ? 'Receipt verified and posted.' : 'Receipt returned for correction.');
      await Promise.all([load(),onChanged()]);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <View style={{gap: 10}}>
    <Text style={stockStyles.title}>Receipts awaiting verification</Text>
    {error ? <><Text style={stockStyles.error}>{error}</Text><StockRecovery scope="receipt-verification" onRecovered={() => void load()}/></> : null}
    {notice ? <Text style={stockStyles.success}>{notice}</Text> : null}
    {receipts?.length===0?<Text style={stockStyles.muted}>No receipts awaiting verification.</Text>:null}
    {receipts?.map(receipt => {
      const payload = receipt.payload;
      const lines = payload.lines ?? payload.new_receipts ?? [];
      return <View key={receipt.id} style={stockStyles.card}>
        <Text style={stockStyles.title}>Receipt {receipt.request_number} · {payload.delivery_note ?? payload.invoice_number}</Text>
        <Text style={stockStyles.text}>{payload.owner_code} · {payload.supplier} · {displayJsplDate(payload.receipt_date ?? '')}</Text>
        {receipt.review_lines?.length?receipt.review_lines.map((line,index)=><Text key={index} style={stockStyles.text}>{line.order_number??'Unknown PO'} · {line.item_name??'Unknown item'} · {line.quantity} {line.unit} received{line.unit_price!=null?' × '+line.unit_price:''}</Text>):lines.map((line, index) => <Text key={index} style={stockStyles.text}>{line.ref?line.ref+' · ':''}{line.item_name??line.item_code??'PO line '+line.order_line_id} · {line.quantity} received</Text>)}
        {payload.invoice_lines?.map((line, index) => <Text key={index} style={stockStyles.text}>{line.item_code} · {line.invoice_quantity} invoiced × {line.unit_price}</Text>)}
        {selected === receipt.id ? <>
          {receipt.receipt_action==='job_delivery'?lines.filter(l=>l.kind==='sample').map(line=><View key={line.order_line_id} style={stockStyles.card}><Text>{line.ref} · {line.item_name}</Text>
            <Text>Stores recorded · {line.marking||'No marking supplied'}</Text>{line.expected_number?<Text>Approved part number · {line.expected_number}</Text>:null}
            <StockField label={'Confirm part number '+line.ref} value={numbers[String(line.order_line_id)]??''} onChange={v=>setNumbers(old=>({...old,[String(line.order_line_id)]:v}))}/>
          </View>):null}
          <StockField label="Reason for returning" value={reason} onChange={setReason}/>
          <StockButton title="Verify and post receipt" disabled={busy||receipt.receipt_action==='job_delivery'&&lines.some(l=>l.kind==='sample'&&!numbers[String(l.order_line_id)]?.trim())} onPress={() => void decide(receipt.id, 'verify')}/>
          <StockButton title="Return receipt" disabled={busy || reason.trim().length < 5} onPress={() => void decide(receipt.id, 'return')}/>
          <StockButton title="Close review" disabled={busy} onPress={() => setSelected('')}/>
        </> : <StockButton title="Review receipt" disabled={busy} onPress={() => {setSelected(receipt.id);setNumbers(Object.fromEntries(lines.filter(l=>l.kind==='sample').map(l=>[String(l.order_line_id),l.expected_number??l.marking??''])));setReason('');}}/>}
      </View>;
    })}
  </View>;
}
