import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { supabase } from "@/supabase";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { JsplDashboardButton } from "@/components/jspl/JsplDashboardButton";
import { jsplColors as C, jsplSpacing as S } from "@/constants/jspl-design";

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
  if (verified === null) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  if (!verified) return <Redirect href="/(tabs)/fuel" />;
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: C.background, padding: S.xl }}>
      <JsplModuleHeader title="Main Dashboard" subtitle="John Sole (Private) Limited · Farm Management" />
      <Text style={{ fontSize: 19, fontWeight: "700", color: C.text, marginBottom: S.xl }}>Select a module</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Trace" description="TraceCode management" onPress={() => router.push("/(tabs)/field-dashboard")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Weighbridge" description="Weighbridge management" onPress={() => router.push("/weighbridge")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Fuel" description="Fuel management" onPress={() => router.push("/(tabs)/fuel")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Stock V2" description="Inputs, purchase orders, receiving, issues and balances" onPress={() => router.push("/(tabs)/stock-test")} /></View>
        <View style={{ width: 240, maxWidth: "100%" }}><JsplDashboardButton title="Control Panel" description="Admin setup and management" onPress={() => router.push("/(tabs)/control-panel")} /></View>
      </View>
    </ScrollView>
  );
}
