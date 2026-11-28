import { JsplDashboardButton } from "@/components/jspl/JsplDashboardButton";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { jsplColors as C, jsplSpacing as S } from "@/constants/jspl-design";
import { supabase } from "@/supabase";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

type Access = "loading" | "pastel" | "admin" | "denied";

export default function PastelDashboard() {
  const [access, setAccess] = useState<Access>("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) {
        if (active) setAccess("denied");
        return;
      }
      const { data: roles, error } = await supabase.rpc("my_farm_app_roles");
      if (!active) return;
      if (error || !Array.isArray(roles)) {
        setAccess("denied");
        return;
      }
      const normalized = roles.map((role: string) => String(role).trim().toLowerCase());
      if (normalized.includes("admin")) setAccess("admin");
      else if (normalized.includes("pastel")) setAccess("pastel");
      else setAccess("denied");
    })();
    return () => { active = false; };
  }, []);

  if (access === "loading") {
    return (
      <ThemedView style={styles.loading}>
        <ActivityIndicator />
      </ThemedView>
    );
  }
  if (access === "denied") return <Redirect href="/login" />;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <JsplModuleHeader title="Pastel Dashboard" showMain={access === "admin"} />
      <ThemedText type="title">Pastel</ThemedText>
      <ThemedText style={styles.subtitle}>Read-only fuel reports</ThemedText>
      <View style={styles.buttons}>
        <JsplDashboardButton
          title="Fuel Report"
          description="Monthly fuel stock, receipts, issues and variances"
          onPress={() => router.push("/(tabs)/home/fuel_report")}
        />
        <JsplDashboardButton
          title="Monthly Allocations"
          description="Fuel by crop, Agri Orange, Mr & Mrs Sole and unplanned trips"
          onPress={() => router.push("/(tabs)/home/fuel_monthly_allocations")}
        />
      </View>
      {access === "admin" && (
        <Pressable style={styles.back} onPress={() => router.replace("/(tabs)/main-dashboard")}>
          <ThemedText>Back to Main</ThemedText>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: S.xl, gap: S.lg, backgroundColor: C.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  subtitle: { opacity: 0.75 },
  buttons: { gap: S.md, maxWidth: 640, width: "100%" },
  back: { alignSelf: "flex-start", borderWidth: 1, borderColor: C.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
});
