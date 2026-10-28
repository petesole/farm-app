import {StockV2Header} from "@/components/jspl/StockV2Header";
import {useEffect,useRef,useState} from "react";
import {useLocalSearchParams,useRouter} from "expo-router";
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,View} from "react-native";
import {ThemedText} from "@/components/themed-text";
import {ThemedView} from "@/components/themed-view";
import {jsplColors,jsplSpacing,jsplRadii,jsplSizes} from "@/constants/jspl-design";
import {supabase} from "../../../supabase";

const endpoint="https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow";
type Movement={transaction_date:string;trans_id:number;description:string;stock_in:number;stock_out:number;stock_pos:number;unit_price:number|null;price_basis:string;document_number:string};
type Result={item:{item_name:string;base_unit:string}|null;movements:Movement[]};
const fmt=(n:number)=>n.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:3});
export default function StockV2MovementReport(){
 const router=useRouter();
 const params=useLocalSearchParams<{item_code?:string;owner?:string}>();
 const itemCode=typeof params.item_code==="string"?params.item_code:"";
 const owner=params.owner==="AO"?"AO":"JS";
 const [result,setResult]=useState<Result|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const scroll=useRef<ScrollView>(null);
 useEffect(()=>{let active=true;async function load(){
  setLoading(true);setError("");try{
   const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw Error("Supabase sign-in required");
   const res=await fetch(endpoint+"?movement_item="+encodeURIComponent(itemCode)+"&owner="+encodeURIComponent(owner),{headers:{authorization:"Bearer "+session.access_token}});
   const data=await res.json();if(!res.ok)throw Error(data.error||"Unable to load movements");
   if(active)setResult(data);
  }catch(e){if(active)setError(e instanceof Error?e.message:String(e))}finally{if(active)setLoading(false)}
 }void load();return()=>{active=false}},[itemCode,owner]);
 const rows=result?.movements??[];
 return <ThemedView style={styles.root}>
  <StockV2Header title="Stock Movement Report"/>
  <View style={styles.header}><ThemedText style={styles.heading}>Stock Movement Report</ThemedText><ThemedText style={styles.sub}>{result?.item?.item_name??itemCode} · {result?.item?.base_unit??""} · {owner} / TEST_WH</ThemedText></View>
  {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:<ScrollView horizontal contentContainerStyle={{flexGrow:1}}>
   <ScrollView ref={scroll} style={styles.list} onContentSizeChange={()=>scroll.current?.scrollToEnd({animated:false})}>
    <View style={styles.table}>
     <View style={styles.rowHead}>
      <ThemedText style={[styles.col,styles.date,styles.bold]}>Transaction Date</ThemedText><ThemedText style={[styles.col,styles.id,styles.bold]}>Trans ID</ThemedText><ThemedText style={[styles.col,styles.desc,styles.bold]}>Description</ThemedText><ThemedText style={[styles.col,styles.price,styles.bold]}>Unit Price (USD)</ThemedText><ThemedText style={[styles.col,styles.number,styles.bold]}>Stock In</ThemedText><ThemedText style={[styles.col,styles.number,styles.bold]}>Stock Out</ThemedText><ThemedText style={[styles.col,styles.number,styles.bold]}>Stock Pos</ThemedText>
     </View>
     {rows.length===0?<ThemedText style={styles.empty}>No posted movements for this product in the test warehouse.</ThemedText>:rows.map((m,i)=><View key={m.document_number+":"+m.trans_id+":"+i} style={[styles.row,i%2===1&&styles.alt]}>
      <ThemedText style={[styles.col,styles.date]}>{m.transaction_date.slice(8,10)+"/"+m.transaction_date.slice(5,7)+"/"+m.transaction_date.slice(0,4)}</ThemedText>
      <ThemedText style={[styles.col,styles.id]}>{m.trans_id}</ThemedText>
      <ThemedText style={[styles.col,styles.desc]}>{m.description}</ThemedText>
      <View style={[styles.col,styles.price]}><ThemedText style={styles.priceText}>{m.unit_price==null?"Pending":fmt(Number(m.unit_price))}</ThemedText><ThemedText style={styles.priceNote}>{m.stock_in>0?"GRV":m.stock_out>0?m.price_basis:"—"}</ThemedText></View>
      <ThemedText style={[styles.col,styles.number]}>{m.stock_in?fmt(m.stock_in):""}</ThemedText>
      <ThemedText style={[styles.col,styles.number]}>{m.stock_out?fmt(m.stock_out):""}</ThemedText>
      <ThemedText style={[styles.col,styles.number,styles.bold]}>{fmt(m.stock_pos)}</ThemedText>
     </View>)}
    </View>
   </ScrollView>
  </ScrollView>}
 </ThemedView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:jsplColors.background},header:{padding:jsplSpacing.lg,gap:8,borderBottomWidth:1,borderColor:jsplColors.border},
 back:{alignSelf:"flex-start",minHeight:jsplSizes.buttonHeight,justifyContent:"center",paddingHorizontal:jsplSpacing.md,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.sm},
 heading:{fontWeight:"700",fontSize:22,color:jsplColors.primaryDark},sub:{color:jsplColors.textSecondary},error:{padding:20,color:jsplColors.danger},
 list:{flex:1},table:{minWidth:1040,padding:12},rowHead:{flexDirection:"row",paddingVertical:9,backgroundColor:"#dce5ed"},row:{flexDirection:"row",paddingVertical:7,borderBottomWidth:1,borderColor:jsplColors.border},alt:{backgroundColor:"#f1f3f5"},
 col:{paddingHorizontal:5},date:{width:135},id:{width:90},desc:{flex:1,minWidth:250},price:{width:145,alignItems:'flex-end'},priceText:{textAlign:'right',fontWeight:'700',color:jsplColors.text},priceNote:{fontSize:11,color:jsplColors.textSecondary,textAlign:'right'},number:{width:110,textAlign:"right"},bold:{fontWeight:"700"},empty:{padding:20,color:jsplColors.textSecondary}
});
