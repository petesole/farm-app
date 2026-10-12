// app/(tabs)/home/fuel_planning.tsx
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { supabase } from "../../../supabase";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

type TraceSummary = {
  tracecode_id: number;
  tracecode_name: string;
  tracecode_size: number | null;
  fuel_budget_id: number | null;
  fuel_budget_name: string | null;
  budget_yield_per_ha: number | null;
  actual_yield_per_ha: number | null;
  current_dap: number | null;
  season_budget_litres: number | null;
  budget_due_today_litres: number | null;
  actual_fuel_litres: number | null;
  season_budget_remaining_litres: number | null;
  variance_vs_today_litres: number | null;
};

type BudgetActivity = {
  tracecode_id: number;
  vehicle_job_id: number;
  vehicle_job_name: string;
  target_dap: number | null;
  planned_operations: number | null;
  calculated_quantity: number | null;
  budget_trip_count: number | null;
  total_budget_litres: number | null;
  due_by_today: boolean;
  fuel_plan_method: string | null;
  fuel_plan_unit: string | null;
  class_code: string | null;
  standard_ha_per_day: number | null;
};

type ActivitySummary = {
  tracecode_id: number;
  vehicle_job_id: number;
  vehicle_job_name: string;
  budget_operations: number | null;
  operations_due_today: number | null;
  completed_operations: number | null;
  operations_remaining: number | null;
  operations_behind_today: number | null;
  total_quantity_done: number | null;
  last_work_date: string | null;
  budget_trip_count: number | null;
  budget_litres: number | null;
  budget_due_today_litres: number | null;
  actual_litres: number | null;
};

type ProgrammeRow = {
  vehicle_job_id: number;
  vehicle_job_name: string;
  dueQty: number;
  actualQty: number;
  remainingQty: number;
  dueTrips: number;
  unit: string;
};

function n(v: number | null | undefined) {
  return Number(v ?? 0);
}

function fmt(v: number | null | undefined, decimals = 0) {
  return n(v).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function qtyUnit(row: Pick<BudgetActivity, "vehicle_job_name" | "fuel_plan_method" | "fuel_plan_unit">) {
  const name = row.vehicle_job_name.toLowerCase();
  if (name === "tpt inputs" || name === "tpt produce") return "t";
  if (name === "tpt labour") return "people";
  if (row.fuel_plan_method === "HA") return "ha";
  return row.fuel_plan_unit || "units";
}

function statusText(remaining: number, actual: number, due: number) {
  if (due <= 0) return "Not due";
  if (remaining <= 0) return "Complete";
  if (actual > 0) return "Behind";
  return "Outstanding";
}

export default function FuelPlanningScreen() {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<number | null>(null);
  const [activities, setActivities] = useState<BudgetActivity[]>([]);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary[]>([]);

  const selectedTrace = useMemo(
    () => traces.find((x) => x.tracecode_id === selectedTraceId) ?? null,
    [traces, selectedTraceId]
  );

  const loadTraces = async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from("fuel_tracecode_budget_summary_v")
      .select("*")
      .order("tracecode_name", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setTraces([]);
      setSelectedTraceId(null);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as TraceSummary[];
    setTraces(rows);
    setSelectedTraceId((current) => {
      if (current && rows.some((x) => x.tracecode_id === current)) return current;
      return rows[0]?.tracecode_id ?? null;
    });
    setLoading(false);
  };

  const loadTraceDetail = async (tracecodeId: number) => {
    setDetailLoading(true);
    setError(null);

    const [budgetResult, summaryResult] = await Promise.all([
      supabase
        .from("fuel_budget_activity_v")
        .select(
          "tracecode_id,vehicle_job_id,vehicle_job_name,target_dap,planned_operations,calculated_quantity,budget_trip_count,total_budget_litres,due_by_today,fuel_plan_method,fuel_plan_unit,class_code,standard_ha_per_day"
        )
        .eq("tracecode_id", tracecodeId)
        .order("target_dap", { ascending: true })
        .order("sequence_no", { ascending: true }),

      supabase
        .from("fuel_tracecode_activity_summary_v")
        .select("*")
        .eq("tracecode_id", tracecodeId),
    ]);

    if (budgetResult.error || summaryResult.error) {
      setError(
        budgetResult.error?.message ||
          summaryResult.error?.message ||
          "Unable to load fuel planning detail."
      );
      setActivities([]);
      setActivitySummary([]);
      setDetailLoading(false);
      return;
    }

    setActivities((budgetResult.data ?? []) as BudgetActivity[]);
    setActivitySummary((summaryResult.data ?? []) as ActivitySummary[]);
    setDetailLoading(false);
  };

  useEffect(() => {
    loadTraces();
  }, []);

  useEffect(() => {
    if (selectedTraceId) {
      loadTraceDetail(selectedTraceId);
    } else {
      setActivities([]);
      setActivitySummary([]);
    }
  }, [selectedTraceId]);

  const programmeRows = useMemo<ProgrammeRow[]>(() => {
    const byJob = new Map<number, ProgrammeRow>();

    for (const row of activities) {
      if (!row.due_by_today) continue;

      const current = byJob.get(row.vehicle_job_id) ?? {
        vehicle_job_id: row.vehicle_job_id,
        vehicle_job_name: row.vehicle_job_name,
        dueQty: 0,
        actualQty: 0,
        remainingQty: 0,
        dueTrips: 0,
        unit: qtyUnit(row),
      };

      current.dueQty += n(row.calculated_quantity);
      current.dueTrips += n(row.budget_trip_count);
      byJob.set(row.vehicle_job_id, current);
    }

    for (const [jobId, row] of byJob.entries()) {
      const actual = activitySummary.find((x) => x.vehicle_job_id === jobId);
      row.actualQty = n(actual?.total_quantity_done);
      row.remainingQty = Math.max(row.dueQty - row.actualQty, 0);
    }

    return Array.from(byJob.values()).sort((a, b) =>
      a.vehicle_job_name.localeCompare(b.vehicle_job_name)
    );
  }, [activities, activitySummary]);

  const upcoming = useMemo(() => {
    const dap = selectedTrace?.current_dap;
    if (dap === null || dap === undefined) return [];

    return activities.filter((row) => {
      if (row.target_dap === null || row.target_dap === undefined) return false;
      return row.target_dap > dap && row.target_dap <= dap + 10;
    });
  }, [activities, selectedTrace]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText>Loading fuel plans...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <ThemedText type="title">Fuel Planning</ThemedText>
          <ThemedText style={styles.muted}>
            Programme position before building the weekly work pool
          </ThemedText>
        </View>

        <Pressable style={styles.refreshBtn} onPress={loadTraces}>
          <ThemedText style={styles.bold}>Refresh</ThemedText>
        </Pressable>
      </View>

      {error ? (
        <ThemedView style={styles.errorCard}>
          <ThemedText style={styles.bold}>Unable to load planning data</ThemedText>
          <ThemedText>{error}</ThemedText>
        </ThemedView>
      ) : null}

      {traces.length === 0 ? (
        <ThemedView style={styles.emptyCard}>
          <ThemedText type="subtitle">No active fuel plans yet</ThemedText>
          <ThemedText style={styles.muted}>
            This is expected for now. TraceCodes will appear here only after a fuel
            budget is assigned. Historical TraceCodes can remain unassigned.
          </ThemedText>
        </ThemedView>
      ) : (
        <>
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Choose Field / TraceCode</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.traceRow}>
                {traces.map((trace) => {
                  const selected = trace.tracecode_id === selectedTraceId;
                  return (
                    <Pressable
                      key={trace.tracecode_id}
                      style={[styles.traceBtn, selected && styles.traceBtnSelected]}
                      onPress={() => setSelectedTraceId(trace.tracecode_id)}
                    >
                      <ThemedText style={styles.bold}>{trace.tracecode_name}</ThemedText>
                      <ThemedText style={styles.smallText}>
                        {fmt(trace.tracecode_size, 1)} ha
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </ThemedView>

          {selectedTrace ? (
            <>
              <ThemedView style={styles.card}>
                <View style={styles.headerRow}>
                  <View>
                    <ThemedText type="subtitle">{selectedTrace.tracecode_name}</ThemedText>
                    <ThemedText style={styles.muted}>
                      {selectedTrace.fuel_budget_name || "Fuel budget"} · {fmt(selectedTrace.tracecode_size, 1)} ha
                      {selectedTrace.current_dap !== null
                        ? ` · DAP ${selectedTrace.current_dap}`
                        : ""}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.metricGrid}>
                  <Metric
                    label="Budget Fuel Due"
                    value={`${fmt(selectedTrace.budget_due_today_litres)} L`}
                  />
                  <Metric
                    label="Actual Fuel"
                    value={`${fmt(selectedTrace.actual_fuel_litres)} L`}
                  />
                  <Metric
                    label="Variance"
                    value={`${fmt(selectedTrace.variance_vs_today_litres)} L`}
                  />
                  <Metric
                    label="Season Budget"
                    value={`${fmt(selectedTrace.season_budget_litres)} L`}
                  />
                </View>
              </ThemedView>

              {detailLoading ? (
                <ThemedView style={styles.centerCard}>
                  <ActivityIndicator />
                  <ThemedText>Loading programme position...</ThemedText>
                </ThemedView>
              ) : (
                <>
                  <ThemedView style={styles.card}>
                    <ThemedText type="subtitle">Programme Position</ThemedText>
                    <ThemedText style={styles.muted}>
                      What should have happened by today versus work actually logged.
                    </ThemedText>

                    {programmeRows.length === 0 ? (
                      <ThemedText style={styles.emptyText}>
                        Nothing in the programme is due yet.
                      </ThemedText>
                    ) : (
                      programmeRows.map((row) => {
                        const status = statusText(
                          row.remainingQty,
                          row.actualQty,
                          row.dueQty
                        );

                        return (
                          <View key={row.vehicle_job_id} style={styles.activityRow}>
                            <View style={styles.activityMain}>
                              <ThemedText style={styles.bold}>
                                {row.vehicle_job_name}
                              </ThemedText>
                              <ThemedText style={styles.smallText}>
                                Due {fmt(row.dueQty, row.unit === "ha" ? 1 : 2)} {row.unit}
                                {" · "}Actual {fmt(row.actualQty, row.unit === "ha" ? 1 : 2)} {row.unit}
                                {" · "}Remaining {fmt(row.remainingQty, row.unit === "ha" ? 1 : 2)} {row.unit}
                              </ThemedText>
                              {row.dueTrips > 0 ? (
                                <ThemedText style={styles.smallText}>
                                  Standalone budget trips: {fmt(row.dueTrips)}
                                </ThemedText>
                              ) : null}
                            </View>

                            <ThemedView style={styles.statusPill}>
                              <ThemedText style={styles.bold}>{status}</ThemedText>
                            </ThemedView>
                          </View>
                        );
                      })
                    )}
                  </ThemedView>

                  <ThemedView style={styles.card}>
                    <ThemedText type="subtitle">Upcoming — Next 10 DAP</ThemedText>

                    {upcoming.length === 0 ? (
                      <ThemedText style={styles.emptyText}>
                        No programme activities due in the next 10 DAP.
                      </ThemedText>
                    ) : (
                      upcoming.map((row, index) => (
                        <View
                          key={`${row.vehicle_job_id}-${row.target_dap}-${index}`}
                          style={styles.upcomingRow}
                        >
                          <View style={styles.dapBox}>
                            <ThemedText style={styles.bold}>DAP {row.target_dap}</ThemedText>
                          </View>

                          <View style={styles.activityMain}>
                            <ThemedText style={styles.bold}>
                              {row.vehicle_job_name}
                            </ThemedText>
                            <ThemedText style={styles.smallText}>
                              {fmt(row.calculated_quantity, qtyUnit(row) === "ha" ? 1 : 2)}{" "}
                              {qtyUnit(row)}
                              {row.class_code ? ` · ${row.class_code}` : ""}
                              {row.standard_ha_per_day
                                ? ` · standard ${fmt(row.standard_ha_per_day)} ha/day`
                                : ""}
                            </ThemedText>
                          </View>
                        </View>
                      ))
                    )}
                  </ThemedView>
                </>
              )}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView style={styles.metric}>
      <ThemedText style={styles.smallText}>{label}</ThemedText>
      <ThemedText type="subtitle">{value}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 12,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  centerCard: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.3)",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.3)",
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.3)",
    borderRadius: 10,
    padding: 18,
    gap: 8,
  },
  errorCard: {
    borderWidth: 1,
    borderColor: "rgba(180,80,80,0.7)",
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  refreshBtn: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.4)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  traceRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  traceBtn: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 130,
  },
  traceBtnSelected: {
    borderWidth: 2,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metric: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.25)",
    borderRadius: 8,
    padding: 10,
    minWidth: 145,
    flexGrow: 1,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "rgba(120,120,120,0.2)",
    paddingTop: 10,
    gap: 10,
  },
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "rgba(120,120,120,0.2)",
    paddingTop: 10,
    gap: 10,
  },
  activityMain: {
    flex: 1,
    gap: 3,
  },
  statusPill: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dapBox: {
    minWidth: 68,
  },
  muted: {
    opacity: 0.7,
  },
  smallText: {
    fontSize: 12,
    opacity: 0.75,
  },
  emptyText: {
    opacity: 0.7,
    paddingVertical: 8,
  },
  bold: {
    fontWeight: "700",
  },
});
