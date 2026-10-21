import {wbParseDate,wbFormatDate,wbToday} from "../utils/wb-date";
import {useEffect,useMemo,useState} from "react";
import {router} from "expo-router";
import {Image,Platform,Pressable,ScrollView,Text,TextInput,View} from "react-native";
import {supabase} from "../supabase";
import {jsplColors as C,jsplSpacing as S,jsplRadii as R} from "../constants/jspl-design";
import {JsplDashboardButton} from "../components/jspl/JsplDashboardButton";

type Dispatch={linked_manual_slips?:string;source_type:string;source_id:string;slip_number:string;dnote_number:string|null;weigh_date:string;net_kg:number;registration_text:string|null;receiving_wb_number:string|null;grv_number:string|null};
const tonnes=(kg:number)=>(Number(kg)/1000).toFixed(3)+" t";
const routes=[
 {title:"Manual WB Entry",description:"Create and allocate manual slips",path:"/weighbridge-manual"},
 {title:"Crop Report",description:"Harvest production by TraceCode",path:"/weighbridge-crop-report"},
 {title:"Delivery Report",description:"Customer WB and GRV records",path:"/weighbridge-delivery-report"},
 {title:"Transporter Report",description:"Seasonal rates, billed loads and GMB transport losses",path:"/weighbridge-transporter-report"},
 {title:"Daily DNotes",description:"Daily slip and allocation report",path:"/weighbridge-daily-dnotes"},
 {title:"Batch Scanner",description:"Scan and read customer documents",path:"/weighbridge-batch-scanner"},
 {title:"Return Reconciliation",description:"Match dispatches and actual returns",path:"/weighbridge-return-reconciliation"},
];
export default function WeighbridgeAdmin(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[rows,setRows]=useState<Dispatch[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[filter,setFilter]=useState("");
 async function load(){setBusy(true);const r=await supabase.from("wb_customer_dispatch_v").select("source_type,source_id,slip_number,dnote_number,weigh_date,net_kg,registration_text,receiving_wb_number,grv_number").order("weigh_date",{ascending:false}).limit(5000);setBusy(false);if(r.error){setError(r.error.message);return;}setRows((r.data||[]) as Dispatch[]);setError("");}
 useEffect(()=>{if(Platform.OS!=="web"){setAllowed(false);return;}let live=true;(async()=>{const u=await supabase.auth.getUser();if(!live)return;if(!u.data.user){setAllowed(false);setError("Sign in first");return;}const p=await supabase.rpc("wb_admin_allowed");if(live){setAllowed(p.data===true&&!p.error);if(p.error)setError(p.error.message)}})();return()=>{live=false}},[]);
 useEffect(()=>{if(allowed)load()},[allowed]);
 const visible=useMemo(()=>rows.filter(x=>[x.dnote_number,x.slip_number,x.registration_text,x.weigh_date].join(" ").toLowerCase().includes(filter.toLowerCase())),[rows,filter]);
 const outDel=rows.filter(x=>!x.receiving_wb_number).length,outGrv=rows.filter(x=>!x.grv_number).length;
 if(Platform.OS!=="web")return <Text>Weighbridge Admin is desktop only.</Text>;
 if(allowed===null)return <Text style={{padding:20}}>Checking Admin access…</Text>;
 if(!allowed)return <Text style={{padding:20,color:C.danger}}>Weighbridge Admin — restricted. {error}</Text>;
 return <ScrollView style={{flex:1,backgroundColor:C.background}} contentContainerStyle={{padding:S.xl,minWidth:980}}>
 <View style={{backgroundColor:C.primaryDark,borderRadius:R.lg,padding:S.xl,flexDirection:"row",alignItems:"center",marginBottom:S.lg}}>
 <Image source={require("../assets/images/jspl_farm_logo.png")} resizeMode="contain" style={{width:80,height:80,marginRight:S.lg,borderRadius:R.md,backgroundColor:C.surface}}/>
 <View style={{flex:1}}><Text style={{color:C.surface,fontSize:29,fontWeight:"800"}}>Weighbridge Management</Text><Text style={{color:"#dce9dc",marginTop:4}}>John Sole (Private) Limited · Customer documents and dispatches</Text></View>
 <Pressable onPress={load} disabled={busy} style={{borderWidth:1,borderColor:"#9cbbaa",borderRadius:R.sm,padding:12}}><Text style={{color:C.surface,fontWeight:"700"}}>{busy?"Loading…":"Refresh"}</Text></Pressable></View>
 <View style={{flexDirection:"row",marginBottom:S.xl}}>
 {([["Out DNote",outDel,"Customer WB information outstanding"],["Out GRV",outGrv,"GRV information outstanding"],["Dispatched loads",rows.length,"WB computer + manual"]] as [string,number,string][]).map(([label,value,note])=><View key={label} style={{flex:1,padding:S.lg,marginRight:S.md,backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:R.md}}>
 <Text style={{color:C.textSecondary,fontWeight:"700"}}>{label}</Text><Text style={{fontSize:34,color:C.primaryDark,fontWeight:"800",marginVertical:5}}>{value}</Text><Text style={{color:C.textSecondary,fontSize:12}}>{note}</Text></View>)}</View>
 {error?<Text style={{color:C.danger,marginBottom:S.md}}>{error}</Text>:null}
 <Text style={{color:C.primaryDark,fontSize:19,fontWeight:"800",marginBottom:S.md}}>Weighbridge modules</Text>
 <View style={{flexDirection:"row",flexWrap:"wrap",marginBottom:S.lg}}>{routes.map(r=><View key={r.path} style={{width:"24%",marginRight:"1%",marginBottom:S.md}}><JsplDashboardButton title={r.title} description={r.description} onPress={()=>router.push(r.path as any)}/></View>)}</View>
 <View style={{backgroundColor:C.surface,padding:S.lg,borderWidth:1,borderColor:C.border,borderRadius:R.md}}>
 <View style={{flexDirection:"row",alignItems:"center",marginBottom:S.md}}><Text style={{fontSize:19,fontWeight:"800",color:C.primaryDark,flex:1}}>Delivery document status</Text><TextInput placeholder="Search DNote, slip or truck" value={filter} onChangeText={setFilter} style={{width:280,padding:10,borderWidth:1,borderColor:C.border,borderRadius:R.sm,color:C.text}}/></View>
 <View style={{flexDirection:"row",backgroundColor:C.successTint,padding:10}}>{([["DNote",210],["Slip",90],["Date",115],["Truck",135],["Weight",115],["Customer WB",145],["GRV",135]] as [string,number][]).map(([s,w])=><Text key={s} style={{width:w,color:C.primaryDark,fontWeight:"800"}}>{s}</Text>)}</View>
 {visible.map(row=><Pressable key={row.source_type+":"+row.source_id} onPress={()=>router.push("/weighbridge-delivery-report")} style={{flexDirection:"row",padding:10,borderBottomWidth:1,borderColor:C.border}}>
 {([ [row.dnote_number||"—",210],[row.slip_number,90],[wbFormatDate(row.weigh_date),115],[row.registration_text||"—",135],[tonnes(row.net_kg),115],[row.receiving_wb_number||"Outstanding",145],[row.grv_number||"Outstanding",135]] as [string,number][]).map(([v,w],i)=><Text key={i} style={{width:w,color:i>=5&&v==="Outstanding"?C.danger:C.text}}>{v}</Text>)}
 </Pressable>)}
 {!busy&&!visible.length?<Text style={{padding:14,color:C.textSecondary}}>No matching dispatch records.</Text>:null}
 <Text style={{color:C.textSecondary,marginTop:S.md,fontSize:12}}>Out DNote and Out GRV are independent. Returning grain to stock does not clear required customer paperwork. Open the Delivery Report to enter or match customer documents.</Text>
 </View></ScrollView>;
}