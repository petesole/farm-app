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

type CropRow = { crop_id: number; crop_name: string | null };
type VarietyRow = { variety_id: number; crop_id: number | null; variety_name: string | null };

type VarietyJoined = {
  variety_id: number;
  crop_id: number | null;
  variety_name: string | null;
  crop_name: string | null;
};

export default function VarietyDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rows, setRows] = useState<VarietyJoined[]>([]);
  const [crops, setCrops] = useState<CropRow[]>([]);

  const [q, setQ] = useState("");
  const [cropFilterId, setCropFilterId] = useState<number | null>(null); // null = All

  async function load() {
    // Load crops and varieties, then join locally (fast + simple)
    const [cropRes, varRes] = await Promise.all([
      supabase.from("crop").select("crop_id,crop_name").order("crop_name"),
      supabase.from("variety").select("variety_id,crop_id,variety_name").order("variety_name"),
    ]);

    if (cropRes.error) throw new Error(cropRes.error.message);
    if (varRes.error) throw new Error(varRes.error.message);

    const cropList = (cropRes.data ?? []) as CropRow[];
    const varietyList = (varRes.data ?? []) as VarietyRow[];

    const cropMap = new Map<number, string | null>();
    cropList.forEach((c) => cropMap.set(c.crop_id, c.crop_name ?? null));

    const joined: VarietyJoined[] = varietyList.map((v) => ({
      variety_id: v.variety_id,
      crop_id: v.crop_id ?? null,
      variety_name: v.variety_name ?? null,
      crop_name: v.crop_id ? cropMap.get(v.crop_id) ?? null : null,
    }));

    // Optional: sort by crop then variety
    joined.sort((a, b) => {
      const ac = (a.crop_name ?? "").toLowerCase();
      const bc = (b.crop_name ?? "").toLowerCase();
      if (ac !== bc) return ac.localeCompare(bc);
      return (a.variety_name ?? "").toLowerCase().localeCompare((b.variety_name ?? "").toLowerCase());
    });

    setCrops(cropList);
    setRows(joined);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load varieties");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onRefresh() {
    try {
      setRefreshing(true);
      await load();
    } catch (e: any) {
      Alert.alert("Load error", e?.message ?? "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  const cropFilterName = useMemo(() => {
    if (cropFilterId === null) return "All";
    return crops.find((c) => c.crop_id === cropFilterId)?.crop_name ?? `Crop ${cropFilterId}`;
  }, [cropFilterId, crops]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (cropFilterId !== null && r.crop_id !== cropFilterId) return false;
      if (!qq) return true;

      const hay = [r.variety_name, r.crop_name, r.variety_id, r.crop_id]
        .map((x) => (x === null || x === undefined ? "" : String(x)))
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [rows, q, cropFilterId]);

  function CropPills() {
    const pillValues = [{ crop_id: null as any, crop_name: "All" as any }, ...crops];

    return (
      <View style={{ marginTop: 10 }}>
        <ThemedText style={{ opacity: 0.7, marginBottom: 6 }}>Crop</ThemedText>
        <View style={styles.pills}>
          {pillValues.slice(0, 12).map((c) => {
            const id = c.crop_id as number | null;
            const name = c.crop_name as string | null;
            const active = id === cropFilterId;

            return (
              <Pressable
                key={id === null ? "All" : String(id)}
                onPress={() => setCropFilterId(id)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <ThemedText style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                  {name ?? (id === null ? "All" : `Crop ${id}`)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        {crops.length + 1 > 12 ? (
          <ThemedText style={{ opacity: 0.6, marginTop: 6 }}>More crops? Use search.</ThemedText>
        ) : null}
      </View>
    );
  }

  function Row({ item }: { item: VarietyJoined }) {
    return (
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="subtitle" numberOfLines={1}>
            {item.variety_name ?? "Variety"}{" "}
            <ThemedText style={{ opacity: 0.7 }}>#{item.variety_id}</ThemedText>
          </ThemedText>

          <ThemedText style={{ opacity: 0.7 }} numberOfLines={1}>
            Crop: {item.crop_name ?? (item.crop_id ? `Crop ${item.crop_id}` : "-")}
          </ThemedText>
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: "/(tabs)/home/variety-edit",
              params: { varietyId: String(item.variety_id) },
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
        <ThemedText style={{ marginTop: 10 }}>Loading varieties…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText type="title">Varieties</ThemedText>

        <Pressable
          style={styles.newBtn}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/home/variety-edit",
              params: { varietyId: "new" },
            })
          }
        >
          <Text style={styles.newBtnText}>NEW</Text>
        </Pressable>
      </View>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={`Search varieties… (Crop filter: ${cropFilterName})`}
        placeholderTextColor="rgba(120,120,120,0.8)"
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <CropPills />

      <ThemedText style={{ marginTop: 10, opacity: 0.7 }}>
        Showing {filtered.length} of {rows.length}
      </ThemedText>

      <FlatList
        style={{ marginTop: 12 }}
        data={filtered}
        keyExtractor={(item) => String(item.variety_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => <Row item={item} />}
        ListEmptyComponent={<ThemedText style={{ marginTop: 16 }}>No varieties found.</ThemedText>}
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

  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    maxWidth: "100%",
  },
  pillActive: { borderColor: "rgba(80,80,80,0.9)" },
  pillText: { opacity: 0.85 },
  pillTextActive: { opacity: 1 },

  cardRow: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.25)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },

  editBtn: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  editBtnText: { fontWeight: "700" as any },
});
