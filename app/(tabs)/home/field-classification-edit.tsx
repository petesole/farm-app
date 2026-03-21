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
  Text,
  TextInput,
} from "react-native";
import { supabase } from "../../../supabase";

type Row = { field_classification_id: number; field_classification_name: string | null };

export default function FieldClassificationEditScreen() {
  const { fieldClassificationId } = useLocalSearchParams<{ fieldClassificationId?: string }>();
  const isNew = fieldClassificationId === "new";

  const id = useMemo(() => {
    if (!fieldClassificationId || isNew) return null;
    const n = Number(fieldClassificationId);
    return Number.isFinite(n) ? n : null;
  }, [fieldClassificationId, isNew]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  async function loadRow(field_classification_id: number) {
    const res = await supabase
      .from("field_classification")
      .select("field_classification_id,field_classification_name")
      .eq("field_classification_id", field_classification_id)
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data as Row;
  }

  useEffect(() => {
    (async () => {
      if (isNew) return;
      if (id === null) {
        Alert.alert("Bad link", "Invalid fieldClassificationId.");
        router.back();
        return;
      }
      try {
        setLoading(true);
        const r = await loadRow(id);
        setName(r.field_classification_name ?? "");
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load classification");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  async function save() {
    const v = name.trim();
    if (!v) {
      Alert.alert("Missing", "Classification name is required.");
      return;
    }

    try {
      setSaving(true);
      if (isNew) {
        const res = await supabase.from("field_classification").insert({ field_classification_name: v });
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Classification created.");
      } else {
        const res = await supabase
          .from("field_classification")
          .update({ field_classification_name: v })
          .eq("field_classification_id", id);
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Classification updated.");
      }
      router.back();
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save classification");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={{ marginTop: 10 }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <ThemedText type="title">{isNew ? "New Classification" : "Edit Classification"}</ThemedText>
        {!isNew ? <ThemedText style={{ opacity: 0.7 }}>ID: {String(id)}</ThemedText> : null}

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Name *</ThemedText>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Pivot"
            autoCapitalize="words"
            autoCorrect={false}
          />
        </ThemedView>

        <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
          <Text style={styles.saveText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },

  card: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.25)",
  },

  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },

  saveBtn: {
    marginTop: 12,
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "700" },
});
