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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../../supabase";

type IrrRow = { irrigation_type_id: number; irrigation_type: string | null };

export default function IrrigationDashboardScreen() {
  const [rows, setRows] = useState<IrrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    const res = await supabase
      .from("irrigation_type")
      .select("irrigation_type_id,irrigation_type")
      .order("irrigation_type");

    if (res.error) {
      Alert.alert("Load error", res.error.message);
      setRows([]);
      return;
    }
    setRows((res.data ?? []) as IrrRow[]);
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
    return rows.filter((r) => `${r.irrigation_type_id} ${r.irrigation_type ?? ""}`.toLowerCase().includes(qq));
  }, [rows, q]);

  function Row({ item }: { item: IrrRow }) {
    return (
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="subtitle" numberOfLines={1}>
            {item.irrigation_type ?? "Irrigation"}{" "}
            <ThemedText style={{ opacity: 0.7 }}>#{item.irrigation_type_id}</ThemedText>
          </ThemedText>
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/(tabs)/home/irrigation-edit",
              params: { irrigationTypeId: String(item.irrigation_type_id) },
            })
          }
          style={styles.editBtn}
        >
          <ThemedText style={styles.editBtnText}>Edit</ThemedText>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={{ marginTop: 10 }}>Loading irrigation types…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText type="title">Irrigation Types</ThemedText>

        <Pressable
          style={styles.newBtn}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/home/irrigation-edit",
              params: { irrigationTypeId: "new" },
            })
          }
        >
          <Text style={styles.newBtnText}>NEW</Text>
        </Pressable>
      </View>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search irrigation types…"
        placeholderTextColor="rgba(120,120,120,0.8)"
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ThemedText style={{ marginTop: 10, opacity: 0.7 }}>
        Showing {filtered.length} of {rows.length}
      </ThemedText>

      <FlatList
        style={{ marginTop: 12 }}
        data={filtered}
        keyExtractor={(item) => String(item.irrigation_type_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => <Row item={item} />}
        ListEmptyComponent={<ThemedText style={{ marginTop: 16 }}>No irrigation types found.</ThemedText>}
        contentContainerStyle={{ paddingBottom: 28 }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },

  newBtn: { backgroundColor: "#111", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  newBtnText: { color: "#fff", fontWeight: "700", letterSpacing: 0.5 },

  search: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  cardRow: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.25)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },

  editBtn: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  editBtnText: { fontWeight: "700" as any },
});
