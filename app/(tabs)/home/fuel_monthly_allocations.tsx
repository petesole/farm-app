// app/(tabs)/home/fuel_monthly_allocations.tsx

import { supabase } from "@/supabase";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Row = {
  bucket: string | null;
  total_liters: number | null;
};

function firstDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function formatMonth(d: Date): string {
  return d.toLocaleString("default", { month: "long", year: "numeric" });
}

export default function FuelMonthlyAllocations() {
  const [selectedMonth, setSelectedMonth] = useState<Date>(
    firstDayOfMonth(new Date())
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase.rpc("get_monthly_fuel_allocations", {
      p_month: monthISO(selectedMonth),
    });

    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Row[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const monthlyTotal = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.total_liters) || 0), 0);
  }, [rows]);

  const changeMonth = (delta: number) => {
    setSelectedMonth(
      new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + delta, 1)
    );
  };

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topRow}>
        <Pressable onPress={() => router.replace("/(tabs)/fuel")} style={styles.closeBtn}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>

        <View style={styles.monthRow}>
          <Pressable onPress={() => changeMonth(-1)} style={styles.monthBtn}>
            <Text>{"<"}</Text>
          </Pressable>

          <Text style={styles.monthText}>{formatMonth(selectedMonth)}</Text>

          <Pressable onPress={() => changeMonth(1)} style={styles.monthBtn}>
            <Text>{">"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Table */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : err ? (
        <Text style={styles.error}>Error: {err}</Text>
      ) : (
        <ScrollView>
          <View style={styles.headerRow}>
            <Text style={[styles.cell, styles.header]}>Crop / Category</Text>
            <Text style={[styles.cell, styles.header, styles.right]}>Litres</Text>
          </View>

          {rows.length === 0 ? (
            <Text style={styles.small}>No allocations for this month.</Text>
          ) : (
            rows.map((r, i) => {
              // IMPORTANT: never show "Unknown crop"
              // If bucket comes back null, treat as General (data missing crop linkage).
              const label = (r.bucket && String(r.bucket).trim()) ? String(r.bucket) : "General";
              const liters = Number(r.total_liters) || 0;

              return (
                <View key={`${label}-${i}`} style={styles.row}>
                  <Text style={styles.cell}>{label}</Text>
                  <Text style={[styles.cell, styles.right]}>{liters.toFixed(0)}</Text>
                </View>
              );
            })
          )}

          {/* TOTAL ROW */}
          <View style={styles.totalRow}>
            <Text style={[styles.cell, styles.totalText]}>TOTAL</Text>
            <Text style={[styles.cell, styles.totalText, styles.right]}>
              {monthlyTotal.toFixed(0)}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },

  topRow: { marginBottom: 12 },
  closeBtn: { alignSelf: "flex-end", paddingVertical: 6, paddingHorizontal: 10 },
  closeText: { fontWeight: "700" },

  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  monthBtn: { padding: 10, borderWidth: 1, borderRadius: 10 },
  monthText: { fontSize: 18, fontWeight: "700" },

  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginBottom: 6,
  },
  row: { flexDirection: "row", paddingVertical: 6 },

  cell: { flex: 1 },
  header: { fontWeight: "800" },
  right: { textAlign: "right" },

  totalRow: {
    flexDirection: "row",
    paddingVertical: 10,
    marginTop: 10,
    borderTopWidth: 2,
  },
  totalText: { fontWeight: "900", fontSize: 16 },

  small: { opacity: 0.7, marginTop: 10 },
  error: { color: "red", marginTop: 12 },
});