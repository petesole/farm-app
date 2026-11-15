import {StockV2Header} from "@/components/jspl/StockV2Header";
import {useEffect,useState} from "react";
import {useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,TextInput,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {supabase} from "../../../supabase";
import {jsplColors,jsplSpacing,jsplRadii,jsplSizes} from "@/constants/jspl-design";
const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Supplier={supplier_id:number;supplier_name:string;active:boolean};
export default function Suppliers(){
 const router=useRouter(),[list,setList]=useState<Supplier[]>([]),[current,setCurrent]=useState<Supplier|null>(null),[search,setSearch]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const call=async(action?:string,payload?:Supplier)=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");
 const r=await fetch(endpoint+(action?"":"?supplier_list=1"),{method:action?"POST":"GET",headers:{authorization:"Bearer "+session.access_token,"content-type":"application/json"},...(action?{body:JSON.stringify({action,payload})}:{})});
 const d=await r.json();if(!r.ok)throw Error(d.error||"Supplier request failed");return d};
 const refresh=async()=>{setBusy(true);try{const d=await call();setList(d.suppliers||[])}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 useEffect(()=>{void refresh()},[]);
 const save=async(c:Supplier)=>{setBusy(true);setError("");setNotice("");try{await call("save_supplier",c);setCurrent(null);setNotice("Supplier saved");await refresh()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const button=(label:string,click:()=>void)=><Pressable style={styles.button} onPress={click}><ThemedText>{label}</ThemedText></Pressable>;
 return <ThemedView style={styles.root}><ScrollView contentContainerStyle={styles.page}>
  <StockV2Header title="Stock Suppliers" onRefresh={()=>void refresh()}/> 
  <View style={styles.line}>{button("＋ Add Supplier",()=>setCurrent({supplier_id:0,supplier_name:"",active:true}))}</View>
  <ThemedText style={styles.title}>Manage Suppliers</ThemedText><ThemedText>Editable Stock V2 supplier catalogue, initially copied from the existing supplier list. Existing public and Access supplier records are unchanged.</ThemedText>
  {busy?<ActivityIndicator/>:null}{error?<ThemedText style={styles.error}>{error}</ThemedText>:null}{notice?<ThemedText style={styles.success}>{notice}</ThemedText>:null}
  {current?<View style={styles.panel}>
    <ThemedText style={styles.label}>{current.supplier_id?"Edit Supplier":"New Supplier"}</ThemedText>
    <TextInput style={styles.input} value={current.supplier_name} onChangeText={v=>setCurrent({...current,supplier_name:v})} placeholder="Supplier name"/>
    {button(current.active?"☑ Active":"☐ Inactive",()=>setCurrent({...current,active:!current.active}))}
    <View style={styles.line}>{button("Save Supplier",()=>void save(current))}{button("Cancel",()=>setCurrent(null))}</View>
   </View>:null}
  <TextInput value={search} onChangeText={setSearch} style={styles.input} placeholder="Search suppliers"/>
  {list.filter(s=>s.supplier_name.toLowerCase().includes(search.toLowerCase())).map(s=><View key={s.supplier_id} style={styles.lineRow}>
    <View style={{flex:1}}><ThemedText style={styles.label}>{s.supplier_name}</ThemedText><ThemedText>{s.active?"Active":"Inactive"}</ThemedText></View>
    {button("Edit",()=>setCurrent({...s}))}
    {button(s.active?"Deactivate":"Activate",()=>void save({...s,active:!s.active}))}
  </View>)}
 </ScrollView></ThemedView>
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:jsplColors.background},page:{padding:jsplSpacing.xl,gap:jsplSpacing.lg},title:{fontSize:23,fontWeight:"800",color:jsplColors.primaryDark},line:{flexDirection:"row",flexWrap:"wrap",gap:9,alignItems:"center"},lineRow:{flexDirection:"row",flexWrap:"wrap",gap:12,alignItems:"center",padding:12,borderBottomWidth:1,borderColor:"#d2dbd5",backgroundColor:"#fff"},label:{fontWeight:"700",color:jsplColors.primaryDark},panel:{padding:jsplSpacing.lg,backgroundColor:jsplColors.surface,gap:jsplSpacing.md,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.md},button:{minHeight:jsplSizes.buttonHeight,paddingHorizontal:jsplSpacing.md,justifyContent:"center",borderColor:jsplColors.border,borderWidth:1,borderRadius:jsplRadii.sm,backgroundColor:jsplColors.surface},input:{minHeight:jsplSizes.inputHeight,paddingHorizontal:jsplSpacing.md,borderWidth:1,borderColor:jsplColors.border,backgroundColor:jsplColors.surface,borderRadius:jsplRadii.sm},error:{color:jsplColors.danger},success:{color:jsplColors.primary}});
