// app/(tabs)/fuel.tsx
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import { supabase } from "../../supabase";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { JsplDashboardButton } from "@/components/jspl/JsplDashboardButton";
import { jsplColors, jsplSpacing, jsplRadii } from "@/constants/jspl-design";

/** Helpers */
function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDmy(iso: string | null | undefined) {
  const s = String(iso ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function norm(s: string | null | undefined) {
  return (s ?? "").toString().trim().toLowerCase();
}

type DipStage = null | "yesterday_closing" | "today_opening";
type DipTypeMap = Record<number, string>;

type Dashboard = {
  base_date: string;
  base_dip_type_id: number | null;
  base_dip_reading: number;
  issued_base: number;
  received_base: number;
  current_stock: number;

  today: string;
  issued_today_total: number;
  received_today_total: number;

  issued_today_rows: any[];
  received_today_rows: any[];
};

export default function FuelScreen() {
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<DipStage>(null);
  const [dipTypes, setDipTypes] = useState<DipTypeMap>({});
  const [dipReading, setDipReading] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [forcedClosingDate, setForcedClosingDate] = useState<string | null>(null);

  const [dash, setDash] = useState<Dashboard | null>(null);
  const [dashErr, setDashErr] = useState<string | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  const [roleName, setRoleName] = useState<string | null>(null);

  const todayISO = useMemo(() => toISODate(new Date()), []);
  const yesterdayISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toISODate(d);
  }, []);

  const requiredDate =
    stage === "yesterday_closing" ? forcedClosingDate ?? yesterdayISO : todayISO;

  const requiredTypeId = stage === "yesterday_closing" ? 2 : 1;

  const isAdmin = roleName === "admin";
  const canSeeMonthlyAllocations =
    roleName === "admin" || roleName === "manager" || roleName === "fuel";

  const loadDipTypes = async () => {
    const { data } = await supabase
      .from("fuel_dip_type")
      .select("fuel_dip_type_id,fuel_dip_type_name");

    const map: DipTypeMap = {};
    for (const row of data ?? []) {
      map[row.fuel_dip_type_id] = row.fuel_dip_type_name;
    }
    setDipTypes(map);
  };

  const loadMyRoleName = async () => {
    // Only accept roles verified by the database for the current Auth user.
    const { data: identity, error: identityError } = await supabase.auth.getUser();
    if (identityError || !identity.user) {
      setRoleName(null);
      setErr("Please sign in again.");
      return null;
    }
    const { data: roles, error: roleError } = await supabase.rpc("my_farm_app_roles");
    if (roleError || !Array.isArray(roles)) {
      setRoleName(null);
      setErr("Unable to verify your permissions.");
      return null;
    }
    const role = ["admin", "manager", "fuel", "viewer", "irrigation", "scouting", "scout", "scouter"]
      .find((item) => roles.map((value: string) => norm(value)).includes(item)) ?? null;
    setRoleName(role);
    return role;
  };

  const checkRequiredDips = async (currentRole?: string | null) => {
    setLoading(true);
    setErr(null);

    const r = norm(currentRole ?? roleName);

    // ONLY fuel must capture dip
    if (r !== "fuel") {
      setStage(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase.rpc("fuel_missing_closing_days");

    if (Array.isArray(data) && data.length > 0) {
      const missingDate = data[0]?.report_date;
      if (missingDate && missingDate < todayISO) {
        setForcedClosingDate(missingDate);
        setStage("yesterday_closing");
        setLoading(false);
        return;
      }
    }

    setStage(null);
    setLoading(false);
  };

  const loadDashboard = async () => {
    setDashLoading(true);
    const { data } = await supabase.rpc("get_fuel_dashboard");
    setDash(data as Dashboard);
    setDashLoading(false);
  };

  useEffect(() => {
    (async () => {
      await loadDipTypes();
      const r = await loadMyRoleName();
      await checkRequiredDips(r);
    })();
  }, []);

  useEffect(() => {
    if (stage === null && !loading) loadDashboard();
  }, [stage, loading]);

  /** ✅ SAFE RPC SAVE */
  const saveDip = async () => {
    const val = Number(dipReading);
    if (!val) {
      Alert.alert("Enter dip");
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("fuel_insert_dip", {
      p_fuel_dip_date: requiredDate,
      p_fuel_dip_type_id: requiredTypeId,
      p_dip_reading: val,
    });

    setSaving(false);

    if (error) {
      Alert.alert(error.message);
      return;
    }

    await checkRequiredDips(roleName);
  };

  if (loading) {
    return <ActivityIndicator />;
  }

  if (stage !== null) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Fuel Dip Required</ThemedText>

        <TextInput
          style={styles.input}
          value={dipReading}
          onChangeText={setDipReading}
        />

        <Pressable style={styles.button} onPress={saveDip}>
          <ThemedText>Save Dip</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Fuel Dashboard</ThemedText>

      {dash && (
        <ThemedView style={styles.card}>
          <ThemedText>Stock: {dash.current_stock}</ThemedText>
        </ThemedView>
      )}

      <ThemedView style={styles.bottomBar}>
        {isAdmin && (
          <JsplDashboardButton title="Fuel Admin" onPress={() => router.push("/(tabs)/home/fuel_admin_home")} />
        )}

        <JsplDashboardButton title="Fuel Issue" onPress={() => router.push("/(tabs)/home/fuel_issue")} />

        <JsplDashboardButton title="Fuel Received" onPress={() => router.push("/(tabs)/home/fuel_received")} />

        <JsplDashboardButton title="Fuel Unallocated" onPress={() => router.push("/(tabs)/home/fuel_unallocated")} />

        <JsplDashboardButton title="Fuel Report" onPress={() => router.push("/(tabs)/home/fuel_report")} />

        {canSeeMonthlyAllocations && (
          <JsplDashboardButton title="Monthly Allocations" onPress={() => router.push("/(tabs)/home/fuel_monthly_allocations")} />
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: jsplSpacing.lg, gap: jsplSpacing.md, backgroundColor: jsplColors.background },
  card: { borderWidth: 1, borderColor: jsplColors.border, backgroundColor: jsplColors.surface, borderRadius: jsplRadii.md, padding: jsplSpacing.lg },
  input: { borderWidth: 1, borderColor: jsplColors.border, backgroundColor: jsplColors.surface, borderRadius: jsplRadii.md, padding: jsplSpacing.md },
  button: { backgroundColor: jsplColors.primary, borderRadius: jsplRadii.md, padding: jsplSpacing.md },
  bottomBar: { marginTop: jsplSpacing.xl, gap: jsplSpacing.md, backgroundColor: jsplColors.background },
  navBtn: { borderWidth: 1, padding: 12 },
});