import {useCallback, useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {Text, View} from 'react-native';
import {StockButton, StockField, StockRecovery, stockStyles} from '@/components/jspl/StockWorkflowControls';
import {displayJsplDate} from '@/utils/jspl-input';
import {stockMutation, stockRequest} from '@/utils/stock-workflow';

type ReceiptLine = {item_code?: string; order_line_id?: number; line_id?: number; quantity?: number; invoice_quantity?: number; unit_price?: number};
type Receipt = {
  id: string;
  request_number: number;
  receipt_action: string;
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
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await stockRequest('?receipt_verification=1');
      setReceipts(response.receipts);
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
      await stockMutation('receipt-verification', {
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
    {receipts.map(receipt => {
      const payload = receipt.payload;
      const lines = payload.lines ?? payload.new_receipts ?? [];
      return <View key={receipt.id} style={stockStyles.card}>
        <Text style={stockStyles.title}>Receipt {receipt.request_number} · {payload.delivery_note ?? payload.invoice_number}</Text>
        <Text style={stockStyles.text}>{payload.owner_code} · {payload.supplier} · {displayJsplDate(payload.receipt_date ?? '')}</Text>
        {lines.map((line, index) => <Text key={index} style={stockStyles.text}>{line.item_code ?? 'PO line ' + line.order_line_id} · {line.quantity} received</Text>)}
        {payload.invoice_lines?.map((line, index) => <Text key={index} style={stockStyles.text}>{line.item_code} · {line.invoice_quantity} invoiced × {line.unit_price}</Text>)}
        {selected === receipt.id ? <>
          <StockField label="Reason for returning" value={reason} onChange={setReason}/>
          <StockButton title="Verify and post receipt" disabled={busy} onPress={() => void decide(receipt.id, 'verify')}/>
          <StockButton title="Return receipt" disabled={busy || reason.trim().length < 5} onPress={() => void decide(receipt.id, 'return')}/>
          <StockButton title="Close review" disabled={busy} onPress={() => setSelected('')}/>
        </> : <StockButton title="Review receipt" disabled={busy} onPress={() => {setSelected(receipt.id); setReason('');}}/>}
      </View>;
    })}
  </View>;
}
