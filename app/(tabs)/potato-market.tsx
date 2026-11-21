import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "@/supabase";
import { parseJsplDateInput, displayJsplDate } from "@/utils/jspl-input";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { JsplSearchCombo } from "@/components/jspl/JsplSearchCombo";
import { jsplColors as C } from "@/constants/jspl-design";

type Dispatch = { dispatch_id: string; dnote_number: string; dnote_date: string; counts: Record<string, number> };
type Trace = { id: number; name: string };
type Market = { id: number; name: string };
type Payment = { payment_id: string; market_id: number | null; customer_id?: number | null; market_name: string; payment_date: string; amount: number; note: string | null; market_reference: string | null };
type PresaleSize={size_code:string;contracted:number;price:number;allocated:number;collected:number;awaiting:number;reserved:number;sold_value:number};
type Presale={presale_id:string;reference:string;contract_date:string;customer_id:number;customer_name:string;tracecode_id:number;trace_name:string;status:string;lines:PresaleSize[]};
type FieldV2={tracecode_id:number;tracecode_name:string;hectares:number;raw_kg:number;waste_kg:number;size_code:string;size_name:string;sort_order:number;processed_pockets:number;processed_kg:number;stock_pockets:number;stock_kg:number;sold_pockets:number;sold_kg:number;sold_value:number};
type TransactionRow={entry_type:string;entry_id:string;entry_date:string;reference:string;customer_id:number;market_name:string;signed_amount:number;notes?:string|null};
type PendingMarketDNote={dispatch_id:string;customer_id:number;market_name:string;dnote_number:string;dnote_date:string;pockets:number};
type Correctable = Dispatch & {source:"normal"|"presale"|"divert";presale_id:string|null;prices:Record<string,number>};

const sizes: [string, string][] = [["LARGE", "Large"], ["MEDIUM", "Medium"], ["SMEDIUM", "Small-Medium"], ["SMALL", "Small"], ["CHATS", "Chats"], ["CUTS", "Cuts"], ["BULLETS", "Bullets"], ["GREENS", "Greens"]];
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const dateIso = (value: string) => parseJsplDateInput(value);
const showDate = (value: string) => value ? displayJsplDate(value.slice(0, 10)) : "—";
const money=(n:number)=>Number(n||0).toFixed(2);
const num=(n:number)=>Number(n||0).toLocaleString("en-US",{maximumFractionDigits:2});
const inputStyle = { borderWidth: 1, borderColor: "#aeb9b4", borderRadius: 6, padding: 9, backgroundColor: "white", minWidth: 105, marginBottom: 7 } as const;
function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={{ padding: 11, backgroundColor: disabled ? "#9aa8a0" : C.primaryDark, borderRadius: 6, marginRight: 8, marginVertical: 5 }}><Text style={{ color: "white", fontWeight: "700" }}>{label}</Text></Pressable>;
}

function ReportCell({value,width=90,bold=false}:{value:string;width?:number;bold?:boolean}){
 return <Text style={{width,flexShrink:0,padding:6,fontWeight:bold?"700":"400"}}>{value}</Text>;
}
export default function PotatoMarket() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedReportField, setSelectedReportField] = useState<number | null>(null);

  const [tab, setTab] = useState<"sale"|"payment"|"transactions"|"presale_report"|"field">("sale");
  const [marketEntryType,setMarketEntryType]=useState<"payment"|"presale">("payment");
  const [presaleReportCustomer,setPresaleReportCustomer]=useState<number|null>(null);
  const [presaleReportContract,setPresaleReportContract]=useState("");
  const [dispatchId,setDispatchId]=useState("");
  const [source,setSource]=useState<"normal"|"presale"|"divert">("normal");
  const [prices,setPrices]=useState<Record<string,string>>({});
  const [presaleChoice,setPresaleChoice]=useState("");
  const [diversionReason,setDiversionReason]=useState("");
  const [presales,setPresales]=useState<Presale[]>([]);
  const [latestAllocated,setLatestAllocated]=useState<Correctable|null>(null);
  const [correctionMode,setCorrectionMode]=useState(false);
  const [correctionReason,setCorrectionReason]=useState("");
  const [reportV2,setReportV2]=useState<FieldV2[]>([]);
  const [transactionRows,setTransactionRows]=useState<TransactionRow[]>([]);
  const [selectedTransactionMarket,setSelectedTransactionMarket]=useState<number|null>(null);
  const [pendingMarketDNotes,setPendingMarketDNotes]=useState<PendingMarketDNote[]>([]);
  const [pendingSizes,setPendingSizes]=useState<{size_code:string;pockets:number}[]>([]);
  const [contractFields,setContractFields]=useState<Trace[]>([]);
  const [contractReference,setContractReference]=useState("");
  const [contractDate,setContractDate]=useState(today());
  const [contractCustomer,setContractCustomer]=useState<number|null>(null);
  const [contractField,setContractField]=useState<number|null>(null);
  const [contractLines,setContractLines]=useState<Record<string,{qty:string;price:string}>>({});
  const [contractNotes,setContractNotes]=useState("");
  const [notice,setNotice]=useState("");
  const [paymentEdit, setPaymentEdit] = useState("new");
  const [marketId, setMarketId] = useState("");
  const [newMarketName, setNewMarketName] = useState("");
  const [addingMarket, setAddingMarket] = useState(false);
  const [paymentDate, setPaymentDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [paymentReason, setPaymentReason] = useState("");

  async function load() {
    const { data, error: loadError } = await supabase.rpc("potato_market_statement_context");
    if (loadError) throw loadError;
    setDispatches(data.dispatches || []);
    // Use the existing Weighbridge customer list as agreed for Market.
    setMarkets(data.customers || []);
    setPayments(data.payments || []);
    setPresales(data.presales || []);
    setLatestAllocated(data.latest_allocated || null);
    setReportV2(data.field_report_v2 || []);
    setTransactionRows(data.transaction_rows || []);
    setPendingMarketDNotes(data.pending_market_dnotes || []);
    setPendingSizes(data.pending_stock_by_size || []);
    setContractFields(data.contract_fields || []);
    return data;
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const { data: roles, error: roleError } = await supabase.rpc("my_farm_app_roles");
      const isAdmin = !userError && !!userData.user && !roleError && Array.isArray(roles) && roles.some((role: string) => String(role).trim().toLowerCase() === "admin");
      if (!mounted) return;
      setAdmin(isAdmin);
      if (isAdmin) try { await load(); } catch (e: any) { if (mounted) setError(e.message || "Could not load Potato Market"); }
    })();
    return () => { mounted = false; };
  }, []);

  const editingPayment=payments.find(p=>p.payment_id===paymentEdit);
  const dispatch=correctionMode?latestAllocated:dispatches.find(d=>d.dispatch_id===dispatchId);
  const availableDNotes=dispatches;
  const eligibleContracts=presales.filter(c=>c.status==="active" && !!dispatch &&
    (correctionMode||sizes.filter(([code])=>Number(dispatch?.counts[code]||0)>0).every(([code])=>
      c.lines.some(l=>l.size_code===code && l.reserved>=Number(dispatch?.counts[code]||0)))));
  // Only customers with an actual potato sale or an issued potato D-Note.
  // Payments alone never qualify a customer for this list.
  const transactionMarkets=[...new Map([
    ...transactionRows.filter(r=>Number(r.customer_id)>0 &&
       (r.entry_type==="normal_sale"||r.entry_type==="presale_reserve"))
       .map(r=>[Number(r.customer_id),{id:Number(r.customer_id),name:r.market_name}] as const),
    ...pendingMarketDNotes.filter(d=>Number(d.customer_id)>0)
       .map(d=>[Number(d.customer_id),{id:Number(d.customer_id),name:d.market_name}] as const)
  ]) .values()].sort((a,b)=>a.name.localeCompare(b.name));
  const presaleCustomers=[...new Map(presales.map(p=>[p.customer_id,{id:p.customer_id,name:p.customer_name}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  const presaleReportContracts=presales.filter(p=>p.customer_id===presaleReportCustomer).sort((a,b)=>a.reference.localeCompare(b.reference));
  const selectedPresaleReport=presales.find(p=>p.presale_id===presaleReportContract);
  const selectedMarketTransactions=transactionRows
    .filter(r=>Number(r.customer_id)===selectedTransactionMarket)
    .sort((a,b)=>String(a.entry_date).localeCompare(String(b.entry_date)) ||
      (a.entry_type==="payment"?1:0)-(b.entry_type==="payment"?1:0) ||
      String(a.entry_id).localeCompare(String(b.entry_id)));
  let marketRunningBalance=0;
  const marketLedgerRows=selectedMarketTransactions.map(r=>{
    marketRunningBalance+=Number(r.signed_amount)||0;
    return {...r,balance:marketRunningBalance};
  });
  const marketSaleTotal=selectedMarketTransactions
    .filter(r=>r.entry_type!=="payment").reduce((total,r)=>total+Number(r.signed_amount||0),0);
  const marketPaymentTotal=selectedMarketTransactions
    .filter(r=>r.entry_type==="payment").reduce((total,r)=>total-Number(r.signed_amount||0),0);
  const selectedPendingDNotes=pendingMarketDNotes.filter(d=>Number(d.customer_id)===selectedTransactionMarket)
    .sort((a,b)=>String(a.dnote_date).localeCompare(String(b.dnote_date))||a.dnote_number.localeCompare(b.dnote_number));
  const reportFields=[...new Map(reportV2.filter(r=>Number(r.raw_kg)>0||Number(r.processed_pockets)>0||Number(r.sold_pockets)>0).map(r=>[r.tracecode_id,{id:r.tracecode_id,name:r.tracecode_name}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
  const selectedRows=reportV2.filter(r=>r.tracecode_id===selectedReportField).sort((a,b)=>sizes.findIndex(([code])=>code===a.size_code)-sizes.findIndex(([code])=>code===b.size_code));
  const reportHa=Number(selectedRows[0]?.hectares||0);
  const rawKg=Number(selectedRows[0]?.raw_kg||0);
  const wasteKg=Number(selectedRows[0]?.waste_kg||0);
  const processKg=selectedRows.reduce((v,r)=>v+Number(r.processed_kg||0),0);
  const soldKg=selectedRows.reduce((v,r)=>v+Number(r.sold_kg||0),0);
  const soldValue=selectedRows.reduce((v,r)=>v+Number(r.sold_value||0),0);
  const processedTotal=processKg+wasteKg;
  useEffect(() => {
    if (editingPayment) {
      const paymentMarketId = editingPayment.customer_id ?? editingPayment.market_id;
      setMarketId(paymentMarketId == null ? "" : String(paymentMarketId));
      setPaymentDate(showDate(editingPayment.payment_date));
      setAmount(String(editingPayment.amount));
      setNote(editingPayment.note || "");
      setReference(editingPayment.market_reference || "");
    } else if (paymentEdit === "new") {
      setMarketId(""); setPaymentDate(today()); setAmount(""); setNote(""); setReference("");
    }
    setPaymentReason("");
  }, [paymentEdit]);

  async function saveSale(){
    setError("");setNotice("");
    if(!dispatch){setError("Choose an issued D-Note.");return;}
    if(source!=="normal"&&!presaleChoice){setError("Select the customer pre-sale.");return;}
    if(source==="divert"&&!diversionReason.trim()&&!correctionMode){setError("Enter the compulsory diversion reason.");return;}
    if(correctionMode&&!correctionReason.trim()){setError("Enter the mandatory audit reason.");return;}
    const lines:Record<string,{price:number}>={};
    if(source!=="presale")for(const [code,name] of sizes){
      if(Number(dispatch.counts?.[code]||0)<=0)continue;
      const price=Number(prices[code]),raw=(prices[code]||"").trim();
      if(!raw||!Number.isFinite(price)||price<=0){setError("Enter positive price per pocket for "+name);return;}
      lines[code]={price};
    }
    setBusy(true);
    try{
      const {error:e}=await supabase.rpc(correctionMode?"potato_market_correct_latest":"potato_market_allocate_and_price",{
        p_dispatch_id:dispatch.dispatch_id,p_source:source,p_presale_id:source==="normal"?null:presaleChoice,
        p_lines:lines,p_reason:correctionMode?correctionReason:(source==="divert"?diversionReason:null)
      });
      if(e)throw new Error(e.message);
      const updated=await load();
      if((updated?.dispatches||[]).some((x:Dispatch)=>x.dispatch_id===dispatch.dispatch_id))
        throw new Error("D-Note still awaits allocation; verify before retrying.");
      setDispatchId("");setPrices({});setPresaleChoice("");setDiversionReason("");setCorrectionMode(false);setCorrectionReason("");
      setNotice(correctionMode?"Corrected D-Note with retained audit history.":"D-Note allocation saved and verified.");
    }catch(e:any){setError(e.message||"Allocation failed.");}
    finally{setBusy(false);}
  }
  async function savePresale(){
    setError("");setNotice("");
    const date=dateIso(contractDate);
    if(!date||!contractReference.trim()||contractCustomer===null||contractField===null){
      setError("Enter contract reference, date, customer and field.");return;
    }
    const lines:Record<string,{pockets:number;price:number}>={};
    for(const [code,name] of sizes){
      const row=contractLines[code];if(!row||(!row.qty.trim()&&!row.price.trim()))continue;
      const pockets=Number(row.qty),price=Number(row.price);
      if(!Number.isInteger(pockets)||pockets<=0||!row.price.trim()||!Number.isFinite(price)||price<=0){
        setError("Enter valid pockets and price for "+name);return;
      }
      lines[code]={pockets,price};
    }
    if(!Object.keys(lines).length){setError("Enter at least one contracted size.");return;}
    setBusy(true);
    try{
      const {data:id,error:e}=await supabase.rpc("potato_presale_create",{
        p_reference:contractReference.trim(),p_contract_date:date,p_customer_id:contractCustomer,
        p_tracecode_id:contractField,p_lines:lines,p_notes:contractNotes||null
      });
      if(e)throw new Error(e.message);
      const updated=await load();
      if(!(updated?.presales||[]).some((c:Presale)=>c.presale_id===id))
        throw new Error("Contract not verified; check records before retry.");
      setContractReference("");setContractDate(today());setContractCustomer(null);
      setContractField(null);setContractLines({});setContractNotes("");
      setNotice("Pre-sale saved; graded stock reserved at contract prices.");
    }catch(e:any){setError(e.message||"Pre-sale save failed.");}
    finally{setBusy(false);}
  }
  async function savePayment(){
    setError("");setNotice("");
    const date=dateIso(paymentDate),value=Number(amount);
    if(!marketId||!date||!Number.isFinite(value)||value<=0){
      setError("Choose a market and enter a valid date and payment amount.");return;
    }
    if(editingPayment&&!paymentReason.trim()){setError("Enter a reason for editing this payment.");return;}
    setBusy(true);
    try{
      const {data:id,error:e}=await supabase.rpc("potato_market_save_payment",{
        p_payment_id:editingPayment?.payment_id||null,
        p_customer_id:Number(marketId),
        p_payment_date:date,p_amount:value,p_note:note,
        p_market_reference:reference,p_reason:paymentReason||null
      });
      if(e)throw new Error(e.message);
      const refreshed=await load();
      if(!(refreshed?.payments||[]).some((p:Payment)=>p.payment_id===id)){
        throw new Error("Payment could not be verified after saving. Check records before retrying.");
      }
      setPaymentEdit("new");
      setMarketId("");setPaymentDate(today());setAmount("");setNote("");
      setReference("");setPaymentReason("");
      setNotice(editingPayment?"Payment correction saved and verified. New payment ready.":"Payment saved and verified. New payment ready.");
    }catch(e:any){setError(e.message||"Payment save failed; entry retained.");}
    finally{setBusy(false);}
  }
  async function addMarket() {
    setError("");
    if (!newMarketName.trim()) { setError("Enter the market name to add it to the customer list."); return; }
    setBusy(true);
    const { data, error: addError } = await supabase.rpc("potato_market_add_market", { p_market_name: newMarketName.trim() });
    setBusy(false);
    if (addError) { setError(addError.message); return; }
    await load();
    setMarketId(String(data));
    setNewMarketName("");
    setAddingMarket(false);
  }

  if (admin === null) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
  if (!admin) return <View style={{ padding: 24 }}><Text>Admin access required.</Text></View>;

  return <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 18 }}>
    <JsplModuleHeader title="Potato Market" subtitle="Normal FIFO, pre-sales, dispatches and market payments" backLabel="Back to Weighbridge Dashboard" backHref="/weighbridge" />
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <Button label="D-Note Allocation" onPress={() => setTab("sale")} />

      <Button label="Market Payment" onPress={() => setTab("payment")} />
      <Button label="Pre-Sale Report" onPress={() => setTab("presale_report")} />
      <Button label="Transaction Report" onPress={() => setTab("transactions")} />
      <Button label="Field Report" onPress={() => setTab("field")} />
      <Button label="Refresh" onPress={() => load().catch((e: any) => setError(e.message))} />
    </View>
    {!!error && <Text style={{ color: "#b42318", marginVertical: 8 }}>{error}</Text>}
    {!!notice && <Text style={{color:C.primaryDark,marginVertical:8}}>{notice}</Text>}


    {tab==="sale"&&<View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
      <Text style={{fontSize:20,fontWeight:"700"}}>D-Note Stock Allocation</Text>
      <Text style={{color:C.textSecondary}}>Normal stock uses FIFO. The WB computer remains unchanged.</Text>
      <Button label={correctionMode?"Cancel correction":"Correct latest allocation"} disabled={!correctionMode&&!latestAllocated}
        onPress={()=>{
          if(correctionMode){setCorrectionMode(false);setCorrectionReason("");setDispatchId("");setPrices({});setPresaleChoice("");}
          else if(latestAllocated){
            setCorrectionMode(true);setSource(latestAllocated.source);
            setPresaleChoice(latestAllocated.presale_id||"");
            setPrices(Object.fromEntries(Object.entries(latestAllocated.prices||{}).map(([k,v])=>[k,String(v)])));
            setCorrectionReason("");
          }
        }}/>
      {correctionMode&&<Text style={{color:C.danger}}>Correction is permitted only on the latest allocation, with a mandatory audit reason. Later movements may prevent older corrections.</Text>}
      {correctionMode?<Text style={{fontWeight:"700",marginVertical:6}}>Correcting {latestAllocated?.dnote_number}</Text>:
      <Picker selectedValue={dispatchId} onValueChange={v=>{setDispatchId(v);setPrices({});setPresaleChoice("");}}>
        <Picker.Item label="Choose unallocated D-Note" value=""/>
        {availableDNotes.map(d=><Picker.Item key={d.dispatch_id} value={d.dispatch_id} label={d.dnote_number+" · "+showDate(d.dnote_date)}/>)}
      </Picker>}
      {dispatch&&<>
        <Text>D-Note date: {showDate(dispatch.dnote_date)}</Text>
        <Picker selectedValue={source} onValueChange={v=>{setSource(v);setPresaleChoice("");}}>
          <Picker.Item label="Normal stock — FIFO" value="normal"/>
          <Picker.Item label="Pre-sold customer collection" value="presale"/>
          <Picker.Item label="Admin diversion of reserved stock" value="divert"/>
        </Picker>
        {source!=="normal"&&<>
          <Picker selectedValue={presaleChoice} onValueChange={setPresaleChoice}>
            <Picker.Item value="" label="Choose pre-sale with sufficient reserved stock"/>
            {eligibleContracts.map(c=><Picker.Item key={c.presale_id} value={c.presale_id} label={c.reference+" · "+c.customer_name+" · "+c.trace_name}/>)}
          </Picker>
          {!eligibleContracts.length&&<Text style={{color:C.danger}}>No contract has enough reserved stock for every size on this D-Note.</Text>}
        </>}
        {source==="divert"&&!correctionMode&&<TextInput style={inputStyle} placeholder="Compulsory diversion reason" value={diversionReason} onChangeText={setDiversionReason}/>}
        {correctionMode&&<TextInput style={inputStyle} placeholder="Compulsory correction reason — retained in audit" value={correctionReason} onChangeText={setCorrectionReason}/>}
        {sizes.filter(([code])=>Number(dispatch.counts[code]||0)>0).map(([code,name])=>
          <View key={code} style={{flexDirection:"row",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <Text style={{width:115,fontWeight:"700"}}>{name}</Text>
            <Text style={{width:120}}>{num(dispatch.counts[code])} pockets</Text>
            {source!=="presale"&&<TextInput style={{...inputStyle,width:145}} placeholder="Price/pocket" keyboardType="decimal-pad" value={prices[code]||""} onChangeText={v=>setPrices(p=>({...p,[code]:v}))}/>}
          </View>)}
        <Button label={busy?"Saving…":correctionMode?"Save audited correction":"Confirm stock allocation"} disabled={busy||(source!=="normal"&&!presaleChoice)} onPress={saveSale}/>
      </>}
      {!availableDNotes.length&&<Text>No D-Notes awaiting stock allocation.</Text>}
    </View>}
    {tab === "payment" && <View style={{ backgroundColor: "white", padding: 14, borderRadius: 8 }}>
      <Text style={{fontSize:20,fontWeight:"700"}}>Market Payment / Pre-Sale</Text>
      <Text>Entry Type</Text>
      <Picker selectedValue={marketEntryType} onValueChange={v=>{setMarketEntryType(v);setError("");setNotice("");}}>
        <Picker.Item label="Market Payment" value="payment"/>
        <Picker.Item label="Pre-Sale" value="presale"/>
      </Picker>
      {marketEntryType==="payment"&&<>
      <Text style={{fontSize:18,fontWeight:"700"}}>{editingPayment?"Edit market payment":"New market payment"}</Text>
      <Text>Payment record</Text>
      <Picker selectedValue={paymentEdit} onValueChange={setPaymentEdit}>
        <Picker.Item label="New payment" value="new" />
        {payments.map(payment => <Picker.Item key={payment.payment_id} label={`${payment.market_name} · ${showDate(payment.payment_date)} · ${Number(payment.amount).toFixed(2)}`} value={payment.payment_id} />)}
      </Picker>
      <Text>Market</Text>
      <JsplSearchCombo label="Market" selector="crop" options={markets.map(market => ({ id: market.id, label: market.name, active: true }))} value={marketId ? Number(marketId) : null} onChange={value => setMarketId(value == null ? "" : String(value))} placeholder="Choose a market" />
      {!markets.length && <Text style={{ color: C.danger, marginVertical: 6 }}>The market list is empty. Add the market before recording its payment.</Text>}
      <Button label={addingMarket ? "Cancel add market" : "Add market to list"} onPress={() => { setAddingMarket(value => !value); setNewMarketName(""); }} />
      {addingMarket && <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <TextInput style={inputStyle} value={newMarketName} onChangeText={setNewMarketName} placeholder="New market name" />
        <Button label={busy ? "Adding…" : "Add to list"} onPress={addMarket} disabled={busy || !newMarketName.trim()} />
      </View>}
      <TextInput style={inputStyle} value={paymentDate} onChangeText={setPaymentDate} placeholder="Payment date DD/MM/YYYY" />
      <TextInput style={inputStyle} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount received" />
      <TextInput style={inputStyle} value={reference} onChangeText={setReference} placeholder="Market reference (optional)" />
      <TextInput style={inputStyle} value={note} onChangeText={setNote} placeholder="Payment note (optional)" />
      {editingPayment && <TextInput style={inputStyle} value={paymentReason} onChangeText={setPaymentReason} placeholder="Reason for editing this payment" />}
      <Button label={busy ? "Saving…" : editingPayment ? "Save payment edit" : "Save market payment"} onPress={savePayment} disabled={busy || !marketId} />
      </>}
      {marketEntryType==="presale"&&<View>
      <Text style={{fontSize:20,fontWeight:"700"}}>New pre-sale</Text>
      <Text style={{color:C.textSecondary}}>Record the contract before grading if necessary. Grading from its field is reserved first, up to the contracted quantities.</Text>
      <TextInput style={inputStyle} placeholder="Contract reference" value={contractReference} onChangeText={setContractReference}/>
      <TextInput style={inputStyle} placeholder="Date DD/MM/YYYY" value={contractDate} onChangeText={setContractDate}/>
      <JsplSearchCombo label="Customer" selector="crop" options={markets.map(m=>({id:m.id,label:m.name,active:true}))} value={contractCustomer} onChange={v=>setContractCustomer(v==null?null:Number(v))} placeholder="Choose customer"/>
      <JsplSearchCombo label="Source field" selector="trace" options={contractFields.map(f=>({id:f.id,label:f.name,active:true}))} value={contractField} onChange={v=>setContractField(v==null?null:Number(v))} placeholder="Choose live potato field"/>
      <Text style={{fontWeight:"700",marginTop:10}}>Pockets and price per 15 kg pocket</Text>
      {sizes.map(([code,name])=><View key={code} style={{flexDirection:"row",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <Text style={{width:115}}>{name}</Text>
        <TextInput style={{...inputStyle,width:130}} keyboardType="number-pad" placeholder="Pockets" value={contractLines[code]?.qty||""} onChangeText={v=>setContractLines(p=>({...p,[code]:{qty:v,price:p[code]?.price||""}}))}/>
        <TextInput style={{...inputStyle,width:135}} keyboardType="decimal-pad" placeholder="Price/pocket" value={contractLines[code]?.price||""} onChangeText={v=>setContractLines(p=>({...p,[code]:{qty:p[code]?.qty||"",price:v}}))}/>
        <Text style={{width:145}}>{"$"+money(Number(contractLines[code]?.qty||0)*Number(contractLines[code]?.price||0))}</Text>
      </View>)}
      <Text style={{fontWeight:"700",marginBottom:8}}>
        {"Total contract pockets: "+num(Object.values(contractLines).reduce((v,r)=>v+Number(r.qty||0),0))
        +" · Total value: $"+money(Object.values(contractLines).reduce((v,r)=>v+Number(r.qty||0)*Number(r.price||0),0))}
      </Text>
      <TextInput style={inputStyle} placeholder="Contract note (optional)" value={contractNotes} onChangeText={setContractNotes}/>
      <Button label={busy?"Saving…":"Save pre-sale"} disabled={busy} onPress={savePresale}/>
      </View>}
    </View>}


    {tab==="transactions"&&<View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
      <Text style={{fontSize:20,fontWeight:"700",marginBottom:8}}>Potato Market Transaction Report</Text>
      <JsplSearchCombo label="Market" selector="crop"
        options={transactionMarkets.map(m=>({id:m.id,label:m.name,active:true}))}
        value={selectedTransactionMarket}
        onChange={v=>setSelectedTransactionMarket(v==null?null:Number(v))}
        placeholder="Choose a market with potato sales"/>
      {!transactionMarkets.length&&<Text style={{color:C.textSecondary,marginTop:8}}>No markets with recorded potato sales.</Text>}
      {selectedTransactionMarket!==null&&!transactionMarkets.some(m=>m.id===selectedTransactionMarket)&&
        <Text style={{color:C.danger}}>The selected market has no recorded potato sales. Choose another market.</Text>}
      {transactionMarkets.some(m=>m.id===selectedTransactionMarket)&&<>
        <Text style={{fontWeight:"700",fontSize:17,marginTop:12,marginBottom:6}}>
          {transactionMarkets.find(m=>m.id===selectedTransactionMarket)?.name}
        </Text>
        {!!selectedPendingDNotes.length&&<Text style={{color:C.danger,marginBottom:8}}>
          {selectedPendingDNotes.length} dispatched D-Note(s) still awaiting stock allocation and prices.
          They are not included in the monetary balance.
        </Text>}
        <ScrollView horizontal>
          <View>
            <View style={{flexDirection:"row",backgroundColor:"#e7eee9",borderBottomWidth:1,borderColor:C.border}}>
              <ReportCell bold width={115} value="Date"/>
              <ReportCell bold width={200} value="Reference / Transaction"/>
              <ReportCell bold width={145} value="Stock Out / Sales"/>
              <ReportCell bold width={145} value="Payments In"/>
              <ReportCell bold width={145} value="Balance"/>
            </View>
            {selectedPendingDNotes.map(d=><View key={d.dispatch_id} style={{flexDirection:"row",borderBottomWidth:1,borderColor:C.border}}>
              <ReportCell width={115} value={showDate(d.dnote_date)}/>
              <ReportCell width={200} value={"D-Note "+d.dnote_number+" (unpriced)"}/>
              <ReportCell width={145} value="Awaiting price"/>
              <ReportCell width={145} value=""/>
              <ReportCell width={145} value="—"/>
            </View>)}
            {marketLedgerRows.map(r=><View key={r.entry_type+":"+r.entry_id}
              style={{borderBottomWidth:1,borderColor:C.border}}>
              <View style={{flexDirection:"row"}}>
                <ReportCell width={115} value={showDate(r.entry_date)}/>
                <ReportCell width={200} value={
                  r.entry_type==="normal_sale"?"D-Note "+r.reference:
                  r.entry_type==="presale_reserve"?"Pre-sale "+r.reference:
                  r.entry_type==="presale_divert"?"Pre-sale adjustment "+r.reference:
                  r.entry_type==="payment"?"Payment "+(r.reference==="Payment"?"":r.reference):
                  r.reference
                }/>
                <ReportCell width={145} value={r.entry_type==="payment"?"":"$"+money(r.signed_amount)}/>
                <ReportCell width={145} value={r.entry_type==="payment"?"$"+money(-Number(r.signed_amount)):""}/>
                <ReportCell width={145} value={"$"+money(r.balance)}/>
              </View>
              {!!r.notes&&<Text style={{paddingHorizontal:6,paddingBottom:7,color:C.textSecondary}}>
                {r.notes}
              </Text>}
            </View>)}
            <View style={{flexDirection:"row",backgroundColor:"#e7eee9",borderTopWidth:1,borderColor:C.border}}>
              <ReportCell bold width={115} value=""/>
              <ReportCell bold width={200} value="TOTAL"/>
              <ReportCell bold width={145} value={"$"+money(marketSaleTotal)}/>
              <ReportCell bold width={145} value={"$"+money(marketPaymentTotal)}/>
              <ReportCell bold width={145} value={"$"+money(marketSaleTotal-marketPaymentTotal)}/>
            </View>
          </View>
        </ScrollView>
        <Text style={{color:C.textSecondary,marginTop:7}}>
          Balance is sales less payments. A negative balance means the market has paid in advance or has a credit.
        </Text>
      </>}
    </View>}

    {tab==="presale_report"&&<View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
      <Text style={{fontSize:20,fontWeight:"700",marginBottom:8}}>Pre-Sale Report</Text>
      <JsplSearchCombo label="Customer / Market" selector="crop"
        options={presaleCustomers.map(c=>({id:c.id,label:c.name,active:true}))}
        value={presaleReportCustomer}
        onChange={v=>{setPresaleReportCustomer(v==null?null:Number(v));setPresaleReportContract("");}}
        placeholder="Choose a customer with pre-sales"/>
      {!presaleCustomers.length&&<Text>No pre-sale contracts recorded.</Text>}
      {presaleReportCustomer!==null&&<>
        <Text style={{fontWeight:"700",marginTop:10}}>Contract</Text>
        <Picker selectedValue={presaleReportContract} onValueChange={setPresaleReportContract}>
          <Picker.Item value="" label="Choose a contract"/>
          {presaleReportContracts.map(c=><Picker.Item key={c.presale_id} value={c.presale_id}
            label={c.reference+" · "+c.trace_name+" · "+showDate(c.contract_date)}/>)}
        </Picker>
      </>}
      {selectedPresaleReport&&(()=>{
        const rows=selectedPresaleReport.lines;
        const totals=rows.reduce((t,l)=>({
          contracted:t.contracted+Number(l.contracted), allocated:t.allocated+Number(l.allocated),
          collected:t.collected+Number(l.collected), reserved:t.reserved+Number(l.reserved),
          outstanding:t.outstanding+Number(l.awaiting),
          contractValue:t.contractValue+Number(l.contracted)*Number(l.price),
          soldValue:t.soldValue+Number(l.sold_value)
        }),{contracted:0,allocated:0,collected:0,reserved:0,outstanding:0,contractValue:0,soldValue:0});
        const paymentValue=payments.filter(p=>Number(p.customer_id??p.market_id)===selectedPresaleReport.customer_id)
          .reduce((v,p)=>v+Number(p.amount||0),0);
        const sameCustomerContracts=presales.filter(p=>p.customer_id===selectedPresaleReport.customer_id).length;
        const status=selectedPresaleReport.status==="cancelled"?"Cancelled":
          totals.outstanding===0&&totals.reserved===0?"Fulfilled":
          totals.allocated>0?"Partially fulfilled":"Open";
        return <>
          <Text style={{fontWeight:"700",fontSize:18,marginTop:10}}>{selectedPresaleReport.reference}</Text>
          <Text>Customer: {selectedPresaleReport.customer_name}</Text>
          <Text>Field: {selectedPresaleReport.trace_name}</Text>
          <Text>Contract Date: {showDate(selectedPresaleReport.contract_date)} · {status}</Text>
          <Button label="Edit Contract" onPress={()=>router.push({
            pathname:"/potato-presale-edit",params:{id:selectedPresaleReport.presale_id}
          })}/>
          <ScrollView horizontal>
            <View>
              <View style={{flexDirection:"row",backgroundColor:"#e7eee9"}}>
                <ReportCell bold width={115} value="Size"/>
                <ReportCell bold width={110} value="Contracted"/>
                <ReportCell bold width={115} value="Allocated"/>
                <ReportCell bold width={110} value="Collected"/>
                <ReportCell bold width={110} value="Reserved"/>
                <ReportCell bold width={120} value="Outstanding"/>
                <ReportCell bold width={110} value="Price"/>
                <ReportCell bold width={125} value="Contract Value"/>
                <ReportCell bold width={125} value="Sold Value"/>
              </View>
              {sizes.filter(([code])=>rows.some(l=>l.size_code===code)).map(([code,name])=>{
                const l=rows.find(r=>r.size_code===code)!;
                return <View key={code} style={{flexDirection:"row",borderBottomWidth:1,borderColor:C.border}}>
                  <ReportCell width={115} value={name}/>
                  <ReportCell width={110} value={num(l.contracted)}/>
                  <ReportCell width={115} value={num(l.allocated)}/>
                  <ReportCell width={110} value={num(l.collected)}/>
                  <ReportCell width={110} value={num(l.reserved)}/>
                  <ReportCell width={120} value={num(l.awaiting)}/>
                  <ReportCell width={110} value={"$"+money(l.price)}/>
                  <ReportCell width={125} value={"$"+money(l.contracted*l.price)}/>
                  <ReportCell width={125} value={"$"+money(l.sold_value)}/>
                </View>;
              })}
              <View style={{flexDirection:"row",backgroundColor:"#e7eee9"}}>
                <ReportCell bold width={115} value="TOTAL"/>
                <ReportCell bold width={110} value={num(totals.contracted)}/>
                <ReportCell bold width={115} value={num(totals.allocated)}/>
                <ReportCell bold width={110} value={num(totals.collected)}/>
                <ReportCell bold width={110} value={num(totals.reserved)}/>
                <ReportCell bold width={120} value={num(totals.outstanding)}/>
                <ReportCell width={110} value=""/>
                <ReportCell bold width={125} value={"$"+money(totals.contractValue)}/>
                <ReportCell bold width={125} value={"$"+money(totals.soldValue)}/>
              </View>
            </View>
          </ScrollView>
          <Text style={{fontWeight:"700",fontSize:17,marginTop:14}}>Financial position</Text>
          <Text>Total contract value: {"$"+money(totals.contractValue)}</Text>
          <Text>Allocated sales value: {"$"+money(totals.soldValue)}</Text>
          <Text>Unallocated contract value: {"$"+money(totals.contractValue-totals.soldValue)}</Text>
          <Text>Customer payments received (all contracts): {"$"+money(paymentValue)}</Text>
          <Text>Customer account balance on allocated sales (all contracts): {"$"+money(
            transactionRows.filter(t=>Number(t.customer_id)===selectedPresaleReport.customer_id)
              .reduce((v,t)=>v+Number(t.signed_amount||0),0))}</Text>
          {sameCustomerContracts>1&&<Text style={{color:C.textSecondary,marginTop:7}}>
            Payments are recorded against the customer, not individual contracts; no payment is attributed twice.
          </Text>}
          <Text style={{color:C.textSecondary,marginTop:7}}>
            Allocated stock is valued as sold at its contracted price. Collection reduces reserved stock, not sales.
          </Text>
        </>;
      })()}
    </View>}

    {tab==="field"&&<View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
      <Text style={{fontSize:20,fontWeight:"700",marginBottom:8}}>Potato Field Report</Text>
      {!!pendingSizes.length&&<Text style={{color:C.danger,fontWeight:"700"}}>
        Provisional stock: D-Notes still awaiting allocation — {pendingSizes.map(p=>p.size_code+" "+num(p.pockets)).join(" · ")}
      </Text>}
      <JsplSearchCombo label="Field" selector="trace"
        options={reportFields.map(f=>({id:f.id,label:f.name,active:true}))}
        value={selectedReportField}
        onChange={v=>setSelectedReportField(v==null?null:Number(v))}
        placeholder="Choose field with potato receipts"/>
      {!!selectedRows.length&&<>
        <ScrollView horizontal contentContainerStyle={{paddingVertical:8}}>
          <View style={{width:1350}}>
            <View style={{flexDirection:"row",justifyContent:"space-between",minHeight:145,marginBottom:14}}>
              <View style={{width:500}}>
                <Text style={{fontSize:21,fontWeight:"700",marginBottom:10}}>{selectedRows[0].tracecode_name}</Text>
                <Text style={{marginBottom:8}}>{num(reportHa)} Ha</Text>
                <View style={{flexDirection:"row",marginTop:3,marginBottom:7}}>
                  <Text style={{width:205,fontWeight:"700"}}>Raw Product</Text>
                  <Text style={{fontWeight:"700"}}>{num(rawKg)}</Text>
                </View>
                <View style={{flexDirection:"row",marginBottom:7}}>
                  <Text style={{width:205}}>Yield/Ha Raw</Text>
                  <Text>{money(reportHa?rawKg/reportHa:0)}</Text>
                </View>
                <View style={{flexDirection:"row"}}>
                  <Text style={{width:205}}>Yield/Ha Processed</Text>
                  <Text>{money(reportHa?processKg/reportHa:0)}</Text>
                </View>
              </View>
              <View style={{width:380,marginTop:77}}>
                <View style={{flexDirection:"row",marginBottom:7}}>
                  <Text style={{width:175}}>Yield/Ha Sold</Text>
                  <Text>{money(reportHa?soldKg/reportHa:0)}</Text>
                </View>
                <View style={{flexDirection:"row"}}>
                  <Text style={{width:175}}>Price/Ha Sold</Text>
                  <Text>{"$"+money(reportHa?soldValue/reportHa:0)}</Text>
                </View>
              </View>
            </View>
            <View style={{flexDirection:"row",marginBottom:4}}>
              <Text style={{width:390,fontSize:17,fontWeight:"800"}}>Processed</Text>
              <View style={{width:40}}/>
              <Text style={{width:290,fontSize:17,fontWeight:"800"}}>Stock</Text>
              <View style={{width:40}}/>
              <Text style={{width:555,fontSize:17,fontWeight:"800"}}>Sold</Text>
            </View>
            <View style={{flexDirection:"row",borderBottomWidth:2,borderColor:C.border}}>
              <ReportCell width={135} bold value="Grading"/>
              <ReportCell width={85} bold value="Pockets"/>
              <ReportCell width={90} bold value="Kgs"/>
              <ReportCell width={80} bold value="%"/>
              <View style={{width:40}}/>
              <ReportCell width={115} bold value=""/>
              <ReportCell width={90} bold value="Pockets"/>
              <ReportCell width={85} bold value="Kgs"/>
              <View style={{width:40}}/>
              <ReportCell width={130} bold value=""/>
              <ReportCell width={85} bold value="Pockets"/>
              <ReportCell width={95} bold value="Kgs"/>
              <ReportCell width={120} bold value="Value"/>
              <ReportCell width={125} bold value="Return/Kg"/>
            </View>
            {selectedRows.map(r=><View key={r.size_code}
              style={{flexDirection:"row",borderBottomWidth:1,borderColor:"#d3d8d3"}}>
              <ReportCell width={135} value={sizes.find(([code])=>code===r.size_code)?.[1]||r.size_name}/>
              <ReportCell width={85} value={Number(r.processed_pockets)?num(r.processed_pockets):""}/>
              <ReportCell width={90} value={Number(r.processed_kg)?num(r.processed_kg):"–"}/>
              <ReportCell width={80} value={Number(r.processed_kg)&&processedTotal?(100*Number(r.processed_kg)/processedTotal).toFixed(2)+"%":""}/>
              <View style={{width:40}}/>
              <ReportCell width={115} value={sizes.find(([code])=>code===r.size_code)?.[1]||r.size_name}/>
              <ReportCell width={90} value={num(r.stock_pockets)}/>
              <ReportCell width={85} value={num(r.stock_kg)}/>
              <View style={{width:40}}/>
              <ReportCell width={130} value={sizes.find(([code])=>code===r.size_code)?.[1]||r.size_name}/>
              <ReportCell width={85} value={Number(r.sold_pockets)?num(r.sold_pockets):""}/>
              <ReportCell width={95} value={Number(r.sold_kg)?num(r.sold_kg):""}/>
              <ReportCell width={120} value={Number(r.sold_value)?"$"+money(r.sold_value):""}/>
              <ReportCell width={125} value={Number(r.sold_kg)?"$"+money(Number(r.sold_value)/Number(r.sold_kg)):""}/>
            </View>)}
            {/* Excel row 18: Waste on left, Stock & Sold totals ON THIS SAME ROW. */}
            <View style={{flexDirection:"row",borderBottomWidth:1,borderColor:C.border}}>
              <View style={{flexDirection:"row",backgroundColor:"#fae1d3"}}>
                <ReportCell width={135} value="Waste"/>
                <ReportCell width={85} value=""/>
                <ReportCell width={90} value={num(wasteKg)}/>
                <ReportCell width={80} value={processedTotal?(100*wasteKg/processedTotal).toFixed(2)+"%":"0.00%"}/>
              </View>
              <View style={{width:40}}/>
              <ReportCell width={115} value=""/>
              <ReportCell width={90} bold value={num(selectedRows.reduce((v,r)=>v+Number(r.stock_pockets||0),0))}/>
              <ReportCell width={85} bold value={num(selectedRows.reduce((v,r)=>v+Number(r.stock_kg||0),0))}/>
              <View style={{width:40}}/>
              <ReportCell width={130} value=""/>
              <ReportCell width={85} value=""/>
              <ReportCell width={95} bold value={num(soldKg)}/>
              <ReportCell width={120} bold value={"$"+money(soldValue)}/>
              <ReportCell width={125} bold value={soldKg?"$"+money(soldValue/soldKg):""}/>
            </View>
            {/* Excel row 19: only the Processed grand total, including waste. */}
            <View style={{flexDirection:"row"}}>
              <ReportCell width={135} value=""/>
              <ReportCell width={85} bold value={num(selectedRows.reduce((v,r)=>v+Number(r.processed_pockets||0),0))}/>
              <ReportCell width={90} bold value={num(processedTotal)}/>
              <ReportCell width={80} value=""/>
            </View>
          </View>
        </ScrollView>
      </>}
      {selectedReportField!==null&&!selectedRows.length&&<Text>No potato records for this field.</Text>}
    </View>}
  </ScrollView>;
}
