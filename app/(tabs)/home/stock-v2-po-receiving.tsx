import {useLocalSearchParams} from "expo-router";
import {stockMutation,stockRequest} from "@/utils/stock-workflow";
import {StockSelect} from "@/components/jspl/StockWorkflowControls";
import {StockRecovery} from "@/components/jspl/StockWorkflowControls";
import {parseJsplDateInput,displayJsplDate} from "@/utils/jspl-input";
import {StockV2Header} from "@/components/jspl/StockV2Header";
import {useEffect,useMemo,useRef,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {jsplColors,jsplSpacing,jsplRadii} from "@/constants/jspl-design";
type DLine={document_id:number;document_date:string;delivery_note:string;delivery_note_date:string|null;supplier_name:string;owner_code:string;item_code:string;item_name:string;base_unit:string;line_id:number;quantity:number;order_id?:number|null;po_price?:number|null;original_price?:number|null};
type POLine={order_date:string;owner_code:string;order_id:number;order_number:string;supplier_name:string|null;item_code:string;item_name:string;base_unit:string;ordered_quantity:number;received_quantity:number;ordered_unit_price:number|null;status:string;order_line_id:number};
type Supplier={supplier_name:string;active:boolean};
type Product={item_code:string;item_name:string;base_unit:string};
type Chosen={kind:"DN"|"PO"|"DIRECT";key:string;item_code:string;quantity:string;price:string;source:number;max:number;orderLineId?:number};
type ReceiptEntry={item_code?:string;order_line_id?:number;line_id?:number;quantity:number;unit_price?:number};
type MyReceipt={
 id:string;request_number:number;status:"pending"|"returned";decision_reason?:string;town_trip_id?:string|null;
 receipt_action:string;
 payload:{owner_code:string;supplier:string;receipt_date:string;invoice_date?:string;invoice_number?:string;delivery_note?:string;
  source_credit_id?:number|null;credit_link_reason?:string;lines?:ReceiptEntry[];po_allocations?:ReceiptEntry[];allocations?:ReceiptEntry[];invoice_lines?:{item_code:string;unit_price:number}[]};
};
const dateISO=(value:string)=>parseJsplDateInput(value) ?? null;
const money=(n:number)=>Number.isFinite(n)?n.toFixed(2):"0.00";
const shortPO=(id:number)=>"PO-"+id;
const shortDNote=(value:string,id:number)=>{const v=String(value??"").trim();return "D-"+(/^(?:DEMO-)?DN-[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(v)||!v?id:v.replace(/^D(?:N(?:OTE)?)?[-\s#:]*/i,""));};
const shortDate=(value:string|null|undefined)=>{if(!value)return "—";const v=String(value);if(/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4);if(/^\d{2}\/\d{2}\/\d{4}/.test(v))return v.slice(0,10);return "—";};
const supplierKey=(name:string|null|undefined)=>String(name??"").trim().toLowerCase();
export default function GRVOutstanding(){
 const {from,trip,order,owner:initialOwner,supplier:initialSupplier,receipt:receiptId}=useLocalSearchParams<{from?:string;trip?:string;order?:string;owner?:string;supplier?:string;receipt?:string}>();
 const openedReceipt=useRef<string|null>(null);
 const [mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 const tripOrder=mounted&&from==="town-trip"?Number(order):null;
 const [dn,setDn]=useState<DLine[]>([]),[po,setPo]=useState<POLine[]>([]),[products,setProducts]=useState<Product[]>([]);
 const [noPO,setNoPO]=useState(false);
 const [owner,setOwner]=useState(""),[supplier,setSupplier]=useState(""),
 [type,setType]=useState<""|"dnote"|"grv">("");
 useEffect(()=>{
  if(!tripOrder)return;
  setOwner(initialOwner??"");setSupplier(initialSupplier??"");setType(initialSupplier?"dnote":"");
 },[tripOrder,initialOwner,initialSupplier]);
 const [date,setDate]=useState(""),[number,setNumber]=useState("");
 const [chosen,setChosen]=useState<Record<string,Chosen>>({});
 const [myReceipts,setMyReceipts]=useState<MyReceipt[]>([]);
 const [supplierMaster,setSupplierMaster]=useState<Supplier[]>([]);
 const [correction,setCorrection]=useState<MyReceipt|null>(null);
 const setRowField=(row:Chosen,field:"quantity"|"price",value:string)=>setChosen(prev=>prev[row.key]?{...prev,[row.key]:{...prev[row.key],[field]:value}}:prev);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=async()=>{setBusy(true);setError("");try{
  const [x,y,history,master]=await Promise.all([stockRequest("?outstanding_dnotes=1"),stockRequest("?purchasing_feed=1"),stockRequest("?my_receipts=1"),stockRequest("?supplier_list=1")]);
  setDn(x.rows??[]);setPo(y.orders??[]);setProducts((y.items??[]).map((i:Product)=>({item_code:i.item_code,item_name:i.item_name,base_unit:i.base_unit})));
  setMyReceipts(history.receipts??[]);
  setSupplierMaster(master.suppliers??[]);

 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 const owners=[...new Set([...po.filter(line=>line.status==="approved"&&Number(line.ordered_quantity)>Number(line.received_quantity)).map(line=>line.owner_code),...dn.filter(line=>line.quantity>0).map(line=>line.owner_code),...(owner?[owner]:[])])].sort();
 const ownerCount=(code:string)=>new Set(po.filter(x=>x.owner_code===code&&x.status==="approved"&&Number(x.ordered_quantity)>Number(x.received_quantity)).map(x=>x.order_id)).size;
 const suppliers=useMemo(()=>{
  const matchingOrders=po.filter(x=>x.owner_code===owner&&x.status==="approved"&&Number(x.ordered_quantity)>Number(x.received_quantity)
   &&(!tripOrder||Number(x.order_id)===tripOrder));
  const names=matchingOrders.flatMap(x=>x.supplier_name?.trim()?[x.supplier_name.trim()]:[]);
  if(!tripOrder)names.push(...dn.filter(line=>line.owner_code===owner&&line.quantity>0).map(line=>line.supplier_name));
  if(owner==="AO"&&matchingOrders.some(x=>x.supplier_name===null)){
   names.push(...supplierMaster.filter(x=>x.active).map(x=>x.supplier_name));
  }
  return [...new Map(names.map(name=>[supplierKey(name),name])).values()].sort((a,b)=>a.localeCompare(b));
 },[po,dn,owner,supplierMaster,tripOrder]);
 const matchesSupplier=(line:POLine,name:string)=>supplierKey(line.supplier_name)===supplierKey(name)
  || (line.owner_code==="AO"&&line.supplier_name===null&&supplierMaster.some(x=>x.active&&supplierKey(x.supplier_name)===supplierKey(name)));
 const outstandingDN=dn.filter(x=>!tripOrder&&x.owner_code===owner&&supplierKey(x.supplier_name)===supplierKey(supplier));
 const supplierPO=po.filter(x=>x.owner_code===owner&&matchesSupplier(x,supplier)&&x.status==="approved"&&(!tripOrder||Number(x.order_id)===tripOrder));
 const outstandingPO=supplierPO.filter(x=>x.ordered_quantity>x.received_quantity).sort((a,b)=>String(a.order_date).localeCompare(String(b.order_date))||a.order_id-b.order_id||a.order_line_id-b.order_line_id);
 const receivedPending=outstandingDN.reduce((a,x)=>a+Number(x.quantity||0),0);
 const pick=(row:Chosen)=>setChosen(old=>old[row.key]?Object.fromEntries(Object.entries(old).filter(([k])=>k!==row.key)):{...old,[row.key]:row});
 const edit=(key:string,field:"quantity"|"price",value:string)=>setChosen(old=>old[key]?{...old,[key]:{...old[key],[field]:value}}:old);
 const lines=Object.values(chosen);
 const documentReady=!!dateISO(date)&&!!number.trim();
 const hasPO=outstandingPO.length>0;
 const includeRow=(row:Chosen)=>setChosen(prev=>({...prev,[row.key]:prev[row.key]??row}));
 const reopenReceipt=(receipt:MyReceipt)=>{
  const p=receipt.payload,invoice=receipt.receipt_action==="combined_grv",direct=receipt.receipt_action==="unplanned_dnote";
  const restored:Chosen[]=[];
  const priceFor=(item:string,entry:ReceiptEntry)=>String(entry.unit_price??p.invoice_lines?.find(line=>line.item_code===item)?.unit_price??"");
  for(const entry of (invoice?p.po_allocations:p.lines)??[]){
   if(direct&&entry.item_code){
    if(products.some(product=>product.item_code===entry.item_code))restored.push({kind:"DIRECT",key:"DIRECT:"+entry.item_code,item_code:entry.item_code,quantity:String(entry.quantity),price:"",source:0,max:100000});
    continue;
   }
   const row=po.find(line=>Number(line.order_line_id)===Number(entry.order_line_id)&&line.status==="approved"&&line.owner_code===p.owner_code&&matchesSupplier(line,p.supplier)&&Number(line.ordered_quantity)>Number(line.received_quantity));
   if(row)restored.push({kind:"PO",key:"PO:"+row.order_line_id,item_code:row.item_code,quantity:String(entry.quantity),price:priceFor(row.item_code,entry),source:row.order_id,max:Number(row.ordered_quantity)-Number(row.received_quantity),orderLineId:row.order_line_id});
  }
  for(const entry of p.allocations??[]){
   const row=dn.find(line=>Number(line.line_id)===Number(entry.line_id)&&line.owner_code===p.owner_code&&supplierKey(line.supplier_name)===supplierKey(p.supplier));
   if(row)restored.push({kind:"DN",key:"DN:"+row.line_id,item_code:row.item_code,quantity:String(entry.quantity),price:priceFor(row.item_code,entry),source:row.document_id,max:Number(row.quantity)});
  }
  const expected=((invoice?p.po_allocations:p.lines)?.length??0)+(p.allocations?.length??0);
  setError(restored.length===expected?"":"Some original lines are no longer outstanding. Review the remaining lines before resubmitting.");
  setSuccess("");setCorrection(receipt);setOwner(p.owner_code);setSupplier(p.supplier);setType(invoice?"grv":"dnote");
  setDate(displayJsplDate(p.receipt_date??p.invoice_date??""));setNumber(p.invoice_number??p.delivery_note??"");setNoPO(direct);
  setChosen(Object.fromEntries(restored.map(line=>[line.key,line])));
 };
 useEffect(()=>{
  if(!mounted||busy||!receiptId||openedReceipt.current===receiptId)return;
  const receipt=myReceipts.find(item=>item.id===receiptId&&item.status==="returned");
  if(receipt){openedReceipt.current=receiptId;reopenReceipt(receipt);}
 },[mounted,busy,receiptId,myReceipts]);
 const linkedCredit=correction?.payload.source_credit_id&&correction.payload.owner_code===owner&&supplierKey(correction.payload.supplier)===supplierKey(supplier)?correction.payload.source_credit_id:null;
 const cancelCorrection=()=>{setCorrection(null);setChosen({});setSupplier("");setType("");setNumber("");setDate("");setNoPO(false);setError("");};
 const receiptTrip=correction?.town_trip_id??(tripOrder?trip:undefined);
 const correctionReference={...(correction?{replaces_id:correction.id}:{}),...(receiptTrip?{town_trip_id:receiptTrip}:{})};
 const valid=!!owner&&!!supplier&&!!type&&!!dateISO(date)&&!!number.trim()&&lines.length>0&&lines.every(x=>(type==="dnote"?(x.price.trim()===""||(Number.isFinite(Number(x.price))&&Number(x.price)>0)):(x.price.trim()!==""&&Number.isFinite(Number(x.price))&&Number(x.price)>0))&&(x.quantity.trim()!==""&&Number.isFinite(Number(x.quantity))&&Number(x.quantity)>0&&Number(x.quantity)<=x.max))&&(type!=="dnote"||lines.every(x=>x.kind===(noPO?"DIRECT":"PO")));
 const submitCombined=async()=>{if(!valid||busy||type!=="grv")return;setBusy(true);setError("");setSuccess("");try{
  const grouped=new Map<string,{item_code:string;invoice_quantity:number;unit_price:number}>();
  const receipts=new Map<string,{item_code:string;quantity:number}>();
  for(const line of lines){const prior=grouped.get(line.item_code),price=Number(line.price),quantity=Number(line.quantity);
   if(prior&&prior.unit_price!==price)throw Error("Use separate GRVs for different prices of the same product.");
   grouped.set(line.item_code,{item_code:line.item_code,invoice_quantity:(prior?.invoice_quantity??0)+quantity,unit_price:price});
   if(line.kind==="PO"){const v=receipts.get(line.item_code);receipts.set(line.item_code,{item_code:line.item_code,quantity:(v?.quantity??0)+quantity});}
  }
  const payload={...(linkedCredit?{source_credit_id:linkedCredit,credit_link_reason:correction?.payload.credit_link_reason}:{}),owner_code:owner,supplier,invoice_number:number.trim(),invoice_date:dateISO(date),receipt_date:dateISO(date),
   invoice_lines:[...grouped.values()],allocations:lines.filter(x=>x.kind==="DN").map(x=>({line_id:Number(x.key.slice(3)),quantity:Number(x.quantity)})),
   new_receipts:[...receipts.values()],
   po_allocations:lines.filter(x=>x.kind==="PO").map(x=>({order_line_id:x.orderLineId,item_code:x.item_code,quantity:Number(x.quantity)}))};
  await stockMutation("receiving",{action:"combined_grv",payload,...correctionReference});
  setCorrection(null);
  setChosen({});setNumber("");setDate("");setSupplier("");setType("");setSuccess("GRV submitted for admin verification.");await load();
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const submitDNote=async()=>{if(!valid||busy||type!=="dnote")return;
  const selected=lines.filter(x=>x.kind==="PO"),poIds=[...new Set(selected.map(x=>x.source))];
  if(!noPO&&selected.length!==lines.length){setError("Select valid outstanding PO lines.");return;}
  if(noPO&&!lines.every(x=>x.kind==="DIRECT")){setError("Choose unplanned receipt products only.");return;}
  setBusy(true);setError("");setSuccess("");
  try{
   const payload={owner_code:owner,supplier,...(!noPO?{order_id:poIds[0]}:{}),receipt_mode:"dnote",delivery_note:number.trim(),receipt_date:dateISO(date),lines:(noPO?lines:selected).map(x=>({item_code:x.item_code,quantity:Number(x.quantity)}))};
   const multiPayload={owner_code:owner,supplier,delivery_note:number.trim(),receipt_date:dateISO(date),lines:selected.map(x=>({order_line_id:x.orderLineId,quantity:Number(x.quantity),...(x.price.trim()?{unit_price:Number(x.price)}:{})}))};
   await stockMutation("receiving",{action:noPO?"unplanned_dnote":"multi_po_dnote",payload:noPO?payload:multiPayload,...correctionReference});
   setCorrection(null);
   setChosen({});setNumber("");setSupplier("");setType("");setSuccess("D-Note submitted for admin verification.");await load();
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const selection=(id:string,text:string,selected:boolean,onPress:()=>void)=><Pressable key={id} onPress={onPress} style={[s.option,selected&&s.active]}><ThemedText style={selected?s.activeText:undefined}>{text}</ThemedText></Pressable>;
 return <ThemedView style={s.root}><ScrollView contentContainerStyle={s.page}>
   <StockV2Header title="POs Outstanding — Receiving" onRefresh={()=>void load()}/>

  {busy?<ActivityIndicator/>:null}{error?<><ThemedText style={s.warning}>{error}</ThemedText><StockRecovery scope="receiving" onRecovered={()=>void load()}/></>:null}{success?<ThemedText>{success}</ThemedText>:null}
  {correction?<View style={s.panel}><ThemedText>Correcting receipt {correction.request_number} · {correction.decision_reason}</ThemedText>
    {correction.payload.source_credit_id?<ThemedText>{linkedCredit?"This invoice retains its linked supplier credit.":"Changing the owner or supplier removes the original credit link."}</ThemedText>:null}
    {selection("cancel-correction","Cancel correction",false,cancelCorrection)}</View>:myReceipts.map(receipt=><View key={receipt.id} style={s.panel}>
    <ThemedText>Receipt {receipt.request_number} · {receipt.payload.delivery_note??receipt.payload.invoice_number} · {receipt.status==="pending"?"Awaiting verification":"Returned"}</ThemedText>
    {receipt.status==="returned"?<><ThemedText>{receipt.decision_reason}</ThemedText>
      {["combined_grv","multi_po_dnote","unplanned_dnote"].includes(receipt.receipt_action)?selection(receipt.id,"Correct receipt",false,()=>reopenReceipt(receipt)):null}</>:null}
  </View>)}
  {tripOrder?<ThemedText style={s.label}>Town Trip · {shortPO(tripOrder)}</ThemedText>:null}
  <StockSelect label="Stock owner" value={owner} options={owners.map(x=>({id:x,label:x+" ("+ownerCount(x)+")"}))} onChange={v=>{setOwner(String(v??''));setSupplier('');setType('');setChosen({});setNoPO(false)}}/>
  {!!owner?<StockSelect label="Supplier" value={supplier} options={suppliers.map(x=>({id:x,label:x}))} onChange={v=>{setSupplier(String(v??''));setType(!v?'':po.some(line=>line.owner_code===owner&&matchesSupplier(line,String(v))&&line.status==='approved'&&Number(line.ordered_quantity)>Number(line.received_quantity)&&(!tripOrder||Number(line.order_id)===tripOrder))?'dnote':'grv');setChosen({});setNoPO(false)}}/>:null}
  {!!supplier?<StockSelect label="Document type" value={type} options={[{id:'dnote',label:'Delivery Note'},{id:'grv',label:'Invoice GRV'}]} onChange={v=>{setType(v as 'dnote'|'grv');setChosen({});setNoPO(false)}}/>:null}

  {!!type?<View style={s.panel}><ThemedText style={s.label}>Date</ThemedText><TextInput style={[s.input,s.required]} value={date} onChangeText={setDate} onBlur={()=>{const parsed=parseJsplDateInput(date);if(parsed)setDate(displayJsplDate(parsed));}} placeholder="d/m (year optional)"/></View>:null}
  {!!type?<View style={s.panel}><ThemedText style={s.label}>{type==="grv"?"Invoice GRV Number":"Delivery Note Number"}</ThemedText><TextInput style={[s.input,s.required]} value={number} onChangeText={setNumber} placeholder="Enter document number"/></View>:null}
  {!!supplier?<View style={s.panel}>
  <ThemedText style={s.label}>Outstanding documents — tick the lines included in this {type==="grv"?"invoice":"delivery note"}</ThemedText>
  <ScrollView horizontal><View style={{minWidth:1040}}>
   <View style={s.trow}>{["Select","Document","Date (dd/mm/yyyy)","Product","Ordered / Received","PO Price","Actual Qty","Actual Price"].map(h=><ThemedText key={h} style={[s.tcell,h==="Product"&&s.wide,s.bold]}>{h}</ThemedText>)}</View>
   {type==="grv"?outstandingDN.map(x=>{const key="DN:"+x.line_id,e=chosen[key],r:Chosen={kind:"DN",key,item_code:x.item_code,quantity:String(x.quantity),price:"",source:x.document_id,max:x.quantity};return <View key={key} style={s.trow}>
     <Pressable style={s.tcell} onPress={()=>pick(r)}><ThemedText style={{fontSize:22,color:jsplColors.primary}}>{e?"☑":"☐"}</ThemedText></Pressable>
     <ThemedText style={s.tcell}>{shortDNote(x.delivery_note,x.document_id)}</ThemedText><ThemedText style={s.tcell}>{shortDate(x.delivery_note_date||x.document_date)}</ThemedText>
     <ThemedText style={[s.tcell,s.wide]}>{x.item_name}</ThemedText><ThemedText style={s.tcell}>{x.quantity}</ThemedText>
     <ThemedText style={s.tcell}>{x.po_price==null?"—":money(Number(x.po_price))}</ThemedText><TextInput style={s.tcell} keyboardType="decimal-pad" editable={!!e} value={e?.quantity??String(x.quantity)} onChangeText={v=>setRowField(r,"quantity",v)}/>
     <TextInput style={[s.tcell,e?s.required:null]} editable={!!e} keyboardType="decimal-pad" placeholder={e?"Required":"Select first"} value={e?.price??""} onChangeText={v=>setRowField(r,"price",v)}/>
    </View>}):null}
   {!noPO&&outstandingPO.map(x=>{const key="PO:"+x.order_line_id,e=chosen[key],max=Math.max(0,x.ordered_quantity-x.received_quantity),r:Chosen={kind:"PO",key,item_code:x.item_code,quantity:"",price:"",source:x.order_id,max,orderLineId:x.order_line_id};return <View key={key} style={s.trow}>
     <Pressable style={s.tcell} onPress={()=>pick(r)}><ThemedText style={{fontSize:22,color:jsplColors.primary}}>{e?"☑":"☐"}</ThemedText></Pressable>
     <ThemedText style={s.tcell}>{shortPO(x.order_id)}</ThemedText><ThemedText style={s.tcell}>{shortDate(x.order_date)}</ThemedText>
     <ThemedText style={[s.tcell,s.wide]}>{x.item_name}</ThemedText><ThemedText style={s.tcell}>{x.ordered_quantity} / {x.received_quantity}</ThemedText>
     <ThemedText style={s.tcell}>{x.ordered_unit_price??"—"}</ThemedText>
     <TextInput style={[s.tcell,e?s.required:null]} editable={!!e} keyboardType="decimal-pad" placeholder={e?"Max "+max:"Select first"} value={e?.quantity??""} onChangeText={v=>setRowField(r,"quantity",v)}/>
     <TextInput style={[s.tcell,e?(type==="grv"?s.required:s.optional):null]} editable={!!e} keyboardType="decimal-pad" placeholder={type==="grv"?"Required":"Optional"} value={e?.price??""} onChangeText={v=>setRowField(r,"price",v)}/>
    </View>})}
  </View></ScrollView>
  <ThemedText style={s.muted}>{type==="grv"?"Enter the quantity covered by this invoice, up to the uninvoiced balance. Physical receipt quantities stay unchanged. For PO quantities, enter actual quantity and price.":"Enter actual quantities received from POs. Unit price is optional on Delivery Notes."}</ThemedText>
  {noPO?<StockSelect label="Add unplanned product" value={null} options={products.filter(p=>!chosen['DIRECT:'+p.item_code]).map(p=>({id:p.item_code,label:p.item_name+' · '+p.base_unit}))} onChange={v=>{if(v)pick({kind:'DIRECT',key:'DIRECT:'+v,item_code:String(v),quantity:'',price:'',source:0,max:100000})}}/>:null}
  {noPO?lines.map(l=><View key={l.key} style={s.wrap}><ThemedText>{products.find(p=>p.item_code===l.item_code)?.item_name}</ThemedText><TextInput accessibilityLabel={'Receipt quantity '+l.item_code} style={s.input} keyboardType="decimal-pad" value={l.quantity} onChangeText={v=>edit(l.key,'quantity',v)}/><Pressable onPress={()=>pick(l)}><ThemedText>Remove</ThemedText></Pressable></View>):null}
  <ThemedText>{lines.length} line(s) to save — only checked rows will be saved.</ThemedText>
  {!hasPO&&!outstandingDN.length?<ThemedText>No outstanding documents for this supplier.</ThemedText>:null}
  <Pressable disabled={busy} onPress={()=>{setError("");if(!valid){setError(!dateISO(date)?"Enter a valid date.":!number.trim()?"Enter the document number.":!lines.length?"Tick at least one outstanding line.":"Complete all highlighted cells on the selected lines.");return;}if(type==="grv")void submitCombined();else void submitDNote()}} style={[s.submit,busy&&s.disabled]}>
  <ThemedText style={s.submitText}>{type==="grv"?"Submit invoice for verification":"Submit delivery note for verification"}</ThemedText></Pressable>
  </View>:null}
 </ScrollView></ThemedView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},heading:{fontSize:22,fontWeight:"700",color:jsplColors.primaryDark},panel:{backgroundColor:"#fff",padding:14,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,gap:9},label:{fontWeight:"700"},muted:{color:jsplColors.textSecondary},warning:{color:jsplColors.danger},wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},option:{borderWidth:1,borderColor:jsplColors.border,padding:11,borderRadius:6},active:{backgroundColor:jsplColors.primary},activeText:{color:"#fff",fontWeight:"700"},line:{paddingVertical:11,borderBottomWidth:1,borderColor:jsplColors.border,gap:7},field:{minWidth:170,flex:1},input:{borderWidth:1,borderColor:jsplColors.border,backgroundColor:"#fff",padding:10,borderRadius:5,minHeight:42,color:jsplColors.text},required:{borderColor:"#e5a700",borderWidth:2,backgroundColor:"#fff4cb"},optional:{borderColor:"#b3b3b3",borderWidth:1,backgroundColor:"#fff4cb"},submit:{backgroundColor:jsplColors.primary,padding:14,borderRadius:6,alignSelf:"flex-start"},submitText:{color:"#fff",fontWeight:"700"},trow:{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderColor:"#ddd",minHeight:52},tcell:{width:125,padding:7,fontSize:12,color:"#222"},wide:{width:190},bold:{fontWeight:"700"},disabled:{opacity:0.5}});
