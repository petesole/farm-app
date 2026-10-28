import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { jsplColors as C, jsplRadii as R, jsplSpacing as S } from "@/constants/jspl-design";

type Props={title:string; dashboard?:boolean; onStock?:()=>void; onRefresh?:()=>void;};
export function StockV2Header({title,dashboard=false,onStock,onRefresh}:Props){
  return <View style={styles.header}>
    <View style={styles.left}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.button} onPress={dashboard?()=>router.replace("/(tabs)/main-dashboard"):onStock??(()=>router.replace("/(tabs)/stock-test"))}>
          <Text style={styles.buttonText}>{dashboard?"← Main":"← Stock"}</Text>
        </Pressable>
        {!dashboard&&onRefresh?<Pressable accessibilityRole="button" style={styles.button} onPress={onRefresh}><Text style={styles.buttonText}>↻ Refresh</Text></Pressable>:null}
      </View>
    </View>
    <Image source={require("../../assets/images/jspl_farm_logo.png")} resizeMode="contain" style={styles.logo}/>
  </View>;
}
const styles=StyleSheet.create({
 header:{backgroundColor:C.primaryDark,flexDirection:"row",alignItems:"center",borderRadius:R.lg,padding:S.lg,gap:S.md,marginBottom:S.md},
 left:{flex:1,gap:S.sm},title:{fontSize:20,color:"#fff",fontWeight:"800"},
 actions:{flexDirection:"row",flexWrap:"wrap",gap:S.sm},
 button:{borderColor:"#A8CAB3",borderWidth:1,borderRadius:R.sm,paddingHorizontal:13,paddingVertical:8},
 buttonText:{color:"#fff",fontWeight:"700"},logo:{width:64,height:64}
});