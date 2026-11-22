import { supabase } from "@/supabase";
import { verifiedIrrigationRoles } from "@/utils/irrigation-access";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { jsplColors as C } from "@/constants/jspl-design";
import { displayJsplDate } from "@/utils/jspl-input";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

type PanReading = { irrigation_pan_id: number; irrigation_pan_date: string; irrigation_pan_reading: number };
export default function PanReadings() {
  const [rows, setRows] = useState<PanReading[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const back = () => router.replace("/(tabs)/irrigation_main_dashboard");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const roles = await verifiedIrrigationRoles(supabase);
      const canRead = roles.includes("admin") || roles.includes("irrigation");
      setAllowed(canRead);
      if (!canRead) throw new Error("Irrigation access is not assigned.");
      const { data, error: queryError } = await supabase.from("irrigation_pan")
        .select("irrigation_pan_id,irrigation_pan_date,irrigation_pan_reading")
        .order("irrigation_pan_date", { ascending: false })
        .order("irrigation_pan_id", { ascending: false })
        .limit(1000);
      if (queryError) throw queryError;
      setRows((data ?? []) as PanReading[]);
    } catch (e: any) { setError(e?.message ?? "Could not load pan readings."); }
    finally { setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);
  return <View style={styles.screen}>
    <JsplModuleHeader title="Pan Readings" backLabel="Back to Irrigation" onBack={back} />
    <View style={styles.heading}>
      <Text style={styles.subheading}>History · newest first</Text>
      {allowed && !busy ? <Pressable style={styles.button} onPress={() => router.push("/(tabs)/home/irrigation/pan-reading-add")}>
        <Text style={styles.buttonText}>Add Pan Reading</Text>
      </Pressable> : null}
    </View>
    {busy ? <ActivityIndicator style={{marginTop:28}}/> :
      error ? <View style={{padding:20}}><Text style={styles.error}>{error}</Text><Pressable onPress={refresh}><Text>Retry</Text></Pressable></View> :
      <FlatList data={rows} keyExtractor={x=>String(x.irrigation_pan_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}
        ListHeaderComponent={<View style={[styles.record,styles.tableHeader]}><Text style={styles.headerText}>Date</Text><Text style={styles.headerText}>Pan reading (mm)</Text></View>}
        renderItem={({item})=><View style={styles.record}>
          <Text style={styles.date}>{displayJsplDate(item.irrigation_pan_date)}</Text>
          <Text style={styles.amount}>{Number(item.irrigation_pan_reading).toFixed(1)}</Text>
        </View>}
        ListEmptyComponent={<Text style={styles.empty}>No pan readings recorded.</Text>}
        contentContainerStyle={{paddingBottom:40}}
      />}
  </View>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:C.background,padding:16},
  heading:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:12,marginVertical:16},
  subheading:{color:C.textSecondary,fontWeight:"700"},
  button:{padding:12,paddingHorizontal:18,backgroundColor:C.primaryDark,borderRadius:8},
  buttonText:{color:"#fff",fontWeight:"800"},
  record:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",padding:14,borderBottomWidth:1,borderColor:C.border,backgroundColor:"#fff"},
  tableHeader:{backgroundColor:"#eaf0ec"},
  headerText:{color:C.primaryDark,fontWeight:"800"},
  date:{fontWeight:"700",color:C.text},
  amount:{fontWeight:"800",fontSize:16,color:C.text},
  error:{color:"#b00020"},
  empty:{color:C.textSecondary,padding:20},
});
