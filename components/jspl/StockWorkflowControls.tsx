import {Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {JsplSearchCombo} from './JsplSearchCombo';
import {jsplColors as C} from '@/constants/jspl-design';
import {ApprovalDocument,documentLabel} from '@/utils/stock-workflow';
import {displayJsplDate} from '@/utils/jspl-input';
import {recoverStockSave} from '@/utils/stock-workflow';
import {useState} from 'react';
export const stockStyles=StyleSheet.create({page:{padding:20,gap:14,backgroundColor:C.background},card:{backgroundColor:C.surface,padding:18,borderRadius:12,gap:10,borderWidth:1,borderColor:C.border},row:{flexDirection:'row',gap:12,flexWrap:'wrap',alignItems:'center'},title:{fontSize:20,fontWeight:'800',color:C.primaryDark},text:{color:C.text,fontSize:16},muted:{color:C.textSecondary,fontSize:14},error:{color:'#9C2424',fontSize:16},success:{color:C.primaryDark,fontSize:16},input:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:8,padding:12,minWidth:130,fontSize:16,color:C.text},button:{backgroundColor:C.primaryDark,padding:13,borderRadius:8},buttonText:{color:'#fff',fontWeight:'700',fontSize:16}});
export function StockButton({title,onPress,disabled=false}:{title:string;onPress:()=>void;disabled?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[stockStyles.button,disabled&&{opacity:.45}]}><Text style={stockStyles.buttonText}>{title}</Text></Pressable>}
export function StockField({label,value,onChange,numeric=false}:{label:string;value:string;onChange:(s:string)=>void;numeric?:boolean}){return <View style={{gap:5,flexGrow:1}}><Text style={stockStyles.text}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} keyboardType={numeric?'decimal-pad':'default'} style={stockStyles.input}/></View>}
export function StockSelect({label,value,options,onChange,disabled=false}:{label:string;value:string|number|null;options:{id:string|number;label:string;active?:boolean}[];onChange:(v:string|number|null)=>void;disabled?:boolean}){return <JsplSearchCombo label={label} selector="product" value={value} options={options} onChange={onChange} disabled={disabled}/>}
export function StockRecovery({scope,onRecovered}:{scope:string;onRecovered?:()=>void}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <View style={{gap:8}}><StockButton title="Verify Previous Save" disabled={busy} onPress={()=>{setBusy(true);void recoverStockSave(scope).then(()=>{setMessage('Previous save confirmed. Reopen the saved document before making further changes.');onRecovered?.();}).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}}/>{message?<Text style={stockStyles.text}>{message}</Text>:null}</View>;
}
export function StockDocumentSummary({document:d}:{document:ApprovalDocument}){
 const p=d.payload;
 return <View style={{gap:6}}><Text style={stockStyles.title}>{documentLabel(d)} · {d.status==='applied'&&d.kind==='po'?'Finalised':d.status}</Text>
 <Text style={stockStyles.text}>{p.supplier??p.supplier_name} · {p.owner_code} · {displayJsplDate(p.order_date??p.credit_note_date??'')}</Text>
 {d.kind==='po'?(p.lines??[]).map((l:any,i:number)=><Text key={i} style={stockStyles.text}>{l.item_name??l.item_code} · {l.quantity} × {l.unit_price==null?'Price not set':Number(l.unit_price).toFixed(2)}</Text>):<><Text style={stockStyles.text}>Supplier credit: {Number(p.total_amount).toFixed(2)} · {p.action==='return_credit'?'Returned stock':'Price only'}</Text>{(p.allocations??[]).map((l:any,i:number)=><Text key={i}>{l.item_name??'Return line '+l.return_line_id} · {l.quantity} × {Number(l.unit_credit_price).toFixed(2)}</Text>)}{p.receipt_label?<Text>{p.receipt_label}</Text>:null}{p.reason?<Text>{p.reason}</Text>:null}{p.notes?<Text>{p.notes}</Text>:null}</>}
 {d.received?<Text style={stockStyles.muted}>Locked — stock has been received.</Text>:null}{d.kind==='credit'&&d.status==='applied'?<Text style={stockStyles.muted}>Approved and applied — locked.</Text>:null}{d.decision_reason?<Text style={stockStyles.error}>{d.decision_reason}</Text>:null}
 </View>
}
