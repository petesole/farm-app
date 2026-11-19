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
type Customer = { id: number; name: string };
type Sale = { sale_id: string; dispatch_id: string; dnote_number: string; dnote_date: string; lines: Record<string, { pockets: number; price: number }>; allocations: { tracecode_id: number; size_code: string; pockets: number }[]; total: number };
type Payment = { payment_id: string; customer_id: number; customer_name: string; payment_date: string; amount: number; note: string | null; market_reference: string | null };
type FieldReport = { tracecode_id: number; tracecode_name: string; incoming_slips: number; incoming_kg: number; sold_pockets: number; sold_kg: number; sold_value: number };
type StockRow = { season_name: string; size_name: string; available_pockets: number; pocket_weight_kg: number };

const sizes: [string, string][] = [["LARGE", "Large"], ["MEDIUM", "Medium"], ["SMEDIUM", "Small-Medium"], ["SMALL", "Small"], ["CHATS", "Chats"], ["CUTS", "Cuts"], ["GREENS", "Greens"], ["BULLETS", "Bullets"]];
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const dateIso = (value: string) => parseJsplDateInput(value);
const showDate = (value: string) => value ? displayJsplDate(value.slice(0, 10)) : "—";
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [fieldReport, setFieldReport] = useState<FieldReport[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);

  const [tab, setTab] = useState<"sale" | "payment" | "transactions" | "field">("sale");
  const [dispatchId, setDispatchId] = useState("");
  const [saleEdit, setSaleEdit] = useState("new");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [chosenFields, setChosenFields] = useState<number[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saleReason, setSaleReason] = useState("");

  const [paymentEdit, setPaymentEdit] = useState("new");
  const [customerId, setCustomerId] = useState("");
  const [newMarketName, setNewMarketName] = useState("");
  const [addingMarket, setAddingMarket] = useState(false);
  const [paymentDate, setPaymentDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [paymentReason, setPaymentReason] = useState("");

  async function load() {
    const { data, error: loadError } = await supabase.rpc("potato_market_context");
    if (loadError) throw loadError;
    setDispatches(data.dispatches || []);
    setTraces(data.traces || []);
    setCustomers(data.customers || []);
    setSales(data.sales || []);
    setPayments(data.payments || []);
    setFieldReport(data.field_report || []);
    setStock(data.stock_by_size || []);
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

  const editingSale = sales.find(sale => sale.sale_id === saleEdit);
  const editingPayment = payments.find(payment => payment.payment_id === paymentEdit);
  const dispatch = dispatches.find(item => item.dispatch_id === dispatchId) || (editingSale ? {
    dispatch_id: editingSale.dispatch_id,
    dnote_number: editingSale.dnote_number,
    dnote_date: editingSale.dnote_date,
    counts: Object.fromEntries(Object.entries(editingSale.lines).map(([code, line]) => [code, line.pockets])),
  } : undefined);
  const availableDNotes = useMemo(() => dispatches.filter(item => saleEdit !== "new" || !sales.some(sale => sale.dispatch_id === item.dispatch_id)), [dispatches, sales, saleEdit]);

  useEffect(() => {
    if (editingSale) {
      setDispatchId(editingSale.dispatch_id);
      setPrices(Object.fromEntries(Object.entries(editingSale.lines).map(([code, line]) => [code, String(line.price)])));
      setChosenFields([...new Set(editingSale.allocations.map(item => item.tracecode_id))]);
      setAllocations(Object.fromEntries(editingSale.allocations.map(item => [`${item.tracecode_id}:${item.size_code}`, String(item.pockets)])));
    } else if (saleEdit === "new") {
      setDispatchId(""); setPrices({}); setChosenFields([]); setAllocations({});
    }
    setSaleReason("");
  }, [saleEdit]);

  useEffect(() => {
    if (editingPayment) {
      setCustomerId(String(editingPayment.customer_id));
      setPaymentDate(showDate(editingPayment.payment_date));
      setAmount(String(editingPayment.amount));
      setNote(editingPayment.note || "");
      setReference(editingPayment.market_reference || "");
    } else if (paymentEdit === "new") {
      setCustomerId(""); setPaymentDate(today()); setAmount(""); setNote(""); setReference("");
    }
    setPaymentReason("");
  }, [paymentEdit]);

  const traceName = (id: number) => traces.find(trace => trace.id === id)?.name || String(id);
  const setFieldSize = (id: number, code: string, value: string) => setAllocations(current => ({ ...current, [`${id}:${code}`]: value }));

  async function saveSale() {
    setError("");
    if (!dispatch) { setError("Choose an issued D-Note."); return; }
    if (!chosenFields.length) { setError("Choose at least one live potato field."); return; }
    const lines: Record<string, { pockets: number; price: number }> = {};
    for (const [code] of sizes) {
      const pockets = Number(dispatch.counts?.[code] || 0);
      if (!pockets) continue;
      const price = Number(prices[code]);
      if (!Number.isFinite(price) || price <= 0) { setError(`Enter a price per pocket for ${code}.`); return; }
      lines[code] = { pockets, price };
    }
    const allocationRows: { tracecode_id: number; size_code: string; pockets: number }[] = [];
    for (const fieldId of chosenFields) for (const [code] of sizes) {
      const pockets = Number(allocations[`${fieldId}:${code}`] || 0);
      if (pockets > 0) allocationRows.push({ tracecode_id: fieldId, size_code: code, pockets });
    }
    for (const [code, name] of sizes) {
      const expected = Number(dispatch.counts?.[code] || 0);
      if (expected && allocationRows.filter(row => row.size_code === code).reduce((sum, row) => sum + row.pockets, 0) !== expected) {
        setError(`${name} field allocations must total ${expected} pockets from the D-Note.`); return;
      }
    }
    if (editingSale && !saleReason.trim()) { setError("Enter a reason for editing this sale."); return; }
    setBusy(true);
    const { error: saveError } = await supabase.rpc("potato_market_save_sale", {
      p_sale_id: editingSale?.sale_id || null,
      p_dispatch_id: dispatch.dispatch_id,
      p_lines: lines,
      p_allocations: allocationRows,
      p_reason: saleReason || null,
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setSaleEdit("new"); setDispatchId(""); await load();
  }

  async function savePayment() {
    setError("");
    const date = dateIso(paymentDate), value = Number(amount);
    if (!customerId || !date || !Number.isFinite(value) || value <= 0) { setError("Choose a market and enter a valid date and payment amount."); return; }
    if (editingPayment && !paymentReason.trim()) { setError("Enter a reason for editing this payment."); return; }
    setBusy(true);
    const { error: saveError } = await supabase.rpc("potato_market_save_payment", {
      p_payment_id: editingPayment?.payment_id || null,
      p_customer_id: Number(customerId),
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
    setCustomerId(String(data));
    setNewMarketName("");
    setAddingMarket(false);
  }

  if (admin === null) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
  if (!admin) return <View style={{ padding: 24 }}><Text>Admin access required.</Text></View>;

  const lineSizes = dispatch ? sizes.filter(([code]) => Number(dispatch.counts?.[code] || 0) > 0) : [];
  return <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 18 }}>
    <JsplModuleHeader title="Potato Market" subtitle="D-Note sales, field allocations and market payments" backLabel="Back to Weighbridge Dashboard" backHref="/weighbridge" />
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <Button label="Potato Sale" onPress={() => setTab("sale")} />
      <Button label="Market Payment" onPress={() => setTab("payment")} />
      <Button label="Transaction Report" onPress={() => setTab("transactions")} />
      <Button label="Field Report" onPress={() => setTab("field")} />
      <Button label="Refresh" onPress={() => load().catch((e: any) => setError(e.message))} />
    </View>
    {!!error && <Text style={{ color: "#b42318", marginVertical: 8 }}>{error}</Text>}

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
        {payments.map(payment => <Picker.Item key={payment.payment_id} label={`${payment.customer_name} · ${showDate(payment.payment_date)} · ${Number(payment.amount).toFixed(2)}`} value={payment.payment_id} />)}
      </Picker>
      <Text>Market</Text>
      <Picker selectedValue={customerId} onValueChange={setCustomerId}>
        <Picker.Item label="Choose market" value="" />
        {customers.map(customer => <Picker.Item key={customer.id} label={customer.name} value={String(customer.id)} />)}
      </Picker>
      {!customers.length && <Text style={{ color: C.danger, marginVertical: 6 }}>No active customer records are available for the market dropdown.</Text>}
      <Button label={addingMarket ? "Cancel add market" : "Add market to customer list"} onPress={() => { setAddingMarket(value => !value); setNewMarketName(""); }} />
      {addingMarket && <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <TextInput style={inputStyle} value={newMarketName} onChangeText={setNewMarketName} placeholder="New market name" />
        <Button label={busy ? "Adding…" : "Add to list"} onPress={addMarket} disabled={busy || !newMarketName.trim()} />
      </View>}
      <TextInput style={inputStyle} value={paymentDate} onChangeText={setPaymentDate} placeholder="Payment date DD/MM/YYYY" />
      <TextInput style={inputStyle} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount received" />
      <TextInput style={inputStyle} value={reference} onChangeText={setReference} placeholder="Market reference (optional)" />
      <TextInput style={inputStyle} value={note} onChangeText={setNote} placeholder="Payment note (optional)" />
      {editingPayment && <TextInput style={inputStyle} value={paymentReason} onChangeText={setPaymentReason} placeholder="Reason for editing this payment" />}
      <Button label={busy ? "Saving…" : editingPayment ? "Save payment edit" : "Save market payment"} onPress={savePayment} disabled={busy || !customerId} />
    </View>}

    {tab === "transactions" && <View style={{ backgroundColor: "white", padding: 14, borderRadius: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 10 }}>Transaction Report</Text>
      {sales.map(sale => <View key={sale.sale_id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: C.border }}><Text style={{ fontWeight: "700" }}>Sale · {sale.dnote_number} · {showDate(sale.dnote_date)}</Text><Text>Sale total: {Number(sale.total).toFixed(2)}</Text></View>)}
      {payments.map(payment => <View key={payment.payment_id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: C.border }}><Text style={{ fontWeight: "700" }}>Payment · {payment.customer_name} · {showDate(payment.payment_date)}</Text><Text>Amount: {Number(payment.amount).toFixed(2)}</Text>{payment.market_reference && <Text>Reference: {payment.market_reference}</Text>}{payment.note && <Text>Note: {payment.note}</Text>}</View>)}
      {!sales.length && !payments.length && <Text>No potato market transactions recorded yet.</Text>}
    </View>}

    {tab === "field" && <View style={{ backgroundColor: "white", padding: 14, borderRadius: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 10 }}>Potato Field Report</Text>
      <Text style={{ fontWeight: "700", marginTop: 5 }}>Potato available stock by size</Text>
      {stock.map((row, index) => <Text key={`${row.season_name}:${row.size_name}:${index}`}>{row.season_name} · {row.size_name}: {Number(row.available_pockets).toLocaleString()} pockets ({(Number(row.available_pockets) * Number(row.pocket_weight_kg)).toLocaleString()} kg)</Text>)}
      {!stock.length && <Text>No available graded potato stock.</Text>}
      <Text style={{ fontWeight: "700", marginTop: 14 }}>Field receipts and sales allocation</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", backgroundColor: "#e7eee9", padding: 8, marginTop: 6 }}>
        {["Field", "Incoming WB slips", "Incoming kg", "Sale pockets", "Sale kg", "Sale value"].map(label => <Text key={label} style={{ fontWeight: "800", width: label === "Field" ? 150 : 125 }}>{label}</Text>)}
      </View>
      {fieldReport.map(row => <View key={row.tracecode_id} style={{ flexDirection: "row", flexWrap: "wrap", padding: 8, borderBottomWidth: 1, borderColor: C.border }}>
        {[row.tracecode_name, Number(row.incoming_slips).toLocaleString(), Number(row.incoming_kg).toLocaleString(), Number(row.sold_pockets).toLocaleString(), Number(row.sold_kg).toLocaleString(), Number(row.sold_value).toFixed(2)].map((value, index) => <Text key={index} style={{ width: index === 0 ? 150 : 125 }}>{value}</Text>)}
      </View>)}
      {!fieldReport.length && <Text>No potato field receipts or sale allocations found.</Text>}
    </View>}
  </ScrollView>;
}
