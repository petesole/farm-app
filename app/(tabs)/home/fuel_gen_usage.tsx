import {fuelDateISO} from "./fuel_admin_dates";
// app/(tabs)/fuel_gen_usage.tsx
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { supabase } from '../../../supabase';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDMY(iso: string) {
  // YYYY-MM-DD -> DD/MM/YYYY
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function dmyToISO(dmy: string) { return fuelDateISO(dmy); }

function n0(x: any) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

type GenBalance = {
  vehicle_id: number;
  vehicle_name: string | null;
  vehicle_assignment_id: number | null;
  consumption_lph: number | null;
  fuel_issued_total: number;
  hours_used_total: number;
  fuel_used_total: number;
  fuel_remaining: number;
  hours_remaining: number | null;
};

type LastUsage = {
  generator_date: string; // ISO
  hours_used: number;
};

export default function FuelGenUsageScreen() {
  const params = useLocalSearchParams();
  const vehicleId = useMemo(() => Number(params.vehicle_id), [params.vehicle_id]);

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [balance, setBalance] = useState<GenBalance | null>(null);
  const [lastUsage, setLastUsage] = useState<LastUsage | null>(null);

  // UI date is DD/MM/YYYY (editable)
  const [generatorDateDMY, setGeneratorDateDMY] = useState<string>(() => isoToDMY(todayISO));
  const [hoursUsed, setHoursUsed] = useState<string>('');

  const load = useCallback(async () => {
    if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
      setErr('Missing or invalid vehicle_id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    // Balance view
    const { data, error } = await supabase
      .from('fuel_gen_balance_v')
      .select(
        'vehicle_id,vehicle_name,vehicle_assignment_id,consumption_lph,fuel_issued_total,hours_used_total,fuel_used_total,fuel_remaining,hours_remaining'
      )
      .eq('vehicle_id', vehicleId)
      .single();

    if (error) {
      setErr(error.message);
      setBalance(null);
      setLastUsage(null);
      setLoading(false);
      return;
    }

    setBalance(data as GenBalance);

    // last usage row (optional)
    const last = await supabase
      .from('fuel_gen_usage')
      .select('generator_date,hours_used')
      .eq('vehicle_id', vehicleId)
      .order('generator_date', { ascending: false })
      .limit(1);

    if (!last.error && last.data && last.data.length > 0) {
      const luISO = last.data[0].generator_date as string;

      setLastUsage({
        generator_date: luISO,
        hours_used: n0(last.data[0].hours_used),
      });

      // Default to today, but if today is before last usage (shouldn't happen),
      // force to last usage. Otherwise use today.
      const defaultISO = todayISO < luISO ? luISO : todayISO;
      setGeneratorDateDMY(isoToDMY(defaultISO));
    } else {
      setLastUsage(null);
      setGeneratorDateDMY(isoToDMY(todayISO));
    }

    setLoading(false);
  }, [vehicleId, todayISO]);

  useEffect(() => {
    load();
  }, [load]);

  const hoursRemaining = balance?.hours_remaining ?? null;

  const validateDateRules = (iso: string) => {
    // Rule A: cannot be after today
    if (iso > todayISO) {
      return `Date cannot be after today (${isoToDMY(todayISO)}).`;
    }

    // Rule B: cannot be BEFORE last usage date (if any)
    if (lastUsage?.generator_date && iso < lastUsage.generator_date) {
      return `Date cannot be before the last usage date (${isoToDMY(lastUsage.generator_date)}).`;
    }

    return null;
  };

  const next = () => {
    if (!balance) return;

    const h = Number(String(hoursUsed).replace(/,/g, '').trim());
    if (!Number.isFinite(h) || h <= 0) {
      Alert.alert('Hours used required', 'Please enter a valid hours value.');
      return;
    }

    const iso = dmyToISO(generatorDateDMY);
    if (!iso) {
      Alert.alert('Invalid date', 'Use DD/MM/YYYY or D/M (e.g. 5/12).');
      return;
    }

    const ruleErr = validateDateRules(iso);
    if (ruleErr) {
      Alert.alert('Invalid date', ruleErr);
      return;
    }

    // Pre-check (RPC will validate again)
    if (hoursRemaining !== null && h > hoursRemaining + 1e-9) {
      Alert.alert('Hours used exceeds hours remaining.', `Remaining: ${hoursRemaining.toFixed(2)} h`);
      return;
    }

    router.push({
      pathname: '/home/fuel_gen_allocation',
      params: {
        vehicle_id: String(vehicleId),
        generator_date: iso, // send ISO to DB / next screen
        hours_used: String(h),
      },
    });
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
        <ThemedText type="title">Generator Usage</ThemedText>
        <ThemedText style={styles.error}>Error: {err}</ThemedText>

        <Pressable style={styles.button} onPress={load}>
          <ThemedText style={styles.buttonText}>Retry</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (!balance) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Generator Usage</ThemedText>
        <ThemedText style={styles.error}>No balance found for this generator.</ThemedText>
      </ThemedView>
    );
  }

  const minISO = lastUsage?.generator_date ?? null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Generator Usage</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">{balance.vehicle_name ?? 'Generator'}</ThemedText>

        {lastUsage ? (
          <ThemedText style={styles.small}>
            Last usage: {isoToDMY(lastUsage.generator_date)} • {n0(lastUsage.hours_used).toFixed(2)} h
          </ThemedText>
        ) : (
          <ThemedText style={styles.small}>Last usage: none recorded</ThemedText>
        )}

        <ThemedText style={styles.small}>
          Consumption: {n0(balance.consumption_lph).toFixed(2)} L/hr
        </ThemedText>
        <ThemedText style={styles.small}>
          Fuel remaining: {n0(balance.fuel_remaining).toFixed(0)} L
        </ThemedText>
        <ThemedText style={styles.small}>
          Hours remaining:{' '}
          {hoursRemaining === null ? 'N/A (set consumption)' : hoursRemaining.toFixed(2)}
        </ThemedText>

        <ThemedText style={styles.small}>
          Allowed date range:{' '}
          {minISO ? `${isoToDMY(minISO)} to ${isoToDMY(todayISO)}` : `Up to ${isoToDMY(todayISO)}`}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Generator Date</ThemedText>
        <TextInput
          style={styles.input}
          value={generatorDateDMY}
          onChangeText={setGeneratorDateDMY}
          placeholder="DD/MM/YYYY"
        />
        <ThemedText style={styles.small}>Format: DD/MM/YYYY (e.g. 09/02/2026)</ThemedText>
        {minISO ? (
          <ThemedText style={styles.small}>Must be ≥ {isoToDMY(minISO)} and ≤ {isoToDMY(todayISO)}.</ThemedText>
        ) : (
          <ThemedText style={styles.small}>Must be ≤ {isoToDMY(todayISO)}.</ThemedText>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Hours Used</ThemedText>
        <TextInput
          style={styles.input}
          value={hoursUsed}
          onChangeText={setHoursUsed}
          keyboardType="numeric"
          placeholder="e.g. 5.5"
        />
        {hoursRemaining !== null && (
          <ThemedText style={styles.small}>Must be ≤ {hoursRemaining.toFixed(2)} hours.</ThemedText>
        )}
      </ThemedView>

      <Pressable style={styles.button} onPress={next}>
        <ThemedText style={styles.buttonText}>Next: Select Tracecodes</ThemedText>
      </Pressable>

      <Pressable style={styles.button} onPress={() => router.back()}>
        <ThemedText style={styles.buttonText}>Cancel</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  small: { opacity: 0.75 },
  error: { color: 'red' },

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
  },
  buttonText: { fontSize: 16 },
});


