import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
// app/(tabs)/fuel_unallocated.tsx
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { supabase } from '../../../supabase';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type UnallocIssueRow = {
  fuel_issue_id: number;
  fuel_issue_date: string;
  vehicle_id: number | null;
  vehicle_name: string | null;
  vehicle_assignment_id: number | null;

  fuel_issued: number;
  fuel_allocated_total: number;
  fuel_unallocated: number;
};

type GenRow = {
  vehicle_id: number;
  vehicle_name: string | null;
  vehicle_assignment_id: number | null;

  consumption_lph: number | null;
  fuel_remaining: number;
  hours_remaining: number | null;
};

type UnifiedRow =
  | {
      kind: 'issue';
      key: string;
      fuel_issue_id: number;
      date: string;
      vehicle_id: number | null;
      vehicle_name: string | null;
      vehicle_assignment_id: number | null;
      issued: number;
      allocated: number;
      unallocated: number;
    }
  | {
      kind: 'gen';
      key: string;
      vehicle_id: number;
      vehicle_name: string | null;
      vehicle_assignment_id: number | null;
      hours_remaining: number | null;
      fuel_remaining: number;
    };

function n0(x: any) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

export default function FuelUnallocatedScreen() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<UnifiedRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    const issuesRes = await supabase
      .from('fuel_issue_unallocated_v')
      .select(
        'fuel_issue_id,fuel_issue_date,vehicle_id,vehicle_name,vehicle_assignment_id,fuel_issued,fuel_allocated_total,fuel_unallocated'
      )
      .order('fuel_issue_date', { ascending: true })
      .order('fuel_issue_id', { ascending: true })
      .limit(1000);

    if (issuesRes.error) {
      setErr(issuesRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const issueRows: UnifiedRow[] = ((issuesRes.data ?? []) as UnallocIssueRow[]).map((r) => ({
      kind: 'issue',
      key: `issue-${r.fuel_issue_id}`,
      fuel_issue_id: r.fuel_issue_id,
      date: r.fuel_issue_date,
      vehicle_id: r.vehicle_id ?? null,
      vehicle_name: r.vehicle_name ?? null,
      vehicle_assignment_id: r.vehicle_assignment_id ?? null,
      issued: n0(r.fuel_issued),
      allocated: n0(r.fuel_allocated_total),
      unallocated: n0(r.fuel_unallocated),
    }));

    const genRes = await supabase
      .from('fuel_gen_balance_v')
      .select('vehicle_id,vehicle_name,vehicle_assignment_id,consumption_lph,fuel_remaining,hours_remaining')
      .not('hours_remaining', 'is', null)
      .gt('hours_remaining', 0)
      .order('vehicle_name', { ascending: true })
      .limit(1000);

    if (genRes.error) {
      setRows(issueRows);
      setLoading(false);
      return;
    }

    const genRows: UnifiedRow[] = ((genRes.data ?? []) as GenRow[])
      .filter((g) => ![1, 4].includes(Number(g.vehicle_assignment_id ?? -999)))
      .map((g) => ({
        kind: 'gen',
        key: `gen-${g.vehicle_id}`,
        vehicle_id: g.vehicle_id,
        vehicle_name: g.vehicle_name ?? null,
        vehicle_assignment_id: (g.vehicle_assignment_id ?? null) as number | null,
        hours_remaining: g.hours_remaining ?? null,
        fuel_remaining: n0(g.fuel_remaining),
      }));

    setRows([...issueRows, ...genRows]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onAction = (r: UnifiedRow) => {
    if (r.kind === 'issue') {
      router.push({
        pathname: '/(tabs)/home/fuel_allocation',
        params: { fuel_issue_id: String(r.fuel_issue_id) },
      });
      return;
    }

    router.push({
      pathname: '/(tabs)/home/fuel_gen_usage',
      params: { vehicle_id: String(r.vehicle_id) },
    });
  };

  const actionLabel = (r: UnifiedRow) => (r.kind === 'issue' ? 'Allocate' : 'Gen Usage');

  const totalUnalloc = useMemo(() => {
    return rows.reduce((sum, r) => (r.kind === 'issue' ? sum + n0(r.unallocated) : sum), 0);
  }, [rows]);

  const issueCount = useMemo(() => rows.filter((r) => r.kind === 'issue').length, [rows]);
  const genCount = useMemo(() => rows.filter((r) => r.kind === 'gen').length, [rows]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={styles.small}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (err) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Fuel Work Queue</ThemedText>
        <ThemedText style={styles.error}>Error: {err}</ThemedText>

        <Pressable style={styles.button} onPress={load}>
          <ThemedText style={styles.buttonText}>Retry</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <JsplModuleHeader title="Unallocated Fuel" />
      
      {/* ✅ CANCEL BUTTON ADDED */}
      <Pressable
        style={styles.cancelBtn}
        onPress={() => router.replace('/(tabs)/fuel')}
      >
        <ThemedText style={styles.cancelText}>Cancel</ThemedText>
      </Pressable>

      <ThemedText type="title">Fuel Work Queue</ThemedText>
      <ThemedText style={styles.small}>
        Allocation (assignment 1/4) + Generator usage (other assignments)
      </ThemedText>

      <ThemedView style={styles.summaryCard}>
        <ThemedText type="subtitle">Summary</ThemedText>
        <ThemedText style={styles.big}>{totalUnalloc.toFixed(0)} L</ThemedText>
        <ThemedText style={styles.small}>
          {issueCount} issue(s) need allocation • {genCount} generator item(s)
        </ThemedText>
      </ThemedView>

      {rows.length === 0 ? (
        <ThemedView style={styles.card}>
          <ThemedText style={styles.small}>Nothing pending 🎉</ThemedText>
        </ThemedView>
      ) : (
        rows.map((r) => (
          <Pressable key={r.key} style={styles.itemCard} onPress={() => onAction(r)}>
            <View style={styles.itemTop}>
              <ThemedText style={styles.itemTitle}>{r.vehicle_name ?? 'Unknown'}</ThemedText>

              <ThemedText style={[styles.badge, r.kind === 'issue' ? styles.dateRed : null]}>
                {r.kind === 'issue' ? r.date : 'GEN'}
              </ThemedText>
            </View>

            {r.kind === 'issue' ? (
              <>
                <View style={styles.kpis}>
                  <View style={styles.kpi}>
                    <ThemedText style={[styles.kpiLabel, styles.kpiBlue]}>Unallocated</ThemedText>
                    <ThemedText style={styles.kpiValue}>{n0(r.unallocated).toFixed(0)} L</ThemedText>
                  </View>
                  <View style={styles.kpi}>
                    <ThemedText style={[styles.kpiLabel, styles.kpiBlue]}>Issued</ThemedText>
                    <ThemedText style={styles.kpiValue}>{n0(r.issued).toFixed(0)} L</ThemedText>
                  </View>
                  <View style={styles.kpi}>
                    <ThemedText style={[styles.kpiLabel, styles.kpiBlue]}>Allocated</ThemedText>
                    <ThemedText style={styles.kpiValue}>{n0(r.allocated).toFixed(0)} L</ThemedText>
                  </View>
                </View>

                <ThemedText style={styles.meta}>
                  Ref #{r.fuel_issue_id} • Assign {String(r.vehicle_assignment_id ?? '')}
                </ThemedText>
              </>
            ) : (
              <>
                <View style={styles.kpis}>
                  <View style={styles.kpi}>
                    <ThemedText style={styles.kpiLabel}>Hours remaining</ThemedText>
                    <ThemedText style={styles.kpiValue}>
                      {r.hours_remaining == null ? '-' : n0(r.hours_remaining).toFixed(2)}
                    </ThemedText>
                  </View>
                  <View style={styles.kpi}>
                    <ThemedText style={styles.kpiLabel}>Fuel remaining</ThemedText>
                    <ThemedText style={styles.kpiValue}>{n0(r.fuel_remaining).toFixed(0)} L</ThemedText>
                  </View>
                  <View style={styles.kpi}>
                    <ThemedText style={styles.kpiLabel}>Assign</ThemedText>
                    <ThemedText style={styles.kpiValue}>{String(r.vehicle_assignment_id ?? '')}</ThemedText>
                  </View>
                </View>
              </>
            )}

            <Pressable style={styles.actionBtn} onPress={() => onAction(r)}>
              <ThemedText style={styles.actionText}>{actionLabel(r)} →</ThemedText>
            </Pressable>
          </Pressable>
        ))
      )}

      <Pressable style={styles.button} onPress={load}>
        <ThemedText style={styles.buttonText}>Refresh</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  summaryCard: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },

  small: { opacity: 0.75 },
  error: { color: 'red' },

  big: { fontSize: 30, fontWeight: '800' },

  itemCard: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  itemTitle: { fontSize: 16, fontWeight: '800', flex: 1 },

  badge: { fontSize: 12, opacity: 0.85 },
  dateRed: { color: 'red', fontWeight: '800', opacity: 1 },

  kpis: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },

  kpiLabel: { fontSize: 12, opacity: 0.75 },
  kpiBlue: { color: 'blue', fontWeight: '800', opacity: 1 },

  kpiValue: { fontSize: 16, fontWeight: '800' },

  meta: { opacity: 0.8 },

  actionBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  actionText: { fontWeight: '700' },

  button: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16 },

  // ✅ ADDED ONLY THIS
  cancelBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  cancelText: {
    fontWeight: '800',
    color: 'red',
  },
});