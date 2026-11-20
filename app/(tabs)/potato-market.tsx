import { useEffect, useState } from "react";
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
type TransactionRow={entry_type:string;entry_id:string;entry_date:string;reference:string;market_name:string;signed_amount:number;notes?:string|null};

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

  const [tab, setTab] = useState<"sale"|"presale"|"payment"|"transactions"|"field">("sale");
  const [dispatchId,setDispatchId]=useState("");
  const [source,setSource]=useState<"normal"|"presale"|"divert">("normal");
  const [prices,setPrices]=useState<Record<string,string>>({});
  const [presaleChoice,setPresaleChoice]=useState("");
  const [diversionReason,setDiversionReason]=useState("");
  const [presales,setPresales]=useState<Presale[]>([]);
  const [reportV2,setReportV2]=useState<FieldV2[]>([]);
  const [transactionRows,setTransactionRows]=useState<TransactionRow[]>([]);
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
    const { data, error: loadError } = await supabase.rpc("potato_market_full_context");
    if (loadError) throw loadError;
    setDispatches(data.dispatches || []);
    // Use the existing Weighbridge customer list as agreed for Market.
    setMarkets(data.customers || []);
    setPayments(data.payments || []);
    setPresales(data.presales || []);
    setReportV2(data.field_report_v2 || []);
    setTransactionRows(data.transaction_rows || []);
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
  const dispatch=dispatches.find(d=>d.dispatch_id===dispatchId);
  const availableDNotes=dispatches;
  const eligibleContracts=presales.filter(c=>c.status==="active" && !!dispatch &&
    sizes.filter(([code])=>Number(dispatch?.counts[code]||0)>0).every(([code])=>
      c.lines.some(l=>l.size_code===code && l.reserved>=Number(dispatch?.counts[code]||0))));
  const reportFields=[...new Map(reportV2.map(r=>[r.tracecode_id,{id:r.tracecode_id,name:r.tracecode_name}])).values()];
  const selectedRows=reportV2.filter(r=>r.tracecode_id===selectedReportField).sort((a,b)=>a.sort_order-b.sort_order);
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
    if(source==="divert"&&!diversionReason.trim()){setError("Enter the compulsory diversion reason.");return;}
    const lines:Record<string,{price:number}>={};
    if(source!=="presale")for(const [code,name] of sizes){
      if(Number(dispatch.counts?.[code]||0)<=0)continue;
      const price=Number(prices[code]),raw=(prices[code]||"").trim();
      if(!raw||!Number.isFinite(price)||price<=0){setError("Enter positive price per pocket for "+name);return;}
      lines[code]={price};
    }
    setBusy(true);
    try{
      const {error:e}=await supabase.rpc("potato_market_allocate_and_price",{
        p_dispatch_id:dispatch.dispatch_id,p_source:source,p_presale_id:source==="normal"?null:presaleChoice,
        p_lines:lines,p_reason:source==="divert"?diversionReason:null
      });
      if(e)throw new Error(e.message);
      const updated=await load();
      if((updated?.dispatches||[]).some((x:Dispatch)=>x.dispatch_id===dispatch.dispatch_id))
        throw new Error("D-Note still awaits allocation; verify before retrying.");
      setDispatchId("");setPrices({});setPresaleChoice("");setDiversionReason("");
      setNotice("D-Note allocation saved and verified.");
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
  async function savePayment() {
    setError("");
    const date = dateIso(paymentDate), value = Number(amount);
    if (!marketId || !date || !Number.isFinite(value) || value <= 0) { setError("Choose a market and enter a valid date and payment amount."); return; }
    if (editingPayment && !paymentReason.trim()) { setError("Enter a reason for editing this payment."); return; }
    setBusy(true);
    const { error: saveError } = await supabase.rpc("potato_market_save_payment", {
      p_payment_id: editingPayment?.payment_id || null,
      p_customer_id: Number(marketId),
      p_payment_date: date,
      p_amount: value,
      p_note: note,
      p_market_reference: reference,
      p_reason: paymentReason || null,
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setPaymentEdit("new"); await load();
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
      <Button label="Pre-Sales" onPress={() => setTab("presale")} />
      <Button label="Market Payment" onPress={() => setTab("payment")} />
      <Button label="Transaction Report" onPress={() => setTab("transactions")} />
      <Button label="Field Report" onPress={() => setTab("field")} />
      <Button label="Refresh" onPress={() => load().catch((e: any) => setError(e.message))} />
    </View>
    {!!error && <Text style={{ color: "#b42318", marginVertical: 8 }}>{error}</Text>}
    {!!notice && <Text style={{color:C.primaryDark,marginVertical:8}}>{notice}</Text>}


    {tab==="sale"&&<View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
      <Text style={{fontSize:20,fontWeight:"700"}}>D-Note Stock Allocation</Text>
      <Text style={{color:C.textSecondary}}>Normal stock uses FIFO. The WB computer remains unchanged.</Text>
      <Picker selectedValue={dispatchId} onValueChange={v=>{setDispatchId(v);setPrices({});setPresaleChoice("");}}>
        <Picker.Item label="Choose unallocated D-Note" value=""/>
        {availableDNotes.map(d=><Picker.Item key={d.dispatch_id} value={d.dispatch_id} label={d.dnote_number+" · "+showDate(d.dnote_date)}/>)}
      </Picker>
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
        {source==="divert"&&<TextInput style={inputStyle} placeholder="Compulsory diversion reason" value={diversionReason} onChangeText={setDiversionReason}/>}
        {sizes.filter(([code])=>Number(dispatch.counts[code]||0)>0).map(([code,name])=>
          <View key={code} style={{flexDirection:"row",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <Text style={{width:115,fontWeight:"700"}}>{name}</Text>
            <Text style={{width:120}}>{num(dispatch.counts[code])} pockets</Text>
            {source!=="presale"&&<TextInput style={{...inputStyle,width:145}} placeholder="Price/pocket" keyboardType="decimal-pad" value={prices[code]||""} onChangeText={v=>setPrices(p=>({...p,[code]:v}))}/>}
          </View>)}
        <Button label={busy?"Saving…":"Confirm stock allocation"} disabled={busy||(source!=="normal"&&!presaleChoice)} onPress={saveSale}/>
      </>}
      {!availableDNotes.length&&<Text>No D-Notes awaiting stock allocation.</Text>}
    </View>}
    {tab==="presale"&&<View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
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
      </View>)}
      <TextInput style={inputStyle} placeholder="Contract note (optional)" value={contractNotes} onChangeText={setContractNotes}/>
      <Button label={busy?"Saving…":"Save pre-sale"} disabled={busy} onPress={savePresale}/>
      <Text style={{fontSize:18,fontWeight:"700",marginTop:14}}>Existing pre-sales</Text>
      {presales.map(c=><View key={c.presale_id} style={{paddingVertical:8,borderBottomWidth:1,borderColor:C.border}}>
        <Text style={{fontWeight:"700"}}>{c.reference} — {c.customer_name}</Text>
        <Text>{c.trace_name} · {showDate(c.contract_date)} · {c.status}</Text>
        {c.lines.map(l=><Text key={l.size_code} style={{color:C.textSecondary}}>
          {l.size_code}: contracted {num(l.contracted)}, reserved {num(l.reserved)}, collected {num(l.collected)}, outstanding {num(l.awaiting)}, sold value {money(l.sold_value)}
        </Text>)}
      </View>)}
      {!presales.length&&<Text>No pre-sales recorded.</Text>}
    </View>}
    {tab === "payment" && <View style={{ backgroundColor: "white", padding: 14, borderRadius: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>{editingPayment ? "Edit market payment" : "Market payment"}</Text>
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
    </View>}


    {tab==="transactions"&&<View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
      <Text style={{fontSize:20,fontWeight:"700",marginBottom:8}}>Transaction Report</Text>
      {!!pendingSizes.length&&<Text style={{color:C.danger}}>Unallocated physical dispatches: {pendingSizes.map(p=>p.size_code+" "+num(p.pockets)).join(" · ")}. These pockets are not available to sell again.</Text>}
      {dispatches.map(d=><View key={d.dispatch_id} style={{borderBottomWidth:1,borderColor:C.border,paddingVertical:8}}>
        <Text style={{fontWeight:"700"}}>D-Note {d.dnote_number} · {showDate(d.dnote_date)}</Text>
        <Text>Dispatched — awaiting stock allocation and pricing</Text>
      </View>)}
      {[...transactionRows].sort((a,b)=>String(b.entry_date).localeCompare(String(a.entry_date))).map(r=>
        <View key={r.entry_type+":"+r.entry_id} style={{borderBottomWidth:1,borderColor:C.border,paddingVertical:8}}>
          <Text style={{fontWeight:"700"}}>{r.entry_type.replace(/_/g," ")} · {r.reference} · {showDate(r.entry_date)}</Text>
          <Text>{r.market_name} · {money(r.signed_amount)}</Text>
          {!!r.notes&&<Text style={{color:C.textSecondary}}>{r.notes}</Text>}
        </View>)}
      {!transactionRows.length&&!dispatches.length&&<Text>No market transactions recorded yet.</Text>}
    </View>}
    {tab==="field"&&<View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
      <Text style={{fontSize:20,fontWeight:"700"}}>Potato Field Report</Text>
      {!!pendingSizes.length&&<Text style={{color:C.danger,fontWeight:"700"}}>Provisional stock: outgoing D-Notes still require allocation. {pendingSizes.map(p=>p.size_code+" "+num(p.pockets)).join(" · ")}</Text>}
      <JsplSearchCombo label="Field" selector="trace" options={reportFields.map(f=>({id:f.id,label:f.name,active:true}))}
        value={selectedReportField} onChange={v=>setSelectedReportField(v==null?null:Number(v))} placeholder="Choose field with potato receipts"/>
      {!!selectedRows.length&&<>
        <Text style={{fontWeight:"700",fontSize:19,marginTop:8}}>{selectedRows[0].tracecode_name}</Text>
        <Text>{num(reportHa)} Ha</Text>
        <Text>Raw Product: {num(rawKg)} kg</Text>
        <View style={{flexDirection:"row",flexWrap:"wrap",gap:15,marginVertical:8}}>
          <Text>Yield/Ha Raw: {num(reportHa?rawKg/reportHa:0)} kg</Text>
          <Text>Yield/Ha Processed: {num(reportHa?processKg/reportHa:0)} kg</Text>
          <Text>Yield/Ha Sold: {num(reportHa?soldKg/reportHa:0)} kg</Text>
          <Text>Price/Ha Sold: {money(reportHa?soldValue/reportHa:0)}</Text>
        </View>
        <ScrollView horizontal>
          <View>
            <View style={{flexDirection:"row",padding:7,backgroundColor:"#e7eee9"}}>
              <Text style={{width:375,fontWeight:"800"}}>Processed</Text>
              <Text style={{width:265,fontWeight:"800"}}>Stock</Text>
              <Text style={{width:525,fontWeight:"800"}}>Sold</Text>
            </View>
            <View style={{flexDirection:"row",borderBottomWidth:1,borderColor:C.border}}>
              <ReportCell bold width={110} value="Grading"/><ReportCell bold width={85} value="Pockets"/><ReportCell bold width={90} value="Kgs"/><ReportCell bold width={90} value="%"/>
              <ReportCell bold width={105} value="Size"/><ReportCell bold width={80} value="Pockets"/><ReportCell bold width={80} value="Kgs"/>
              <ReportCell bold width={105} value="Size"/><ReportCell bold width={85} value="Pockets"/><ReportCell bold width={90} value="Kgs"/><ReportCell bold width={105} value="Value"/><ReportCell bold width={140} value="Return/Kg"/>
            </View>
            {selectedRows.map(r=><View key={r.size_code} style={{flexDirection:"row",borderBottomWidth:1,borderColor:"#e3e6e3"}}>
              <ReportCell width={110} value={r.size_name}/><ReportCell width={85} value={num(r.processed_pockets)}/><ReportCell width={90} value={num(r.processed_kg)}/>
              <ReportCell width={90} value={processedTotal?(100*Number(r.processed_kg||0)/processedTotal).toFixed(1)+"%":"0%"}/>
              <ReportCell width={105} value={r.size_name}/><ReportCell width={80} value={num(r.stock_pockets)}/><ReportCell width={80} value={num(r.stock_kg)}/>
              <ReportCell width={105} value={r.size_name}/><ReportCell width={85} value={num(r.sold_pockets)}/><ReportCell width={90} value={num(r.sold_kg)}/>
              <ReportCell width={105} value={money(r.sold_value)}/><ReportCell width={140} value={Number(r.sold_kg)?money(Number(r.sold_value)/Number(r.sold_kg)):"0.00"}/>
            </View>)}
            <View style={{flexDirection:"row",backgroundColor:"#f1f3f0"}}>
              <ReportCell bold width={110} value="Waste"/><ReportCell width={85} value=""/><ReportCell width={90} value={num(wasteKg)}/>
              <ReportCell width={90} value={processedTotal?(100*wasteKg/processedTotal).toFixed(1)+"%":"0%"}/>
              <ReportCell width={105} value=""/><ReportCell width={80} value=""/><ReportCell width={80} value=""/>
              <ReportCell width={105} value=""/><ReportCell width={85} value=""/><ReportCell width={90} value=""/><ReportCell width={105} value=""/><ReportCell width={140} value=""/>
            </View>
            <View style={{flexDirection:"row",backgroundColor:"#e7eee9"}}>
              <ReportCell bold width={110} value="Total"/>
              <ReportCell bold width={85} value={num(selectedRows.reduce((v,r)=>v+Number(r.processed_pockets||0),0))}/>
              <ReportCell bold width={90} value={num(processedTotal)}/><ReportCell bold width={90} value={processedTotal?"100%":"0%"}/>
              <ReportCell bold width={105} value="Total"/>
              <ReportCell bold width={80} value={num(selectedRows.reduce((v,r)=>v+Number(r.stock_pockets||0),0))}/>
              <ReportCell bold width={80} value={num(selectedRows.reduce((v,r)=>v+Number(r.stock_kg||0),0))}/>
              <ReportCell bold width={105} value="Total"/>
              <ReportCell bold width={85} value={num(selectedRows.reduce((v,r)=>v+Number(r.sold_pockets||0),0))}/>
              <ReportCell bold width={90} value={num(soldKg)}/><ReportCell bold width={105} value={money(soldValue)}/>
              <ReportCell bold width={140} value={soldKg?money(soldValue/soldKg):"0.00"}/>
            </View>
          </View>
        </ScrollView>
        <Text style={{color:C.textSecondary,marginTop:8}}>Pre-sold stock counts as sold at contract price when allocated; customer collection does not record a second sale.</Text>
      </>}
      {selectedReportField!==null&&!selectedRows.length&&<Text>No potato records for this field.</Text>}
    </View>}
  </ScrollView>;
}
