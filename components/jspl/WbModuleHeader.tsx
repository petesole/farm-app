import type {ReactNode} from "react";
import {Image,Pressable,Text,View} from "react-native";
import {router} from "expo-router";
import {jsplColors as C,jsplRadii as R,jsplSpacing as S} from "../../constants/jspl-design";

/** Shared WB module masthead. Styling only; never affects screen data or forms. */
export function WbModuleHeader({title,subtitle,right}:{title:string;subtitle?:string;right?:ReactNode}){
 return <View style={{backgroundColor:C.primaryDark,borderRadius:R.lg,padding:S.lg,flexDirection:"row",alignItems:"center",marginBottom:S.lg}}>
  <Image source={require("../../assets/images/jspl_farm_logo.png")} resizeMode="contain" style={{width:68,height:68,backgroundColor:C.surface,borderRadius:R.sm,marginRight:S.lg}}/>
  <View style={{flex:1}}><Text style={{fontSize:24,fontWeight:"800",color:C.surface}}>{title}</Text>
  <Text style={{color:"#dce9dc",marginTop:4}}>{subtitle||"John Sole (Private) Limited · Weighbridge"}</Text></View>
  <View style={{alignItems:"flex-end",gap:8}}>
   {right}
   <Pressable accessibilityRole="button" onPress={()=>router.push("/weighbridge")} style={{backgroundColor:C.surface,borderRadius:R.sm,paddingHorizontal:12,paddingVertical:9}}>
    <Text style={{color:C.primaryDark,fontWeight:"700"}}>Back to WB Dashboard</Text>
   </Pressable>
  </View>
 </View>;
}