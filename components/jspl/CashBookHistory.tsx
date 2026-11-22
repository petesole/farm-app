import {useState, type ReactNode} from 'react';
import {Pressable,Text,View} from 'react-native';
import {displayJsplDate,parseJsplDateInput} from '@/utils/jspl-input';
import {StockButton,StockDateField,StockSelect,stockStyles as styles} from './StockWorkflowControls';

export type CashEntry={id:string;entry_number:number;kind:string;currency:string;amount:string;account_id:string;destination_id?:string;entry_date:string;created_at:string;
  reference:string;narrative:string;counterparty?:string;status:'draft'|'confirmed'|'voided';reversal_of?:string;reversed:boolean;trip_cash:boolean};
export type QuickNote={id:string;note_number:number;note_date:string;description:string;created_at:string;entry_id:string|null;matched_reference:string|null;reconciled:boolean};
export type CashBalance={currency:string;balance:string};
type Props={entries:CashEntry[];notes:QuickNote[];balances:CashBalance[];busy:boolean;accountName:(id:string)=>string;
  actions:(entry:CashEntry)=>ReactNode;match:(note:QuickNote,entryId:string)=>void};

export function CashBookHistory({entries,notes,balances,busy,accountName,actions,match}:Props){
  const [from,setFrom]=useState(''),[to,setTo]=useState('');
  const [selected,setSelected]=useState<string|null>(null),[matchId,setMatchId]=useState('');
  const start=from.trim()?parseJsplDateInput(from):null,end=to.trim()?parseJsplDateInput(to):null;
  const invalid=(!!from.trim()&&!start)||(!!to.trim()&&!end)||!!(start&&end&&start>end);
  const rows=[
    ...entries.map(entry=>({key:'entry-'+entry.id,number:Number(entry.entry_number),date:entry.entry_date,time:entry.created_at,entry,note:null})),
    ...notes.map(note=>({key:'note-'+note.id,number:Number(note.note_number),date:note.note_date,time:note.created_at,entry:null,note})),
  ].filter(row=>(!start||row.date>=start)&&(!end||row.date<=end))
    .sort((a,b)=>b.date.localeCompare(a.date)||(b.time??'').localeCompare(a.time??'')||b.number-a.number);
  const eligible=entries.filter(e=>e.status==='confirmed'&&!e.reversal_of&&!e.reversed&&['payment','receipt'].includes(e.kind));
  return <>
    <View style={styles.card}><Text style={styles.title}>Current balance</Text>
      {balances.length?balances.map(b=><Text key={b.currency} style={styles.text}>{b.currency} {b.balance}</Text>):<Text style={styles.muted}>No cash account balance recorded.</Text>}
    </View>
    <View style={styles.row}>
      <StockDateField label="Date from" value={from} onChange={v=>{setFrom(v);setSelected(null);}}/>
      <StockDateField label="Date to" value={to} onChange={v=>{setTo(v);setSelected(null);}}/>
    </View>
    {invalid?<Text style={styles.error}>{start&&end&&start>end?'Date from must be on or before Date to.':'Enter a valid date or leave the filter blank.'}</Text>:null}
    {!invalid&&rows.length===0?<Text style={styles.muted}>No transactions in this date range.</Text>:null}
    {!invalid&&rows.map(row=>{
      const {entry,note}=row;
      const title=entry?entry.reference:'Quick Cash '+note!.note_number;
      const status=entry?(entry.reversal_of?'Reversal':entry.reversed?'Reversed':entry.status):(note!.reconciled?'Reconciled':'Awaiting reconciliation');
      return <View key={row.key} style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{expanded:selected===row.key}}
          onPress={()=>{setSelected(selected===row.key?null:row.key);setMatchId('');}} style={{gap:4}}>
          <Text style={styles.title}>{displayJsplDate(row.date)} · {title}{entry?' · '+entry.currency+' '+entry.amount:''}</Text>
          <Text style={styles.text}>{entry?entry.narrative:note!.description}</Text>
          <Text style={styles.muted}>{entry?entry.kind+' · '+accountName(entry.account_id)+' · ':''}{status}</Text>
        </Pressable>
        {selected===row.key&&entry?<>{entry.counterparty?<Text style={styles.muted}>{entry.counterparty}</Text>:null}
          {entry.destination_id?<Text style={styles.muted}>Destination · {accountName(entry.destination_id)}</Text>:null}{actions(entry)}</>:null}
        {selected===row.key&&note?(note.reconciled?<Text style={styles.text}>Matched to {note.matched_reference}</Text>:
          <><StockSelect label="Confirmed transaction" value={matchId||null} options={eligible.map(e=>({id:e.id,label:displayJsplDate(e.entry_date)+' · '+e.reference+' · '+e.currency+' '+e.amount+' · '+e.narrative}))} onChange={v=>setMatchId(String(v??''))}/>
            {!eligible.length?<Text style={styles.muted}>Confirm the payment or receipt first, then match it here.</Text>:null}
            <StockButton title="Reconcile note" disabled={busy||!matchId} onPress={()=>match(note,matchId)}/></>):null}
      </View>;
    })}
  </>;
}
