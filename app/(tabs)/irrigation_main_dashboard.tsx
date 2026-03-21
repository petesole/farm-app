import { supabase } from "@/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

type DashRow = {
  tracecode_id: number;
  crop: string | null;
  trace: string | null;
  in_cycle: boolean | null;
  cycle_stamp: string | null;
  ["DSL_Irr/Rain"]?: number | null;
  daily_req: number | null;
  acc_req: number | null;
  next_app: string | null;
  next_app_mm: number | null;
  next_schedule_id: number | null;
  seasonal_depletion_mm?: number | null;
};

type RoleName = "admin" | "irrigation" | "manager" | "viewer" | "unknown" | string;

function normRole(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function fmt0(v: any) {
  const n = toNum(v);
  return n === null ? "-" : String(Math.round(n));
}

function fmt1(v: any) {
  const n = toNum(v);
  return n === null ? "-" : (Math.round(n * 10) / 10).toFixed(1);
}

function fmtDate(v: any) {
  if (!v) return "-";
  return String(v);
}

const COLS = [
  { key: "crop", label: "Crop", width: 150 },
  { key: "trace", label: "Trace", width: 160 },
  { key: "cycle_stamp", label: "Cycle", width: 150 },
  { key: "DSL_Irr/Rain", label: "DSL", width: 70 },
  { key: "daily_req", label: "Daily", width: 90 },
  { key: "acc_req", label: "Acc", width: 90 },
  { key: "seasonal_depletion_mm", label: "Season", width: 90 },
  { key: "next_app", label: "Next d", width: 110 },
  { key: "next_app_mm", label: "Next mm", width: 90 },
  { key: "actions", label: "Actions", width: 260 },
] as const;

export default function IrrigationMainDashboard() {
  const { width } = useWindowDimensions();
  const isPhone = width < 700;

  const [rows, setRows] = useState<DashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [roles, setRoles] = useState<RoleName[]>([]);
  const isAdmin = useMemo(() => roles.map(normRole).includes("admin"), [roles]);

  const tableWidth = useMemo(
    () => COLS.reduce((sum, c) => sum + c.width, 0),
    []
  );

  const loadRoles = useCallback(async () => {
    try {
      const storedRole = await AsyncStorage.getItem("role");
      const r = normRole(storedRole);

      if (!r) {
        setRoles(["unknown"]);
        return;
      }

      setRoles([r]);
    } catch (e: any) {
      console.log("Role load error:", e?.message ?? e);
      setRoles(["unknown"]);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setErrorText(null);
    setLoading(true);

    try {
      const queryPromise = supabase
        .from("irrigation_dashboard_cache")
        .select(
          'tracecode_id,crop,trace,in_cycle,cycle_stamp,daily_req,acc_req,next_app,next_app_mm,next_schedule_id,"DSL_Irr/Rain",seasonal_depletion_mm'
        )
        .order("in_cycle", { ascending: false })
        .order("acc_req", { ascending: false })
        .order("trace", { ascending: true });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Dashboard query timed out")), 20000)
      );

      const result: any = await Promise.race([queryPromise, timeoutPromise]);
      const { data, error } = result;

      if (error) throw error;

      setRows((data ?? []) as DashRow[]);
    } catch (e: any) {
      setRows([]);
      setErrorText(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const crop = (r.crop ?? "").toLowerCase();
      const trace = (r.trace ?? "").toLowerCase();
      return crop.includes(s) || trace.includes(s);
    });
  }, [rows, search]);

  const goSchedule = (tracecode_id: number) => {
    router.push({
      pathname: "/(tabs)/home/irrigation/irrigation_schedule",
      params: { tracecode_id: String(tracecode_id) },
    });
  };

  const goActual = (tracecode_id: number) => {
    router.push({
      pathname: "/(tabs)/home/irrigation/irrigation_actual",
      params: { tracecode_id: String(tracecode_id) },
    });
  };

  const showApplied = (r: DashRow) => r.next_schedule_id != null || !!r.in_cycle;

  const renderActions = (r: DashRow) => {
    const appliedVisible = showApplied(r);

    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {isAdmin ? (
          <Pressable
            onPress={() => goSchedule(r.tracecode_id)}
            style={[styles.actionBtn, styles.actionBtnDark, { marginRight: 8 }]}
          >
            <Text style={styles.actionBtnTextDark}>Schedule</Text>
          </Pressable>
        ) : (
          <View style={{ width: 86, marginRight: 8, alignItems: "center" }}>
            <Text style={{ color: "#999", fontWeight: "800", fontSize: 12 }}>—</Text>
          </View>
        )}

        {appliedVisible ? (
          <Pressable
            onPress={() => goActual(r.tracecode_id)}
            style={[styles.actionBtn, styles.actionBtnLight]}
          >
            <Text style={styles.actionBtnTextLight}>
              {r.in_cycle ? "Finish" : "Applied"}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 86, alignItems: "center" }}>
            <Text style={{ color: "#999", fontWeight: "800", fontSize: 12 }}>—</Text>
          </View>
        )}
      </View>
    );
  };

  const renderCard = ({ item }: { item: DashRow }) => {
    const inCycle = !!item.in_cycle;
    const cycle = item.cycle_stamp ?? "-";

    return (
      <View style={[styles.cardPhone, inCycle && styles.cardGreen]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTrace}>{item.trace ?? "-"}</Text>
            <Text style={styles.cardCrop}>{item.crop ?? "-"}</Text>
          </View>
          <Text style={styles.cardCycle}>{cycle}</Text>
        </View>

        <View style={styles.metricGrid}>
          <Metric label="DSL" value={fmt0(item["DSL_Irr/Rain"])} />
          <Metric label="Daily" value={fmt1(item.daily_req)} />
          <Metric label="Acc" value={fmt1(item.acc_req)} />
          <Metric label="Season" value={fmt0(item.seasonal_depletion_mm)} />
          <Metric label="Next d" value={fmtDate(item.next_app)} />
          <Metric label="Next mm" value={fmt0(item.next_app_mm)} />
        </View>

        <View style={{ marginTop: 10 }}>{renderActions(item)}</View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={[styles.tr, styles.headerRow]}>
      {COLS.map((c) => (
        <View key={c.key} style={[styles.td, { width: c.width }]}>
          <Text style={styles.headerText}>{c.label}</Text>
        </View>
      ))}
    </View>
  );

  const renderCell = (row: DashRow, colKey: (typeof COLS)[number]["key"]) => {
    if (colKey === "crop") return <Text style={styles.cellText}>{row.crop ?? "-"}</Text>;
    if (colKey === "trace")
      return <Text style={[styles.cellText, { fontWeight: "900" }]}>{row.trace ?? "-"}</Text>;
    if (colKey === "cycle_stamp") return <Text style={styles.cellText}>{row.cycle_stamp ?? "-"}</Text>;
    if (colKey === "DSL_Irr/Rain") return <Text style={styles.cellText}>{fmt0(row["DSL_Irr/Rain"])}</Text>;
    if (colKey === "daily_req") return <Text style={styles.cellText}>{fmt1(row.daily_req)}</Text>;
    if (colKey === "acc_req") return <Text style={styles.cellText}>{fmt1(row.acc_req)}</Text>;
    if (colKey === "seasonal_depletion_mm")
      return <Text style={styles.cellText}>{fmt0(row.seasonal_depletion_mm)}</Text>;
    if (colKey === "next_app") return <Text style={styles.cellText}>{fmtDate(row.next_app)}</Text>;
    if (colKey === "next_app_mm") return <Text style={styles.cellText}>{fmt0(row.next_app_mm)}</Text>;
    if (colKey === "actions") return renderActions(row);
    return <Text style={styles.cellText}>-</Text>;
  };

  const renderRow = ({ item }: { item: DashRow }) => {
    const inCycle = !!item.in_cycle;
    return (
      <View style={[styles.tr, inCycle && styles.trGreen]}>
        {COLS.map((c) => (
          <View key={c.key} style={[styles.td, { width: c.width }]}>
            {renderCell(item, c.key)}
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading dashboard…</Text>
      </View>
    );
  }

  if (errorText) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{errorText}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={() => router.push("/(tabs)/home/rainfall/rainfall_index")}
        style={styles.rainfallFab}
      >
        <Text style={styles.rainfallFabText}>Rainfall</Text>
      </Pressable>

      <View style={styles.searchWrap}>
        <Text style={{ fontWeight: "900", marginBottom: 6 }}>
          Roles: {roles.length ? roles.map(normRole).join(", ") : "unknown"}
        </Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search crop or trace…"
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isPhone ? (
        <FlatList
          data={filteredRows}
          keyExtractor={(r) => String(r.tracecode_id)}
          renderItem={renderCard}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontWeight: "900" }}>No matches</Text>
            </View>
          }
        />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ minWidth: tableWidth }}>
            {renderHeader()}
            <FlatList
              data={filteredRows}
              keyExtractor={(r) => String(r.tracecode_id)}
              renderItem={renderRow}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={filteredRows.length === 0 ? { flexGrow: 1 } : undefined}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={{ fontWeight: "900" }}>No matches</Text>
                </View>
              }
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  error: { color: "crimson", fontWeight: "900" },

  rainfallFab: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 20,
    backgroundColor: "#111",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#111",
  },
  rainfallFabText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },

  searchWrap: {
    padding: 12,
    paddingRight: 110,
    borderBottomWidth: 1,
    borderBottomColor: "#e6e6e6",
  },
  search: {
    borderWidth: 1,
    borderColor: "#dcdcdc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#fafafa",
  },

  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e6e6e6" },
  headerRow: { backgroundColor: "#f3f3f3" },
  td: { paddingVertical: 10, paddingHorizontal: 8, justifyContent: "center" },
  headerText: { fontWeight: "900", fontSize: 12 },
  cellText: { fontSize: 12 },
  trGreen: { backgroundColor: "#dff5df" },

  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnDark: { backgroundColor: "#111", borderColor: "#111" },
  actionBtnTextDark: { color: "#fff", fontWeight: "900", fontSize: 12 },
  actionBtnLight: { backgroundColor: "#fff", borderColor: "#111" },
  actionBtnTextLight: { color: "#111", fontWeight: "900", fontSize: 12 },

  cardPhone: {
    borderWidth: 1,
    borderColor: "#e6e6e6",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  cardGreen: { backgroundColor: "#dff5df" },
  cardTrace: { fontSize: 18, fontWeight: "900" },
  cardCrop: { marginTop: 2, color: "#666", fontWeight: "800" },
  cardCycle: { fontWeight: "900", color: "#111" },

  metricGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metric: {
    width: "31%",
    borderWidth: 1,
    borderColor: "#efefef",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#fafafa",
  },
  metricLabel: { fontSize: 11, fontWeight: "900", color: "#666" },
  metricValue: { marginTop: 2, fontSize: 16, fontWeight: "900" },
});