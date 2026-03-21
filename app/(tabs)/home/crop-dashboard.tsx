// app/(tabs)/crop-dashboard.tsx
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../../supabase";

type CropRow = {
  crop_id: number;
  crop_name: string | null;
  price_per_ton: number | null;
  planned_planting_month: number | null;
  average_yield: number | null;
  dr_average_yield: number | null;
  start_week: number | null;
  not_crop: boolean | null;
  top_yield: number | null;
  germination_time: number | null;
};

function fmt(v: any) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

const COLS = [
  { key: "crop_id", label: "ID", minWidth: 60 },
  { key: "crop_name", label: "Name", minWidth: 160 },
  { key: "price_per_ton", label: "Price/Ton", minWidth: 110 },
  { key: "planned_planting_month", label: "Plant Month", minWidth: 120 },
  { key: "average_yield", label: "Avg Yield", minWidth: 110 },
  { key: "dr_average_yield", label: "DR Avg Yield", minWidth: 120 },
  { key: "start_week", label: "Start Week", minWidth: 110 },
  { key: "not_crop", label: "Not Crop", minWidth: 90 },
  { key: "top_yield", label: "Top Yield", minWidth: 110 },
  { key: "germination_time", label: "Germ (days)", minWidth: 110 },
  { key: "_edit", label: "", minWidth: 70 },
] as const;

export default function CropDashboardScreen() {
  const [rows, setRows] = useState<CropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [q, setQ] = useState("");

  async function load() {
    const res = await supabase.from("crop").select("*").order("crop_name");
    if (res.error) {
      Alert.alert("Load error", res.error.message);
      setRows([]);
      return;
    }
    setRows((res.data ?? []) as CropRow[]);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const hay = [
        r.crop_id,
        r.crop_name,
        r.price_per_ton,
        r.planned_planting_month,
        r.average_yield,
        r.dr_average_yield,
        r.start_week,
        r.not_crop,
        r.top_yield,
        r.germination_time,
      ]
        .map((x) => (x === null || x === undefined ? "" : String(x)))
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q]);

  function Row({ item }: { item: CropRow }) {
    return (
      <View style={styles.tableRow}>
        {COLS.map((c) => {
          if (c.key === "_edit") {
            return (
              <View key={c.key} style={[styles.cell, { minWidth: c.minWidth }]}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/home/crop-edit",
                      params: { cropId: String(item.crop_id) },
                    })
                  }
                  style={styles.editBtn}
                >
                  <ThemedText style={styles.editBtnText}>Edit</ThemedText>
                </Pressable>
              </View>
            );
          }

          const v = (item as any)[c.key];
          return (
            <View key={c.key} style={[styles.cell, { minWidth: c.minWidth }]}>
              <ThemedText numberOfLines={1}>{fmt(v)}</ThemedText>
            </View>
          );
        })}
      </View>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={{ marginTop: 10 }}>Loading crops…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <ThemedText type="title">Crop Dashboard</ThemedText>

        <Pressable
          style={styles.newBtn}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/home/crop-edit",
              params: { cropId: "new" },
            })
          }
        >
          <Text style={styles.newBtnText}>NEW</Text>
        </Pressable>
      </View>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search crops…"
        placeholderTextColor="rgba(120,120,120,0.8)"
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ThemedText style={{ marginTop: 10, opacity: 0.7 }}>
        Showing {filtered.length} of {rows.length}
      </ThemedText>

      {/* Horizontal scroll for columns + FlatList for vertical scrolling */}
      <ScrollView
        horizontal
        contentContainerStyle={{ paddingBottom: 14 }}
        style={{ marginTop: 10 }}
      >
        <View style={{ flex: 1 }}>
          {/* Header row */}
          <View style={styles.tableHeaderRow}>
            {COLS.map((c) => (
              <View key={c.key} style={[styles.cell, { minWidth: c.minWidth }]}>
                <ThemedText style={styles.headerText} numberOfLines={1}>
                  {c.label}
                </ThemedText>
              </View>
            ))}
          </View>

          {/* Rows */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.crop_id)}
            renderItem={({ item }) => <Row item={item} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <ThemedText style={{ marginTop: 16 }}>No crops found.</ThemedText>
            }
            // IMPORTANT: let FlatList size itself inside horizontal scroll
            style={{ flexGrow: 0 }}
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  newBtn: {
    backgroundColor: "#111",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  newBtnText: { color: "#fff", fontWeight: "700", letterSpacing: 0.5 },

  search: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  tableHeaderRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.18)",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 6,
  },

  cell: {
    paddingHorizontal: 8,
    justifyContent: "center",
    flexShrink: 0,
  },

  headerText: { opacity: 0.75, fontWeight: "700" as any },

  editBtn: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
  },
  editBtnText: { fontWeight: "700" as any },
});
