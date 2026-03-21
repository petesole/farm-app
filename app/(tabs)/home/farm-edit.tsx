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

type FarmRow = { farm_id: number; farm_name: string | null };

export default function FarmEditScreen() {
  const { farmId } = useLocalSearchParams<{ farmId?: string }>();
  const isNew = farmId === "new";

  const id = useMemo(() => {
    if (!farmId || isNew) return null;
    const n = Number(farmId);
    return Number.isFinite(n) ? n : null;
  }, [farmId, isNew]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [farmName, setFarmName] = useState("");

  async function loadFarm(farm_id: number) {
    const res = await supabase.from("farm").select("farm_id,farm_name").eq("farm_id", farm_id).single();
    if (res.error) throw new Error(res.error.message);
    return res.data as FarmRow;
  }

  useEffect(() => {
    (async () => {
      if (isNew) return;

      if (id === null) {
        Alert.alert("Bad link", "Invalid farmId.");
        router.back();
        return;
      }

      try {
        setLoading(true);
        const r = await loadFarm(id);
        setFarmName(r.farm_name ?? "");
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load farm");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  async function save() {
    const name = farmName.trim();
    if (!name) {
      Alert.alert("Missing", "Farm name is required.");
      return;
    }

    try {
      setSaving(true);

      if (isNew) {
        const res = await supabase.from("farm").insert({ farm_name: name });
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Farm created.");
        router.back();
      } else {
        if (id === null) return;
        const res = await supabase.from("farm").update({ farm_name: name }).eq("farm_id", id);
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Farm updated.");
        router.back();
      }
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save farm");
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
        <ThemedText type="title">{isNew ? "New Farm" : "Edit Farm"}</ThemedText>
        {!isNew ? <ThemedText style={{ opacity: 0.7 }}>ID: {String(id)}</ThemedText> : null}

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Farm name *</ThemedText>
          <TextInput
            style={styles.input}
            value={farmName}
            onChangeText={setFarmName}
            placeholder="e.g. Heyshott Farm"
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
