import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { jsplColors as C, jsplRadii as R, jsplSpacing as S } from "@/constants/jspl-design";

type Props={title:string; dashboard?:boolean; allowMain?:boolean; backLabel?:string; onStock?:()=>void; onRefresh?:()=>void;};
export function StockV2Header({title,dashboard=false,allowMain=false,backLabel,onStock,onRefresh}:Props){
  const {from}=useLocalSearchParams<{from?:string}>();
  const parent=from==="outstanding-issues"?{label:"← Outstanding Issues",route:"/outstanding-issues" as const}
    :dashboard&&from==="buying"?{label:"← Buying",route:"/buying" as const}
    :dashboard&&from==="stock-dashboard"?{label:"← Stock",route:"/stock-dashboard" as const}:null;
  const goBack=onStock??(parent?()=>{
    if(from!=="stock-dashboard"&&router.canGoBack())router.back();
    else router.replace(parent.route);
  }
    :()=>router.replace(dashboard?"/(tabs)/main-dashboard":"/(tabs)/stock-test"));
  return <View style={styles.header}>
    <Image source={require("../../assets/images/jspl_farm_logo.png")} resizeMode="contain" style={styles.logo}/>
    <View style={styles.left}>
      <Text style={styles.title}>{title}</Text>
    </View>
    <View style={styles.actions}>
        {!dashboard||allowMain||parent||onStock?<Pressable accessibilityRole="button" style={styles.button} onPress={goBack}>
          <Text style={styles.buttonText}>{backLabel??parent?.label??(dashboard?"← Main":"← Stock")}</Text>
        </Pressable>:null}
        {!dashboard&&onRefresh?<Pressable accessibilityRole="button" style={styles.button} onPress={onRefresh}><Text style={styles.buttonText}>↻ Refresh</Text></Pressable>:null}
    </View>
  </View>;
}
const styles=StyleSheet.create({
 header:{backgroundColor:C.primaryDark,flexDirection:"row",alignItems:"center",borderRadius:R.lg,padding:S.lg,gap:S.md,marginBottom:S.md},
 left:{flex:1,gap:S.sm},title:{fontSize:20,color:"#fff",fontWeight:"800"},
 actions:{flexDirection:"row",flexWrap:"wrap",gap:S.sm,alignItems:"center",justifyContent:"flex-end"},
 button:{borderColor:"#A8CAB3",borderWidth:1,borderRadius:R.sm,paddingHorizontal:13,paddingVertical:8},
 buttonText:{color:"#fff",fontWeight:"700"},logo:{width:64,height:64}
});
