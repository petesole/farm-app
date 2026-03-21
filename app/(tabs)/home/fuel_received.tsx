// app/(tabs)/fuel_received.tsx
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

type SupplierRow = {
  supplier_id: number;
  supplier_name: string;
};

export default function FuelReceivedScreen() {
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);

  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [litres, setLitres] = useState<string>('');

  const loadSuppliers = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('supplier')
      .select('supplier_id,supplier_name')
      .order('supplier_name', { ascending: true });

    if (error) {
      Alert.alert('Load failed', error.message);
      setSuppliers([]);
      setSupplierId(null);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as SupplierRow[];
    setSuppliers(list);
    if (!supplierId && list.length) setSupplierId(list[0].supplier_id);

    setLoading(false);
  };

  useEffect(() => {
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveFuelReceived = async () => {
    const qty = Number(String(litres).replace(/,/g, '').trim());

    if (!supplierId) {
      Alert.alert('Supplier required', 'Please select a supplier.');
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Invalid litres', 'Please enter a valid litres value.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('fuel_received').insert({
      fuel_received_date: todayISO, // locked to today as requested
      supplier_id: supplierId,
      invoice_no: invoiceNo.trim() ? invoiceNo.trim() : null,
      fuel_received: qty,
    });

    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }

    Alert.alert('Saved', 'Fuel received captured.');
    router.back(); // Fuel dashboard will refresh on focus (fuel.tsx)
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
      <ThemedText type="title">Fuel Received</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Date</ThemedText>
        <ThemedText style={styles.locked}>{todayISO} (today)</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Supplier</ThemedText>

        {suppliers.length === 0 ? (
          <ThemedText style={styles.small}>
            No suppliers found. Add suppliers in the supplier table first.
          </ThemedText>
        ) : (
          <View style={styles.pickerBox}>
            <Picker
              selectedValue={supplierId}
              onValueChange={(val) => setSupplierId(val)}
              enabled={!saving}
            >
              {suppliers.map((s) => (
                <Picker.Item key={s.supplier_id} label={s.supplier_name} value={s.supplier_id} />
              ))}
            </Picker>
          </View>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Invoice Number</ThemedText>
        <TextInput
          style={styles.input}
          value={invoiceNo}
          onChangeText={setInvoiceNo}
          placeholder="e.g. INV-12345"
          editable={!saving}
          autoCapitalize="characters"
        />
        <ThemedText style={styles.small}>Optional.</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Litres Received</ThemedText>
        <TextInput
          style={styles.input}
          value={litres}
          onChangeText={setLitres}
          placeholder="Enter litres"
          keyboardType="numeric"
          editable={!saving}
        />
      </ThemedView>

      <Pressable
        style={[styles.button, saving ? styles.buttonDisabled : null]}
        onPress={saveFuelReceived}
        disabled={saving || suppliers.length === 0}
      >
        <ThemedText style={styles.buttonText}>{saving ? 'Saving…' : 'Save Fuel Received'}</ThemedText>
      </Pressable>

      <Pressable style={styles.button} onPress={() => router.back()} disabled={saving}>
        <ThemedText style={styles.buttonText}>Cancel</ThemedText>
      </Pressable>

      <Pressable style={styles.link} onPress={loadSuppliers} disabled={saving}>
        <ThemedText style={styles.small}>Reload suppliers</ThemedText>
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
