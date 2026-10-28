import {fuelDateISO} from "../fuel_admin_dates";
// app/home/rainfall/rainfall_record.tsx
import { supabase } from "@/supabase";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Gauge = { rain_gauge_id: number; rain_gauge: string | null };
type RainRow = { rain_gauge_id: number; rainfall_received: number };

function isoToDisplay(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function displayToIso(display: string) { return fuelDateISO(display) ?? ""; }

function yesterdayISO() {
  const now = new Date();
  const localYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const y = localYesterday.getFullYear();
  const m = String(localYesterday.getMonth() + 1).padStart(2, "0");
  const d = String(localYesterday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function RainfallRecordScreen() {
  const INDEX_PATH = "/home/rainfall/rainfall_index";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 👇 THIS is your “error / feedback”
  const [status, setStatus] = useState<string>("(status will show here)");

  const [dateDisplay, setDateDisplay] = useState(isoToDisplay(yesterdayISO()));
  const [isAdmin, setIsAdmin] = useState(false);
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [mmByGauge, setMmByGauge] = useState<Record<number, string>>({});

  const loadedRef = useRef(false);
  const isoDate = useMemo(() => displayToIso(dateDisplay), [dateDisplay]);

  const goBack = () => {
    setStatus("↩️ Returning to index…");
    router.replace({
      pathname: INDEX_PATH,
      params: { refresh: String(Date.now()) },
    });
  };

  // Only admins may change the entry date to backfill missing rainfall.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data, error } = await supabase
        .from("app_user_role")
        .select("role_name")
        .eq("user_id", uid);
      if (active && !error) {
        setIsAdmin((data ?? []).some((r) => r.role_name === "admin"));
      }
    })();
    return () => { active = false; };
  }, []);

  // Load gauges once
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      setStatus("⏳ Loading rain gauges…");
      const { data, error } = await supabase
        .from("rain_gauge")
        .select("rain_gauge_id, rain_gauge")
        .order("rain_gauge");

      if (error) {
        setStatus("❌ Failed to load gauges: " + error.message);
        setLoading(false);
        return;
      }

      setGauges((data ?? []) as Gauge[]);
      setLoading(false);
      setStatus("✅ Gauges loaded. Enter mm and press Save.");
    })();
  }, []);

  // Load rainfall for date (only when date is valid)
  useEffect(() => {
    // Never carry values from a previous selected day into the new date.
    setMmByGauge({});
    if (!isoDate) return;
    let active = true;
    (async () => {
      setStatus(`⏳ Loading rainfall for ${isoDate}…`);

      const { data, error } = await supabase
        .from("rainfall")
        .select("rain_gauge_id, rainfall_received")
        .eq("rainfall_date", isoDate);

      if (error) {
        setStatus("❌ Failed loading rainfall: " + error.message);
        return;
      }

      const rows = (data ?? []) as RainRow[];
      const next: Record<number, string> = {};
      for (const r of rows) {
        next[r.rain_gauge_id] = String(r.rainfall_received ?? "");
      }

      if (active) setMmByGauge(next);
      setStatus(`✅ Loaded ${rows.length} existing values for ${isoDate}.`);
    })();
    return () => { active = false; };
  }, [isoDate]);

  const setMm = (id: number, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    setMmByGauge((prev) => ({ ...prev, [id]: cleaned }));
  };

  const onSave = async () => {
    setStatus("✅ Save pressed… preparing payload");

    const iso = displayToIso(dateDisplay);
    if (!iso) {
      setStatus("❌ Invalid date. Use DD/MM/YYYY or D/M (e.g. 5/12).");
      return;
    }

    if (!isAdmin && iso !== yesterdayISO()) {
      setStatus("❌ Only admins may record or correct dates other than yesterday.");
      return;
    }

    const payload = gauges
      .map((g) => {
        const txt = (mmByGauge[g.rain_gauge_id] ?? "").trim();
        if (!txt) return null;

        const mm = Number(txt);
        if (!Number.isFinite(mm) || mm < 0) return null;

        return {
          rain_gauge_id: g.rain_gauge_id,
          rainfall_date: iso,
          rainfall_received: mm,
        };
      })
      .filter(Boolean) as {
      rain_gauge_id: number;
      rainfall_date: string;
      rainfall_received: number;
    }[];

    if (payload.length === 0) {
      setStatus("⚠️ Nothing to save (no mm values entered).");
      return;
    }

    setSaving(true);
    setStatus(`⏳ Saving ${payload.length} rows for ${iso}…`);

    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Supabase timeout (12s)")), 12000)
      );

      const request = supabase
        .from("rainfall")
        .upsert(payload, { onConflict: "rain_gauge_id,rainfall_date" })
        .select("rain_gauge_id, rainfall_date, rainfall_received");

      const result = (await Promise.race([request, timeout])) as any;

      if (result?.error) {
        setStatus("❌ Save failed: " + result.error.message);
        return;
      }

      const savedCount = result?.data?.length ?? payload.length;
      setStatus(`✅ Saved ${savedCount} rows. Returning to index…`);
      goBack();
    } catch (e: any) {
      setStatus("❌ Save crashed: " + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10 }}>{status}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.banner}>RAINFALL RECORD</Text>

        <Text style={styles.label}>Date (DD/MM/YYYY)</Text>
        <TextInput
          value={dateDisplay}
          onChangeText={setDateDisplay}
          editable={isAdmin}
          style={[styles.input, !isAdmin && { backgroundColor: "#f1f3f2" }]}
          keyboardType="numbers-and-punctuation"
        />

        <Text style={{ marginBottom: 8, opacity: 0.7 }}>
          {isAdmin ? "Admin: change the date to add missing historical rainfall or correct a day." : "Daily entry is for yesterday. Contact an admin to correct an earlier date."}
        </Text>

        {/* Header row so it’s obvious + aligns widths */}
        <View style={styles.headerRow}>
          <Text style={styles.colGaugeHeader}>Gauge</Text>
          <Text style={styles.colMmHeader}>mm</Text>
        </View>

        <FlatList
          data={gauges}
          keyExtractor={(g) => String(g.rain_gauge_id)}
          contentContainerStyle={{ paddingBottom: 190 }} // space for bottom status+buttons
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.colGaugeText} numberOfLines={1}>
                {item.rain_gauge ?? `Gauge #${item.rain_gauge_id}`}
              </Text>

              <TextInput
                value={mmByGauge[item.rain_gauge_id] ?? ""}
                onChangeText={(v) => setMm(item.rain_gauge_id, v)}
                placeholder="0"
                keyboardType="decimal-pad"
                style={styles.colMmInput}
              />
            </View>
          )}
        />

        <View style={styles.bottomBar}>
          <Text style={styles.statusText} numberOfLines={3}>
            {status}
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={goBack}
              disabled={saving}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnPrimary, saving && { opacity: 0.6 }]}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={styles.btnPrimaryText}>
                {saving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const MM_COL_W = 90; // 👈 change this number to widen/narrow the mm column

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  banner: {
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 10,
  },

  label: { fontWeight: "800", marginBottom: 6 },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "white",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 10,
  },

  colGaugeHeader: {
    flex: 1,
    fontWeight: "900",
    opacity: 0.7,
  },

  colMmHeader: {
    width: MM_COL_W,
    textAlign: "right",
    fontWeight: "900",
    opacity: 0.7,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 10,
  },

  // 👇 Gauge “column”: fills remaining space
  colGaugeText: {
    flex: 1,
    fontWeight: "700",
  },

  // 👇 MM “column”: fixed width so it looks tidy on phone
  colMmInput: {
    width: MM_COL_W,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 8,
    textAlign: "right",
    backgroundColor: "white",
    fontWeight: "800",
  },

  bottomBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "white",
    zIndex: 999,
    elevation: 10,
    gap: 10,
  },

  statusText: {
    fontWeight: "800",
  },

  btn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },

  btnGhost: {
    borderWidth: 1,
    borderColor: "#bbb",
    backgroundColor: "white",
  },

  btnPrimary: {
    backgroundColor: "#111",
  },

  btnGhostText: { fontWeight: "700" },
  btnPrimaryText: { color: "white", fontWeight: "900" },
});