import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { jsplColors as C, jsplRadii as R, jsplSpacing as S } from "@/constants/jspl-design";

type Props={title:string; dashboard?:boolean; allowMain?:boolean; backLabel?:string; onStock?:()=>void; onRefresh?:()=>void;};
export function StockV2Header({title,dashboard=false,allowMain=false,backLabel,onStock,onRefresh}:Props){
  return <View style={styles.header}>
    <Image source={require("../../assets/images/jspl_farm_logo.png")} resizeMode="contain" style={styles.logo}/>
    <View style={styles.left}>
      <Text style={styles.title}>{title}</Text>
    </View>
    <View style={styles.actions}>
        {!dashboard||allowMain?<Pressable accessibilityRole="button" style={styles.button} onPress={dashboard?()=>router.replace("/(tabs)/main-dashboard"):onStock??(()=>router.replace("/(tabs)/stock-test"))}>
          <Text style={styles.buttonText}>{backLabel??(dashboard?"← Main":"← Stock")}</Text>
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
