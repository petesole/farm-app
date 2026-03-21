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

type SeasonRow = { season_id: number; season_name: string | null };

export default function SeasonEditScreen() {
  const { seasonId } = useLocalSearchParams<{ seasonId?: string }>();
  const isNew = seasonId === "new";

  const id = useMemo(() => {
    if (!seasonId || isNew) return null;
    const n = Number(seasonId);
    return Number.isFinite(n) ? n : null;
  }, [seasonId, isNew]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");

  async function loadRow(season_id: number) {
    const res = await supabase.from("season").select("season_id,season_name").eq("season_id", season_id).single();
    if (res.error) throw new Error(res.error.message);
    return res.data as SeasonRow;
  }

  useEffect(() => {
    (async () => {
      if (isNew) return;
      if (id === null) {
        Alert.alert("Bad link", "Invalid seasonId.");
        router.back();
        return;
      }

      try {
        setLoading(true);
        const r = await loadRow(id);
        setName(r.season_name ?? "");
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load season");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  async function save() {
    const v = name.trim();
    if (!v) {
      Alert.alert("Missing", "Season name is required.");
      return;
    }

    try {
      setSaving(true);

      if (isNew) {
        const res = await supabase.from("season").insert({ season_name: v });
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Season created.");
      } else {
        const res = await supabase.from("season").update({ season_name: v }).eq("season_id", id);
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Season updated.");
      }

      router.back();
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save season");
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
        <ThemedText type="title">{isNew ? "New Season" : "Edit Season"}</ThemedText>
        {!isNew ? <ThemedText style={{ opacity: 0.7 }}>ID: {String(id)}</ThemedText> : null}

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Season name *</ThemedText>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. 2026 Winter"
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
