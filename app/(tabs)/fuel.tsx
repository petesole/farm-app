import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
// app/(tabs)/fuel.tsx
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
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
  const [dipError, setDipError] = useState<string | null>(null);
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

    const { data, error } = await supabase.rpc("fuel_missing_closing_days");
    if (error) {
      setErr("Unable to check required dips: " + error.message);
      setLoading(false);
      return;
    }

    if (Array.isArray(data) && data.length > 0) {
      const missingDate = data[0]?.report_date;
      if (missingDate && missingDate < todayISO) {
        setForcedClosingDate(missingDate);
        setStage("yesterday_closing");
        setLoading(false);
        return;
      }
    }

    setForcedClosingDate(null);
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

  const saveDip = async () => {
    if (saving) return;
    setDipError(null);
    const trimmed = dipReading.trim();
    const val = Number(trimmed);
    if (!trimmed || !Number.isFinite(val) || val < 0) {
      setDipError("Enter a valid dip reading (zero is allowed).");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("fuel_insert_dip", {
        p_fuel_dip_date: requiredDate,
        p_fuel_dip_type_id: requiredTypeId,
        p_dip_reading: val,
      });
      if (error) {
        setDipError(error.message);
        return;
      }
      setDipReading("");
      await checkRequiredDips(roleName);
    } catch (e: any) {
      setDipError(e?.message || "Could not save the dip. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
        <ThemedText>Checking fuel dips...</ThemedText>
      </ThemedView>
    );
  }

  if (err) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Fuel</ThemedText>
        <ThemedText style={styles.error}>{err}</ThemedText>
        <Pressable style={styles.button} onPress={async () => {
          const role = await loadMyRoleName();
          if (role) await checkRequiredDips(role);
        }}>
          <ThemedText style={styles.buttonText}>Retry</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (stage !== null) {
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <JsplModuleHeader title="Fuel" showMain={isAdmin} />
        <ThemedView style={styles.card}>
          <ThemedText type="title">
            {stage === "yesterday_closing" ? "Closing Fuel Dip Required" : "Opening Fuel Dip Required"}
          </ThemedText>
          <ThemedText style={styles.dipDate}>Date: {isoToDmy(requiredDate)}</ThemedText>
          <ThemedText>
            {stage === "yesterday_closing"
              ? "Record the closing dip for this date before continuing to the Fuel Dashboard."
              : "Record today's opening dip to continue."}
          </ThemedText>
          <ThemedText style={styles.label}>Dip reading</ThemedText>
          <TextInput
            style={styles.input}
            value={dipReading}
            onChangeText={(value) => { setDipReading(value); setDipError(null); }}
            keyboardType="decimal-pad"
            placeholder="Enter dip reading"
            placeholderTextColor="#888"
            editable={!saving}
          />
          {dipError ? <ThemedText style={styles.error}>{dipError}</ThemedText> : null}
          <Pressable style={[styles.button, saving && { opacity: 0.6 }]} disabled={saving} onPress={saveDip}>
            <ThemedText style={styles.buttonText}>{saving ? "Saving..." : "Save Dip"}</ThemedText>
          </Pressable>
        </ThemedView>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <JsplModuleHeader title="Fuel" showMain={isAdmin} />
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
  dipDate: { fontSize: 18, fontWeight: "700", color: jsplColors.primary },
  label: { fontWeight: "700", marginTop: 10 },
  error: { color: "#B42318", fontWeight: "600" },
  buttonText: { color: "#FFFFFF", fontWeight: "700", textAlign: "center" },
});