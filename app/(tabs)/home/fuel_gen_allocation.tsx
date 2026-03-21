// app/(tabs)/fuel_gen_allocation.tsx
import { Picker } from '@react-native-picker/picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { supabase } from '../../../supabase';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type CropRow = { crop_id: number; crop_name: string };
type TraceRow = { tracecode_id: number; tracecode_name: string; crop_id: number | null };

type DraftRow = {
  key: string;
  crop_id: number | null;
  tracecode_id: number | null;
};

export default function FuelGenAllocationScreen() {
  const params = useLocalSearchParams();

  const vehicleId = useMemo(() => Number(params.vehicle_id), [params.vehicle_id]);
  const generatorDate = useMemo(
    () => String(params.generator_date ?? ''),
    [params.generator_date]
  );
  const hoursUsed = useMemo(() => Number(params.hours_used), [params.hours_used]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [vehicleName, setVehicleName] = useState<string | null>(null);

  const [crops, setCrops] = useState<CropRow[]>([]);
  const [traceCache, setTraceCache] = useState<Record<number, TraceRow[]>>({});

  const [drafts, setDrafts] = useState<DraftRow[]>([
    { key: String(Date.now()), crop_id: null, tracecode_id: null },
  ]);

  const selectedTraceIds = useMemo(() => {
    return new Set(drafts.map((d) => d.tracecode_id).filter(Boolean) as number[]);
  }, [drafts]);

  const loadTracecodesForCrop = useCallback(
    async (cropId: number) => {
      if (traceCache[cropId]) return;

      const { data, error } = await supabase
        .from('tracecode')
        .select('tracecode_id,tracecode_name,crop_id,start_date,end_date')
        .eq('crop_id', cropId)
        .not('start_date', 'is', null)
        .is('end_date', null)
        .order('tracecode_name', { ascending: true })
        .limit(3000);

      if (error) return;

      const rows: TraceRow[] = (data ?? []).map((r: any) => ({
        tracecode_id: r.tracecode_id,
        tracecode_name: r.tracecode_name,
        crop_id: r.crop_id ?? null,
      }));

      setTraceCache((prev) => ({ ...prev, [cropId]: rows }));
    },
    [traceCache]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
      setErr('Missing or invalid vehicle_id.');
      setLoading(false);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(generatorDate)) {
      setErr('Invalid generator_date.');
      setLoading(false);
      return;
    }
    if (!Number.isFinite(hoursUsed) || hoursUsed <= 0) {
      setErr('Invalid hours_used.');
      setLoading(false);
      return;
    }

    // Vehicle name (non-fatal if missing)
    const v = await supabase
      .from('vehicle')
      .select('vehicle_name')
      .eq('vehicle_id', vehicleId)
      .single();

    if (!v.error) setVehicleName(v.data?.vehicle_name ?? null);

    // Only crops that have ACTIVE tracecodes (start_date not null AND end_date is null)
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
    setDrafts([{ key: String(Date.now()), crop_id: null, tracecode_id: null }]);
    setLoading(false);
  }, [vehicleId, generatorDate, hoursUsed]);

  useEffect(() => {
    load();
  }, [load]);

  const updateDraft = (key: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const addRow = () => {
    setDrafts((prev) => [
      ...prev,
      { key: String(Date.now() + Math.random()), crop_id: null, tracecode_id: null },
    ]);
  };

  const removeRow = (key: string) => {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)));
  };

  const tracecodesForCropFiltered = (cropId: number | null, currentTraceId: number | null) => {
    if (!cropId) return [];
    const all = traceCache[cropId] ?? [];
    // hide already-selected tracecodes, but keep the currently selected one visible for this row
    return all.filter(
      (tc) => !selectedTraceIds.has(tc.tracecode_id) || tc.tracecode_id === currentTraceId
    );
  };

  const save = async () => {
    const traceIds = drafts
      .map((d) => d.tracecode_id)
      .filter((x): x is number => Number.isFinite(Number(x)) && Number(x) > 0);

    if (traceIds.length === 0) {
      Alert.alert('Tracecodes required', 'Please add at least one tracecode before saving.');
      return;
    }

    const unique = Array.from(new Set(traceIds));
    if (unique.length !== traceIds.length) {
      Alert.alert('Duplicate tracecode', 'You selected the same tracecode more than once.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc('create_fuel_gen_usage_with_tracecodes', {
      p_vehicle_id: vehicleId,
      p_generator_date: generatorDate,
      p_hours_used: hoursUsed,
      p_tracecode_ids: unique,
    });

    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }

    // If fuel_unallocated is in app/(tabs)/ then keep the tabs prefix:
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
        <ThemedText type="title">Generator Allocation</ThemedText>
        <ThemedText style={styles.error}>Error: {err}</ThemedText>

        <Pressable style={styles.button} onPress={() => router.back()}>
          <ThemedText style={styles.buttonText}>Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Generator Allocation</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">{vehicleName ?? 'Generator'}</ThemedText>
        <ThemedText style={styles.small}>Date: {generatorDate}</ThemedText>
        <ThemedText style={styles.small}>Hours used: {hoursUsed.toFixed(2)} h</ThemedText>
        <ThemedText style={styles.small}>Add the tracecodes that shared this generator run.</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Tracecodes</ThemedText>
        <ThemedText style={styles.small}>
          Crop → Tracecode (active). Selected tracecodes won’t appear again.
        </ThemedText>

        {drafts.map((d, idx) => {
          const options = tracecodesForCropFiltered(d.crop_id, d.tracecode_id);

          return (
            <ThemedView key={d.key} style={styles.rowBox}>
              <View style={styles.rowTop}>
                <ThemedText style={styles.rowTitle}>Row {idx + 1}</ThemedText>
                <Pressable onPress={() => removeRow(d.key)} disabled={saving}>
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
                  {crops.map((crop) => (
                    <Picker.Item key={crop.crop_id} label={crop.crop_name} value={crop.crop_id} />
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
                  {options.map((t) => (
                    <Picker.Item
                      key={t.tracecode_id}
                      label={t.tracecode_name}
                      value={t.tracecode_id}
                    />
                  ))}
                </Picker>
              </View>
            </ThemedView>
          );
        })}

        <Pressable style={styles.secondaryBtn} onPress={addRow} disabled={saving}>
          <ThemedText style={styles.buttonText}>+ Add Another Row</ThemedText>
        </Pressable>

        <Pressable
          style={[styles.button, saving ? styles.buttonDisabled : null]}
          onPress={save}
          disabled={saving}
        >
          <ThemedText style={styles.buttonText}>
            {saving ? 'Saving…' : 'Save Usage + Tracecodes'}
          </ThemedText>
        </Pressable>

        <Pressable style={styles.button} onPress={() => router.back()} disabled={saving}>
          <ThemedText style={styles.buttonText}>Back</ThemedText>
        </Pressable>
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

  rowBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontWeight: '700' },
  remove: { color: 'red', opacity: 0.9 },

  pickerBox: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },

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
