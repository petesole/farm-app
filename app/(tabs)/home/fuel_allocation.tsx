// app/(tabs)/fuel_allocation.tsx
import { Picker } from '@react-native-picker/picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../../supabase';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type CropRow = {
  crop_id: number;
  crop_name: string;
};

type TracecodeRow = {
  tracecode_id: number;
  tracecode_name: string;
  crop_id: number | null;
};

type VehicleJobRow = {
  vehicle_job_id: number;
  vehicle_job_name: string;
};

type IssueHeader = {
  fuel_issue_id: number;
  fuel_issue_date: string;
  fuel_issued: number;
  vehicle_id: number | null;
  vehicle_name: string | null;
  vehicle_assignment_id: number | null;
};

type ExistingAllocRow = {
  fuel_allocation_id: number;
  fuel_allocated: number;
  crop_name: string | null;
  tracecode_name: string | null;
  vehicle_job_name: string | null;
};

type DraftRow = {
  key: string;
  crop_id: number | null;
  tracecode_id: number | null;
  vehicle_job_id: number | null;
  fuel_allocated_text: string;
};

function n0(x: any) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

function parseQty(txt: string) {
  const cleaned = String(txt ?? '').replace(/[^\d.]/g, '').trim();
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}

export default function FuelAllocationScreen() {
  const params = useLocalSearchParams();
  const fuelIssueId = useMemo(() => Number(params.fuel_issue_id), [params.fuel_issue_id]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // header
  const [issue, setIssue] = useState<IssueHeader | null>(null);

  // reference lists
  const [crops, setCrops] = useState<CropRow[]>([]);
  const [jobs, setJobs] = useState<VehicleJobRow[]>([]);

  // tracecodes loaded per crop (cache by crop_id)
  const [tracecodeCache, setTracecodeCache] = useState<Record<number, TracecodeRow[]>>({});

  // existing allocations
  const [existing, setExisting] = useState<ExistingAllocRow[]>([]);

  // draft allocations (multi-row)
  const [drafts, setDrafts] = useState<DraftRow[]>([
    {
      key: String(Date.now()),
      crop_id: null,
      tracecode_id: null,
      vehicle_job_id: null,
      fuel_allocated_text: '',
    },
  ]);

  const loadTracecodesForCrop = useCallback(
    async (cropId: number) => {
      // if already cached, skip
      if (tracecodeCache[cropId]) return;

      // ✅ ONLY ACTIVE TRACECODES:
      // start_date IS NOT NULL AND end_date IS NULL
      const { data, error } = await supabase
        .from('tracecode')
        .select('tracecode_id,tracecode_name,crop_id,start_date,end_date')
        .eq('crop_id', cropId)
        .not('start_date', 'is', null)
        .is('end_date', null)
        .order('tracecode_name', { ascending: true })
        .limit(3000);

      if (error) return;

      const rows: TracecodeRow[] = (data ?? []).map((r: any) => ({
        tracecode_id: r.tracecode_id,
        tracecode_name: r.tracecode_name,
        crop_id: r.crop_id ?? null,
      }));

      setTracecodeCache((prev) => ({ ...prev, [cropId]: rows }));
    },
    [tracecodeCache]
  );

  const loadAll = useCallback(async () => {
    if (!Number.isFinite(fuelIssueId) || fuelIssueId <= 0) {
      setErr('Missing or invalid fuel_issue_id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    // 1) Load fuel issue
    const { data: issueData, error: issueErr } = await supabase
      .from('fuel_issue')
      .select('fuel_issue_id,fuel_issue_date,fuel_issued,vehicle_id')
      .eq('fuel_issue_id', fuelIssueId)
      .single();

    if (issueErr) {
      setErr(issueErr.message);
      setLoading(false);
      return;
    }

    // 2) Load vehicle details (name + assignment)
    let vehicle_name: string | null = null;
    let vehicle_assignment_id: number | null = null;

    if (issueData?.vehicle_id) {
      const { data: vData } = await supabase
        .from('vehicle')
        .select('vehicle_name,vehicle_assignment_id')
        .eq('vehicle_id', issueData.vehicle_id)
        .single();

      if (vData) {
        vehicle_name = vData.vehicle_name ?? null;
        vehicle_assignment_id = (vData.vehicle_assignment_id ?? null) as number | null;
      }
    }

    setIssue({
      fuel_issue_id: issueData.fuel_issue_id,
      fuel_issue_date: issueData.fuel_issue_date,
      fuel_issued: n0(issueData.fuel_issued),
      vehicle_id: issueData.vehicle_id ?? null,
      vehicle_name,
      vehicle_assignment_id,
    });

    // 3) ✅ Load CROPS that have ACTIVE TRACECODES only
    // start_date IS NOT NULL AND end_date IS NULL
    const tc = await supabase
      .from('tracecode')
      .select('crop_id, crop:crop_id (crop_id, crop_name)')
      .not('start_date', 'is', null)
      .is('end_date', null)
      .not('crop_id', 'is', null)
      .limit(5000);

    if (tc.error) {
      setErr(tc.error.message);
      setLoading(false);
      return;
    }

    // De-duplicate crops
    const map = new Map<number, CropRow>();
    for (const r of tc.data ?? []) {
      const crop = (r as any).crop;
      if (crop?.crop_id && crop?.crop_name) {
        map.set(crop.crop_id, { crop_id: crop.crop_id, crop_name: crop.crop_name });
      }
    }

    const activeCrops = Array.from(map.values()).sort((a, b) =>
      a.crop_name.localeCompare(b.crop_name)
    );

    setCrops(activeCrops);

    // 4) Load vehicle jobs
    const jb = await supabase
      .from('vehicle_job')
      .select('vehicle_job_id,vehicle_job_name')
      .order('vehicle_job_name', { ascending: true })
      .limit(2000);

    if (jb.error) {
      setErr(jb.error.message);
      setLoading(false);
      return;
    }
    setJobs((jb.data ?? []) as VehicleJobRow[]);

    // 5) Load existing allocations with names (+ crop via tracecode -> crop)
    const ex = await supabase
      .from('fuel_allocation')
      .select(
        `
        fuel_allocation_id,
        fuel_allocated,
        tracecode:tracecode_id(
          tracecode_name,
          crop:crop_id(crop_name)
        ),
        vehicle_job:vehicle_job_id(vehicle_job_name)
      `
      )
      .eq('fuel_issue_id', fuelIssueId)
      .order('fuel_allocation_id', { ascending: false })
      .limit(5000);

    if (ex.error) {
      setErr(ex.error.message);
      setLoading(false);
      return;
    }

    const mapped: ExistingAllocRow[] = (ex.data ?? []).map((r: any) => ({
      fuel_allocation_id: r.fuel_allocation_id,
      fuel_allocated: n0(r.fuel_allocated),
      crop_name: r.tracecode?.crop?.crop_name ?? null,
      tracecode_name: r.tracecode?.tracecode_name ?? null,
      vehicle_job_name: r.vehicle_job?.vehicle_job_name ?? null,
    }));
    setExisting(mapped);

    // reset drafts
    setDrafts([
      {
        key: String(Date.now()),
        crop_id: null,
        tracecode_id: null,
        vehicle_job_id: null,
        fuel_allocated_text: '',
      },
    ]);

    setLoading(false);
  }, [fuelIssueId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const existingTotal = useMemo(
    () => existing.reduce((sum, r) => sum + n0(r.fuel_allocated), 0),
    [existing]
  );

  const draftTotal = useMemo(
    () => drafts.reduce((sum, d) => sum + parseQty(d.fuel_allocated_text), 0),
    [drafts]
  );

  const issued = issue?.fuel_issued ?? 0;

  const canAllocate = useMemo(() => {
    // Only vehicles with assignment 1 or 4 should actually need allocations
    const a = issue?.vehicle_assignment_id ?? null;
    return a === 1 || a === 4;
  }, [issue?.vehicle_assignment_id]);

  const unallocatedNow = useMemo(() => {
    if (!canAllocate) return 0;
    return Math.max(0, issued - existingTotal);
  }, [canAllocate, issued, existingTotal]);

  const addDraftRow = () => {
    setDrafts((prev) => [
      ...prev,
      {
        key: String(Date.now() + Math.random()),
        crop_id: null,
        tracecode_id: null,
        vehicle_job_id: null,
        fuel_allocated_text: '',
      },
    ]);
  };

  const removeDraftRow = (key: string) => {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)));
  };

  const updateDraft = (key: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const tracecodesForCrop = (cropId: number | null) => {
    if (!cropId) return [];
    return tracecodeCache[cropId] ?? [];
  };

  const save = async () => {
    if (!issue) return;

    if (!canAllocate) {
      Alert.alert('Not required', 'This vehicle type does not require allocation (allocated = issued).');
      router.replace('/(tabs)/home/fuel_unallocated');
      return;
    }

    // Build rows to insert (ignore incomplete rows)
    const rows = drafts
      .map((d) => ({
        crop_id: d.crop_id,
        tracecode_id: d.tracecode_id,
        vehicle_job_id: d.vehicle_job_id,
        fuel_allocated: parseQty(d.fuel_allocated_text),
      }))
      .filter(
        (r) =>
          r.crop_id &&
          r.tracecode_id &&
          r.vehicle_job_id &&
          Number.isFinite(r.fuel_allocated) &&
          r.fuel_allocated > 0
      );

    if (rows.length === 0) {
      Alert.alert('Nothing to save', 'Add at least one allocation row (crop, tracecode, job, litres).');
      return;
    }

    const newTotal = rows.reduce((s, r) => s + n0(r.fuel_allocated), 0);
const remaining = Math.max(0, issued - existingTotal);

if (newTotal > remaining) {
  Alert.alert(
    "Over-allocation blocked",
    `You can only allocate up to the remaining litres.\n\n` +
      `Issued: ${issued.toFixed(0)} L\n` +
      `Already allocated: ${existingTotal.toFixed(0)} L\n` +
      `Remaining: ${remaining.toFixed(0)} L\n\n` +
      `You tried to add: ${newTotal.toFixed(0)} L`
  );
  return;
}


    setSaving(true);

    const insertPayload = rows.map((r) => ({
      fuel_issue_id: issue.fuel_issue_id,
      tracecode_id: r.tracecode_id,
      vehicle_job_id: r.vehicle_job_id,
      fuel_allocated: r.fuel_allocated,
    }));

    const { error } = await supabase.from('fuel_allocation').insert(insertPayload);

    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }

    router.replace('/(tabs)/home/fuel_unallocated');
  };

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
        <ThemedText type="title">Fuel Allocation</ThemedText>
        <ThemedText style={styles.error}>Error: {err}</ThemedText>

        <Pressable style={styles.button} onPress={loadAll}>
          <ThemedText style={styles.buttonText}>Retry</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (!issue) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Fuel Allocation</ThemedText>
        <ThemedText style={styles.error}>No fuel issue found.</ThemedText>
      </ThemedView>
    );
  }

  const grandAfterDraft = existingTotal + draftTotal;
  const exceed = canAllocate && grandAfterDraft > issued;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Fuel Allocation</ThemedText>

      {/* Header */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Fuel Issue</ThemedText>
        <ThemedText style={styles.bigLine}>
          #{issue.fuel_issue_id} • {issue.fuel_issue_date}
        </ThemedText>
        <ThemedText style={styles.small}>
          Vehicle: {issue.vehicle_name ?? 'Unknown'} • Issued: {issued.toFixed(0)} L
        </ThemedText>
        <ThemedText style={styles.small}>
          Allocated so far: {existingTotal.toFixed(0)} L • Unallocated: {unallocatedNow.toFixed(0)} L
        </ThemedText>
        {!canAllocate && (
          <ThemedText style={styles.small}>
            Note: This vehicle type does not require allocation (allocated = issued).
          </ThemedText>
        )}
      </ThemedView>

      {/* Existing allocations */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Allocated Summary</ThemedText>

        {existing.length === 0 ? (
          <ThemedText style={styles.small}>No allocations captured yet.</ThemedText>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <ThemedText style={styles.hCrop}>Crop</ThemedText>
              <ThemedText style={styles.hTrace}>Tracecode</ThemedText>
              <ThemedText style={styles.hJob}>Job</ThemedText>
              <ThemedText style={styles.hRight}>Litres</ThemedText>
            </View>

            {existing.map((r) => (
              <View key={r.fuel_allocation_id} style={styles.tableRow}>
                <ThemedText style={styles.cCrop}>{r.crop_name ?? 'Unknown'}</ThemedText>
                <ThemedText style={styles.cTrace}>{r.tracecode_name ?? 'Unknown'}</ThemedText>
                <ThemedText style={styles.cJob}>{r.vehicle_job_name ?? 'Unknown'}</ThemedText>
                <ThemedText style={styles.cRight}>{n0(r.fuel_allocated).toFixed(0)}</ThemedText>
              </View>
            ))}
          </View>
        )}
      </ThemedView>

      {/* Draft allocations */}
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Add Allocations</ThemedText>
        <ThemedText style={styles.small}>
          Choose Crop → Tracecode → Job → Litres. Add multiple rows, then Save once.
        </ThemedText>

        {drafts.map((d, idx) => {
          const tcs = tracecodesForCrop(d.crop_id);
          return (
            <ThemedView key={d.key} style={styles.draftBox}>
              <View style={styles.draftTop}>
                <ThemedText style={styles.rowTitle}>Row {idx + 1}</ThemedText>
                <Pressable onPress={() => removeDraftRow(d.key)} disabled={saving}>
                  <ThemedText style={styles.remove}>Remove</ThemedText>
                </Pressable>
              </View>

              <ThemedText style={styles.small}>Crop</ThemedText>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={d.crop_id}
                  onValueChange={async (val) => {
                    updateDraft(d.key, { crop_id: val, tracecode_id: null });
                    if (val) await loadTracecodesForCrop(val);
                  }}
                  enabled={!saving}
                >
                  <Picker.Item label="Select crop..." value={null} />
                  {crops.map((c) => (
                    <Picker.Item key={c.crop_id} label={c.crop_name} value={c.crop_id} />
                  ))}
                </Picker>
              </View>

              <ThemedText style={styles.small}>Tracecode (active)</ThemedText>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={d.tracecode_id}
                  onValueChange={(val) => updateDraft(d.key, { tracecode_id: val })}
                  enabled={!saving && !!d.crop_id}
                >
                  <Picker.Item
                    label={d.crop_id ? 'Select tracecode...' : 'Select crop first'}
                    value={null}
                  />
                  {tcs.map((t) => (
                    <Picker.Item key={t.tracecode_id} label={t.tracecode_name} value={t.tracecode_id} />
                  ))}
                </Picker>
              </View>

              <ThemedText style={styles.small}>Job</ThemedText>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={d.vehicle_job_id}
                  onValueChange={(val) => updateDraft(d.key, { vehicle_job_id: val })}
                  enabled={!saving}
                >
                  <Picker.Item label="Select job..." value={null} />
                  {jobs.map((j) => (
                    <Picker.Item key={j.vehicle_job_id} label={j.vehicle_job_name} value={j.vehicle_job_id} />
                  ))}
                </Picker>
              </View>

              <ThemedText style={styles.small}>Fuel Allocated (Litres)</ThemedText>
              <TextInput
                style={styles.input}
                value={d.fuel_allocated_text}
                onChangeText={(txt) => updateDraft(d.key, { fuel_allocated_text: txt })}
                placeholder="Enter litres"
                keyboardType="numeric"
                editable={!saving}
              />
            </ThemedView>
          );
        })}

        <Pressable style={styles.secondaryBtn} onPress={addDraftRow} disabled={saving}>
          <ThemedText style={styles.buttonText}>+ Add Another Row</ThemedText>
        </Pressable>

        <ThemedText style={[styles.small, exceed ? styles.error : null]}>
          Draft total: {draftTotal.toFixed(0)} L • After save: {grandAfterDraft.toFixed(0)} / {issued.toFixed(0)} L
          {exceed ? '  (exceeds issued)' : ''}
        </ThemedText>

        <Pressable
          style={[styles.button, saving || !canAllocate ? styles.buttonDisabled : null]}
          onPress={save}
          disabled={saving || !canAllocate}
        >
          <ThemedText style={styles.buttonText}>{saving ? 'Saving…' : 'Save Allocations'}</ThemedText>
        </Pressable>

        {!canAllocate && (
          <Pressable
            style={styles.button}
            onPress={() => router.replace('/(tabs)/home/fuel_unallocated')}
            disabled={saving}
          >
            <ThemedText style={styles.buttonText}>Back</ThemedText>
          </Pressable>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  small: { opacity: 0.75 },
  error: { color: 'red' },

  bigLine: { fontSize: 16, fontWeight: '700' },

  table: { gap: 6 },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    opacity: 0.9,
    alignItems: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    opacity: 0.95,
    alignItems: 'center',
  },

  hCrop: { width: 110, fontWeight: '700' },
  hTrace: { flex: 2, fontWeight: '700' },
  hJob: { flex: 2, fontWeight: '700' },
  hRight: { width: 80, textAlign: 'right', fontWeight: '700' },

  cCrop: { width: 110, fontSize: 13 },
  cTrace: { flex: 2, fontSize: 13 },
  cJob: { flex: 2, fontSize: 13 },
  cRight: { width: 80, textAlign: 'right', fontSize: 13 },

  draftBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  draftTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontWeight: '700' },
  remove: { color: 'red', opacity: 0.9 },

  pickerBox: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },

  button: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
    opacity: 0.95,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16 },
});
