// app/(tabs)/fuel_issue.tsx
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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

/** Helpers */
function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatMeter(value: number | null) {
  if (value === null || value === undefined) return '';
  return Math.round(value).toString();
}

type VehicleRow = {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_discontinued?: boolean;
  has_meter: boolean | null;
  meter_type: 'HOURS' | 'KM' | null;
};

type DashboardForStock = {
  current_stock: number;
};

type LastMeterRow = {
  meter_reading: number | null;
};

export default function FuelIssueScreen() {
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [vehicleId, setVehicleId] = useState<number | null>(null);

  const [litres, setLitres] = useState<string>('');
  const [meterReading, setMeterReading] = useState<string>('');
  const [lastMeterReading, setLastMeterReading] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>('');

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.vehicle_id === vehicleId) ?? null,
    [vehicles, vehicleId]
  );

  const showMeter = !!selectedVehicle?.has_meter;
  const meterLabel =
    selectedVehicle?.meter_type === 'KM'
      ? 'Meter Reading (KM)'
      : 'Meter Reading (Hours)';

  const meterDelta = useMemo(() => {
    if (
      !selectedVehicle?.has_meter ||
      lastMeterReading === null ||
      !meterReading.trim()
    ) {
      return null;
    }

    const val = Number(String(meterReading).replace(/,/g, '').trim());

    if (!Number.isFinite(val)) return null;

    return val - lastMeterReading;
  }, [meterReading, lastMeterReading, selectedVehicle]);

  const loadVehicles = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('vehicle')
      .select(
        'vehicle_id,vehicle_name,vehicle_discontinued,has_meter,meter_type'
      )
      .eq('vehicle_discontinued', false)
      .order('vehicle_name', { ascending: true });

    if (error) {
      Alert.alert('Load failed', error.message);
      setVehicles([]);
      setVehicleId(null);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as VehicleRow[];
    setVehicles(list);

    const stillValid =
      vehicleId !== null && list.some((v) => v.vehicle_id === vehicleId);

    const nextVehicleId = stillValid
      ? vehicleId
      : list.length
      ? list[0].vehicle_id
      : null;

    setVehicleId(nextVehicleId);
    setLoading(false);
  };

  const loadLastMeterReading = async (selectedVehicleId: number | null) => {
    if (!selectedVehicleId) {
      setLastMeterReading(null);
      return;
    }

    const vehicle = vehicles.find((v) => v.vehicle_id === selectedVehicleId);

    if (!vehicle?.has_meter) {
      setLastMeterReading(null);
      return;
    }

    const { data, error } = await supabase
      .from('fuel_issue')
      .select('meter_reading')
      .eq('vehicle_id', selectedVehicleId)
      .not('meter_reading', 'is', null)
      .order('fuel_issue_date', { ascending: false })
      .order('fuel_issue_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setLastMeterReading(null);
      return;
    }

    const row = data as LastMeterRow | null;
    setLastMeterReading(row?.meter_reading ?? null);
  };

  useEffect(() => {
    loadVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMeterReading('');
    loadLastMeterReading(vehicleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, vehicles]);

  const saveFuelIssue = async () => {
    const qty = Number(String(litres).replace(/,/g, '').trim());
    const meterValue = Number(String(meterReading).replace(/,/g, '').trim());

    if (!vehicleId) {
      Alert.alert('Vehicle required', 'Please select a vehicle.');
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid fuel quantity (litres).');
      return;
    }

    const selected = vehicles.find((v) => v.vehicle_id === vehicleId);

    if (!selected) {
      Alert.alert('Vehicle not available', 'Please reselect a vehicle.');
      await loadVehicles();
      return;
    }

    if (selected.has_meter) {
      if (!meterReading.trim()) {
        Alert.alert(
          'Meter reading required',
          `Please enter the ${selected.meter_type === 'KM' ? 'KM' : 'hours'} reading.`
        );
        return;
      }

      if (!Number.isInteger(meterValue) || meterValue < 0) {
        Alert.alert('Invalid meter reading', 'Enter a valid whole number.');
        return;
      }

      if (lastMeterReading !== null && meterValue < lastMeterReading) {
        Alert.alert(
          'Meter reading too low',
          `New reading cannot be lower than the last reading of ${formatMeter(lastMeterReading)}.`
        );
        return;
      }
    }

    if (!selected.has_meter && meterReading.trim()) {
      Alert.alert(
        'Meter not applicable',
        'This vehicle is not set up to use meter readings.'
      );
      return;
    }

    setSaving(true);

    const { data: dash, error: dashError } = await supabase.rpc('fuel_dashboard', {
      p_today: todayISO,
    });

    if (dashError) {
      setSaving(false);
      Alert.alert('Stock check failed', dashError.message);
      return;
    }

    const currentStock = Number((dash as DashboardForStock)?.current_stock ?? 0);

    if (qty > currentStock) {
      setSaving(false);
      Alert.alert(
        'Insufficient stock',
        `Available stock is ${currentStock.toFixed(0)} L`
      );
      return;
    }

    const { error } = await supabase.from('fuel_issue').insert({
      fuel_issue_date: todayISO,
      vehicle_id: vehicleId,
      fuel_issued: qty,
      meter_reading: selected.has_meter ? meterValue : null,
      notes: notes.trim() ? notes.trim() : null,
    });

    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }

    Alert.alert('Saved', 'Fuel issue captured.');
    router.back();
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={styles.small}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Fuel Issue</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Date</ThemedText>
        <ThemedText style={styles.locked}>{todayISO} (today)</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Vehicle</ThemedText>

        {vehicles.length === 0 ? (
          <ThemedText style={styles.small}>No active vehicles found.</ThemedText>
        ) : (
          <View style={styles.pickerBox}>
            <Picker
              selectedValue={vehicleId}
              onValueChange={(val) => setVehicleId(val)}
              enabled={!saving}
            >
              {vehicles.map((v) => (
                <Picker.Item
                  key={v.vehicle_id}
                  label={v.vehicle_name}
                  value={v.vehicle_id}
                />
              ))}
            </Picker>
          </View>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Fuel Issued (Litres)</ThemedText>
        <TextInput
          style={styles.input}
          value={litres}
          onChangeText={setLitres}
          placeholder="Enter litres"
          keyboardType="numeric"
          editable={!saving}
        />
        <ThemedText style={styles.small}>
          This will be blocked if it exceeds current stock.
        </ThemedText>
      </ThemedView>

      {showMeter ? (
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">{meterLabel}</ThemedText>

          {lastMeterReading !== null ? (
            <ThemedText style={styles.small}>
              Last reading: {formatMeter(lastMeterReading)}
            </ThemedText>
          ) : (
            <ThemedText style={styles.small}>
              No previous meter reading found.
            </ThemedText>
          )}

          <TextInput
            style={styles.input}
            value={meterReading}
            onChangeText={(text) => {
              setMeterReading(text.replace(/[^0-9]/g, ''));
            }}
            placeholder={
              selectedVehicle?.meter_type === 'KM'
                ? 'Enter current KM'
                : 'Enter current hours'
            }
            keyboardType="numeric"
            editable={!saving}
          />

          {meterDelta !== null ? (
            <ThemedText style={styles.small}>
              Since last: {formatMeter(meterDelta)}
            </ThemedText>
          ) : null}
        </ThemedView>
      ) : null}

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Notes (optional)</ThemedText>
        <TextInput
          style={styles.input}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. Potato spraying - Field 12"
          editable={!saving}
        />
      </ThemedView>

      <Pressable
        style={[styles.button, saving ? styles.buttonDisabled : null]}
        onPress={saveFuelIssue}
        disabled={saving}
      >
        <ThemedText style={styles.buttonText}>
          {saving ? 'Saving…' : 'Save Fuel Issue'}
        </ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.replace('/(tabs)/fuel')}
        disabled={saving}
      >
        <ThemedText style={styles.buttonText}>Cancel</ThemedText>
      </Pressable>

      <Pressable style={styles.link} onPress={loadVehicles} disabled={saving}>
        <ThemedText style={styles.small}>Reload vehicles</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  small: { opacity: 0.75 },
  locked: { fontSize: 16, opacity: 0.9 },

  pickerBox: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },

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
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16 },

  link: { alignItems: 'center', paddingVertical: 6 },
});