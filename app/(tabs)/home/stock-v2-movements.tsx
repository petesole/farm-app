import {StockReport} from "@/components/jspl/StockReport";
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
type Result={item:{item_name:string;base_unit:string}|null;movements:Movement[];current_stock:number};
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
  <View style={styles.header}><View style={styles.productHeading}><View style={{flex:1,minWidth:0}}><ThemedText style={styles.heading}>{result?.item?.item_name??itemCode}</ThemedText><ThemedText style={styles.sub}>{owner} · {result?.item?.base_unit??""}</ThemedText></View><View style={styles.stockBox}><ThemedText style={styles.stockLabel}>Current stock</ThemedText><ThemedText style={styles.stockValue}>{loading?"…":fmt(Number(result?.current_stock??0))} {result?.item?.base_unit??""}</ThemedText></View></View></View>
  {loading?<ActivityIndicator/>:error?<ThemedText style={styles.error}>{error}</ThemedText>:<StockReport title={(result?.item?.item_name??itemCode)+' — '+owner+' Stock Movements'} rows={rows} measures={['stock_in','stock_out']} columns={[
   {key:'transaction_date',title:'Transaction Date',value:r=>r.transaction_date},
   {key:'document',title:'Document',value:r=>r.document_number},
   {key:'description',title:'Description',value:r=>r.description,width:260},
   {key:'unit_price',title:'Unit Price (USD)',value:r=>r.unit_price??'Pending'},
   {key:'stock_in',title:'Stock In',value:r=>Number(r.stock_in)===0?'':Number(r.stock_in)},
   {key:'stock_out',title:'Stock Out',value:r=>Number(r.stock_out)===0?'':Number(r.stock_out)},
   {key:'stock_pos',title:'Stock Position',value:r=>Number(r.stock_pos)}
  ]}/>}

 </ThemedView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:jsplColors.background},header:{padding:jsplSpacing.lg,gap:8,borderBottomWidth:1,borderColor:jsplColors.border},productHeading:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"},stockBox:{padding:12,borderColor:jsplColors.border,borderWidth:1,borderRadius:jsplRadii.md,backgroundColor:"#eaf3ec",minWidth:160},stockLabel:{fontSize:12,color:jsplColors.textSecondary,fontWeight:"700"},stockValue:{fontSize:21,fontWeight:"800",color:jsplColors.primaryDark},
 back:{alignSelf:"flex-start",minHeight:jsplSizes.buttonHeight,justifyContent:"center",paddingHorizontal:jsplSpacing.md,borderWidth:1,borderColor:jsplColors.border,borderRadius:jsplRadii.sm},
 heading:{fontWeight:"800",fontSize:27,color:jsplColors.primaryDark},sub:{color:jsplColors.textSecondary},error:{padding:20,color:jsplColors.danger},
 list:{flex:1},table:{minWidth:1040,padding:12},rowHead:{flexDirection:"row",paddingVertical:9,backgroundColor:"#dce5ed"},row:{flexDirection:"row",paddingVertical:7,borderBottomWidth:1,borderColor:jsplColors.border},alt:{backgroundColor:"#f1f3f5"},
 col:{paddingHorizontal:5},date:{width:135},id:{width:90},desc:{flex:1,minWidth:250},price:{width:145,alignItems:'flex-end'},priceText:{textAlign:'right',fontWeight:'700',color:jsplColors.text},priceNote:{fontSize:11,color:jsplColors.textSecondary,textAlign:'right'},number:{width:110,textAlign:"right"},bold:{fontWeight:"700"},empty:{padding:20,color:jsplColors.textSecondary}
});
