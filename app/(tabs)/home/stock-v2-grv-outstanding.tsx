import {StockV2Header} from "@/components/jspl/StockV2Header";
import {useEffect,useMemo,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {displayJsplDate} from "@/utils/jspl-input";
import {jsplColors,jsplSpacing,jsplRadii} from "@/constants/jspl-design";
const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Line={document_id:number;document_date:string;delivery_note:string;delivery_note_date:string|null;supplier_name:string;owner_code:string;item_code:string;item_name:string;base_unit:string;line_id:number;quantity:number;original_price:number|null;po_price?:number|null;original_price_source?:string|null};
const dateISO=(v:string)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());if(!m)return null;const iso=m[3]+"-"+m[2]+"-"+m[1];const d=new Date(iso+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;};
const formatDate=(v:string|null|undefined)=>{if(!v)return "—";const s=String(v);if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4);return /^\d{2}\/\d{2}\/\d{4}$/.test(s)?s:"—";};
const shortDNote=(x:Line)=>/^(?:DEMO-)?DN-[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(x.delivery_note)?String(x.document_id):x.delivery_note;
export default function GRVOutstanding(){
 const [rows,setRows]=useState<Line[]>([]),[owner,setOwner]=useState(""),[supplier,setSupplier]=useState("");
 const [date,setDate]=useState(""),[invoice,setInvoice]=useState("");
 const [prices,setPrices]=useState<Record<number,string>>({});
 const [checked,setChecked]=useState<number[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=async()=>{setBusy(true);try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");const r=await fetch(endpoint+"?outstanding_dnotes=1",{headers:{authorization:"Bearer "+session.access_token}});const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load outstanding D Notes");setRows(d.rows??[]);}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 const owners=["JS","AO"];
 const ownerCount=(code:string)=>new Set(rows.filter(x=>x.owner_code===code).map(x=>x.document_id)).size;
 const suppliers=useMemo(()=>[...new Set(rows.filter(x=>x.owner_code===owner).map(x=>x.supplier_name))].sort(),[rows,owner]);
 const outstanding=rows.filter(x=>x.owner_code===owner&&x.supplier_name===supplier).sort((a,b)=>String(a.delivery_note_date||a.document_date).localeCompare(String(b.delivery_note_date||b.document_date))||a.document_id-b.document_id||a.line_id-b.line_id);
 const included=outstanding.filter(x=>checked.includes(x.line_id));
 const documentReady=!!dateISO(date)&&!!invoice.trim();
 const valid=documentReady&&included.length>0&&included.every(x=>Number.isFinite(Number(prices[x.line_id]))&&Number(prices[x.line_id])>0);
 const setPrice=(id:number,v:string)=>setPrices(p=>({...p,[id]:v}));
 const submit=async()=>{setError("");if(!valid){setError(!dateISO(date)?"Enter a valid date (DD/MM/YYYY).":!invoice.trim()?"Enter the supplier invoice number.":!included.length?"Tick the D Note lines included on this invoice.":"Every entered price must be greater than zero.");return;}if(busy)return;setBusy(true);
 try{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Sign in required");
  const grouped=new Map<string,{item_code:string;invoice_quantity:number;unit_price:number}>();
  for(const line of included){const price=Number(prices[line.line_id]);const prev=grouped.get(line.item_code);if(prev&&prev.unit_price!==price)throw Error("Different prices for the same product must be invoiced separately.");grouped.set(line.item_code,{item_code:line.item_code,invoice_quantity:(prev?.invoice_quantity??0)+Number(line.quantity),unit_price:price});}
  const payload={owner_code:owner,supplier,invoice_number:invoice.trim(),invoice_date:dateISO(date),receipt_date:dateISO(date),invoice_lines:[...grouped.values()],allocations:included.map(x=>({line_id:x.line_id,quantity:Number(x.quantity)})),new_receipts:[],po_allocations:[]};
  const id="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,v=>{const n=Math.floor(Math.random()*16);return(v==="x"?n:(n&3)|8).toString(16)});
  const r=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+session.access_token,"content-type":"application/json"},body:JSON.stringify({action:"combined_grv",request_id:id,payload})});
  const d=await r.json();if(!r.ok)throw Error(d.error||"GRV not posted");
  setSupplier("");setInvoice("");setDate("");setPrices({});setChecked([]);setSuccess("GRV posted. Outstanding D Notes have been valued without receiving stock again.");await load();
 }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const choice=(id:string,selected:boolean,onPress:()=>void,label:string)=><Pressable key={id} onPress={onPress} style={[s.option,selected&&s.active]}><ThemedText style={selected?s.activeText:undefined}>{label}</ThemedText></Pressable>;
 return <ThemedView style={s.root}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  <StockV2Header title="GRV — Outstanding D Notes" onRefresh={()=>void load()}/>
  {busy?<ActivityIndicator/>:null}{error?<ThemedText style={s.warning}>{error}</ThemedText>:null}{success?<ThemedText>{success}</ThemedText>:null}
  <View style={s.panel}><ThemedText style={s.label}>Stock Owner</ThemedText><View style={s.wrap}>{owners.map(x=>choice(x,owner===x,()=>{setOwner(x);setSupplier("");setPrices({});setChecked([]);setDate("");setInvoice("");},x+" ("+ownerCount(x)+")"))}</View></View>
  {!!owner?<View style={s.panel}><ThemedText style={s.label}>Supplier — Outstanding D Notes Only</ThemedText><View style={s.wrap}>{suppliers.map(x=>choice(x,supplier===x,()=>{setSupplier(x);setPrices({});setInvoice("");},x))}</View>{!suppliers.length?<ThemedText>No outstanding D Notes for this owner.</ThemedText>:null}</View>:null}
  {!!supplier?<><View style={s.panel}><View style={s.wrap}><View style={s.field}><ThemedText style={s.label}>Date</ThemedText><TextInput style={[s.input,s.required]} value={date} onChangeText={setDate} placeholder="DD/MM/YYYY"/></View><View style={s.field}><ThemedText style={s.label}>Invoice / GRV Number</ThemedText><TextInput style={[s.input,s.required]} value={invoice} onChangeText={setInvoice} placeholder="Invoice number"/></View></View></View>
  {documentReady?<View style={s.panel}><ThemedText style={s.label}>Outstanding D Notes — tick the lines included on this invoice</ThemedText>
   <ScrollView horizontal><View>
    <View style={s.trow}>{["Select","D Note #","Date (dd/mm/yyyy)","Product","Quantity Received","PO Price","Actual Price"].map((h,i)=><ThemedText key={h} style={[s.tcell,i===2&&s.wide,s.bold]}>{h}</ThemedText>)}</View>
    {outstanding.map(x=><View key={x.line_id} style={s.trow}><Pressable style={s.tcell} onPress={()=>setChecked(old=>old.includes(x.line_id)?old.filter(id=>id!==x.line_id):[...old,x.line_id])}><ThemedText style={{fontSize:22,color:jsplColors.primary}}>{checked.includes(x.line_id)?"☑":"☐"}</ThemedText></Pressable><ThemedText style={s.tcell}>{shortDNote(x)}</ThemedText><ThemedText style={s.tcell}>{formatDate(x.delivery_note_date||x.document_date)}</ThemedText><ThemedText style={[s.tcell,s.wide]}>{x.item_name} ({x.base_unit})</ThemedText><ThemedText style={s.tcell}>{x.quantity} locked</ThemedText><ThemedText style={s.tcell}>{x.po_price==null?"—":Number(x.po_price).toFixed(2)}</ThemedText><TextInput style={[s.tcell,checked.includes(x.line_id)?s.required:null]} editable={checked.includes(x.line_id)} keyboardType="decimal-pad" placeholder={checked.includes(x.line_id)?"Required":"Select first"} value={prices[x.line_id]??""} onChangeText={v=>setPrice(x.line_id,v)}/></View>)}
   </View></ScrollView>
   <ThemedText style={s.muted}>{included.length} line(s) entered. Only checked lines are invoiced; received quantities remain locked.</ThemedText>
   <Pressable style={[s.submit,busy&&s.disabled]} disabled={busy} onPress={()=>void submit()}><ThemedText style={s.submitText}>SAVE INVOICE GRV</ThemedText></Pressable>
  </View>:null}</>:null}
 </ScrollView></ThemedView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.lg,gap:12},panel:{backgroundColor:"#fff",padding:14,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md,gap:9},label:{fontWeight:"700"},muted:{color:jsplColors.textSecondary},warning:{color:jsplColors.danger},wrap:{flexDirection:"row",flexWrap:"wrap",gap:8},option:{borderWidth:1,borderColor:jsplColors.border,padding:11,borderRadius:6},active:{backgroundColor:jsplColors.primary},activeText:{color:"#fff",fontWeight:"700"},field:{minWidth:170,flex:1},input:{borderWidth:1,borderColor:jsplColors.border,backgroundColor:"#fff",padding:10,borderRadius:5,minHeight:42,color:jsplColors.text},required:{borderColor:"#e5a700",borderWidth:2,backgroundColor:"#fff4cb"},submit:{backgroundColor:jsplColors.primary,padding:14,borderRadius:6,alignSelf:"flex-start"},submitText:{color:"#fff",fontWeight:"700"},trow:{flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderColor:"#ddd",minHeight:52},tcell:{width:155,padding:7,fontSize:12,color:"#222"},wide:{width:220},bold:{fontWeight:"700"},disabled:{opacity:0.5}});
