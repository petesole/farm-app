// app/(tabs)/scouting.tsx
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { SyncBar } from "../../components/SyncBar";
import { ThemedText } from "../../components/themed-text";
import { ThemedView } from "../../components/themed-view";

import {
  CachedTracecode,
  getLocalActiveTracecodes,
  getTracecodeLastRefresh,
  refreshActiveTracecodesFromSupabase,
} from "../../lib/tracecodeCache";

import { supabase } from "../../supabase";

type CropPick = { crop_id: number; crop_name: string };

function SelectModal<T>(props: {
  visible: boolean;
  title: string;
  items: T[];
  getKey: (t: T) => string;
  getLabel: (t: T) => string;
  onPick: (t: T) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return props.items;
    return props.items.filter((it) =>
      props.getLabel(it).toLowerCase().includes(qq)
    );
  }, [q, props.items, props.getLabel]);

  useEffect(() => {
    if (!props.visible) setQ("");
  }, [props.visible]);

  return (
    <Modal visible={props.visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <ThemedText type="subtitle">{props.title}</ThemedText>
            <Pressable onPress={props.onClose} style={styles.modalCloseBtn}>
              <ThemedText style={{ fontWeight: "700" }}>X</ThemedText>
            </Pressable>
          </View>

          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search…"
            placeholderTextColor="rgba(120,120,120,0.8)"
            style={styles.modalSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <ScrollView style={{ maxHeight: 420 }}>
            {filtered.map((it) => (
              <Pressable
                key={props.getKey(it)}
                onPress={() => props.onPick(it)}
                style={styles.modalItem}
              >
                <ThemedText numberOfLines={1}>{props.getLabel(it)}</ThemedText>
              </Pressable>
            ))}
            {filtered.length === 0 ? (
              <ThemedText style={{ opacity: 0.7, paddingVertical: 10 }}>
                No matches.
              </ThemedText>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function ScoutingScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rows, setRows] = useState<CachedTracecode[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const [cropModal, setCropModal] = useState(false);
  const [selectedCrop, setSelectedCrop] = useState<CropPick | null>(null);
  const [tracecodeSearch, setTracecodeSearch] = useState("");

  const crops = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      if (r.crop_id && r.crop_name) map.set(r.crop_id, r.crop_name);
    }
    return Array.from(map.entries())
      .map(([crop_id, crop_name]) => ({ crop_id, crop_name }))
      .sort((a, b) => a.crop_name.localeCompare(b.crop_name));
  }, [rows]);

  const tracecodesForCrop = useMemo(() => {
    const qq = tracecodeSearch.trim().toLowerCase();

    const filtered = rows.filter((r) => {
      if (!selectedCrop) return false;
      if (r.crop_id !== selectedCrop.crop_id) return false;
      if (!qq) return true;

      const label = `${r.tracecode_name ?? ""} ${r.field_name ?? ""} ${r.tracecode_id}`.toLowerCase();
      return label.includes(qq);
    });

    return filtered.sort((a, b) => {
      const fa = (a.field_name ?? "").localeCompare(b.field_name ?? "");
      if (fa !== 0) return fa;
      return (a.tracecode_name ?? "").localeCompare(b.tracecode_name ?? "");
    });
  }, [rows, selectedCrop, tracecodeSearch]);

  async function loadInitial() {
    setLoading(true);
    try {
      if (Platform.OS === "web") {
        const res = await supabase
          .from("v_scouting_active_tracecodes")
          .select("tracecode_id, tracecode_name, crop_id, crop_name, field_id, field_name")
          .order("crop_name", { ascending: true })
          .order("tracecode_name", { ascending: true });

        if (res.error) throw new Error(res.error.message);
        setRows((res.data ?? []) as any);
        setLastRefresh("Web (live)");
      } else {
        const local = await getLocalActiveTracecodes();
        setRows(local);
        setLastRefresh(await getTracecodeLastRefresh());

        if (local.length === 0) {
          Alert.alert(
            "No cached tracecodes",
            "Tap Refresh Active Tracecodes to download for offline use."
          );
        }
      }
    } catch (e: any) {
      Alert.alert("Scouting load error", e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function refreshActive() {
    if (Platform.OS === "web") {
      setRefreshing(true);
      try {
        const res = await supabase
          .from("v_scouting_active_tracecodes")
          .select("tracecode_id, tracecode_name, crop_id, crop_name, field_id, field_name")
          .order("crop_name", { ascending: true })
          .order("tracecode_name", { ascending: true });

        if (res.error) throw new Error(res.error.message);

        setRows((res.data ?? []) as any);
        setLastRefresh("Web (live)");
        Alert.alert("Updated", `Loaded ${(res.data ?? []).length} tracecodes.`);
      } catch (e: any) {
        Alert.alert("Refresh failed", e?.message ?? "Could not refresh");
      } finally {
        setRefreshing(false);
      }
      return;
    }

    setRefreshing(true);
    try {
      const res = await refreshActiveTracecodesFromSupabase();
      const local = await getLocalActiveTracecodes();
      setRows(local);
      setLastRefresh(await getTracecodeLastRefresh());
      Alert.alert("Updated", `Downloaded ${res.count} tracecodes.`);
    } catch (e: any) {
      Alert.alert("Refresh failed", e?.message ?? "Could not refresh");
    } finally {
      setRefreshing(false);
    }
  }

  async function clearLocalTracecodeCache() {
    if (Platform.OS === "web") return;

    try {
      // platform-resolved localdb (native on device)
      const { db } = await import("../../lib/localdb");
      db.execSync("delete from tracecode_local;");
      db.runSync("delete from app_kv where k = ?", ["tracecode_last_refresh"]);

      setRows([]);
      setLastRefresh(null);
      setSelectedCrop(null);
      setTracecodeSearch("");

      Alert.alert("Cleared", "Local tracecode cache cleared.");
    } catch (e: any) {
      Alert.alert("Clear failed", e?.message ?? "Could not clear local cache");
    }
  }

  function pickCrop(c: CropPick) {
    setSelectedCrop(c);
    setCropModal(false);
    setTracecodeSearch("");
  }

  useEffect(() => {
    loadInitial();
  }, []);

  return (
    <ThemedView style={styles.container}>
      {/* SyncBar is platform split; it renders null on web */}
      <SyncBar />

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Scouting</ThemedText>

        <Pressable onPress={refreshActive} style={styles.refreshBtn} disabled={refreshing}>
          <ThemedText style={styles.refreshText}>
            {refreshing ? "Refreshing…" : "Refresh Active Tracecodes"}
          </ThemedText>
        </Pressable>

        {Platform.OS !== "web" && (
          <Pressable onPress={clearLocalTracecodeCache} style={styles.refreshBtn}>
            <ThemedText style={styles.refreshText}>Clear Local Cache</ThemedText>
          </Pressable>
        )}

        <ThemedText style={{ opacity: 0.7, marginTop: 6 }}>
          Last refresh: {lastRefresh ?? "Never"}
        </ThemedText>

        <View style={{ marginTop: 14 }}>
          <ThemedText style={styles.label}>Crop</ThemedText>
          <Pressable style={styles.selector} onPress={() => setCropModal(true)}>
            <ThemedText numberOfLines={1}>
              {selectedCrop ? selectedCrop.crop_name : "Select crop…"}
            </ThemedText>
          </Pressable>
        </View>

        <SelectModal<CropPick>
          visible={cropModal}
          title="Select crop"
          items={crops}
          getKey={(c) => String(c.crop_id)}
          getLabel={(c) => c.crop_name}
          onPick={pickCrop}
          onClose={() => setCropModal(false)}
        />

        <View style={{ marginTop: 14 }}>
          <ThemedText style={styles.label}>Tracecode (filtered by crop)</ThemedText>
          <TextInput
            value={tracecodeSearch}
            onChangeText={setTracecodeSearch}
            placeholder={selectedCrop ? "Search tracecode / field…" : "Pick a crop first…"}
            placeholderTextColor="rgba(120,120,120,0.8)"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!!selectedCrop}
          />
        </View>
      </ThemedView>

      {loading ? (
        <ThemedView style={styles.center}>
          <ActivityIndicator />
          <ThemedText style={{ marginTop: 8 }}>Loading…</ThemedText>
        </ThemedView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          {!selectedCrop ? (
            <ThemedText style={{ opacity: 0.7, padding: 12 }}>
              Select a crop to see its active tracecodes.
            </ThemedText>
          ) : (
            <>
              {tracecodesForCrop.map((t) => (
                <Pressable key={t.tracecode_id} style={styles.item}>
                  <ThemedText style={{ fontWeight: "700" }} numberOfLines={1}>
                    {t.field_name
                      ? `${t.field_name} — ${t.tracecode_name ?? ""}`
                      : (t.tracecode_name ?? `Tracecode ${t.tracecode_id}`)}
                  </ThemedText>
                  <ThemedText style={{ opacity: 0.7 }}>
                    {t.crop_name ?? ""} • ID {t.tracecode_id}
                  </ThemedText>
                </Pressable>
              ))}

              {tracecodesForCrop.length === 0 ? (
                <ThemedText style={{ opacity: 0.7, padding: 12 }}>
                  No active tracecodes found for this crop.
                </ThemedText>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { padding: 12, borderRadius: 12, marginBottom: 12 },
  label: { marginTop: 6, opacity: 0.8, fontSize: 12 },
  selector: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  refreshBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  refreshText: { fontWeight: "700" },
  item: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.25)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 14,
  },
  modalCard: { backgroundColor: "white", borderRadius: 14, padding: 12 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
  },
  modalSearch: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(120,120,120,0.18)",
  },
});


