import {useEffect,useMemo,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {JsplSearchCombo} from "@/components/jspl/JsplSearchCombo";
import {displayJsplDate} from "@/utils/jspl-input";
import {jsplColors,jsplSpacing,jsplRadii,jsplSizes} from "@/constants/jspl-design";
const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Line={document_id:number;document_date:string;delivery_note:string;delivery_note_date:string|null;supplier_name:string;owner_code:string;item_code:string;item_name:string;base_unit:string;line_id:number;quantity:number};
const fmt=(v:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());if(!m)return null;const iso=m[3]+"-"+m[2]+"-"+m[1];const d=new Date(iso+"T12:00:00Z");return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==iso?null:iso;};
export default function GRVOutstanding(){
 const router=useRouter();
 const [rows,setRows]=useState<Line[]>([]),[selected,setSelected]=useState<number|null>(null),[invoice,setInvoice]=useState(""),[date,setDate]=useState(new Date().toLocaleDateString("en-GB")),[prices,setPrices]=useState<Record<number,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [grower,setGrower]=useState("ALL");
 const [selectedDnotes,setSelectedDnotes]=useState<number[]>([]);
 const [newReceipts,setNewReceipts]=useState<{id:number;item_code:string;quantity:string}[]>([]);
 const [invoiceQuantities,setInvoiceQuantities]=useState<Record<string,string>>({});
 const load=async()=>{setBusy(true);setError("");try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");const r=await fetch(endpoint+"?outstanding_dnotes=1",{headers:{authorization:"Bearer "+session.access_token}});const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load outstanding invoices");setRows(d.rows??[]);}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 const documents=useMemo(()=>{const map=new Map<number,Line[]>();for(const l of rows){if(!map.has(l.document_id))map.set(l.document_id,[]);map.get(l.document_id)!.push(l);}return [...map.values()]},[rows]);
 const growers=useMemo(()=>[...new Set(documents.map(d=>d[0].owner_code))].sort(),[documents]);
 const visibleDocuments=useMemo(()=>documents.filter(d=>grower==="ALL"||d[0].owner_code===grower),[documents,grower]);
 const dnoteOptions=useMemo(()=>visibleDocuments.map(group=>({
  id:group[0].document_id,
  label:"DNote "+group[0].delivery_note+" · "+displayJsplDate(group[0].delivery_note_date||group[0].document_date),
 })),[visibleDocuments]);
 const selectedLines=documents.find(d=>d[0].document_id===selected)??[];
 const groupedSelection=documents.filter(d=>selectedDnotes.includes(d[0].document_id));
 const selectedSupplier=groupedSelection[0]?.[0]?.supplier_name??"";
 const stockByProduct=useMemo(()=>{
  const groups=new Map<string,{name:string;unit:string;old:number;fresh:number}>();
  const matched=documents.filter(d=>selectedDnotes.includes(d[0].document_id));
  for(const doc of matched)for(const line of doc){
   const cur=groups.get(line.item_code)??{name:line.item_name,unit:line.base_unit,old:0,fresh:0};
   cur.old+=Number(line.quantity);groups.set(line.item_code,cur);
  }
  for(const line of newReceipts){
   const source=rows.find(r=>r.item_code===line.item_code);
   if(!source)continue;
   const cur=groups.get(line.item_code)??{name:source.item_name,unit:source.base_unit,old:0,fresh:0};
   cur.fresh+=Number(line.quantity)||0;groups.set(line.item_code,cur);
  }
  return [...groups.entries()].map(([code,x])=>({code,...x,total:x.old+x.fresh}));
 },[documents,selectedDnotes,newReceipts,rows]);
 const mixedMode=selectedDnotes.length>1||newReceipts.length>0;
 const valid=selectedLines.length>0&&invoice.trim().length>0&&!!fmt(date)&&selectedLines.every(l=>Number.isFinite(Number(prices[l.line_id]))&&Number(prices[l.line_id])>0);
 const post=async()=>{if(!valid||busy)return;setBusy(true);setError("");setSuccess("");try{
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
  const payload={document_id:selected,invoice_number:invoice.trim(),invoice_date:fmt(date),lines:selectedLines.map(l=>({line_id:l.line_id,unit_price:Number(prices[l.line_id])}))};
  const r=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+session.access_token,"content-type":"application/json"},body:JSON.stringify({action:"match_invoice",payload})});const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to match invoice");
  const completed=Array.isArray(d.result?.cost_runs)?d.result.cost_runs.length:0;
  const pending=Array.isArray(d.result?.cost_pending)?d.result.cost_pending:[];
  setSuccess("Invoice matched to DNote #"+selected+". No stock was received again. "+
   (pending.length?"WA COSTING PENDING for "+pending.length+" product(s): "+pending.map((x:{reason:string})=>x.reason).join("; "):
   "Historical WA recalculated for "+completed+" product(s), including downstream issues and transfers."));setSelected(null);setSelectedDnotes([]);setNewReceipts([]);setInvoiceQuantities({});setInvoice("");setPrices({});
  const fresh=await fetch(endpoint+"?outstanding_dnotes=1",{headers:{authorization:"Bearer "+session.access_token}});const data=await fresh.json();if(fresh.ok)setRows(data.rows??[]);
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <Pressable onPress={()=>router.replace("/stock-test")}><ThemedText>← Stock Home</ThemedText></Pressable>
  <ThemedText style={styles.heading}>GRV · Outstanding Invoices ({documents.length})</ThemedText>
  <ThemedText>Received delivery notes awaiting supplier invoices. Matching an invoice does not receive stock a second time.</ThemedText>
  <Pressable style={styles.button} onPress={()=>void load()}><ThemedText>↻ Refresh</ThemedText></Pressable>
  {busy?<ActivityIndicator/>:null}{error?<ThemedText style={styles.error}>{error}</ThemedText>:null}{success?<ThemedText>{success}</ThemedText>:null}
  <View style={styles.pickerSection}>
   <ThemedText style={styles.bold}>Filter by Grower</ThemedText>
   <View style={styles.growerFilters}>
    {["ALL",...growers].map(owner=><Pressable key={owner} accessibilityRole="button" accessibilityState={{selected:grower===owner}}
     onPress={()=>{setGrower(owner);setSelected(null);setSelectedDnotes([]);setNewReceipts([]);setInvoiceQuantities({});setInvoice("");setPrices({});setError("")}}
     style={[styles.growerButton,grower===owner&&styles.growerActive]}>
     <ThemedText style={grower===owner?styles.growerActiveText:styles.growerText}>{owner==="ALL"?"All Growers":owner}</ThemedText>
    </Pressable>)}
   </View>
   {documents.length===0?<ThemedText>No outstanding delivery notes.</ThemedText>:visibleDocuments.length===0?<ThemedText>No outstanding delivery notes for this grower.</ThemedText>:<>
    <JsplSearchCombo label="Outstanding Delivery Notes" selector="product" options={dnoteOptions} value={selected}
     placeholder="Search by DNote number" onChange={value=>{const id=value===null?null:Number(value);setSelected(id);if(id!==null){const group=documents.find(d=>d[0].document_id===id);if(group&&(selectedSupplier===""||group[0].supplier_name===selectedSupplier)){setSelectedDnotes(old=>old.includes(id)?old:[...old,id])}else setError("One GRV cannot mix DNotes from different suppliers.")}setInvoice("");setPrices({})}}/>
    {selectedLines.length>0?<ThemedText style={styles.muted}>{selectedLines[0].supplier_name} · {selectedLines[0].owner_code} · {selectedLines.length} products</ThemedText>:null}
   </>}
  </View>
  <View style={styles.form}>
   <ThemedText style={styles.bold}>Combined GRV — Reconciliation Preview</ThemedText>
   <ThemedText style={styles.muted}>Choose several DNotes from the same supplier. Add today's physical receipts separately. Previously received stock will not be received again.</ThemedText>
   <ThemedText style={styles.bold}>Linked DNotes ({selectedDnotes.length})</ThemedText>
   {groupedSelection.map(group=><View key={group[0].document_id} style={styles.reconcileRow}><ThemedText>DNote {group[0].delivery_note} · {displayJsplDate(group[0].delivery_note_date||group[0].document_date)} · {group[0].supplier_name}</ThemedText><Pressable onPress={()=>setSelectedDnotes(old=>old.filter(id=>id!==group[0].document_id))}><ThemedText style={styles.error}>Remove</ThemedText></Pressable></View>)}
   <ThemedText style={styles.bold}>Today's new stock receipts</ThemedText>
   {newReceipts.map(entry=><View key={entry.id} style={styles.reconcileRow}>
    <ThemedText>{rows.find(r=>r.item_code===entry.item_code)?.item_name??entry.item_code}</ThemedText>
    <TextInput keyboardType="decimal-pad" accessibilityLabel="New stock received quantity" style={[styles.input,styles.qtyInput]} value={entry.quantity} onChangeText={v=>setNewReceipts(old=>old.map(x=>x.id===entry.id?{...x,quantity:v}:x))}/>
    <Pressable onPress={()=>setNewReceipts(old=>old.filter(x=>x.id!==entry.id))}><ThemedText style={styles.error}>Remove</ThemedText></Pressable>
   </View>)}
   <View style={styles.actions}>{[...new Map(rows.filter(r=>grower==="ALL"||r.owner_code===grower).filter(r=>!selectedSupplier||r.supplier_name===selectedSupplier).map(r=>[r.item_code,r])).values()].map(product=><Pressable key={product.item_code} style={styles.button} onPress={()=>setNewReceipts(old=>[...old,{id:Date.now()+old.length,item_code:product.item_code,quantity:""}])}><ThemedText>+ {product.item_name}</ThemedText></Pressable>)}</View>
   <ThemedText style={styles.bold}>Product reconciliation (quantity)</ThemedText>
   {stockByProduct.map(x=><View key={x.code} style={styles.productReview}>
    <ThemedText style={styles.bold}>{x.name} ({x.unit})</ThemedText>
    <ThemedText>Prior DNotes: {x.old} · New physical receipt: {x.fresh} · Total received: {x.total}</ThemedText>
    <ThemedText>Supplier invoice quantity</ThemedText>
    <TextInput keyboardType="decimal-pad" style={styles.input} value={invoiceQuantities[x.code]??""} onChangeText={v=>setInvoiceQuantities(old=>({...old,[x.code]:v}))}/>
    {invoiceQuantities[x.code]!==undefined&&invoiceQuantities[x.code]!==""?<ThemedText style={Number(invoiceQuantities[x.code])-x.total===0?styles.muted:styles.error}>Variance (invoice − receipts): {(Number(invoiceQuantities[x.code])-x.total).toFixed(2)}</ThemedText>:null}
   </View>)}
   {mixedMode?<ThemedText style={styles.error}>Combined GRV posting is disabled until the server supports atomic linking, partial matching and new stock receipt posting. Preview only — no database writes.</ThemedText>:null}
  </View>
  {!mixedMode&&selectedLines.length>0?<View style={styles.form}>
   <ThemedText style={styles.bold}>Match invoice to {selectedLines[0].delivery_note}</ThemedText>
   <ThemedText>Supplier Invoice Number</ThemedText><TextInput style={styles.input} value={invoice} onChangeText={setInvoice}/>
   <ThemedText>Invoice Date (DD/MM/YYYY)</ThemedText><TextInput style={styles.input} value={date} onChangeText={setDate}/>
   {selectedLines.map(l=><View key={l.line_id} style={styles.line}><ThemedText style={styles.bold}>{l.item_name} · {l.quantity} {l.base_unit}</ThemedText><ThemedText>Actual unit purchase price (USD)</ThemedText><TextInput keyboardType="decimal-pad" style={styles.input} value={prices[l.line_id]??""} onChangeText={v=>setPrices(p=>({...p,[l.line_id]:v}))}/></View>)}
   <Pressable disabled={!valid||busy} style={[styles.submit,(!valid||busy)&&styles.disabled]} onPress={()=>void post()}><ThemedText style={styles.submitText}>Confirm GRV — Match Invoice</ThemedText></Pressable>
  </View>:null}
 </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},heading:{fontWeight:"700",fontSize:22,color:jsplColors.primaryDark},reconcileRow:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:jsplSpacing.md,paddingVertical:jsplSpacing.sm,borderBottomWidth:1,borderColor:jsplColors.border},productReview:{padding:jsplSpacing.md,gap:jsplSpacing.sm,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.sm},qtyInput:{width:110},actions:{flexDirection:"row",flexWrap:"wrap",gap:jsplSpacing.sm},pickerSection:{backgroundColor:jsplColors.surface,padding:jsplSpacing.lg,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,gap:jsplSpacing.md},growerFilters:{flexDirection:"row",flexWrap:"wrap",gap:jsplSpacing.sm},growerButton:{minHeight:jsplSizes.buttonHeight,justifyContent:"center",paddingHorizontal:jsplSpacing.lg,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.sm,backgroundColor:jsplColors.surface},growerActive:{backgroundColor:jsplColors.primary,borderColor:jsplColors.primary},growerText:{color:jsplColors.text},growerActiveText:{color:jsplColors.surface,fontWeight:"700"},muted:{color:jsplColors.textSecondary},bold:{fontWeight:"700"},button:{minHeight:jsplSizes.buttonHeight,justifyContent:"center",paddingHorizontal:jsplSpacing.md,alignSelf:"flex-start",borderColor:jsplColors.border,borderWidth:1,borderRadius:jsplRadii.sm},form:{backgroundColor:"#fff",borderWidth:1,borderColor:jsplColors.border,borderRadius:8,padding:14,gap:9},line:{borderTopWidth:1,borderColor:jsplColors.border,paddingTop:9,gap:5},input:{minHeight:jsplSizes.inputHeight,borderWidth:1,borderRadius:jsplRadii.sm,borderColor:jsplColors.border,paddingHorizontal:jsplSpacing.md,paddingVertical:9,color:jsplColors.text,backgroundColor:jsplColors.surface},submit:{backgroundColor:jsplColors.primary,padding:15,alignSelf:"flex-start",borderRadius:6},disabled:{opacity:0.5},submitText:{color:"white",fontWeight:"700"},error:{color:jsplColors.danger}});
