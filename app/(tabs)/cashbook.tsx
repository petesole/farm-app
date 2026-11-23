import {useCallback,useEffect,useState} from 'react';
import {useFocusEffect,useLocalSearchParams} from 'expo-router';
import {ScrollView,Text,View} from 'react-native';
import {StockV2Header} from '@/components/jspl/StockV2Header';
import {CashBookHistory,type CashEntry as Entry,type QuickNote,type CashBalance} from '@/components/jspl/CashBookHistory';
import {StockButton,StockDateField,StockField,StockRecovery,StockSelect,stockStyles as styles} from '@/components/jspl/StockWorkflowControls';
import {displayJsplDate,parseJsplDateInput} from '@/utils/jspl-input';
import {stockMutation,stockRequest} from '@/utils/stock-workflow';

type Account={id:string;name:string;currency:string;balance:string;active:boolean};
type Trip={id:string;trip_number:number;trip_date:string;driver_name:string};
type Advance={id:string;trip_id:string;account_id:string;amount:string;currency:string;outstanding:string;spend?:string;cash_returned?:string;receipt_reference?:string;settled_date?:string;
  invoices:{invoice_number:string;amount:string}[]};
type TripInvoice={id:string;town_trip_id:string;invoice_number:string;supplier_name:string;available:string;payment_currency:string|null};
type LabourRow={source_type:string;source_id:string;tracecode_name:string;activity_name:string;amount:string};
type Invoice={id:string;invoice_number:string;supplier_name:string;invoice_amount:string;paid:string;drafted:string;credited:string;available:string;payment_currency:string|null};
type CreditOption={grv_id:string;credit_id:string;invoice_number:string;supplier_name:string;owner_code:string;credit_note_number:string;available:string;remaining:string;currency:string|null};
const blankEntry={kind:'payment',account_id:'',destination_id:'',amount:'',entry_date:'',value_date:'',reference:'',narrative:'',counterparty:''};
const blankAccount={name:'',currency:'USD',opening_date:'',opening_balance:''};
const blankAdvance={trip_id:'',account_id:'',date:'',amount:''};
const blankSettlement={advance_id:'',date:'',spend:'',cash_returned:'',receipt_reference:'',invoices:[] as {grv_id:string;amount:string}[]};

export default function CashBook(){
  const {from,view}=useLocalSearchParams<{from?:string;view?:string}>();
  const [data,setData]=useState<{accounts:Account[];entries:Entry[];notes:QuickNote[];balances:CashBalance[];trips:Trip[];advances:Advance[];tripInvoices:TripInvoice[];counterparties:{name:string}[];expenses:{id:string;job_number:number;item_name:string;tracecode_name:string}[]}>();
  const [tab,setTab]=useState<'home'|'entries'|'quick'|'history'|'accounts'|'trips'|'labour'|'suppliers'>('home');
  useEffect(()=>setTab(view==='trips'||view==='history'?view:'home'),[view,from]);
  const backToCashBook=tab!=='home'&&!(from==='outstanding-issues'&&view===tab);
  const [expenseLines,setExpenseLines]=useState<{part_id:string;amount:string}[]>([]);
  const [draft,setDraft]=useState(blankEntry);
  const [quickNote,setQuickNote]=useState({date:'',description:''});
  const [account,setAccount]=useState(blankAccount);
  const [advance,setAdvance]=useState(blankAdvance);
  const [settlement,setSettlement]=useState(blankSettlement);
  const [labourDate,setLabourDate]=useState('');
  const [loadedLabourDate,setLoadedLabourDate]=useState('');
  const [labourRows,setLabourRows]=useState<LabourRow[]>([]);
  const [selectedLabour,setSelectedLabour]=useState<string[]>([]);
  const [labourPayment,setLabourPayment]=useState({account_id:'',date:'',payee:'',reference:''});
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [creditOptions,setCreditOptions]=useState<CreditOption[]>([]);
  const [credit,setCredit]=useState({pair:'',currency:'',amount:''});
  const [supplierPayment,setSupplierPayment]=useState({grv_id:'',account_id:'',date:'',amount:'',reference:''});
  const [reversal,setReversal]=useState({id:'',date:'',reason:''});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    try{
      await Promise.all([stockRequest('?cash_book=1').then(setData),stockRequest('?cash_book_supplier_invoices=1').then(suppliers=>{
        setInvoices(suppliers.invoices);setCreditOptions(suppliers.creditOptions);
      })]);
    }
    catch(failure){setError((failure as Error).message);}
  },[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  const accounts=data?.accounts??[];
  const label=(id:string)=>accounts.find(record=>record.id===id)?.name??'Account';
  const accountOptions=accounts.filter(record=>record.active).map(record=>({id:record.id,label:record.name+' · '+record.currency}));
  const source=accounts.find(record=>record.id===draft.account_id);

  async function save(action:string,payload:Record<string,unknown>){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const {result}=await stockMutation('cash-book',{action,payload});
      if(action==='cash_book_add_counterparty'){if(tab==='labour')setLabourPayment(current=>({...current,payee:result.name}));else setDraft(current=>({...current,counterparty:result.name}));setNotice('Payer or payee added.');}
      else if(action==='cash_book_account'){setAccount(blankAccount);setNotice('Account created.');}
      else if(action==='cash_book_draft'){setDraft(blankEntry);setTab('history');setNotice('Entry '+result.entry_number+' saved as draft.');}
      else if(action==='cash_book_trip_advance'){setAdvance(blankAdvance);setNotice('Trip advance recorded.');}
      else if(action==='cash_book_trip_settle'){setSettlement(blankSettlement);setNotice('Trip advance reconciled.');}
      else if(action==='cash_book_quick_note'){setQuickNote({date:'',description:''});setTab('history');setNotice('Quick Cash '+result.note_number+' saved for reconciliation.');}
      else if(action==='cash_book_match_note'){setNotice('Quick Cash '+result.note_number+' reconciled.');}
      else if(action==='cash_book_labour_draft'){setSelectedLabour([]);setLabourRows([]);setLoadedLabourDate('');setNotice('Labour payment '+result.entry_number+' saved as a draft.');}
      else if(action==='cash_book_supplier_draft'){setSupplierPayment({grv_id:'',account_id:'',date:'',amount:'',reference:''});setNotice('Supplier payment '+result.entry_number+' saved as a draft.');}
      else if(action==='cash_book_apply_supplier_credit'){setCredit({pair:'',currency:'',amount:''});setNotice('Supplier credit applied.');}
      else{setReversal({id:'',date:'',reason:''});setNotice('Entry '+result.entry_number+' '+result.status+'.');}
      await load();
    }catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }

  const editDraft=(key:keyof typeof blankEntry,value:string)=>setDraft(current=>({...current,[key]:value}));
  const editAccount=(key:keyof typeof blankAccount,value:string)=>setAccount(current=>({...current,[key]:value}));
  const decision=(entry:Entry,command:'confirm'|'void')=>void save('cash_book_decision',{entry_id:entry.id,decision:command});
  function openTransaction(kind:'payment'|'receipt'){
    setExpenseLines([]);setDraft({...blankEntry,kind});setError('');setNotice('');setTab('entries');
  }
  const entryDate=parseJsplDateInput(draft.entry_date);
  const valueDate=draft.value_date?parseJsplDateInput(draft.value_date):entryDate;
  const openingDate=parseJsplDateInput(account.opening_date);
  const reversalDate=parseJsplDateInput(reversal.date);
  const advanceDate=parseJsplDateInput(advance.date);
  const settlementDate=parseJsplDateInput(settlement.date);
  const labourDay=parseJsplDateInput(labourDate);
  const paymentDay=parseJsplDateInput(labourPayment.date);
  const supplierDay=parseJsplDateInput(supplierPayment.date);
  const invoice=invoices.find(record=>record.id===supplierPayment.grv_id);
  const creditKey=(option:CreditOption)=>option.grv_id+':'+option.credit_id;
  const selectedCredit=creditOptions.find(option=>creditKey(option)===credit.pair);
  const rowKey=(row:LabourRow)=>JSON.stringify([row.source_type,row.source_id]);
  const labourSources=labourRows.filter(row=>selectedLabour.includes(rowKey(row)));
  const labourTotal=(labourSources.reduce((sum,row)=>sum+Math.round(Number(row.amount)*100),0)/100).toFixed(2);
  const validDraft=!busy&&!!entryDate&&!!valueDate&&!!source&&!!draft.reference.trim()&&!!draft.narrative.trim()&&Number(draft.amount)>0
    &&!!draft.counterparty.trim();

  async function loadLabour(){
    if(!labourDay||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      setLabourRows((await stockRequest('?cash_book_labour='+labourDay)).rows);
      setLoadedLabourDate(labourDay);setSelectedLabour([]);
    }catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }

  return <ScrollView key={tab} contentContainerStyle={styles.page}>
    <StockV2Header title={({home:"Cash Book",quick:"Quick Cash",entries:"New "+draft.kind[0].toUpperCase()+draft.kind.slice(1),history:"Transaction History",accounts:"Cash Book Accounts",trips:"Trip Advances",labour:"Labour Payments",suppliers:"Supplier Invoices"})[tab]} dashboard allowMain={!!data}
      backLabel={backToCashBook?'← Cash Book':undefined} onStock={backToCashBook?()=>{if(!busy)setTab('home');}:undefined}/>
    {error?<><Text style={styles.error}>{error}</Text><StockRecovery scope="cash-book" onRecovered={()=>void load()}/></>:null}
    {notice?<Text style={styles.success}>{notice}</Text>:null}
    {data?<>{tab==="home"?<><View style={styles.row}>
      <StockButton title="New Payment" disabled={busy} onPress={()=>openTransaction('payment')}/>
      <StockButton title="New Receipt" disabled={busy} onPress={()=>openTransaction('receipt')}/>
      <StockButton title="Quick Cash" disabled={busy} onPress={()=>{setQuickNote({date:new Date().toLocaleDateString('en-GB'),description:''});setNotice('');setError('');setTab('quick');}}/>
      <StockButton title="Transaction History" disabled={busy} onPress={()=>setTab('history')}/>
      <StockButton title="Accounts" disabled={busy} onPress={()=>setTab('accounts')}/>
      <StockButton title="Trip advances" disabled={busy} onPress={()=>setTab('trips')}/>
      <StockButton title="Labour payments" disabled={busy} onPress={()=>setTab('labour')}/>
      <StockButton title="Supplier invoices" disabled={busy} onPress={()=>setTab('suppliers')}/>
    </View></>:null}
    {tab==='accounts'&&accounts.map(record=><Text key={record.id} style={styles.text}>{record.name} · {record.currency} {record.balance}</Text>)}
    {tab==='home'?null:tab==='quick'?<View style={styles.card}>
      <StockDateField label="Date" value={quickNote.date} onChange={date=>setQuickNote(n=>({...n,date}))}/>
      <StockField label="Description" value={quickNote.description} onChange={description=>setQuickNote(n=>({...n,description}))}/>
      <StockButton title="Save Quick Cash" disabled={busy||!parseJsplDateInput(quickNote.date)||!quickNote.description.trim()||quickNote.description.trim().length>500}
        onPress={()=>void save('cash_book_quick_note',{date:parseJsplDateInput(quickNote.date),description:quickNote.description.trim()})}/>
      </View>:tab==='accounts'?<View style={styles.card}>
      <Text style={styles.title}>New account</Text>
      <StockField label="Account name" value={account.name} onChange={value=>editAccount('name',value)}/>
      <StockSelect label="Currency" value={account.currency} options={['USD','ZiG'].map(id=>({id,label:id}))} onChange={value=>editAccount('currency',String(value??''))}/>
      <StockDateField label="Opening date (dd/mm/yyyy)" value={account.opening_date} onChange={value=>editAccount('opening_date',value)}/>
      <StockField label="Opening balance" value={account.opening_balance} onChange={value=>editAccount('opening_balance',value)}/>
      <StockButton title="Create account" disabled={busy||!account.name.trim()||!openingDate||!account.opening_balance.trim()}
        onPress={()=>void save('cash_book_account',{...account,opening_date:openingDate})}/>
    </View>:tab==='trips'?<>
      <View style={styles.card}>
        <Text style={styles.title}>Record cash given to a driver</Text>
        <StockSelect label="Town Trip" value={advance.trip_id} options={data.trips.map(trip=>({id:trip.id,label:'Trip '+trip.trip_number+' · '+trip.driver_name}))}
          onChange={value=>setAdvance(current=>({...current,trip_id:String(value??'')}))}/>
        <StockSelect label="Account used" value={advance.account_id}
          options={accountOptions.filter(option=>!data.advances.some(record=>record.trip_id===advance.trip_id&&record.account_id===option.id))}
          onChange={value=>setAdvance(current=>({...current,account_id:String(value??'')}))}/>
        <StockField label="Advance amount" value={advance.amount} numeric onChange={amount=>setAdvance(current=>({...current,amount}))}/>
        <StockDateField label="Advance date (dd/mm/yyyy)" value={advance.date} onChange={date=>setAdvance(current=>({...current,date}))}/>
        <StockButton title="Record advance" disabled={busy||!advance.trip_id||!advance.account_id||!(Number(advance.amount)>0)||!advanceDate}
          onPress={()=>void save('cash_book_trip_advance',{trip_id:advance.trip_id,account_id:advance.account_id,amount:advance.amount,entry_date:advanceDate})}/>
      </View>
      {data.advances.map(record=><View key={record.id} style={styles.card}>
        <Text style={styles.title}>Trip {data.trips.find(trip=>trip.id===record.trip_id)?.trip_number} · {record.currency} {record.amount}</Text>
        {record.settled_date?<><Text style={styles.text}>Reconciled {displayJsplDate(record.settled_date)} · spent {record.spend} · returned {record.cash_returned} · {record.receipt_reference}</Text>
          {record.invoices.map(item=><Text key={item.invoice_number} style={styles.muted}>{item.invoice_number} · {record.currency} {item.amount} paid from advance</Text>)}</>
          :settlement.advance_id===record.id?<>
            <StockField label="Amount spent" value={settlement.spend} numeric onChange={spend=>setSettlement(current=>({...current,spend}))}/>
            <StockField label="Cash returned" value={settlement.cash_returned} numeric onChange={cash_returned=>setSettlement(current=>({...current,cash_returned}))}/>
            <StockField label="Receipt and return references" value={settlement.receipt_reference} onChange={receipt_reference=>setSettlement(current=>({...current,receipt_reference}))}/>
            <StockDateField label="Reconciliation date (dd/mm/yyyy)" value={settlement.date} onChange={date=>setSettlement(current=>({...current,date}))}/>
            <StockSelect label="Add an invoice paid from this advance" value={null} options={data.tripInvoices
              .filter(invoice=>invoice.town_trip_id===record.trip_id&&(!invoice.payment_currency||invoice.payment_currency===record.currency)
                &&!settlement.invoices.some(item=>item.grv_id===invoice.id))
              .map(invoice=>({id:invoice.id,label:invoice.invoice_number+' · '+invoice.supplier_name+' · '+invoice.available+' available'}))}
              onChange={value=>{if(value!==null)setSettlement(current=>({...current,invoices:[...current.invoices,{grv_id:String(value),amount:''}]}));}}
              disabled={busy||settlement.invoices.length>=30}/>
            {settlement.invoices.map(invoice=><View key={invoice.grv_id} style={styles.row}>
              <StockField label={'Paid on '+(data.tripInvoices.find(row=>row.id===invoice.grv_id)?.invoice_number??'invoice')}
                value={invoice.amount} numeric onChange={amount=>setSettlement(current=>({...current,invoices:current.invoices.map(row=>row.grv_id===invoice.grv_id?{...row,amount}:row)}))}/>
              <StockButton title="Remove" disabled={busy} onPress={()=>setSettlement(current=>({...current,invoices:current.invoices.filter(row=>row.grv_id!==invoice.grv_id)}))}/>
            </View>)}
            <StockButton title="Reconcile advance" disabled={busy||!settlementDate||!settlement.receipt_reference.trim()||!settlement.spend.trim()||
              !settlement.cash_returned.trim()||settlement.invoices.some(invoice=>!(Number(invoice.amount)>0))}
              onPress={()=>void save('cash_book_trip_settle',{advance_id:record.id,entry_date:settlementDate,spend:settlement.spend,
                cash_returned:settlement.cash_returned,receipt_reference:settlement.receipt_reference,invoices:settlement.invoices})}/>
          </>:<><Text style={styles.text}>{record.currency} {record.outstanding} to reconcile</Text>
            <StockButton title="Open reconciliation" disabled={busy} onPress={()=>setSettlement({...blankSettlement,advance_id:record.id})}/></>}
      </View>)}
    </>:tab==='suppliers'?<>
      <View style={styles.card}>
        <StockSelect label="Verified supplier invoice" value={supplierPayment.grv_id}
          options={invoices.filter(record=>Number(record.available)>0).map(record=>({id:record.id,label:record.invoice_number+' · '+record.supplier_name+' · '+record.available+' available'}))}
          onChange={value=>setSupplierPayment(current=>({...current,grv_id:String(value??''),account_id:''}))}/>
        {invoice?<Text style={styles.text}>Invoice {invoice.invoice_amount} · Paid {invoice.paid} · Credited {invoice.credited} · Drafted {invoice.drafted} · Available {invoice.available}</Text>:null}
        <StockSelect label="Account in the invoice currency" value={supplierPayment.account_id}
          options={accountOptions.filter(option=>!invoice?.payment_currency||accounts.find(record=>record.id===option.id)?.currency===invoice.payment_currency)}
          onChange={value=>setSupplierPayment(current=>({...current,account_id:String(value??'')}))}/>
        <StockField label="Payment amount" value={supplierPayment.amount} numeric onChange={amount=>setSupplierPayment(current=>({...current,amount}))}/>
        <StockDateField label="Payment date (dd/mm/yyyy)" value={supplierPayment.date} onChange={date=>setSupplierPayment(current=>({...current,date}))}/>
        <StockField label="Payment reference" value={supplierPayment.reference} onChange={reference=>setSupplierPayment(current=>({...current,reference}))}/>
        <StockButton title="Save supplier payment draft" disabled={busy||!invoice||!supplierPayment.account_id||!supplierDay||
          !(Number(supplierPayment.amount)>0)||Number(supplierPayment.amount)>Number(invoice.available)||!supplierPayment.reference.trim()}
          onPress={()=>void save('cash_book_supplier_draft',{...supplierPayment,entry_date:supplierDay})}/>
      </View>
      {creditOptions.length?<View style={styles.card}>
        <Text style={styles.title}>Apply a supplier credit</Text>
        <StockSelect label="Invoice and credit note" value={credit.pair}
          options={creditOptions.map(option=>({id:creditKey(option),label:option.invoice_number+' · '+option.credit_note_number+' · '+option.supplier_name+' · '+option.owner_code}))}
          onChange={value=>{const pair=String(value??'');setCredit({pair,amount:'',currency:creditOptions.find(option=>creditKey(option)===pair)?.currency??''});}}/>
        {selectedCredit?<Text style={styles.text}>Invoice available {selectedCredit.available} · Credit remaining {selectedCredit.remaining}</Text>:null}
        <StockSelect label="Credit currency" value={credit.currency}
          options={(selectedCredit?.currency?[selectedCredit.currency]:['USD','ZiG']).map(id=>({id,label:id}))}
          onChange={value=>setCredit(current=>({...current,currency:String(value??'')}))}/>
        <StockField label="Credit amount to apply" value={credit.amount} numeric onChange={amount=>setCredit(current=>({...current,amount}))}/>
        <StockButton title="Apply credit" disabled={busy||!selectedCredit||!credit.currency||!(Number(credit.amount)>0)||
          Number(credit.amount)>Math.min(Number(selectedCredit.available),Number(selectedCredit.remaining))}
          onPress={()=>{if(selectedCredit)void save('cash_book_apply_supplier_credit',{
            grv_id:selectedCredit.grv_id,credit_id:selectedCredit.credit_id,currency:credit.currency,amount:credit.amount,
          });}}/>
      </View>:null}
    </>:tab==='labour'?<View style={styles.card}>
      <StockDateField label="Labour date (dd/mm/yyyy)" value={labourDate} onChange={value=>{setLabourDate(value);setLoadedLabourDate('');setLabourRows([]);setSelectedLabour([]);}}/>
      <StockButton title="Load labour records" disabled={busy||!labourDay} onPress={()=>void loadLabour()}/>
      {loadedLabourDate&&!labourRows.length?<Text style={styles.text}>No unpaid records for this date.</Text>:null}
      {labourRows.map(row=>{
        const key=rowKey(row),selected=selectedLabour.includes(key);
        return <View key={key} style={styles.row}>
          <Text style={styles.text}>{row.tracecode_name} · {row.activity_name} · {row.amount}</Text>
          <StockButton title={selected?'Remove':'Select'} disabled={busy||(!selected&&selectedLabour.length>=100)}
            onPress={()=>setSelectedLabour(current=>selected?current.filter(id=>id!==key):[...current,key])}/>
        </View>;
      })}
      {labourSources.length>0?<>
        <Text style={styles.title}>Selected labour cost {labourTotal}</Text>
        <StockSelect label="Account in the recorded cost currency" value={labourPayment.account_id} options={accountOptions}
          onChange={value=>setLabourPayment(current=>({...current,account_id:String(value??'')}))}/>
        <StockSelect label="Payee" value={labourPayment.payee||null} options={data.counterparties.map(p=>({id:p.name,label:p.name}))} onChange={v=>setLabourPayment(current=>({...current,payee:String(v??'')}))} createLabel="+ Add payee" onCreate={name=>void save("cash_book_add_counterparty",{name})}/>
        <StockDateField label="Payment date (dd/mm/yyyy)" value={labourPayment.date} onChange={date=>setLabourPayment(current=>({...current,date}))}/>
        <StockField label="Payment reference" value={labourPayment.reference} onChange={reference=>setLabourPayment(current=>({...current,reference}))}/>
        <StockButton title="Save labour payment draft"
          disabled={busy||!paymentDay||!labourPayment.account_id||!labourPayment.payee.trim()||!labourPayment.reference.trim()}
          onPress={()=>void save('cash_book_labour_draft',{account_id:labourPayment.account_id,counterparty:labourPayment.payee,
            entry_date:paymentDay,value_date:paymentDay,reference:labourPayment.reference,narrative:'Labour for '+displayJsplDate(loadedLabourDate),
            amount:labourTotal,labour_date:loadedLabourDate,sources:labourSources.map(({source_type,source_id})=>({source_type,source_id}))})}/>
      </>:null}
    </View>:tab==='entries'?<>
      <View style={styles.card}>
        <StockSelect label="Account" value={draft.account_id} options={accountOptions}
          onChange={value=>setDraft(current=>({...current,account_id:String(value??''),destination_id:''}))}/>
        <StockSelect label={draft.kind==="receipt"?"Payer":"Payee"} value={draft.counterparty||null}
          options={(data.counterparties??[]).map(party=>({id:party.name,label:party.name}))}
          onChange={value=>editDraft("counterparty",String(value??""))}
          createLabel={draft.kind==="receipt"?"+ Add payer":"+ Add payee"}
          onCreate={name=>void save("cash_book_add_counterparty",{name})}/>
        <StockField label="Amount" value={draft.amount} numeric onChange={value=>editDraft('amount',value)}/>
        <StockDateField label="Transaction date (dd/mm/yyyy)" value={draft.entry_date} onChange={value=>editDraft('entry_date',value)}/>
        <StockDateField label="Value date (optional)" value={draft.value_date} onChange={value=>editDraft('value_date',value)}/>
        {draft.kind==='payment'&&data.expenses?.length?<View style={styles.card}>
          {expenseLines.map((line,index)=><View key={index} style={styles.row}>
            <StockSelect label="Job Card expense" value={line.part_id||null} options={data.expenses.filter(e=>!expenseLines.some((l,n)=>n!==index&&l.part_id===e.id)).map(e=>({id:e.id,label:'Job Card '+e.job_number+' · '+e.tracecode_name+' · '+e.item_name}))} onChange={v=>setExpenseLines(lines=>lines.map((l,n)=>n===index?{...l,part_id:String(v??'')}:l))}/>
            <StockField label="Allocated amount" numeric value={line.amount} onChange={amount=>setExpenseLines(lines=>lines.map((l,n)=>n===index?{...l,amount}:l))}/>
            <StockButton title="Remove" onPress={()=>setExpenseLines(lines=>lines.filter((_,n)=>n!==index))}/>
          </View>)}
          <StockButton title="Allocate to a Job Card" onPress={()=>setExpenseLines(lines=>[...lines,{part_id:'',amount:String(Math.max(0,Number(draft.amount)-lines.reduce((s,l)=>s+Number(l.amount),0))||'')}])}/>
        </View>:null}
        <StockField label="Reference" value={draft.reference} onChange={value=>editDraft('reference',value)}/>
        <StockField label="Description" value={draft.narrative} onChange={value=>editDraft('narrative',value)}/>
        <StockButton title="Save draft" disabled={!validDraft||expenseLines.some(l=>!l.part_id||!(Number(l.amount)>0))||expenseLines.reduce((s,l)=>s+Number(l.amount),0)>Number(draft.amount)+0.000001}
          onPress={()=>void save('cash_book_draft',{...draft,entry_date:entryDate,value_date:valueDate,expense_allocations:expenseLines})}/>
      </View>
    </>:<CashBookHistory entries={data.entries} notes={data.notes??[]} balances={data.balances??[]} busy={busy} accountName={label}
      match={(note,entryId)=>void save('cash_book_match_note',{note_id:note.id,entry_id:entryId})}
      actions={entry=>entry.status==='draft'?<View style={styles.row}>
          <StockButton title="Confirm entry" disabled={busy} onPress={()=>decision(entry,'confirm')}/>
          <StockButton title="Void draft" disabled={busy} onPress={()=>decision(entry,'void')}/>
        </View>:entry.status==='confirmed'&&!entry.reversed&&!entry.reversal_of&&!entry.trip_cash?(reversal.id===entry.id?<View style={styles.card}>
          <StockDateField label="Reversal date (dd/mm/yyyy)" value={reversal.date} onChange={date=>setReversal(current=>({...current,date}))}/>
          <StockField label="Reason" value={reversal.reason} onChange={reason=>setReversal(current=>({...current,reason}))}/>
          <StockButton title="Post reversal" disabled={busy||!reversalDate||!reversal.reason.trim()}
            onPress={()=>void save('cash_book_decision',{entry_id:entry.id,decision:'reverse',entry_date:reversalDate,reason:reversal.reason})}/>
        </View>:<StockButton title="Reverse entry" disabled={busy} onPress={()=>setReversal({id:entry.id,date:'',reason:''})}/>):null}
    />}
    </>:null}
  </ScrollView>;
}
