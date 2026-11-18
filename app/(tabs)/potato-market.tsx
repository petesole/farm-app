import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import { supabase } from "@/supabase";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { jsplColors as C } from "@/constants/jspl-design";

type Dispatch={dispatch_id:string;dnote_number:string;counts:Record<string,number>};
type Trace={id:number;name:string};
type Sale={sale_id:string;dispatch_id:string;dnote_number:string;sale_date:string;lines:Record<string,{pockets:number;price:number}>;allocations:{tracecode_id:number;size_code:string;pockets:number}[];total:number;paid:number};
type Payment={payment_id:string;sale_id:string;dnote_number:string;payment_date:string;amount:number;note:string|null;market_reference:string|null};
const sizes:[string,string][]=[["LARGE","Large"],["MEDIUM","Medium"],["SMEDIUM","Small-Medium"],["SMALL","Small"],["CHATS","Chats"],["CUTS","Cuts"],["GREENS","Greens"],["BULLETS","Bullets"]];
const today=()=>{const d=new Date();return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear()};
const iso=(v:string)=>{const m=v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)return null;const d=new Date(+m[3],+m[2]-1,+m[1]);return d.getFullYear()===+m[3]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[1]?m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0"):null};
const display=(v:string)=>{if(!v)return "";const [y,m,d]=v.slice(0,10).split("-");return d+"/"+m+"/"+y};
const input={borderWidth:1,borderColor:"#aeb9b4",borderRadius:6,padding:9,backgroundColor:"white",minWidth:110,marginBottom:8} as const;
function Btn({label,onPress,disabled=false}:any){return <Pressable onPress={onPress} disabled={disabled} style={{padding:11,backgroundColor:disabled?"#9aa8a0":C.primaryDark,borderRadius:6,marginRight:8,marginVertical:5}}><Text style={{color:"white",fontWeight:"700"}}>{label}</Text></Pressable>}
export default function PotatoMarket(){
 const [admin,setAdmin]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [dispatches,setDispatches]=useState<Dispatch[]>([]),[traces,setTraces]=useState<Trace[]>([]),[sales,setSales]=useState<Sale[]>([]),[payments,setPayments]=useState<Payment[]>([]),[report,setReport]=useState<any[]>([]);
 const [tab,setTab]=useState<"sale"|"payment"|"report">("sale"),[dispatchId,setDispatchId]=useState(""),[saleEdit,setSaleEdit]=useState("new"),[saleDate,setSaleDate]=useState(today()),[prices,setPrices]=useState<Record<string,string>>({}),[chosen,setChosen]=useState<number[]>([]),[alloc,setAlloc]=useState<Record<string,string>>({}),[saleReason,setSaleReason]=useState("");
 const [paymentEdit,setPaymentEdit]=useState("new"),[paymentSale,setPaymentSale]=useState(""),[paymentDate,setPaymentDate]=useState(today()),[amount,setAmount]=useState(""),[note,setNote]=useState(""),[reference,setReference]=useState(""),[paymentReason,setPaymentReason]=useState("");
 async function load(){const {data,error:e}=await supabase.rpc("potato_market_context");if(e)throw e;setDispatches(data.dispatches||[]);setTraces(data.traces||[]);setSales(data.sales||[]);setPayments(data.payments||[]);setReport(data.report||[]);}
 useEffect(()=>{(async()=>{const {data:u,error:ue}=await supabase.auth.getUser();const {data:r,error:re}=await supabase.rpc("my_farm_app_roles");const ok=!ue&&!!u.user&&!re&&Array.isArray(r)&&r.some((x:string)=>String(x).toLowerCase()==="admin");setAdmin(ok);if(ok)try{await load()}catch(e:any){setError(e.message||"Could not load Potato Market");}})()},[]);
 const dispatch=dispatches.find(d=>d.dispatch_id===dispatchId),editingSale=sales.find(s=>s.sale_id===saleEdit),editingPayment=payments.find(p=>p.payment_id===paymentEdit);
 const activeDispatches=useMemo(()=>dispatches.filter(d=>saleEdit!=="new"||!sales.some(s=>s.dispatch_id===d.dispatch_id)),[dispatches,sales,saleEdit]);
 useEffect(()=>{if(editingSale){setDispatchId(editingSale.dispatch_id);setSaleDate(display(editingSale.sale_date));setPrices(Object.fromEntries(Object.entries(editingSale.lines).map(([k,v])=>[k,String(v.price)])));setChosen([...new Set(editingSale.allocations.map(a=>a.tracecode_id))]);setAlloc(Object.fromEntries(editingSale.allocations.map(a=>[a.tracecode_id+":"+a.size_code,String(a.pockets)])));}else if(saleEdit==="new"){setDispatchId("");setSaleDate(today());setPrices({});setChosen([]);setAlloc({});}setSaleReason("")},[saleEdit]);
 useEffect(()=>{if(editingPayment){setPaymentSale(editingPayment.sale_id);setPaymentDate(display(editingPayment.payment_date));setAmount(String(editingPayment.amount));setNote(editingPayment.note||"");setReference(editingPayment.market_reference||"");}else if(paymentEdit==="new"){setPaymentSale("");setPaymentDate(today());setAmount("");setNote("");setReference("");}setPaymentReason("")},[paymentEdit]);
 function setA(id:number,code:string,v:string){setAlloc(x=>({...x,[id+":"+code]:v}))}
 async function saveSale(){setError("");const date=iso(saleDate);if(!dispatch||!date){setError("Choose a D-Note and enter a valid date (DD/MM/YYYY).");return;}const lines:any={};for(const [code] of sizes){const q=Number(dispatch.counts?.[code]||0);if(q){const price=Number(prices[code]);if(!Number.isFinite(price)||price<=0){setError("Enter a price for "+code+".");return;}lines[code]={pockets:q,price};}}
 const allocations:any[]=[];for(const id of chosen)for(const [code] of sizes){const q=Number(alloc[id+":"+code]||0);if(q>0)allocations.push({tracecode_id:id,size_code:code,pockets:q});}
 for(const [code] of sizes){const expected=Number(dispatch.counts?.[code]||0);if(expected&&allocations.filter(a=>a.size_code===code).reduce((n,a)=>n+a.pockets,0)!==expected){setError("Field allocations for "+code+" must add to "+expected+" pockets.");return;}}
 if(!chosen.length){setError("Choose at least one live field.");return;}if(editingSale&&!saleReason.trim()){setError("Enter a reason for the edit.");return;}
 setBusy(true);const {error:e}=await supabase.rpc("potato_market_save_sale",{p_sale_id:editingSale?.sale_id||null,p_dispatch_id:dispatch.dispatch_id,p_sale_date:date,p_lines:lines,p_allocations:allocations,p_reason:saleReason||null});setBusy(false);if(e){setError(e.message);return;}setSaleEdit("new");setDispatchId("");await load();}
 async function savePayment(){setError("");const date=iso(paymentDate),value=Number(amount);if(!paymentSale||!date||!Number.isFinite(value)||value<=0){setError("Choose a sale and enter a valid date and amount.");return;}if(editingPayment&&!paymentReason.trim()){setError("Enter a reason for the edit.");return;}setBusy(true);const {error:e}=await supabase.rpc("potato_market_save_payment",{p_payment_id:editingPayment?.payment_id||null,p_sale_id:paymentSale,p_payment_date:date,p_amount:value,p_note:note,p_market_reference:reference,p_reason:paymentReason||null});setBusy(false);if(e){setError(e.message);return;}setPaymentEdit("new");await load();}
 if(admin===null)return <View style={{flex:1,alignItems:"center",justifyContent:"center"}}><ActivityIndicator/></View>;
 if(!admin)return <View style={{padding:24}}><Text>Admin access required.</Text></View>;
 const label=(s:string)=>traces.find(t=>t.id===Number(s))?.name||s;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:18}}>
  <JsplModuleHeader title="Potato Market" subtitle="Sales, field allocations and market payments" backLabel="Back to Main" backHref="/(tabs)/main-dashboard"/>
  <View style={{flexDirection:"row",flexWrap:"wrap"}}><Btn label="Sales" onPress={()=>setTab("sale")}/><Btn label="Payments" onPress={()=>setTab("payment")}/><Btn label="Transaction Report" onPress={()=>setTab("report")}/><Btn label="Refresh" onPress={()=>load().catch((e:any)=>setError(e.message))}/></View>
  {!!error&&<Text style={{color:"#b42318",marginVertical:8}}>{error}</Text>}
  {tab==="sale"? <View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
   <Text style={{fontSize:20,fontWeight:"700",marginBottom:8}}>{editingSale?"Edit posted sale":"Record sale from issued D-Note"}</Text>
   <Text>Sale to edit / new</Text><Picker selectedValue={saleEdit} onValueChange={setSaleEdit}><Picker.Item label="New sale" value="new"/>{sales.map(s=><Picker.Item key={s.sale_id} label={s.dnote_number+" · "+display(s.sale_date)} value={s.sale_id}/>)}</Picker>
   <Text>D-Note (issued D-Notes only)</Text><Picker selectedValue={dispatchId} onValueChange={setDispatchId}><Picker.Item label="Choose D-Note" value=""/>{activeDispatches.map(d=><Picker.Item key={d.dispatch_id} label={d.dnote_number} value={d.dispatch_id}/>)}</Picker>
   <TextInput style={input} value={saleDate} onChangeText={setSaleDate} placeholder="DD/MM/YYYY"/>
   {dispatch&&sizes.filter(([c])=>Number(dispatch.counts?.[c]||0)>0).map(([code,name])=><View key={code} style={{flexDirection:"row",alignItems:"center",gap:8}}><Text style={{flex:1}}>{name}: {dispatch.counts[code]} pockets</Text><TextInput style={input} keyboardType="decimal-pad" value={prices[code]||""} onChangeText={v=>setPrices(x=>({...x,[code]:v}))} placeholder="Price / pocket"/></View>)}
   <Text style={{fontWeight:"700",marginVertical:8}}>Select live potato fields, then split each size so the totals match the D-Note.</Text>
   {traces.map(t=><View key={t.id}><Pressable onPress={()=>setChosen(x=>x.includes(t.id)?x.filter(i=>i!==t.id):[...x,t.id])} style={{paddingVertical:7}}><Text>{chosen.includes(t.id)?"☑":"☐"} {t.name}</Text></Pressable>{chosen.includes(t.id)&&dispatch&&sizes.filter(([c])=>Number(dispatch.counts?.[c]||0)>0).map(([code,name])=><View key={code} style={{flexDirection:"row",alignItems:"center",gap:8}}><Text style={{flex:1,marginLeft:20}}>{name}</Text><TextInput style={input} keyboardType="number-pad" value={alloc[t.id+":"+code]||""} onChangeText={v=>setA(t.id,code,v)} placeholder="Pockets"/></View>)}</View>)}
   {editingSale&&<TextInput style={input} value={saleReason} onChangeText={setSaleReason} placeholder="Reason for editing this sale"/>}
   <Btn label={busy?"Saving…":editingSale?"Save sale edit":"Save sale"} onPress={saveSale} disabled={busy||!dispatchId}/>
  </View>:null}
  {tab==="payment"?<View style={{backgroundColor:"white",padding:14,borderRadius:8}}>
   <Text style={{fontSize:20,fontWeight:"700"}}>{editingPayment?"Edit posted payment":"Record market payment"}</Text>
   <Text>Payment to edit / new</Text><Picker selectedValue={paymentEdit} onValueChange={setPaymentEdit}><Picker.Item label="New payment" value="new"/>{payments.map(p=><Picker.Item key={p.payment_id} label={p.dnote_number+" · "+Number(p.amount).toFixed(2)} value={p.payment_id}/>)}</Picker>
   <Text>Sale / D-Note</Text><Picker selectedValue={paymentSale} onValueChange={setPaymentSale}><Picker.Item label="Choose sale" value=""/>{sales.map(s=><Picker.Item key={s.sale_id} label={s.dnote_number+" · balance "+(Number(s.total)-Number(s.paid)).toFixed(2)} value={s.sale_id}/>)}</Picker>
   <TextInput style={input} value={paymentDate} onChangeText={setPaymentDate} placeholder="DD/MM/YYYY"/>
   <TextInput style={input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount received"/>
   <TextInput style={input} value={reference} onChangeText={setReference} placeholder="Market payment reference (optional)"/>
   <TextInput style={input} value={note} onChangeText={setNote} placeholder="Payment note"/>
   {editingPayment&&<TextInput style={input} value={paymentReason} onChangeText={setPaymentReason} placeholder="Reason for editing this payment"/>}
   <Btn label={busy?"Saving…":editingPayment?"Save payment edit":"Save payment"} onPress={savePayment} disabled={busy||!paymentSale}/>
  </View>:null}
  {tab==="report"?<View style={{backgroundColor:"white",padding:14,borderRadius:8}}><Text style={{fontSize:20,fontWeight:"700",marginBottom:10}}>Transaction Report</Text>
   {report.map((r,i)=><View key={i} style={{paddingVertical:9,borderBottomWidth:1,borderColor:"#e6e9e7"}}><Text style={{fontWeight:"700"}}>{r.type} · {r.dnote} · {display(r.date)}</Text><Text>Amount: {Number(r.amount).toFixed(2)}</Text>{r.note?<Text>Note: {r.note}</Text>:null}</View>)}
   {!report.length?<Text>No potato market transactions yet.</Text>:null}
   <Text style={{marginTop:12,fontWeight:"700"}}>Sales balances</Text>{sales.map(s=><Text key={s.sale_id}>{s.dnote_number}: Sale {Number(s.total).toFixed(2)} · Paid {Number(s.paid).toFixed(2)} · Balance {(Number(s.total)-Number(s.paid)).toFixed(2)}</Text>)}
  </View>:null}
 </ScrollView>;
}
