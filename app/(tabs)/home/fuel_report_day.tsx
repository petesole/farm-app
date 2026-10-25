import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
// app/(tabs)/fuel-report-day.tsx
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { supabase } from "../../../supabase";

function formatNum(v: number | null | undefined, decimals = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return Number(v).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

type AllocationRow = {
  fuel_allocated: number | null;
  tracecode?: { tracecode_name: string | null } | null;
  vehicle_job?: { vehicle_job_name: string | null } | null;
};

type IssueRow = {
  fuel_issue_id: number;
  fuel_issue_date: string;
  fuel_issued: number;
  notes: string | null;
  vehicle?: { vehicle_name: string | null } | null;
  fuel_allocation?: AllocationRow[] | null;
};

export default function FuelReportDayScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const reportDate = date ?? "";

  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<IssueRow[]>([]);

  async function loadDay() {
    try {
      setLoading(true);

      if (!reportDate) {
        throw new Error("No date provided.");
      }

      const { data, error } = await supabase
        .from("fuel_issue")
        .select(`
          fuel_issue_id,
          fuel_issue_date,
          fuel_issued,
          notes,
          vehicle:vehicle_id(vehicle_name),
          fuel_allocation(
            fuel_allocated,
            tracecode:tracecode_id(tracecode_name),
            vehicle_job:vehicle_job_id(vehicle_job_name)
          )
        `)
        .eq("fuel_issue_date", reportDate)
        .order("fuel_issue_id", { ascending: true });

      if (error) throw error;

      // Safe mapping (avoids TypeScript errors)
      const safe: IssueRow[] = Array.isArray(data)
        ? (data as any[]).map((i) => ({
            fuel_issue_id: Number(i.fuel_issue_id),
            fuel_issue_date: String(i.fuel_issue_date),
            fuel_issued: Number(i.fuel_issued ?? 0),
            notes: i.notes ?? null,
            vehicle: i.vehicle ?? null,
            fuel_allocation: Array.isArray(i.fuel_allocation)
              ? i.fuel_allocation.map((a: any) => ({
                  fuel_allocated:
                    a.fuel_allocated == null
                      ? null
                      : Number(a.fuel_allocated),
                  tracecode: a.tracecode ?? null,
                  vehicle_job: a.vehicle_job ?? null,
                }))
              : [],
          }))
        : [];

      setIssues(safe);
    } catch (e: any) {
      Alert.alert("Day report error", e?.message ?? "Failed to load day report.");
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate]);

  const totals = useMemo(() => {
    const totalIssued = issues.reduce(
      (a, i) => a + Number(i.fuel_issued || 0),
      0
    );

    const totalAllocated = issues.reduce((a, i) => {
      const alloc = (i.fuel_allocation ?? []).reduce(
        (aa, r) => aa + Number(r.fuel_allocated || 0),
        0
      );
      return a + alloc;
    }, 0);

    const unallocated = totalIssued - totalAllocated;

    return { totalIssued, totalAllocated, unallocated };
  }, [issues]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <JsplModuleHeader title="Daily Fuel Report" />
      <ThemedView style={styles.headerRow}>
        <Pressable
           onPress={() => router.replace("/(tabs)/home/fuel_report")}
            style={styles.backBtn}
>
  <ThemedText>{"< Back to Report"}</ThemedText>
</Pressable>

        <ThemedText type="title">Fuel Day Summary</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Date</ThemedText>
        <ThemedText style={styles.big}>{reportDate}</ThemedText>
      </ThemedView>

      {loading ? (
        <ThemedView style={styles.loading}>
          <ActivityIndicator />
          <ThemedText>Loading…</ThemedText>
        </ThemedView>
      ) : (
        <>
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Totals</ThemedText>
            <ThemedText>Issued: {formatNum(totals.totalIssued)} L</ThemedText>
            <ThemedText>Allocated: {formatNum(totals.totalAllocated)} L</ThemedText>
            <ThemedText>Unallocated: {formatNum(totals.unallocated)} L</ThemedText>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Issued & Allocations</ThemedText>

            {issues.length === 0 ? (
              <ThemedText style={styles.muted}>
                No fuel issues for this date.
              </ThemedText>
            ) : (
              issues.map((issue) => {
                const allocRows = issue.fuel_allocation ?? [];
                const allocTotal = allocRows.reduce(
                  (a, r) => a + Number(r.fuel_allocated || 0),
                  0
                );
                const unalloc =
                  Number(issue.fuel_issued || 0) - allocTotal;

                return (
                  <ThemedView key={issue.fuel_issue_id} style={styles.issueBlock}>
                    <ThemedText style={styles.issueTitle}>
                      Issue #{issue.fuel_issue_id} •{" "}
                      {issue.vehicle?.vehicle_name ?? "Vehicle?"}
                    </ThemedText>

                    {/* Only the issued amount is red */}
                    <ThemedText>
                      Issued:{" "}
                      <ThemedText style={styles.issuedAmount}>
                        {formatNum(issue.fuel_issued)} L
                      </ThemedText>
                      {"  •  "}
                      Alloc: {formatNum(allocTotal)} L
                      {"  •  "}
                      Unalloc: {formatNum(unalloc)} L
                    </ThemedText>

                    {issue.notes ? (
                      <ThemedText style={styles.muted}>
                        Notes: {issue.notes}
                      </ThemedText>
                    ) : null}

                    <ThemedView style={styles.allocHeader}>
                      <ThemedText style={[styles.allocCell, styles.bold]}>
                        Tracecode
                      </ThemedText>
                      <ThemedText style={[styles.allocCell, styles.bold]}>
                        Job
                      </ThemedText>
                      <ThemedText
                        style={[styles.allocCell, styles.bold, styles.right]}
                      >
                        Alloc (L)
                      </ThemedText>
                    </ThemedView>

                    {allocRows.length === 0 ? (
                      <ThemedText style={styles.muted}>
                        No allocations for this issue.
                      </ThemedText>
                    ) : (
                      allocRows.map((aRow, idx) => (
                        <ThemedView key={idx} style={styles.allocRow}>
                          <ThemedText style={styles.allocCell} numberOfLines={1}>
                            {aRow.tracecode?.tracecode_name ?? "-"}
                          </ThemedText>
                          <ThemedText style={styles.allocCell} numberOfLines={1}>
                            {aRow.vehicle_job?.vehicle_job_name ?? "-"}
                          </ThemedText>
                          <ThemedText
                            style={[styles.allocCell, styles.right]}
                            numberOfLines={1}
                          >
                            {formatNum(aRow.fuel_allocated)}
                          </ThemedText>
                        </ThemedView>
                      ))
                    )}
                  </ThemedView>
                );
              })
            )}
          </ThemedView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, paddingBottom: 24, gap: 12 },
  headerRow: { gap: 8 },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  card: { borderRadius: 12, padding: 12, borderWidth: 1, gap: 8 },
  loading: { alignItems: "center", paddingVertical: 20, gap: 10 },
  big: { fontSize: 18, fontWeight: "700" },
  muted: { opacity: 0.7 },

  issueBlock: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
    marginTop: 10,
  },
  issueTitle: { fontWeight: "800" },

  issuedAmount: {
    color: "red",
    fontWeight: "800",
  },

  allocHeader: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  allocRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  allocCell: { flex: 1, fontSize: 12 },
  right: { textAlign: "right" },
  bold: { fontWeight: "800" },
});
