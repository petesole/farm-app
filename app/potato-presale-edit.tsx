import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { supabase } from "@/supabase";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { JsplSearchCombo } from "@/components/jspl/JsplSearchCombo";
import { displayJsplDate, parseJsplDateInput } from "@/utils/jspl-input";
import { jsplColors as C } from "@/constants/jspl-design";

type Ref = {id:number;name:string};
type ContractLine = {size_code:string;pockets:number;price:number};
type Contract={presale_id:string;reference:string;contract_date:string;customer_id:number;tracecode_id:number;notes:string|null;status:string;has_allocations:boolean;lines:ContractLine[]};
type Context={contract:Contract;customers:Ref[];fields:Ref[]};
const sizeNames:[string,string][]=[
 ["LARGE","Large"],["MEDIUM","Medium"],["SMEDIUM","Small-Medium"],["SMALL","Small"],
 ["CHATS","Chats"],["CUTS","Cuts"],["BULLETS","Bullets"],["GREENS","Greens"]
];
const inputStyle={backgroundColor:"white",borderWidth:1,borderRadius:6,borderColor:"#aeb9b4",padding:9,minWidth:125,marginVertical:5} as const;

export default function PotatoPresaleEdit(){
 const params=useLocalSearchParams<{id:string}>();
 const id=typeof params.id==="string"?params.id:"";
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[info,setInfo]=useState("");
 const [initial,setInitial]=useState<Contract|null>(null);
 const [customers,setCustomers]=useState<Ref[]>([]),[fields,setFields]=useState<Ref[]>([]);
 const [reference,setReference]=useState(""),[contractDate,setContractDate]=useState("");
 const [customer,setCustomer]=useState<number|null>(null),[field,setField]=useState<number|null>(null);
 const [notes,setNotes]=useState(""),[reason,setReason]=useState("");
 const [rows,setRows]=useState<Record<string,{qty:string;price:string}>>({});
 const locked=!!initial?.has_allocations;
 async function load(){
  if(!id)throw new Error("Pre-sale contract reference missing");
  const {data,error:e}=await supabase.rpc("potato_presale_edit_context",{p_presale_id:id});
  if(e)throw new Error(e.message);
  const ctx=data as Context;
  setInitial(ctx.contract);setCustomers(ctx.customers||[]);setFields(ctx.fields||[]);
  setReference(ctx.contract.reference);
  setContractDate(displayJsplDate(ctx.contract.contract_date));
  setCustomer(ctx.contract.customer_id);setField(ctx.contract.tracecode_id);
  setNotes(ctx.contract.notes||"");
  setRows(Object.fromEntries(ctx.contract.lines.map(l=>[l.size_code,{qty:String(l.pockets),price:String(l.price)}])));
 }
 useEffect(()=>{let mounted=true;(async()=>{
  try{await load();}catch(e:any){if(mounted)setError(e.message||"Could not load contract");}
  finally{if(mounted)setLoading(false);}
 })();return()=>{mounted=false;};},[id]);
 async function save(){
  setError("");setInfo("");
  if(!initial)return;
  const d=parseJsplDateInput(contractDate);
  if(!reference.trim()||!d||customer===null||field===null||!reason.trim()){
    setError("Reference, date, customer, field and correction reason are required.");return;
  }
  const lines:Record<string,{pockets:number;price:number}>={};
  for(const [code,name] of sizeNames){
   const line=rows[code],q=line?.qty?.trim()||"",p=line?.price?.trim()||"";
   if(!q&&!p)continue;
   if(!/^[1-9][0-9]*$/.test(q)||!/^([0-9]+)(\.[0-9]{1,2})?$/.test(p)||Number(p)<=0){
     setError("Valid quantity and price required for "+name);return;
   }
   lines[code]={pockets:Number(q),price:Number(p)};
  }
  if(!Object.keys(lines).length){setError("At least one contracted size is required");return;}
  setSaving(true);
  try{
   const {data:updatedId,error:e}=await supabase.rpc("potato_presale_update",{
    p_presale_id:id,p_reference:reference.trim(),p_contract_date:d,
    p_customer_id:customer,p_tracecode_id:field,p_lines:lines,p_notes:notes,
    p_reason:reason.trim()
   });
   if(e)throw new Error(e.message);
   if(updatedId!==id)throw new Error("Unexpected contract returned after saving");
   const check=await supabase.rpc("potato_presale_edit_context",{p_presale_id:id});
   if(check.error)throw new Error("Saved but verification failed: "+check.error.message);
   if(check.data?.contract?.reference!==reference.trim() || check.data?.contract?.contract_date!==d)
     throw new Error("Saved contract values could not be verified; check before retrying.");
   setInfo("Contract correction saved and audited.");
   setReason("");
   setInitial(check.data.contract as Contract);
  }catch(e:any){setError(e.message||"Save failed; entries retained.");}
  finally{setSaving(false);}
 }
 if(loading)return <View style={{flex:1,justifyContent:"center",alignItems:"center"}}><ActivityIndicator/></View>;
 return <ScrollView style={{flex:1,backgroundColor:"#f6f7f2"}} contentContainerStyle={{padding:18}}>
  <JsplModuleHeader title="Edit Potato Pre-Sale" subtitle="Audited contract correction"
   backLabel="Back to Potato Market" backHref="/potato-market"/>
  {!!error&&<Text style={{color:C.danger,marginVertical:8}}>{error}</Text>}
  {!!info&&<Text style={{color:C.primaryDark,marginVertical:8}}>{info}</Text>}
  {!!initial&&<View style={{backgroundColor:"white",padding:15,borderRadius:8}}>
    <Text style={{fontWeight:"700",fontSize:19}}>Contract {initial.reference}</Text>
    {locked&&<Text style={{color:C.danger,marginVertical:8}}>
      Graded stock has been allocated. Only contract reference and notes may be amended here.
      Changing contracted quantities, prices, field, customer or date requires a separate stock/financial correction.
    </Text>}
    <Text>Reference</Text><TextInput style={inputStyle} value={reference} onChangeText={setReference}/>
    <Text>Contract date</Text><TextInput style={inputStyle} value={contractDate} editable={!locked} onChangeText={setContractDate}/>
    {locked?<>
      <Text>Customer: {customers.find(c=>c.id===customer)?.name||"—"}</Text>
      <Text>Field: {fields.find(c=>c.id===field)?.name||"—"}</Text>
    </>:<>
      <JsplSearchCombo label="Customer" selector="crop" options={customers.map(c=>({id:c.id,label:c.name,active:true}))}
        value={customer} onChange={v=>setCustomer(v==null?null:Number(v))} placeholder="Select customer"/>
      <JsplSearchCombo label="Field" selector="trace" options={fields.map(c=>({id:c.id,label:c.name,active:true}))}
        value={field} onChange={v=>setField(v==null?null:Number(v))} placeholder="Select active potato field"/>
    </>}
    <Text style={{fontWeight:"700",marginTop:12}}>Sizes / quantities / contract prices</Text>
    {sizeNames.map(([code,name])=><View key={code} style={{flexDirection:"row",gap:9,flexWrap:"wrap",alignItems:"center"}}>
      <Text style={{width:115}}>{name}</Text>
      <TextInput style={{...inputStyle,width:115}} editable={!locked} keyboardType="number-pad"
        placeholder="Pockets" value={rows[code]?.qty||""}
        onChangeText={v=>setRows(p=>({...p,[code]:{qty:v,price:p[code]?.price||""}}))}/>
      <TextInput style={{...inputStyle,width:125}} editable={!locked} keyboardType="decimal-pad"
        placeholder="Price/pocket" value={rows[code]?.price||""}
        onChangeText={v=>setRows(p=>({...p,[code]:{qty:p[code]?.qty||"",price:v}}))}/>
    </View>)}
    <Text>Notes</Text><TextInput style={inputStyle} value={notes} onChangeText={setNotes}/>
    <Text>Reason for correction (mandatory)</Text>
    <TextInput style={inputStyle} value={reason} onChangeText={setReason} placeholder="Why is this contract being corrected?"/>
    <View style={{flexDirection:"row",gap:8,flexWrap:"wrap"}}>
      <Pressable disabled={saving} onPress={save} style={{padding:12,backgroundColor:saving?"#9aa8a0":C.primaryDark,borderRadius:6}}>
        <Text style={{fontWeight:"700",color:"white"}}>{saving?"Saving…":"Save Contract Correction"}</Text>
      </Pressable>
      <Pressable onPress={()=>router.back()} style={{padding:12,borderRadius:6,borderWidth:1,borderColor:"#aeb9b4"}}>
        <Text>Back to Pre-Sale Report</Text>
      </Pressable>
    </View>
   </View>}
 </ScrollView>;
}
