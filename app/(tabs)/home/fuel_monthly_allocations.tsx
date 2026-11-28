import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { supabase } from "@/supabase";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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

type UnplannedRow = {
  fuel_issue_id: number;
  fuel_issue_date: string;
  vehicle_name: string | null;
  notes: string | null;
  fuel_issued: number | null;
  fuel_allocated: number | null;
  fuel_unallocated: number | null;
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
  const [unplanned, setUnplanned] = useState<UnplannedRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    const [allocationsRes, unplannedRes, rolesRes] = await Promise.all([
      supabase.rpc("get_monthly_fuel_allocations", {
        p_month: monthISO(selectedMonth),
      }),
      supabase.rpc("get_monthly_unplanned_fuel_issues", {
        p_month: monthISO(selectedMonth),
      }),
      supabase.rpc("my_farm_app_roles"),
    ]);

    if (allocationsRes.error) {
      setErr(allocationsRes.error.message);
      setRows([]);
      setUnplanned([]);
      setLoading(false);
      return;
    }

    if (unplannedRes.error) {
      setErr(unplannedRes.error.message);
      setRows([]);
      setUnplanned([]);
      setLoading(false);
      return;
    }

    setRows((allocationsRes.data ?? []) as Row[]);
    setUnplanned((unplannedRes.data ?? []) as UnplannedRow[]);
    setIsAdmin(!rolesRes.error && ((rolesRes.data ?? []) as string[]).includes("admin"));
    setLoading(false);
  }, [selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const monthlyTotal = useMemo(() => {
    const allocatedTotal = rows.reduce(
      (sum, r) => sum + (Number(r.total_liters) || 0),
      0
    );
    const unplannedTotal = unplanned.reduce(
      (sum, r) => sum + (Number(r.fuel_unallocated) || 0),
      0
    );
    return allocatedTotal + unplannedTotal;
  }, [rows, unplanned]);

  const changeMonth = (delta: number) => {
    setSelectedMonth(
      new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + delta, 1)
    );
  };

  const assignTrip = (fuelIssueId: number) => {
    router.push({
      pathname: "/(tabs)/home/fuel_monthly_unplanned_assign",
      params: { fuel_issue_id: String(fuelIssueId) },
    });
  };

  return (
    <View style={styles.container}>
      <JsplModuleHeader title="Monthly Fuel Allocations" />
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

          {rows.length === 0 && unplanned.length === 0 ? (
            <Text style={styles.small}>No allocations for this month.</Text>
          ) : (
            <>
              {rows.map((r, i) => {
                const label = (r.bucket && String(r.bucket).trim())
                  ? String(r.bucket)
                  : "General";
                const liters = Number(r.total_liters) || 0;

                return (
                  <View key={`${label}-${i}`} style={styles.row}>
                    <Text style={styles.cell}>{label}</Text>
                    <Text style={[styles.cell, styles.right]}>{liters.toFixed(0)}</Text>
                  </View>
                );
              })}

              {unplanned.length > 0 && (
                <View style={styles.unplannedSection}>
                  <Text style={styles.unplannedHeading}>Unplanned</Text>
                  {unplanned.map((trip) => {
                    const description = String(trip.notes ?? "Unplanned trip")
                      .replace(/^\[UNPLANNED\]\s*/i, "")
                      .trim();
                    const liters = Number(trip.fuel_unallocated) || 0;
                    return (
                      <View key={trip.fuel_issue_id} style={styles.tripCard}>
                        <View style={styles.tripDetails}>
                          <Text style={styles.tripTitle}>{description || "Unplanned trip"}</Text>
                          <Text style={styles.small}>
                            {trip.fuel_issue_date} · {trip.vehicle_name ?? "Other"} · Ref #{trip.fuel_issue_id}
                          </Text>
                        </View>
                        <Text style={styles.tripLitres}>{liters.toFixed(0)} L</Text>
                        {isAdmin && (
                          <Pressable
                            style={styles.assignBtn}
                            onPress={() => assignTrip(trip.fuel_issue_id)}
                          >
                            <Text style={styles.assignText}>Assign</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}

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
  unplannedSection: { marginTop: 12, gap: 8 },
  unplannedHeading: {
    fontSize: 16,
    fontWeight: "800",
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  tripCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tripDetails: { flex: 1, gap: 4 },
  tripTitle: { fontWeight: "700" },
  tripLitres: { fontWeight: "800" },
  assignBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  assignText: { fontWeight: "700" },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 10,
    marginTop: 10,
    borderTopWidth: 2,
  },
  totalText: { fontWeight: "900", fontSize: 16 },
  small: { opacity: 0.7, marginTop: 4 },
  error: { color: "red", marginTop: 12 },
});
