import { useEffect, useMemo, useState } from "react";
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
type Sale = { sale_id: string; dispatch_id: string; dnote_number: string; dnote_date: string; lines: Record<string, { pockets: number; price: number }>; allocations: { tracecode_id: number; size_code: string; pockets: number }[]; total: number };
type Payment = { payment_id: string; market_id: number | null; customer_id?: number | null; market_name: string; payment_date: string; amount: number; note: string | null; market_reference: string | null };
type FieldReport = { tracecode_id: number; tracecode_name: string; incoming_slips: number; incoming_kg: number; sold_pockets: number; sold_kg: number; sold_value: number };
type StockRow={season_name:string;size_name:string;available_pockets:number;pocket_weight_kg:number};
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

export default function PotatoMarket() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [fieldReport, setFieldReport] = useState<FieldReport[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
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
    setTraces(data.traces || []);
    // Use the existing Weighbridge customer list as agreed for Market.
    setMarkets(data.customers || []);
    setSales(data.sales || []);
    setPayments(data.payments || []);
    setFieldReport(data.field_report || []);
    setStock(data.stock_by_size || []);
    setPresales(data.presales || []);
    setReportV2(data.field_report_v2 || []);
    setTransactionRows(data.transaction_rows || []);
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

  const lineSizes = dispatch ? sizes.filter(([code]) => Number(dispatch.counts?.[code] || 0) > 0) : [];
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

    {tab === "sale" && <View style={{ backgroundColor: "white", padding: 14, borderRadius: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 8 }}>{editingSale ? "Edit potato sale" : "Potato sale"}</Text>
      <Text>Sale record</Text>
      <Picker selectedValue={saleEdit} onValueChange={setSaleEdit}>
        <Picker.Item label="New sale" value="new" />
        {sales.map(sale => <Picker.Item key={sale.sale_id} label={`${sale.dnote_number} · ${showDate(sale.dnote_date)}`} value={sale.sale_id} />)}
      </Picker>
      <Text>D-Note</Text>
      <Picker selectedValue={dispatchId} onValueChange={setDispatchId}>
        <Picker.Item label={editingSale?.dnote_number || "Choose issued D-Note"} value={editingSale?.dispatch_id || ""} />
        {availableDNotes.map(item => <Picker.Item key={item.dispatch_id} label={`${item.dnote_number} · ${showDate(item.dnote_date)}`} value={item.dispatch_id} />)}
      </Picker>
      {dispatch && <Text style={{ color: C.textSecondary, marginVertical: 7 }}>D-Note date: {showDate(dispatch.dnote_date)} (used for this sale)</Text>}

      <Text style={{ fontWeight: "700", marginTop: 8 }}>1. Choose the live potato field(s)</Text>
      <JsplSearchCombo label="Add live potato field" selector="trace" options={traces.filter(trace => !chosenFields.includes(trace.id)).map(trace => ({ id: trace.id, label: trace.name, active: true }))} value={null} onChange={value => { if (value !== null) setChosenFields(current => [...current, Number(value)]); }} placeholder="Search live potato fields…" />
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {chosenFields.map(id => <View key={id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#e7eee9", borderRadius: 6, padding: 7, margin: 3 }}><Text style={{ fontWeight: "700", marginRight: 8 }}>{traceName(id)}</Text><Pressable onPress={() => { setChosenFields(current => current.filter(item => item !== id)); setAllocations(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${id}:`)))); }}><Text style={{ color: C.danger, fontWeight: "700" }}>Remove</Text></Pressable></View>)}
      </View>

      {dispatch && <>
        <Text style={{ fontWeight: "700", marginTop: 12 }}>2. Allocate each D-Note size to the chosen fields and enter the price</Text>
        <Text style={{ color: C.textSecondary, marginBottom: 8 }}>Enter each size price once per D-Note. Field pocket totals for each size must equal the D-Note.</Text>
        {!chosenFields.length && <Text style={{ color: C.textSecondary, marginVertical: 8 }}>Choose fields above to enter size allocations.</Text>}
        {chosenFields.length > 0 && lineSizes.map(([code, name]) => <View key={code} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 7, padding: 10, marginVertical: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <Text style={{ fontWeight: "800", minWidth: 120 }}>{name}</Text>
            <Text style={{ color: C.textSecondary }}>D-Note: {dispatch.counts[code]} pockets</Text>
            <TextInput style={inputStyle} keyboardType="decimal-pad" value={prices[code] || ""} onChangeText={value => setPrices(current => ({ ...current, [code]: value }))} placeholder="Price / pocket" />
          </View>
          {chosenFields.map(id => <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 12 }}>
            <Text style={{ flex: 1 }}>{traceName(id)}</Text>
            <TextInput style={inputStyle} keyboardType="number-pad" value={allocations[`${id}:${code}`] || ""} onChangeText={value => setFieldSize(id, code, value)} placeholder="Pockets" />
          </View>)}
        </View>)}
      </>}
      {editingSale && <TextInput style={inputStyle} value={saleReason} onChangeText={setSaleReason} placeholder="Reason for editing this sale" />}
      <Button label={busy ? "Saving…" : editingSale ? "Save sale edit" : "Save potato sale"} onPress={saveSale} disabled={busy || !dispatch} />
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

    {tab === "transactions" && <View style={{ backgroundColor: "white", padding: 14, borderRadius: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 10 }}>Transaction Report</Text>
      {sales.map(sale => <View key={sale.sale_id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: C.border }}><Text style={{ fontWeight: "700" }}>Sale · {sale.dnote_number} · {showDate(sale.dnote_date)}</Text><Text>Sale total: {Number(sale.total).toFixed(2)}</Text></View>)}
      {payments.map(payment => <View key={payment.payment_id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: C.border }}><Text style={{ fontWeight: "700" }}>Payment · {payment.market_name} · {showDate(payment.payment_date)}</Text><Text>Amount: {Number(payment.amount).toFixed(2)}</Text>{payment.market_reference && <Text>Reference: {payment.market_reference}</Text>}{payment.note && <Text>Note: {payment.note}</Text>}</View>)}
      {!sales.length && !payments.length && <Text>No potato market transactions recorded yet.</Text>}
    </View>}

    {tab === "field" && <View style={{ backgroundColor: "white", padding: 14, borderRadius: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 10 }}>Potato Field Report</Text>
      <JsplSearchCombo label="Field" selector="trace" options={traces.map(trace => ({ id: trace.id, label: trace.name, active: true }))} value={selectedReportField} onChange={value => setSelectedReportField(value == null ? null : Number(value))} placeholder="Choose a live potato field" />
      {!selectedReportField && <Text style={{ color: C.textSecondary, marginVertical: 8 }}>Choose a field to view its report.</Text>}
      {selectedReportField && <>
        <Text style={{ fontWeight: "700", marginTop: 12 }}>Processed</Text>
        <Text>Incoming WB slips: {Number(fieldReport.find(row => row.tracecode_id === selectedReportField)?.incoming_slips || 0).toLocaleString()}</Text>
        <Text>Incoming weight: {Number(fieldReport.find(row => row.tracecode_id === selectedReportField)?.incoming_kg || 0).toLocaleString()} kg</Text>
        <Text style={{ fontWeight: "700", marginTop: 12 }}>Stock</Text>
        <Text style={{ color: C.textSecondary }}>Graded stock is shared by season; grading batches are not linked to individual fields.</Text>
        {stock.map((row, index) => <Text key={`${row.season_name}:${row.size_name}:${index}`}>{row.season_name} · {row.size_name}: {Number(row.available_pockets).toLocaleString()} pockets ({(Number(row.available_pockets) * Number(row.pocket_weight_kg)).toLocaleString()} kg)</Text>)}
        {!stock.length && <Text>No available graded potato stock.</Text>}
        <Text style={{ fontWeight: "700", marginTop: 14 }}>Sold</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", backgroundColor: "#e7eee9", padding: 8, marginTop: 6 }}>
          {["Sale pockets", "Sale kg", "Sale value"].map(label => <Text key={label} style={{ fontWeight: "800", width: 125 }}>{label}</Text>)}
        </View>
        {fieldReport.filter(row => row.tracecode_id === selectedReportField).map(row => <View key={row.tracecode_id} style={{ flexDirection: "row", flexWrap: "wrap", padding: 8, borderBottomWidth: 1, borderColor: C.border }}>
          {[Number(row.sold_pockets).toLocaleString(), Number(row.sold_kg).toLocaleString(), Number(row.sold_value).toFixed(2)].map((value, index) => <Text key={index} style={{ width: 125 }}>{value}</Text>)}
        </View>)}
        {!fieldReport.some(row => row.tracecode_id === selectedReportField) && <Text>No field receipts or sales recorded for this field.</Text>}
      </>}
    </View>}  </ScrollView>;
}
