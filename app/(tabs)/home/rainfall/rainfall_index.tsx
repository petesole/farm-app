import { supabase } from "@/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { router, useNavigation } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type DashRow = {
  rain_gauge_id: number;
  rain_gauge: string;

  total_to_date: number | null;
  last_rain_date: string | null;
  last_rain_mm: number | null;

  mm_this_week: number | null;
};

function fmtDate(d: string | null) {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtMm(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.0";
  return n.toFixed(1);
}

export default function RainfallDashboardScreen() {
  const navigation = useNavigation();
  const [rows, setRows] = useState<DashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("vw_rainfall_dashboard")
      .select("*")
      .order("rain_gauge", { ascending: true });

    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data ?? []) as DashRow[]);
    }

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: "Rainfall",
        headerRight: () => (
          <Pressable
            onPress={() => router.push("/home/rainfall/rainfall_record")}
            style={{ paddingHorizontal: 14 }}
          >
            <Text style={{ color: "#0a7", fontWeight: "900" }}>
              Record Rainfall
            </Text>
          </Pressable>
        ),
      });

      load();
    }, [load, navigation])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const empty = useMemo(
    () => !loading && rows.length === 0,
    [loading, rows.length]
  );

  // ✅ Column widths (tuned for phone)
  // Change these numbers to widen/narrow columns
  const W = {
    gauge: 100,   // was 180
    total: 60,    // was 110
    lastDate: 90, // was 120
    lastMm: 40,   // was 100
    week: 60,     // was 110
    hist: 85,     // was 90
  };

  const tableWidth = W.gauge + W.total + W.lastDate + W.lastMm + W.week + W.hist;

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={{ paddingTop: 24 }}>
          <ActivityIndicator />
        </View>
      ) : empty ? (
        <Text style={{ opacity: 0.7 }}>No rain gauges found.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={{ width: tableWidth }}>
            {/* HEADER */}
            <View style={[styles.tr, styles.header]}>
              <Text
                style={[
                  styles.cell,
                  styles.headerText,
                  { width: W.gauge },
                ]}
                numberOfLines={1}
              >
                Rain Gauge
              </Text>

              <Text
                style={[
                  styles.cell,
                  styles.headerText,
                  { width: W.total, textAlign: "right" },
                ]}
                numberOfLines={1}
              >
                Total
              </Text>

              <Text
                style={[
                  styles.cell,
                  styles.headerText,
                  { width: W.lastDate },
                ]}
                numberOfLines={1}
              >
                Last Date
              </Text>

              <Text
                style={[
                  styles.cell,
                  styles.headerText,
                  { width: W.lastMm, textAlign: "right" },
                ]}
                numberOfLines={1}
              >
                Last
              </Text>

              <Text
                style={[
                  styles.cell,
                  styles.headerText,
                  { width: W.week, textAlign: "right" },
                ]}
                numberOfLines={1}
              >
                Week
              </Text>

              <Text
                style={[
                  styles.cell,
                  styles.headerText,
                  { width: W.hist, textAlign: "center" },
                ]}
                numberOfLines={1}
              >
                History
              </Text>
            </View>

            {/* BODY */}
            <ScrollView showsVerticalScrollIndicator>
              {rows.map((r, idx) => (
                <View
                  key={String(r.rain_gauge_id)}
                  style={[styles.tr, idx % 2 === 0 ? styles.altRow : null]}
                >
                  <Text
                    style={[styles.cell, { width: W.gauge }]}
                    numberOfLines={1}
                  >
                    {r.rain_gauge}
                  </Text>

                  <Text style={[styles.cell, { width: W.total, textAlign: "right" }]}>
                    {fmtMm(r.total_to_date)}
                  </Text>

                  <Text style={[styles.cell, { width: W.lastDate }]} numberOfLines={1}>
                    {fmtDate(r.last_rain_date)}
                  </Text>

                  <Text style={[styles.cell, { width: W.lastMm, textAlign: "right" }]}>
                    {fmtMm(r.last_rain_mm)}
                  </Text>

                  <Text style={[styles.cell, { width: W.week, textAlign: "right" }]}>
                    {fmtMm(r.mm_this_week)}
                  </Text>

                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/home/rainfall/rainfall_edit",
                        params: { rain_gauge_id: String(r.rain_gauge_id) },
                      })
                    }
                    style={[styles.histBtn, { width: W.hist }]}
                  >
                    <Text style={{ color: "white", fontWeight: "900" }}>Open</Text>
                  </Pressable>
                </View>
              ))}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },

  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  header: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    marginBottom: 8,
  },

  headerText: { fontWeight: "900" },

  cell: {
    paddingHorizontal: 6,
    fontSize: 13,
  },

  altRow: {
    backgroundColor: "#fafafa",
  },

  histBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 6,
    backgroundColor: "#06c",
  },
});