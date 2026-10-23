import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";

type Kind = "Payment" | "Receipt" | "Transfer";
type Entry = { id: number; kind: Kind; date: string; account: string; counterparty: string; category: string; allocation: string; description: string; amount: number };
const accounts = ["USD Bank", "USD Cash", "ZiG Bank", "ZiG Cash"];
const categories = ["R+M", "Crop Production", "Electricity", "Wages", "Farm Overheads", "Other"];
const GREEN = "#164932";
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function CashbookV1() {
  const [kind, setKind] = useState<Kind>("Payment");
  const [account, setAccount] = useState(accounts[0]);
  const [destination, setDestination] = useState(accounts[1]);
  const [category, setCategory] = useState(categories[0]);
  const [counterparty, setCounterparty] = useState("");
  const [allocation, setAllocation] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notice, setNotice] = useState("");
  const summary = useMemo(() => ({
    paid: entries.filter(e => e.kind === "Payment").reduce((sum,e)=>sum+e.amount,0),
    received: entries.filter(e => e.kind === "Receipt").reduce((sum,e)=>sum+e.amount,0),
    transfers: entries.filter(e => e.kind === "Transfer").length
  }), [entries]);
  function addPreview() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || (kind === "Transfer" && (destination === account || destination.split(" ")[0] !== account.split(" ")[0]))) {
      setNotice("Enter a positive amount. Transfers must use different accounts in the same currency.");
      return;
    }
    if (kind !== "Transfer" && !counterparty.trim()) { setNotice("Enter a supplier, customer or payee."); return; }
    const today = new Date().toISOString().slice(0,10);
    setEntries(old => [{ id: Date.now(), kind, date: today, account, counterparty: kind === "Transfer" ? destination : counterparty.trim(), category: kind === "Transfer" ? "Internal transfer" : category, allocation: allocation.trim(), description: description.trim(), amount: n }, ...old]);
    setNotice("Added to this screen's DEMO list only. Nothing has been posted.");
    setAmount(""); setDescription("");
  }
  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>‹ Back</Text></TouchableOpacity>
    <Text style={s.heading}>Farm Cashbook</Text>
    <Text style={s.sub}>V1 test preview • No live database writes • Pastel remains the accounts system</Text>
    <View style={s.summary}>
      <Text style={s.summaryLabel}>Preview entries: {entries.length} • Transfers: {summary.transfers}</Text>
      <Text style={s.summaryLabel}>Payments: {money(summary.paid)} • Receipts: {money(summary.received)}</Text>
      <Text style={s.hint}>USD and ZiG must be reported separately. These totals are DEMO inputs, not account balances.</Text>
    </View>
    <View style={s.panel}>
      <Text style={s.section}>New transaction</Text>
      <Text style={s.label}>Type</Text>
      <View style={s.choices}>{(["Payment","Receipt","Transfer"] as Kind[]).map(x=><TouchableOpacity key={x} onPress={()=>setKind(x)} style={[s.choice, kind===x&&s.selected]}><Text style={kind===x?s.white:s.choiceText}>{x}</Text></TouchableOpacity>)}</View>
      <Text style={s.label}>Account</Text>
      <View style={s.choices}>{accounts.map(x=><TouchableOpacity key={x} onPress={()=>setAccount(x)} style={[s.choice,account===x&&s.selected]}><Text style={account===x?s.white:s.choiceText}>{x}</Text></TouchableOpacity>)}</View>
      {kind==="Transfer" ? <><Text style={s.label}>Transfer to</Text><View style={s.choices}>{accounts.filter(x=>x!==account&&x.split(" ")[0]===account.split(" ")[0]).map(x=><TouchableOpacity key={x} onPress={()=>setDestination(x)} style={[s.choice,destination===x&&s.selected]}><Text style={destination===x?s.white:s.choiceText}>{x}</Text></TouchableOpacity>)}</View></> :
        <><Text style={s.label}>{kind==="Payment"?"Payee / supplier":"Received from"}</Text><TextInput style={s.input} value={counterparty} onChangeText={setCounterparty} placeholder="Name" />
          <Text style={s.label}>Category</Text><View style={s.choices}>{categories.map(x=><TouchableOpacity key={x} onPress={()=>setCategory(x)} style={[s.choice,category===x&&s.selected]}><Text style={category===x?s.white:s.choiceText}>{x}</Text></TouchableOpacity>)}</View>
          <Text style={s.label}>Allocation (optional)</Text><TextInput style={s.input} value={allocation} onChangeText={setAllocation} placeholder="Machine, job card or tracecode" /></>}
      <Text style={s.label}>Amount ({account.startsWith("USD")?"USD":"ZiG"})</Text><TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00"/>
      <Text style={s.label}>Description / reference</Text><TextInput style={s.input} value={description} onChangeText={setDescription} placeholder="What was this for?"/>
      <TouchableOpacity style={s.button} onPress={addPreview}><Text style={s.white}>Add test entry</Text></TouchableOpacity>
      {!!notice&&<Text style={s.hint}>{notice}</Text>}
    </View>
    <View style={s.panel}><Text style={s.section}>Session preview</Text>{entries.length===0?<Text style={s.hint}>No entries yet. Test a payment, receipt or transfer above.</Text>:entries.map(e=><View key={e.id} style={s.line}><View style={{flex:1}}><Text style={s.lineStrong}>{e.kind} · {e.counterparty}</Text><Text style={s.hint}>{e.account} · {e.category} {e.allocation?"· "+e.allocation:""}</Text></View><Text style={s.lineStrong}>{money(e.amount)}</Text></View>)}</View>
    <Text style={s.hint}>Next build: secured database, opening balances, supplier invoice matching, payment runs, advances, reconciliation and Pastel export. Do not use this preview for real payments.</Text>
  </ScrollView>;
}
const s = StyleSheet.create({
  page:{flex:1,backgroundColor:"#F5F7F4"},content:{padding:20,maxWidth:1050,width:"100%",alignSelf:"center",gap:12,paddingBottom:48},
  back:{color:GREEN,fontSize:15},heading:{fontSize:27,fontWeight:"700",color:GREEN},sub:{fontSize:13,color:"#52685B"},
  summary:{padding:16,backgroundColor:"#E8F0EA",borderRadius:12,gap:6},summaryLabel:{color:GREEN,fontWeight:"600"},panel:{backgroundColor:"#FFF",padding:18,borderRadius:12,gap:8,borderWidth:1,borderColor:"#DFE5DF"},
  section:{fontSize:18,color:GREEN,fontWeight:"700",marginBottom:5},label:{fontWeight:"600",color:"#283C31",marginTop:8},
  choices:{flexDirection:"row",flexWrap:"wrap",gap:7},choice:{paddingVertical:9,paddingHorizontal:12,backgroundColor:"#EFF2EF",borderRadius:7},selected:{backgroundColor:GREEN},
  white:{color:"#FFF",fontWeight:"700"},choiceText:{color:"#304538"},input:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#C9D4CB",borderRadius:8,padding:12,color:"#23382C"},
  button:{backgroundColor:GREEN,padding:14,alignItems:"center",borderRadius:8,marginTop:12},hint:{color:"#637167",fontSize:12},
  line:{flexDirection:"row",justifyContent:"space-between",gap:10,borderBottomWidth:1,borderBottomColor:"#E4E9E5",paddingVertical:10},
  lineStrong:{color:"#253D2F",fontWeight:"600"}
});