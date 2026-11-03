import React,{useCallback,useEffect,useMemo,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import {StockV2Header} from "@/components/jspl/StockV2Header";
import {supabase} from "../../../supabase";
import {jsplColors} from "@/constants/jspl-design";

const creditApi="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-credits";
const stockApi="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type CreditLine={line_id:number;item_code:string;item_name:string;quantity:number;agreed_price:number;inventory_value:number|null;credited_quantity:number;credited_value:number};
type ReturnRow={document_id:number;document_number:string;document_date:string;owner_code:string;supplier_name:string;return_reference:string;reason:string;lines:CreditLine[]};
type Allocation={return_line_id:number;quantity:number;unit_credit_price:number};
type Credit={credit_id:number;credit_note_number:string;credit_note_date:string;supplier_name:string;owner_code:string;total_amount:number;credit_kind:string;notes:string;allocations:any[];price_adjustment?:{receipt_number:string;item_name:string;amount:number;reason:string}|null};
type Receipt={document_id:number;document_number:string;display_no:number;document_date:string;supplier_name:string;owner_code:string;item_id:number;item_code:string;item_name:string;receipt_line_id:number};
const display=(s:string|null|undefined)=>s&&/^\d{4}-\d{2}-\d{2}/.test(s)?s.substring(8,10)+"/"+s.substring(5,7)+"/"+s.substring(0,4):s||"";
const toISO=(s:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());if(!m)return "";const iso=m[3]+"-"+m[2]+"-"+m[1];const d=new Date(iso+"T12:00:00Z");return !Number.isNaN(d.valueOf())&&d.toISOString().substring(0,10)===iso?iso:""};
const value=(v:unknown)=>Number(v||0);
export default function SupplierCredits(){
 const router=useRouter();
 const [returns,setReturns]=useState<ReturnRow[]>([]),[credits,setCredits]=useState<Credit[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [owner,setOwner]=useState("JS"),[supplier,setSupplier]=useState(""),[window,setWindow]=useState<"return"|"price"|"history"|null>(null),[selectedCredit,setSelectedCredit]=useState<Credit|null>(null);
 const [creditNo,setCreditNo]=useState(""),[date,setDate]=useState(""),[amount,setAmount]=useState(""),[notes,setNotes]=useState("");
 const [edits,setEdits]=useState<Record<number,{qty:string;price:string}>>({});
 const [receipts,setReceipts]=useState<Receipt[]>([]),[receiptSearch,setReceiptSearch]=useState(""),[receiptLine,setReceiptLine]=useState<Receipt|null>(null),[reason,setReason]=useState("");
 const token=async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Please sign in");return session.access_token};
 const request=async(url:string,payload?:unknown)=>{const t=await token();const r=await fetch(url,{method:payload?"POST":"GET",headers:{authorization:"Bearer "+t,...(payload?{"content-type":"application/json"}:{})},...(payload?{body:JSON.stringify(payload)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error||"Request failed");return j};
 const load=useCallback(async()=>{setBusy(true);setError("");try{const x=await request(creditApi);setReturns(x.returns||[]);setCredits(x.credits||[]);setReceipts(x.receipts||[])}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}},[]);
 useEffect(()=>{void load()},[]);
 const supplierNames=useMemo(()=>Array.from(new Set([...returns.filter(x=>x.owner_code===owner).map(x=>x.supplier_name),...receipts.filter(x=>x.owner_code==="TEST_"+owner).map(x=>x.supplier_name)])).sort(),[returns,receipts,owner]);
 const available=useMemo(()=>returns.filter(r=>r.owner_code===owner&&(!supplier||r.supplier_name===supplier)).flatMap(r=>r.lines.filter(l=>value(l.quantity)>value(l.credited_quantity)+0.000001).map(l=>({...l,ret:r}))),[returns,owner,supplier]);
 const expected=useMemo(()=>available.reduce((n,l)=>{const e=edits[l.line_id];return n+(e?value(e.qty)*value(e.price):0)},0),[available,edits]);
 const reset=()=>{setCreditNo("");setDate("");setAmount("");setNotes("");setReason("");setEdits({});setReceiptLine(null);setReceiptSearch("");setError("")};
 const open=(type:"return"|"price",s?:string)=>{reset();if(s)setSupplier(s);setWindow(type)};
 const close=()=>{setWindow(null);setSelectedCredit(null);setError("")};
 const add=(l:CreditLine)=>{const left=value(l.quantity)-value(l.credited_quantity);setEdits(prev=>({...prev,[l.line_id]:{qty:prev[l.line_id]?.qty??String(left),price:prev[l.line_id]?.price??String(l.agreed_price)}}))};
 const save=async()=>{if(!supplier){setError("Choose supplier");return}if(!creditNo.trim()||!toISO(date)||!amount.trim()||!Number.isFinite(Number(amount))||Number(amount)<0){setError("Enter credit note number, valid date dd/mm/yyyy, and actual credit note amount");return}setBusy(true);setError("");try{
  if(window==="return"){
   const selected:Allocation[]=available.filter(l=>Number(edits[l.line_id]?.qty)>0).map(l=>({return_line_id:l.line_id,quantity:Number(edits[l.line_id].qty),unit_credit_price:Number(edits[l.line_id].price)}));
   if(!selected.length)throw Error("Choose at least one returned item");
   for(const a of selected){const l=available.find(x=>x.line_id===a.return_line_id)!;if(!Number.isFinite(a.quantity)||a.quantity<=0||a.quantity>Number(l.quantity)-Number(l.credited_quantity)+0.000001||!Number.isFinite(a.unit_credit_price)||a.unit_credit_price<0)throw Error("Check the credit quantity and actual price for "+l.item_name)}
   await request(creditApi,{action:"return_credit",owner_code:owner,supplier_name:supplier,credit_note_number:creditNo.trim(),credit_note_date:toISO(date),total_amount:Number(amount),notes,allocations:selected});
  }else{
   if(!receiptLine)throw Error("Select original D-Note/GRV and product");
   if(reason.trim().length<5)throw Error("Enter reason for price-only credit");
   await request(creditApi,{action:"price_credit",owner_code:owner,supplier_name:supplier,credit_note_number:creditNo.trim(),credit_note_date:toISO(date),total_amount:Number(amount),notes,receipt_document_id:receiptLine.document_id,item_id:receiptLine.item_id,reason});
  }
  close();await load();setNotice("Supplier credit note "+creditNo+" posted and recorded");
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const fetchReceipts=async()=>{await load()};
 const button=(title:string,onPress:()=>void,disabled=false)=><Pressable disabled={disabled||busy} style={[styles.button,(disabled||busy)&&styles.dim]} onPress={onPress}><Text style={styles.buttonText}>{title}</Text></Pressable>;
 return <View style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <StockV2Header title="Supplier Credit Notes"/>
  <Pressable onPress={()=>router.back()}><Text style={styles.link}>‹ Back to Supplier Returns</Text></Pressable>
  <Text style={styles.sub}>Record the supplier's actual credit. One note can cover several returns, and individual returns can be credited in parts. Stock is NOT moved again.</Text>
  {notice?<Text style={styles.success}>{notice}</Text>:null}{!window&&error?<Text style={styles.error}>{error}</Text>:null}
  <View style={styles.row}>{["JS","AO"].map(o=><Pressable key={o} onPress={()=>{setOwner(o);setSupplier("")}} style={[styles.choice,owner===o&&styles.selected]}><Text>{o}</Text></Pressable>)}</View>
  <Text style={styles.label}>Supplier</Text><ScrollView horizontal contentContainerStyle={styles.row}>{supplierNames.map(s=><Pressable key={s} style={[styles.choice,supplier===s&&styles.selected]} onPress={()=>setSupplier(s)}><Text>{s}</Text></Pressable>)}</ScrollView>
  <View style={styles.row}>{button("Credit Returned Stock",()=>open("return"),!supplier)}{button("Price-only Credit",()=>open("price"),!supplier)}</View>
  <Text style={styles.heading}>Outstanding Returns</Text>
  {busy&&!window?<ActivityIndicator/>:null}
  {returns.filter(r=>r.owner_code===owner&&(!supplier||r.supplier_name===supplier)).map(r=>{
    const outstanding=r.lines.reduce((n,l)=>n+Math.max(0,value(l.quantity)-value(l.credited_quantity)),0);
    const credited=r.lines.reduce((n,l)=>n+value(l.credited_value),0);
    const expectedForCredited=r.lines.reduce((n,l)=>n+value(l.credited_quantity)*value(l.agreed_price),0);
    const difference=credited-expectedForCredited;
    const stockValue=r.lines.reduce((n,l)=>n+(value(l.quantity)>0?value(l.inventory_value)*value(l.credited_quantity)/value(l.quantity):0),0);
    const valuationDifference=credited-stockValue;
    return <Pressable key={r.document_id} style={styles.panel} onPress={()=>open("return",r.supplier_name)}>
     <Text style={styles.bold}>{r.document_number} · {r.supplier_name}</Text><Text>{display(r.document_date)} · {r.lines.length} products · {outstanding>0?"Outstanding qty "+outstanding:"Fully quantity credited"}</Text>
     <Text>Credit received: ${credited.toFixed(2)} · {outstanding>0?"Open":"Qty credited"}</Text>
     {Math.abs(difference)>0.01?<Text style={styles.error}>Expected vs actual credit: ${difference.toFixed(2)} — review required</Text>:null}
     {credited>0?<Text>Stock value of credited quantities: ${stockValue.toFixed(2)} · Credit less stock value: ${valuationDifference.toFixed(2)}</Text>:null}
    </Pressable>})}
  <Text style={styles.heading}>Recorded Credit Notes</Text>
  {credits.filter(c=>c.owner_code===owner&&(!supplier||c.supplier_name===supplier)).map(c=><Pressable key={c.credit_id} style={styles.panel} onPress={()=>{setSelectedCredit(c);setWindow("history")}}>
    <Text style={styles.bold}>{c.credit_note_number} · {c.supplier_name}</Text><Text>{display(c.credit_note_date)} · ${value(c.total_amount).toFixed(2)} · {c.credit_kind==="return"?"Returned goods":"Price-only credit"}</Text>
  </Pressable>)}
 </ScrollView>
 <Modal visible={window!==null} animationType="slide" onRequestClose={close}>
  <View style={styles.root}><ScrollView contentContainerStyle={styles.page}>
   <View style={styles.top}><Text style={styles.heading}>{window==="history"?"Supplier Credit Note":window==="price"?"Price-only Credit":"Record Supplier Credit"}</Text><Pressable onPress={close}><Text style={styles.link}>✕ Close</Text></Pressable></View>
   {window==="history"&&selectedCredit?<View style={styles.panel}><Text style={styles.bold}>{selectedCredit.credit_note_number} · {selectedCredit.supplier_name}</Text><Text>{display(selectedCredit.credit_note_date)} · ${value(selectedCredit.total_amount).toFixed(2)}</Text><Text>{selectedCredit.notes}</Text>{selectedCredit.price_adjustment?<Text>Linked {selectedCredit.price_adjustment.receipt_number} · {selectedCredit.price_adjustment.item_name} · ${Number(selectedCredit.price_adjustment.amount).toFixed(2)} · {selectedCredit.price_adjustment.reason}</Text>:null}{(selectedCredit.allocations||[]).map((a,i)=><Text key={i}>{a.return_number} · {a.item_name} · {a.quantity} × ${a.unit_credit_price} actual (expected ${Number(a.agreed_price).toFixed(2)}/unit; variance ${(Number(a.actual_value)-Number(a.expected_value)).toFixed(2)})</Text>)}
    {selectedCredit.credit_kind==="return"?<Text style={styles.bold}>Line allocations ${selectedCredit.allocations.reduce((n,a)=>n+Number(a.actual_value),0).toFixed(2)} · Actual supplier credit ${value(selectedCredit.total_amount).toFixed(2)} · Difference ${(value(selectedCredit.total_amount)-selectedCredit.allocations.reduce((n,a)=>n+Number(a.actual_value),0)).toFixed(2)}</Text>:null}</View>:null}
   {window==="return"||window==="price"?<>
    <Text style={styles.label}>Supplier: {supplier} · Owner: {owner}</Text>
    <Text style={styles.label}>Credit Note Number</Text><TextInput style={styles.input} value={creditNo} onChangeText={setCreditNo} placeholder="Supplier CN reference"/>
    <Text style={styles.label}>Credit Note Date (dd/mm/yyyy)</Text><TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="dd/mm/yyyy"/>
    {window==="return"?<>
     <Text style={styles.heading}>Select items credited on this note</Text>
     {available.map(l=>{const left=value(l.quantity)-value(l.credited_quantity);const edit=edits[l.line_id];return <View key={l.line_id} style={styles.panel}>
      <Pressable onPress={()=>add(l)}><Text style={styles.bold}>{edit?"☑ ":"☐ "}{l.ret.document_number} · {l.item_name}</Text></Pressable>
      <Text>Outstanding {left} · Expected ${value(l.agreed_price).toFixed(2)}/unit</Text>
      {edit?<View style={styles.row}><View style={styles.flex}><Text style={styles.label}>Quantity</Text><TextInput style={styles.input} keyboardType="decimal-pad" value={edit.qty} onChangeText={qty=>setEdits(v=>({...v,[l.line_id]:{...v[l.line_id],qty}}))}/></View><View style={styles.flex}><Text style={styles.label}>Actual credit $/unit</Text><TextInput style={styles.input} keyboardType="decimal-pad" value={edit.price} onChangeText={price=>setEdits(v=>({...v,[l.line_id]:{...v[l.line_id],price}}))}/></View><Pressable onPress={()=>setEdits(v=>{const next={...v};delete next[l.line_id];return next})}><Text style={styles.link}>Remove</Text></Pressable></View>:null}
     </View>})}
     <Text style={styles.bold}>Selected line credit value: ${expected.toFixed(2)}</Text><Text>Enter the actual supplier credit total below. Any difference must be explained in Notes.</Text>
    </>:null}
    {window==="price"?<>
      <Text style={styles.label}>Original Receipt</Text>{button("Load Receipts",()=>void fetchReceipts())}
      <TextInput style={styles.input} placeholder="Search product or GRV" value={receiptSearch} onChangeText={setReceiptSearch}/>
      {receipts.filter(r=>r.owner_code==="TEST_"+owner&&r.supplier_name.trim().toLowerCase()===supplier.trim().toLowerCase()&&(r.item_name+" "+r.display_no).toLowerCase().includes(receiptSearch.toLowerCase())).slice(0,40).map(r=><Pressable key={r.receipt_line_id} style={[styles.panel,receiptLine?.receipt_line_id===r.receipt_line_id&&styles.selected]} onPress={()=>setReceiptLine(r)}><Text>GRV {r.display_no} · {r.item_name} · {display(r.document_date)}</Text></Pressable>)}
      <Text style={styles.label}>Reason for price-only credit</Text><TextInput style={styles.input} value={reason} onChangeText={setReason}/>
    </>:null}
    <Text style={styles.label}>Actual supplier credit note total ($)</Text><TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="Exact amount on supplier credit"/>
    <Text style={styles.label}>Notes / reason for any difference</Text><TextInput style={styles.input} multiline value={notes} onChangeText={setNotes} placeholder="Required if total differs from allocated lines"/>
    {error?<Text style={styles.error}>{error}</Text>:null}
    {button(busy?"Saving…":"Post Credit Note",()=>void save())}
   </>:null}
  </ScrollView></View>
 </Modal>
 </View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:16,gap:10,paddingBottom:40},top:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},heading:{fontSize:20,fontWeight:"700",color:"#123c27",marginTop:8},sub:{color:"#475569"},label:{fontWeight:"600",fontSize:13,color:"#344b3b"},row:{flexDirection:"row",gap:9,alignItems:"center",flexWrap:"wrap"},flex:{flex:1,minWidth:125},bold:{fontWeight:"700",color:"#1c3328"},choice:{padding:10,borderWidth:1,borderColor:"#c4d2c7",borderRadius:8,backgroundColor:"#fff"},selected:{backgroundColor:"#e0f1de",borderColor:"#39834d"},input:{borderWidth:1,borderColor:"#bacdc0",backgroundColor:"#fff",padding:12,borderRadius:8,minHeight:43},panel:{backgroundColor:"#fff",padding:12,borderWidth:1,borderColor:"#d9e4dc",borderRadius:9,gap:7},button:{backgroundColor:"#176339",borderRadius:9,padding:14,alignItems:"center"},buttonText:{fontWeight:"700",color:"#fff"},dim:{opacity:0.45},link:{color:"#186e44",fontWeight:"700"},error:{color:"#b91c1c",fontWeight:"700"},success:{color:"#166534",fontWeight:"600"}});
