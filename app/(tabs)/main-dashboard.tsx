import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { supabase } from "@/supabase";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { JsplDashboardButton } from "@/components/jspl/JsplDashboardButton";
import { jsplColors as C, jsplSpacing as S, formatJsplDate, formatJsplNumber } from "@/constants/jspl-design";

export default function MainDashboard() {
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { if (active) setVerified(false); return; }
        const { data: roles, error } = await supabase.rpc("my_farm_app_roles");
        if (active) setVerified(!error && Array.isArray(roles) && roles.some((r: string) => String(r).trim().toLowerCase() === "admin"));
      } catch { if (active) setVerified(false); }
    })();
    return () => { active = false; };
  }, []);
  const [latest, setLatest] = useState<{name:string;date:string|null;mm:number|null}[]>([]);
  const [rainError, setRainError] = useState("");
  const [rainLoading, setRainLoading] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!verified) return;
    let active = true;
    setRainLoading(true);
    setRainError("");
    void (async () => {
      try {
        const gauges = await supabase.from("rain_gauge").select("rain_gauge_id,rain_gauge").order("rain_gauge");
        if (gauges.error) throw gauges.error;
        const rows = await Promise.all((gauges.data ?? []).map(async gauge => {
          const {data,error} = await supabase.from("rainfall").select("rainfall_date,rainfall_received")
            .eq("rain_gauge_id",gauge.rain_gauge_id).not("rainfall_received","is",null)
            .order("rainfall_date",{ascending:false}).limit(1);
          if (error) throw error;
          return {name:gauge.rain_gauge ?? `Gauge ${gauge.rain_gauge_id}`,date:data?.[0]?.rainfall_date ?? null,mm:data?.[0]?.rainfall_received ?? null};
        }));
        if (active) setLatest(rows);
      } catch {
        if (active) setRainError("Could not load latest rainfall readings.");
      } finally {
        if (active) setRainLoading(false);
      }
    })();
    return () => { active = false; };
  }, [verified]));

  if (verified === null) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  if (!verified) return <Redirect href="/(tabs)/fuel" />;
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: C.background, padding: S.xl }}>
      <JsplModuleHeader title="Main Dashboard" subtitle="John Sole (Private) Limited · Farm Management" />
      <View style={{flexDirection:"row",flexWrap:"wrap",gap:S.lg,alignItems:"flex-start"}}>
      <View style={{flex:1,minWidth:240}}>
      <Text style={{ fontSize: 19, fontWeight: "700", color: C.text, marginBottom: S.xl }}>Select a module</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Trace" description="TraceCode management" onPress={() => router.push("/(tabs)/field-dashboard")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Weighbridge" description="Weighbridge management" onPress={() => router.push("/weighbridge")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Fuel" description="Fuel management" onPress={() => router.push("/(tabs)/fuel")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Stock V2" description="Inputs, purchase orders, receiving, issues and balances" onPress={() => router.push("/(tabs)/stock-test")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Labour" description="Daily labour entry and costing" onPress={() => router.push("/(tabs)/labour")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Rainfall" description="Record readings and view rainfall reports" onPress={() => router.push("/home/rainfall/rainfall_index")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Control Panel" description="Admin setup and management" onPress={() => router.push("/(tabs)/control-panel")} /></View>
      </View>
      </View>
      <View style={{width:320,maxWidth:"100%",marginLeft:"auto",backgroundColor:C.surface,borderColor:C.border,borderWidth:1,borderRadius:8,padding:S.md}}>
        <Text style={{fontWeight:"800",color:C.primaryDark,marginBottom:S.sm}}>Latest Rainfall by Gauge</Text>
        <View style={{flexDirection:"row",backgroundColor:C.successTint,paddingVertical:S.xs}}>
          <Text style={{flex:1,fontWeight:"700"}}>Gauge</Text>
          <Text style={{width:92,fontWeight:"700"}}>Date</Text>
          <Text style={{width:52,textAlign:"right",fontWeight:"700"}}>mm</Text>
        </View>
        {rainError ? <Text accessibilityRole="alert">{rainError}</Text> : rainLoading ? <ActivityIndicator color={C.primary}/> : !latest.length ? <Text>No gauges found.</Text> : latest.map(row => <View key={row.name} style={{flexDirection:"row",paddingVertical:S.xs,borderBottomWidth:1,borderColor:C.border}}>
          <Text style={{flex:1}}>{row.name}</Text>
          <Text style={{width:92}}>{row.date ? formatJsplDate(row.date) : "—"}</Text>
          <Text style={{width:52,textAlign:"right"}}>{row.mm == null ? "—" : formatJsplNumber(Number(row.mm),1)}</Text>
        </View>)}
      </View>
      </View>
    </ScrollView>
  );
}
