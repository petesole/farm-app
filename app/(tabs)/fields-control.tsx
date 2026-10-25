import {useEffect,useState} from "react";
import {ActivityIndicator,Pressable,ScrollView,Text,View} from "react-native";
import {Redirect,router} from "expo-router";
import {supabase} from "@/supabase";
import {JsplModuleHeader} from "@/components/jspl/JsplModuleHeader";
import {JsplDashboardButton} from "@/components/jspl/JsplDashboardButton";
import {jsplColors as C,jsplSpacing as S} from "@/constants/jspl-design";
export default function FieldsControl(){
 const [allowed,setAllowed]=useState<boolean|null>(null);
 useEffect(()=>{(async()=>{const {data:u,error:ue}=await supabase.auth.getUser();if(ue||!u.user){setAllowed(false);return;}const {data:r,error:e}=await supabase.rpc("my_farm_app_roles");setAllowed(!e&&Array.isArray(r)&&r.some((x:string)=>String(x).trim().toLowerCase()==="admin"));})()},[]);
 if(allowed===null)return <ActivityIndicator/>;
 if(!allowed)return <Redirect href="/(tabs)/fuel"/>;
 const choices:[string,string,string][]=[["Fields","Field records and attributes","field"],["Farm","Farm definitions","farm"],["ZESA","Electricity points","zesa_point"],["Rain Gauge","Rain gauge locations","rain_gauge"],["Field Classification","Field classification choices","field_classification"]];
 return <ScrollView contentContainerStyle={{padding:S.xl,backgroundColor:C.background,flexGrow:1}}>
  <JsplModuleHeader title="Fields Control" showMain/>
  <Pressable onPress={()=>router.replace("/(tabs)/control-panel")} style={{marginBottom:S.lg}}><Text style={{color:C.primary,fontWeight:"700"}}>← Control Panel</Text></Pressable>
  <View style={{flexDirection:"row",flexWrap:"wrap",gap:S.lg}}>
   {choices.map(([title,description,key])=><View key={key} style={{width:250,maxWidth:"100%"}}><JsplDashboardButton title={title} description={description} onPress={()=>key==="field"?router.push("/(tabs)/home/field-master-dashboard"):router.push({pathname:"/(tabs)/field-control-list",params:{kind:key}})}/></View>)}
  </View>
 </ScrollView>;
}
