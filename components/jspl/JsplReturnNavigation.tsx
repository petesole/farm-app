import {useLocalSearchParams,usePathname,useRouter} from "expo-router";
import {Pressable,Text,View} from "react-native";

/** One route-aware return bar for legacy and newer screens. No database or role operations. */
export function JsplReturnNavigation(){
  const pathname=usePathname() ?? "";
  const router=useRouter();
  const params=useLocalSearchParams<{kind?:string}>();
  const path=pathname.toLowerCase();
  if(!path || path==="/" || path.startsWith("/login") || path.startsWith("/pending-access") || path.startsWith("/modal"))return null;
  const isMain=path.endsWith("/main-dashboard") || path.endsWith("/field-dashboard") || path==="/fuel" || path.endsWith("/fuel") || path==="/weighbridge" || path.endsWith("/wb-admin");
  if(isMain)return null;
  let label="Main";
  let target="/(tabs)/main-dashboard";
  if(path.startsWith("/weighbridge-")||path.includes("/wheat-storage-classification")){
    label="Weighbridge";target="/weighbridge";
  }else if(path.includes("vehicle-detail")){
    label="Vehicle Management";target="/(tabs)/vehicle-management";
  }else if(path.includes("vehicle-management") || path.includes("fields-control")){
    label="Control Panel";target="/(tabs)/control-panel";
  }else if((path.includes("field-control-detail")||path.includes("field-control-list"))&&params.kind==="crop"){
    label="Control Panel";target="/(tabs)/control-panel";
  }else if(path.includes("field-control-detail")||path.includes("field-control-list")){
    label="Fields Control";target="/(tabs)/fields-control";
  }else if(path.includes("/home/tracecode-edit")){
    label="Trace Control";target="/(tabs)/field-dashboard";
  }else if(path.includes("/home/field-edit")){
    label="Fields List";target="/(tabs)/home/field-master-dashboard";
  }else if(path.includes("/home/") && /(farm-|field-|crop-|season-|variety-|zesa-point-|rain-gauge-|tracecode-|user-management|control-panel)/.test(path)){
    label="Fields Control";target="/(tabs)/fields-control";
  }else if(path.includes("fuel_")||path.includes("fuel-")||path.includes("/home/fuel")||path.includes("/fuel-planning")){
    label="Fuel";target="/(tabs)/fuel";
  }else if(path.includes("irrigation")||path.includes("rainfall")){
    label="Irrigation";target="/(tabs)/irrigation_main_dashboard";
  }else if(path.includes("scouting")){
    label="Main";target="/(tabs)/main-dashboard";
  }else if(path.includes("control-panel")){
    label="Main";target="/(tabs)/main-dashboard";
  }
  return <View style={{backgroundColor:"#103D2B",paddingHorizontal:18,paddingVertical:9,flexDirection:"row",alignItems:"center",justifyContent:"flex-start"}}>
    <Pressable accessibilityRole="button" onPress={()=>router.replace(target as any)} style={{borderWidth:1,borderColor:"#95BEA0",borderRadius:7,paddingHorizontal:16,paddingVertical:7}}>
      <Text style={{color:"#FFFFFF",fontSize:15,fontWeight:"700"}}>{"← "+label}</Text>
    </Pressable>
  </View>;
}
