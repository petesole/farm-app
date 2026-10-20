import {useEffect,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors} from "@/constants/jspl-design";
const url="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Contract={contract_id:number;contract_code:string;contract_name:string;active:boolean};
type Owner={owner_id:number;owner_code:string;owner_name:string;active:boolean;po_required_for_grv:boolean;po_requires_contract:boolean;default_contract_id:number|null;allow_direct_grv:boolean};
type Trace={tracecode_id:number;tracecode_name:string;contract_id:number|null};
const blankContract:Contract={contract_id:0,contract_code:"",contract_name:"",active:true};
const blankOwner:Owner={owner_id:0,owner_code:"",owner_name:"",active:true,po_required_for_grv:true,po_requires_contract:false,default_contract_id:null,allow_direct_grv:false};
export default function StockSetup(){
 const router=useRouter();
 const [contracts,setContracts]=useState<Contract[]>([]),[owners,setOwners]=useState<Owner[]>([]),[traces,setTraces]=useState<Trace[]>([]);
 const [mode,setMode]=useState<"owners"|"contracts"|"traces">("owners");
 const [selectedContract,setSelectedContract]=useState<Contract|null>(null),[selectedOwner,setSelectedOwner]=useState<Owner|null>(null);
 const [traceSearch,setTraceSearch]=useState(""),[traceId,setTraceId]=useState<number|null>(null),[traceContract,setTraceContract]=useState<number|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const request=async(action?:string,payload?:unknown)=>{
  const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");
  const r=await fetch(url+(action?"":"?stock_setup=1"),{method:action?"POST":"GET",headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},...(action?{body:JSON.stringify({action,payload})}:{})});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load stock setup");return d;
 };
 const reload=async()=>{setLoading(true);try{const d=await request();setContracts(d.contracts||[]);setOwners(d.owners||[]);setTraces(d.traces||[])}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}};
 useEffect(()=>{void reload()},[]);
 const save=async(action:string,payload:unknown)=>{setBusy(true);setError("");setNotice("");try{await request(action,payload);setNotice("Saved successfully");setSelectedContract(null);setSelectedOwner(null);await reload()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const button=(label:string,onPress:()=>void,primary=false)=><Pressable onPress={onPress} style={[styles.button,primary&&styles.primary]}><ThemedText style={primary?styles.white:styles.text}>{label}</ThemedText></Pressable>;
 const field=(label:string,value:string,onChange:(v:string)=>void,editable=true)=><View style={styles.field}><ThemedText style={styles.label}>{label}</ThemedText><TextInput style={styles.input} editable={editable} value={value} onChangeText={onChange}/></View>;
 const tick=(label:string,checked:boolean,toggle:()=>void)=><Pressable style={styles.check} onPress={toggle}><ThemedText>{checked?"☑":"☐"} {label}</ThemedText></Pressable>;
 const contractOptions=(value:number|null,onSelect:(v:number|null)=>void,includeNone=true)=><View style={styles.options}>
  {includeNone?button(value===null?"✓ None":"None",()=>onSelect(null)):null}
  {contracts.filter(c=>c.active||c.contract_id===value).map(c=>button((c.contract_id===value?"✓ ":"")+c.contract_code,()=>onSelect(c.contract_id)))}
 </View>;
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <View style={styles.bar}>{button("← Stock Home",()=>router.replace("/(tabs)/stock-test"))}{button("↻ Refresh",()=>void reload())}</View>
  <ThemedText style={styles.title}>Stock V2 · Configuration</ThemedText>
  <ThemedText>Test owners and contracts only. Existing Access records are unchanged.</ThemedText>
  <View style={styles.bar}>{button("Stock Owners",()=>setMode("owners"),mode==="owners")}{button("Contracts",()=>setMode("contracts"),mode==="contracts")}{button("TraceCode Contracts",()=>setMode("traces"),mode==="traces")}</View>
  {loading?<ActivityIndicator/>:null}{error?<ThemedText style={styles.error}>{error}</ThemedText>:null}{notice?<ThemedText style={styles.success}>{notice}</ThemedText>:null}
  {mode==="contracts"?<View style={styles.section}>
   <View style={styles.bar}><ThemedText style={styles.heading}>Contracts</ThemedText>{button("＋ New Contract",()=>setSelectedContract({...blankContract}),true)}</View>
   {contracts.map(c=><View key={c.contract_id} style={styles.item}>
    <View style={{flex:1}}><ThemedText style={styles.label}>{c.contract_code}</ThemedText><ThemedText>{c.contract_name} · {c.active?"Active":"Inactive"}</ThemedText></View>
    {button("Edit",()=>setSelectedContract({...c}))}
    {button(c.active?"Deactivate":"Activate",()=>void save("save_contract",{...c,active:!c.active}))}
   </View>)}
   {selectedContract?<View style={styles.editor}><ThemedText style={styles.heading}>{selectedContract.contract_id?"Edit Contract":"New Contract"}</ThemedText>
    {field("Contract Code",selectedContract.contract_code,v=>setSelectedContract({...selectedContract,contract_code:v}))}
    {field("Contract Name",selectedContract.contract_name,v=>setSelectedContract({...selectedContract,contract_name:v}))}
    {tick("Active",selectedContract.active,()=>setSelectedContract({...selectedContract,active:!selectedContract.active}))}
    <View style={styles.bar}>{button("Save Contract",()=>void save("save_contract",selectedContract),true)}{button("Cancel",()=>setSelectedContract(null))}</View>
   </View>:null}
  </View>:null}
  {mode==="owners"?<View style={styles.section}>
   <View style={styles.bar}><ThemedText style={styles.heading}>Stock Owners</ThemedText>{button("＋ New Owner",()=>setSelectedOwner({...blankOwner}),true)}</View>
   {owners.map(o=><View style={styles.item} key={o.owner_id}>
    <View style={{flex:1}}><ThemedText style={styles.label}>{o.owner_code} · {o.owner_name}</ThemedText><ThemedText>{o.active?"Active":"Inactive"} · {o.allow_direct_grv?"Direct GRV allowed":"PO required for GRV"} · {o.default_contract_id?contracts.find(c=>c.contract_id===o.default_contract_id)?.contract_code:"Select contract on PO"}</ThemedText></View>
    {button("Edit",()=>setSelectedOwner({...o}))}
   </View>)}
   {selectedOwner?<View style={styles.editor}><ThemedText style={styles.heading}>{selectedOwner.owner_id?"Edit Stock Owner":"New Stock Owner"}</ThemedText>
    {field("Owner Code",selectedOwner.owner_code,v=>setSelectedOwner({...selectedOwner,owner_code:v}),!selectedOwner.owner_id)}
    {field("Owner Name",selectedOwner.owner_name,v=>setSelectedOwner({...selectedOwner,owner_name:v}))}
    {tick("Active",selectedOwner.active,()=>setSelectedOwner({...selectedOwner,active:!selectedOwner.active}))}
    {tick("Purchase Order required for GRV",selectedOwner.po_required_for_grv,()=>setSelectedOwner({...selectedOwner,po_required_for_grv:!selectedOwner.po_required_for_grv,allow_direct_grv:selectedOwner.po_required_for_grv}))}
    {tick("Contract required on PO",selectedOwner.po_requires_contract,()=>setSelectedOwner({...selectedOwner,po_requires_contract:!selectedOwner.po_requires_contract}))}
    {tick("Allow Direct GRV",selectedOwner.allow_direct_grv,()=>setSelectedOwner({...selectedOwner,allow_direct_grv:!selectedOwner.allow_direct_grv,po_required_for_grv:selectedOwner.allow_direct_grv}))}
    <ThemedText style={styles.label}>Default Contract (optional)</ThemedText>
    {contractOptions(selectedOwner.default_contract_id,v=>setSelectedOwner({...selectedOwner,default_contract_id:v}))}
    <View style={styles.bar}>{button("Save Owner",()=>void save("save_owner",selectedOwner),true)}{button("Cancel",()=>setSelectedOwner(null))}</View>
   </View>:null}
  </View>:null}
  {mode==="traces"?<View style={styles.section}>
   <ThemedText style={styles.heading}>Independent TraceCode Contract</ThemedText>
   <ThemedText>This is separate from the purchasing contract. No stock-issue matching takes place.</ThemedText>
   {field("Find TraceCode",traceSearch,v=>{setTraceSearch(v);setTraceId(null)})}
   {traceId===null?<ScrollView style={{maxHeight:250}} nestedScrollEnabled>{traces.filter(t=>t.tracecode_name.toLowerCase().includes(traceSearch.trim().toLowerCase())).slice(0,40).map(t=><Pressable key={t.tracecode_id} style={styles.item} onPress={()=>{setTraceId(t.tracecode_id);setTraceContract(t.contract_id)}}><ThemedText>{t.tracecode_name} · {contracts.find(c=>c.contract_id===t.contract_id)?.contract_code||"Not assigned"}</ThemedText></Pressable>)}</ScrollView>:<View style={styles.editor}>
    <ThemedText style={styles.heading}>{traces.find(t=>t.tracecode_id===traceId)?.tracecode_name}</ThemedText>
    {contractOptions(traceContract,setTraceContract,false)}
    <View style={styles.bar}>{button("Save TraceCode Contract",()=>{if(traceContract)void save("save_trace_contract",{tracecode_id:traceId,contract_id:traceContract});else setError("Select a contract")},true)}{button("Change TraceCode",()=>setTraceId(null))}</View>
   </View>}
  </View>:null}
  {busy?<ActivityIndicator/>:null}
 </ScrollView></ThemedView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:"#f4f7f4"},page:{padding:22,gap:15},title:{fontSize:23,fontWeight:"800",color:"#174832"},heading:{fontSize:17,fontWeight:"700",color:"#174832"},bar:{flexDirection:"row",gap:9,flexWrap:"wrap",alignItems:"center"},button:{borderWidth:1,borderColor:"#b8c8bf",paddingHorizontal:12,paddingVertical:9,borderRadius:5,backgroundColor:"#fff"},primary:{backgroundColor:"#1c603e",borderColor:"#1c603e"},text:{color:"#183d2d"},white:{color:"#fff",fontWeight:"700"},section:{backgroundColor:"#fff",padding:16,borderRadius:8,gap:11,borderWidth:1,borderColor:"#d6e1da"},editor:{padding:15,borderWidth:1,borderColor:"#9db6a9",backgroundColor:"#f8fbf8",borderRadius:7,gap:12},item:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:10,borderBottomWidth:1,borderColor:"#e4e8e5",paddingVertical:10},field:{gap:4},label:{fontSize:13,fontWeight:"700",color:"#284d3c"},input:{borderWidth:1,borderColor:"#b8c9bf",backgroundColor:"#fff",padding:10,borderRadius:5,minHeight:40},check:{paddingVertical:8},options:{flexDirection:"row",flexWrap:"wrap",gap:6},error:{color:"#b12530",fontWeight:"600"},success:{color:"#176136",fontWeight:"700"}});
