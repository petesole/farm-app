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
  View,
} from "react-native";
import { supabase } from "../../../supabase";

type IrrRow = { irrigation_type_id: number; irrigation_type: string | null };

export default function IrrigationEditScreen() {
  const { irrigationTypeId } = useLocalSearchParams<{ irrigationTypeId?: string }>();
  const isNew = irrigationTypeId === "new";

  const id = useMemo(() => {
    if (!irrigationTypeId || isNew) return null;
    const n = Number(irrigationTypeId);
    return Number.isFinite(n) ? n : null;
  }, [irrigationTypeId, isNew]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");

  async function loadRow(irrigation_type_id: number) {
    const res = await supabase
      .from("irrigation_type")
      .select("irrigation_type_id,irrigation_type")
      .eq("irrigation_type_id", irrigation_type_id)
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data as IrrRow;
  }

  useEffect(() => {
    (async () => {
      if (isNew) return;
      if (id === null) {
        Alert.alert("Bad link", "Invalid irrigationTypeId.");
        router.back();
        return;
      }

      try {
        setLoading(true);
        const r = await loadRow(id);
        setName(r.irrigation_type ?? "");
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load irrigation type");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  async function save() {
    const v = name.trim();
    if (!v) {
      Alert.alert("Missing", "Irrigation type is required.");
      return;
    }

    try {
      setSaving(true);

      if (isNew) {
        const res = await supabase.from("irrigation_type").insert({ irrigation_type: v });
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Irrigation type created.");
      } else {
        const res = await supabase
          .from("irrigation_type")
          .update({ irrigation_type: v })
          .eq("irrigation_type_id", id);
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Irrigation type updated.");
      }

      router.back();
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save irrigation type");
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
        <ThemedText type="title">{isNew ? "New Irrigation Type" : "Edit Irrigation Type"}</ThemedText>
        {!isNew ? <ThemedText style={{ opacity: 0.7 }}>ID: {String(id)}</ThemedText> : null}

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Irrigation type *</ThemedText>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Pivot"
            autoCapitalize="words"
            autoCorrect={false}
          />
        </ThemedView>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            style={[styles.btn, styles.btnGhost, { flex: 1 }]}
            onPress={() => router.back()}
            disabled={saving}
          >
            <Text style={styles.btnTextGhost}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnPrimary, { flex: 1 }, saving && { opacity: 0.7 }]}
            onPress={save}
            disabled={saving}
          >
            <Text style={styles.btnTextPrimary}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
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

  btn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: "#111" },
  btnGhost: { backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(150,150,150,0.35)" },
  btnTextPrimary: { color: "#fff", fontWeight: "700" },
  btnTextGhost: { color: "#111", fontWeight: "700" },
});
