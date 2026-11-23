import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import {useEffect, useState} from "react";
import {stockParent} from "@/utils/stock-navigation";
import { router, useLocalSearchParams } from "expo-router";
import { jsplColors as C, jsplRadii as R, jsplSpacing as S } from "@/constants/jspl-design";

type Props={title:string; dashboard?:boolean; stockRoot?:boolean; allowMain?:boolean; backLabel?:string; onStock?:()=>void; onRefresh?:()=>void;};
export function StockV2Header({title,dashboard=false,stockRoot=false,allowMain=false,backLabel,onStock,onRefresh}:Props){
  const params=useLocalSearchParams<{from?:string; returnTo?:string; job?:string; trip?:string; fromSpray?:string}>();
  const [mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]);
  const parent=stockParent(mounted?params:{},dashboard);
  const goBack=onStock??(()=>stockRoot?router.replace('/(tabs)/main-dashboard'):router.replace(parent.href));
  return <View style={styles.header}>
    <Image source={require("../../assets/images/jspl_farm_logo.png")} resizeMode="contain" style={styles.logo}/>
    <View style={styles.left}>
      <Text style={styles.title}>{title}</Text>
    </View>
    <View style={styles.actions}>
        {!stockRoot||allowMain?<Pressable accessibilityRole="button" style={styles.button} onPress={goBack}>
          <Text style={styles.buttonText}>{backLabel??(stockRoot?"← Main":parent.label)}</Text>
        </Pressable>:null}
        {!dashboard&&onRefresh?<Pressable accessibilityRole="button" style={styles.button} onPress={onRefresh}><Text style={styles.buttonText}>↻ Refresh</Text></Pressable>:null}
    </View>
  </View>;
}
const styles=StyleSheet.create({
 header:{backgroundColor:C.primaryDark,flexDirection:"row",flexWrap:"wrap",alignItems:"center",borderRadius:R.lg,padding:S.lg,gap:S.md,marginBottom:S.md},
 left:{flexBasis:150,flexGrow:1,flexShrink:1,gap:S.sm},title:{fontSize:20,color:"#fff",fontWeight:"800"},
 actions:{maxWidth:"100%",flexDirection:"row",flexWrap:"wrap",gap:S.sm,alignItems:"center",justifyContent:"flex-end"},
 button:{borderColor:"#A8CAB3",borderWidth:1,borderRadius:R.sm,paddingHorizontal:13,paddingVertical:8},
 buttonText:{color:"#fff",fontWeight:"700"},logo:{width:64,height:64}
});
