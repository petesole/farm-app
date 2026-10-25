import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Redirect, router } from "expo-router";
import { supabase } from "@/supabase";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { JsplDashboardButton } from "@/components/jspl/JsplDashboardButton";
import { jsplColors as C, jsplSpacing as S } from "@/constants/jspl-design";

export default function ControlPanel() {
 const [admin,setAdmin]=useState<boolean|null>(null);
 useEffect(()=>{(async()=>{
   const {data:u,error:ue}=await supabase.auth.getUser();
   if(ue||!u.user){setAdmin(false);return;}
   const {data:r,error:e}=await supabase.rpc("my_farm_app_roles");
   setAdmin(!e&&Array.isArray(r)&&r.some((x:string)=>String(x).toLowerCase()==="admin"));
 })()},[]);
 if(admin===null)return <ActivityIndicator/>;
 if(!admin)return <Redirect href="/(tabs)/fuel"/>;
 return <ScrollView contentContainerStyle={{padding:S.xl,backgroundColor:C.background,flexGrow:1}}>
   <JsplModuleHeader title="Control Panel" subtitle="Admin settings" showMain />
   <View style={{flexDirection:"row",flexWrap:"wrap",gap:S.lg}}>
     <View style={{width:250,maxWidth:"100%"}}><JsplDashboardButton title="Contracts" description="Manage active and inactive contracts" onPress={()=>router.push({pathname:"/(tabs)/field-control-list",params:{kind:"contract"}})}/></View>
     <View style={{width:250,maxWidth:"100%"}}><JsplDashboardButton title="Crop" description="Add, edit and activate crops" onPress={()=>router.push({pathname:"/(tabs)/field-control-list",params:{kind:"crop"}})}/></View>
     <View style={{width:250,maxWidth:"100%"}}><JsplDashboardButton title="Vehicles" description="Add, edit, discontinue or reactivate vehicles" onPress={()=>router.push("/(tabs)/vehicle-management")}/></View>
     <View style={{width:250,maxWidth:"100%"}}><JsplDashboardButton title="Fields & Tracecodes" description="Existing field controls" onPress={()=>router.push("/(tabs)/fields-control")}/></View>
   </View>
 </ScrollView>;
}
