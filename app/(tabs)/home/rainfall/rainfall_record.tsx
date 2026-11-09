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

type Gauge = { rain_gauge_id: number; rain_gauge: string | null; active: boolean | null; active_from: string | null; active_to: string | null };
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
  const [savedByGauge, setSavedByGauge] = useState<Record<number, string>>({});
  const [loadedDate, setLoadedDate] = useState("");
  const [reload, setReload] = useState(0);
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [mmByGauge, setMmByGauge] = useState<Record<number, string>>({});

  const loadedRef = useRef(false);
  const isoDate = useMemo(() => displayToIso(dateDisplay), [dateDisplay]);
  const requiredGauges = gauges.filter(gauge =>
    !!isoDate &&
    (!gauge.active_from || gauge.active_from <= isoDate) &&
    (gauge.active_to ? isoDate <= gauge.active_to : gauge.active !== false)
  );

  const goBack = () => {
    setStatus("↩️ Returning to index…");
    router.replace({
      pathname: INDEX_PATH,
      params: { refresh: String(Date.now()) },
    });
  };

  // Load gauges once
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      setStatus("⏳ Loading rain gauges…");
      const { data, error } = await supabase
        .from("rain_gauge")
        .select("rain_gauge_id, rain_gauge, active, active_from, active_to")
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
    setLoadedDate("");
    setSavedByGauge({});
    setMmByGauge({});
    if (!isoDate) return;
    let active = true;
    (async () => {
      setStatus(`⏳ Loading rainfall for ${isoDate}…`);

      const { data, error } = await supabase
        .from("rainfall")
        .select("rain_gauge_id, rainfall_received")
        .eq("rainfall_date", isoDate);

      if (!active) return;
      if (error) {
        setStatus("❌ Failed loading rainfall: " + error.message);
        return;
      }

      const rows = (data ?? []) as RainRow[];
      const next: Record<number, string> = {};
      for (const r of rows) {
        if (r.rainfall_received != null) next[r.rain_gauge_id] = String(r.rainfall_received);
      }

      setSavedByGauge(next);
      setLoadedDate(isoDate);
      setStatus(`✅ Loaded ${rows.length} existing values for ${isoDate}.`);
    })();
    return () => { active = false; };
  }, [isoDate, reload]);

  const setMm = (id: number, value: string) => {
    setMmByGauge((prev) => ({ ...prev, [id]: value }));
  };

  const onSave = async () => {
    setStatus("✅ Save pressed… preparing payload");

    const iso = displayToIso(dateDisplay);
    if (!iso) {
      setStatus("❌ Invalid date. Use DD/MM/YYYY or D/M (e.g. 5/12).");
      return;
    }

    if (loadedDate !== iso || saving) return;
    const payload = [];
    for (const gauge of requiredGauges) {
      const id = gauge.rain_gauge_id;
      if (savedByGauge[id] !== undefined) continue;
      const input = (mmByGauge[id] ?? "").trim();
      if (!input) continue;
      const mm = Number(input.replace(",", "."));
      if (!/^\d+(?:[.,]\d+)?$/.test(input) || !Number.isFinite(mm)) {
        setStatus(`Enter valid millimetres for ${gauge.rain_gauge ?? id}.`);
        return;
      }
      payload.push({ rain_gauge_id: id, rainfall_date: iso, rainfall_received: mm });
    }
    if (!payload.length) {
      setStatus("Enter a reading for at least one missing gauge.");
      return;
    }

    setSaving(true);
    setStatus(`⏳ Saving ${payload.length} rows for ${iso}…`);

    try {
      const { error } = await supabase.from("rainfall").insert(payload);
      if (error) {
        setStatus(error.code === "23505"
          ? "A gauge was already saved. Reload the readings before trying again."
          : "Save could not be confirmed. Reload the readings before retrying. " + error.message);
        return;
      }
      setSavedByGauge(previous => ({
        ...previous,
        ...Object.fromEntries(payload.map(row => [row.rain_gauge_id, String(row.rainfall_received)])),
      }));
      setMmByGauge({});
      setStatus(`Saved ${payload.length} gauge readings.`);
    } catch {
      setStatus("Save could not be confirmed. Reload the readings before retrying.");
    } finally {
      setSaving(false);
    }
  };

  const missing = requiredGauges.filter(gauge => savedByGauge[gauge.rain_gauge_id] === undefined);
  const savedCount = requiredGauges.length - missing.length;

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
          onBlur={()=>{const d=displayToIso(dateDisplay);if(d)setDateDisplay(isoToDisplay(d));}}
          editable={!saving}
          style={styles.input}
          keyboardType="numbers-and-punctuation"
        />

        <Text style={{ marginBottom: 8, opacity: 0.7 }}>
          {loadedDate === isoDate && isoDate && requiredGauges.length > 0
            ? `${savedCount} of ${requiredGauges.length} gauges saved. ${missing.length ? "Still missing: " + missing.map(gauge => gauge.rain_gauge ?? gauge.rain_gauge_id).join(", ") : "Complete."}`
            : "Choose the reading date. Enter 0 for a dry gauge and leave readings you are waiting for blank."}
        </Text>

        {/* Header row so it’s obvious + aligns widths */}
        <View style={styles.headerRow}>
          <Text style={styles.colGaugeHeader}>Gauge</Text>
          <Text style={styles.colMmHeader}>mm</Text>
        </View>

        <FlatList
          data={requiredGauges}
          ListEmptyComponent={isoDate ? <Text>No gauges required for this date.</Text> : null}
          keyExtractor={(g) => String(g.rain_gauge_id)}
          contentContainerStyle={{ paddingBottom: 190 }} // space for bottom status+buttons
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.colGaugeText} numberOfLines={1}>
                {item.rain_gauge ?? `Gauge #${item.rain_gauge_id}`}
              </Text>

              <TextInput
                accessibilityLabel={`${item.rain_gauge ?? "Gauge"} millimetres`}
                value={savedByGauge[item.rain_gauge_id] ?? mmByGauge[item.rain_gauge_id] ?? ""}
                editable={!saving && loadedDate === isoDate && savedByGauge[item.rain_gauge_id] === undefined}
                onChangeText={(v) => setMm(item.rain_gauge_id, v)}
                placeholder="—"
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

          <Pressable accessibilityRole="button" disabled={saving || !isoDate} onPress={() => setReload(value => value + 1)}><Text>Reload readings</Text></Pressable>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={goBack}
              disabled={saving}
            >
              <Text style={styles.btnGhostText}>Back</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.btnPrimary, saving && { opacity: 0.6 }]}
              onPress={onSave}
              disabled={saving || !isoDate || loadedDate !== isoDate || !missing.length}
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