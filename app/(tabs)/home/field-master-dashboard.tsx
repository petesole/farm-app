import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
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

type FarmRow = { farm_id: number; farm_name: string | null };

type FieldRow = {
  field_id: number;
  field_name: string | null;
  farm_id: number | null;

  field_size: number | null;
  latitude: string | null;
  longitude: string | null;

  discontinued: boolean | null;
  zesa_point_id: number | null;
  rain_gauge_id: number | null;
  fuel_active: boolean | null;
  field_classification_id: number | null;
};

type FieldJoined = FieldRow & { farm_name: string | null };

function fmt(v: any) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function fmtNum(v: any, dp = 2) {
  if (v === null || v === undefined) return "-";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(dp) : String(v);
}

export default function FieldMasterDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rows, setRows] = useState<FieldJoined[]>([]);
  const [farms, setFarms] = useState<FarmRow[]>([]);

  const [q, setQ] = useState("");
  const [farmFilterId, setFarmFilterId] = useState<number | null>(null); // null = All
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  async function load() {
    const [farmRes, fieldRes] = await Promise.all([
      supabase.from("farm").select("farm_id,farm_name").order("farm_name"),
      supabase
        .from("field")
        .select(
          "field_id,field_name,farm_id,field_size,latitude,longitude,discontinued,zesa_point_id,rain_gauge_id,fuel_active,field_classification_id"
        )
        .order("field_name"),
    ]);

    if (farmRes.error) throw new Error(farmRes.error.message);
    if (fieldRes.error) throw new Error(fieldRes.error.message);

    const farmList = (farmRes.data ?? []) as FarmRow[];
    const fieldList = (fieldRes.data ?? []) as FieldRow[];

    const farmMap = new Map<number, string | null>();
    farmList.forEach((f) => farmMap.set(f.farm_id, f.farm_name ?? null));

    const joined: FieldJoined[] = fieldList.map((x) => ({
      ...x,
      farm_name: x.farm_id ? farmMap.get(x.farm_id) ?? null : null,
    }));

    joined.sort((a, b) => {
      const af = (a.farm_name ?? "").toLowerCase();
      const bf = (b.farm_name ?? "").toLowerCase();
      if (af !== bf) return af.localeCompare(bf);
      return (a.field_name ?? "").toLowerCase().localeCompare((b.field_name ?? "").toLowerCase());
    });

    setFarms(farmList);
    setRows(joined);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load fields");
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

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (farmFilterId !== null && r.farm_id !== farmFilterId) return false;
      if (statusFilter === "active" && r.discontinued === true) return false;
      if (statusFilter === "inactive" && r.discontinued !== true) return false;
      if (!qq) return true;

      const hay = [
        r.field_id,
        r.field_name,
        r.farm_id,
        r.farm_name,
        r.field_size,
        r.latitude,
        r.longitude,
        r.discontinued,
        r.zesa_point_id,
        r.rain_gauge_id,
        r.fuel_active,
        r.field_classification_id,
      ]
        .map((x) => (x === null || x === undefined ? "" : String(x)))
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [rows, q, farmFilterId, statusFilter]);

  function FarmPills() {
    const pillValues = [{ farm_id: null as any, farm_name: "All" as any }, ...farms];

    return (
      <View style={{ marginTop: 10 }}>
        <ThemedText style={{ opacity: 0.7, marginBottom: 6 }}>Farm</ThemedText>
        <View style={styles.pills}>
          {pillValues.slice(0, 10).map((f) => {
            const id = f.farm_id as number | null;
            const name = f.farm_name as string | null;
            const active = id === farmFilterId;

            return (
              <Pressable
                key={id === null ? "All" : String(id)}
                onPress={() => setFarmFilterId(id)}
                style={[styles.pill, active && styles.pillActive]}
              >
                <ThemedText style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                  {name ?? (id === null ? "All" : `Farm ${id}`)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        {farms.length + 1 > 10 ? (
          <ThemedText style={{ opacity: 0.6, marginTop: 6 }}>More farms? Use search.</ThemedText>
        ) : null}
      </View>
    );
  }

  function goEdit(field_id: number) {
    router.push({
      pathname: "/(tabs)/home/field-edit",
      params: { fieldId: String(field_id) },
    });
  }

  function TableRow({ item }: { item: FieldJoined }) {
    // Horizontal mini-table per row (so you can see all columns)
    return (
      <View style={styles.cardRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          <View style={styles.rowTable}>
            <Cell w={60} text={fmt(item.field_id)} bold />
            <Cell w={160} text={fmt(item.field_name)} />
            <Cell w={160} text={fmt(item.farm_name ?? (item.farm_id ? `Farm ${item.farm_id}` : "-"))} />
            <Cell w={90} text={fmtNum(item.field_size, 2)} right />
            <Cell w={120} text={fmt(item.latitude)} />
            <Cell w={120} text={fmt(item.longitude)} />
            <Cell w={110} text={fmt(item.fuel_active)} />
            <Cell w={110} text={fmt(item.discontinued)} />
            <Cell w={110} text={fmt(item.zesa_point_id)} />
            <Cell w={120} text={fmt(item.rain_gauge_id)} />
            <Cell w={160} text={fmt(item.field_classification_id)} />

            <View style={{ width: 80, justifyContent: "center" }}>
              <Pressable onPress={() => goEdit(item.field_id)} style={styles.editBtn}>
                <ThemedText style={styles.editBtnText}>Edit</ThemedText>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  function Header() {
    return (
      <View style={{ marginBottom: 8 }}>
        <View style={styles.headerRow}>
          <ThemedText type="title">Fields</ThemedText>

          <Pressable
            style={styles.newBtn}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/home/field-edit",
                params: { fieldId: "new" },
              })
            }
          >
            <Text style={styles.newBtnText}>NEW</Text>
          </Pressable>
        </View>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search fields…"
          placeholderTextColor="rgba(120,120,120,0.8)"
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <FarmPills />
        <View style={{ marginTop: 12 }}>
          <ThemedText style={{ opacity: 0.7, marginBottom: 6 }}>Field status</ThemedText>
          <View style={styles.pills}>
            {(["active", "all", "inactive"] as const).map(value => (
              <Pressable key={value} onPress={() => setStatusFilter(value)}
                style={[styles.pill, statusFilter === value && styles.pillActive]}>
                <ThemedText style={[styles.pillText, statusFilter === value && styles.pillTextActive]}>
                  {value === "all" ? "All" : value === "active" ? "Active" : "Inactive"}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <ThemedText style={{ marginTop: 10, opacity: 0.7 }}>
          Showing {filtered.length} of {rows.length}
        </ThemedText>

        {/* Column labels */}
        <View style={[styles.tableHeaderRow, { marginTop: 10 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.rowTable}>
              <HeaderCell w={60} text="ID" />
              <HeaderCell w={160} text="Field" />
              <HeaderCell w={160} text="Farm" />
              <HeaderCell w={90} text="Ha" right />
              <HeaderCell w={120} text="Lat" />
              <HeaderCell w={120} text="Long" />
              <HeaderCell w={110} text="Fuel" />
              <HeaderCell w={110} text="Discontinued" />
              <HeaderCell w={110} text="Zesa" />
              <HeaderCell w={120} text="Rain Gauge" />
              <HeaderCell w={160} text="Classification" />
              <HeaderCell w={80} text="" />
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={{ marginTop: 10 }}>Loading fields…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <JsplModuleHeader title="Field Management" />
      <Pressable onPress={()=>router.replace("/(tabs)/fields-control")} style={{padding:10}}><Text style={{color:"#25633A",fontWeight:"700"}}>← Fields Control</Text></Pressable>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.field_id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => <TableRow item={item} />}
        ListHeaderComponent={<Header />}
        ListEmptyComponent={<ThemedText style={{ marginTop: 16 }}>No fields found.</ThemedText>}
        contentContainerStyle={{ paddingBottom: 28 }}
      />
    </ThemedView>
  );
}

function HeaderCell({ w, text, right }: { w: number; text: string; right?: boolean }) {
  return (
    <View style={[styles.cell, { width: w }]}>
      <ThemedText style={[styles.headerText, right && { textAlign: "right" }]} numberOfLines={1}>
        {text}
      </ThemedText>
    </View>
  );
}

function Cell({ w, text, right, bold }: { w: number; text: string; right?: boolean; bold?: boolean }) {
  return (
    <View style={[styles.cell, { width: w }]}>
      <ThemedText
        numberOfLines={1}
        style={[right && { textAlign: "right" }, bold && { fontWeight: "700" as any }]}
      >
        {text}
      </ThemedText>
    </View>
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

  tableHeaderRow: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },

  cardRow: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.25)",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginTop: 8,
  },

  rowTable: { flexDirection: "row", alignItems: "center" },

  cell: { paddingHorizontal: 8, justifyContent: "center" },

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
