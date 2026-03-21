import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Picker } from "@react-native-picker/picker";
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

type CropRow = { crop_id: number; crop_name: string | null };
type VarietyRow = { variety_id: number; crop_id: number | null; variety_name: string | null };

export default function VarietyEditScreen() {
  const { varietyId } = useLocalSearchParams<{ varietyId?: string }>();
  const isNew = varietyId === "new";

  const id = useMemo(() => {
    if (!varietyId || isNew) return null;
    const n = Number(varietyId);
    return Number.isFinite(n) ? n : null;
  }, [varietyId, isNew]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [crops, setCrops] = useState<CropRow[]>([]);

  // Form
  const [cropId, setCropId] = useState<number | null>(null);
  const [varietyName, setVarietyName] = useState("");

  async function loadCrops() {
    const res = await supabase.from("crop").select("crop_id,crop_name").order("crop_name");
    if (res.error) throw new Error(res.error.message);
    setCrops((res.data ?? []) as CropRow[]);
  }

  async function loadVariety(variety_id: number) {
    const res = await supabase
      .from("variety")
      .select("variety_id,crop_id,variety_name")
      .eq("variety_id", variety_id)
      .single();

    if (res.error) throw new Error(res.error.message);
    return res.data as VarietyRow;
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        await loadCrops();

        if (!isNew) {
          if (id === null) {
            Alert.alert("Bad link", "Invalid varietyId.");
            router.back();
            return;
          }

          const v = await loadVariety(id);
          setCropId(v.crop_id ?? null);
          setVarietyName(v.variety_name ?? "");
        } else {
          // New: default to first crop if available (user can change)
          setCropId((prev) => prev ?? (crops[0]?.crop_id ?? null));
        }
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load variety");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  // If crops load later and we are on NEW, set a sensible default crop
  useEffect(() => {
    if (!isNew) return;
    if (cropId !== null) return;
    if (crops.length > 0) setCropId(crops[0].crop_id);
  }, [crops, isNew, cropId]);

  async function save() {
    const name = varietyName.trim();
    if (!cropId) {
      Alert.alert("Missing crop", "Please choose a crop first.");
      return;
    }
    if (!name) {
      Alert.alert("Missing variety name", "Please enter a variety name.");
      return;
    }

    try {
      setSaving(true);

      if (isNew) {
        const res = await supabase.from("variety").insert({
          crop_id: cropId,
          variety_name: name,
        });
        if (res.error) throw res.error;
        Alert.alert("Saved", "Variety created.");
        router.back();
      } else {
        if (id === null) return;

        const res = await supabase
          .from("variety")
          .update({ crop_id: cropId, variety_name: name })
          .eq("variety_id", id);

        if (res.error) throw res.error;
        Alert.alert("Saved", "Variety updated.");
        router.back();
      }
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save variety");
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
        <ThemedText type="title">{isNew ? "New Variety" : "Edit Variety"}</ThemedText>
        {!isNew ? <ThemedText style={{ opacity: 0.7 }}>ID: {String(id)}</ThemedText> : null}

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Crop *</ThemedText>

          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={cropId ?? 0}
              onValueChange={(v) => setCropId(Number(v) || null)}
            >
              <Picker.Item label="Select crop…" value={0} />
              {crops.map((c) => (
                <Picker.Item
                  key={c.crop_id}
                  label={c.crop_name ?? `Crop ${c.crop_id}`}
                  value={c.crop_id}
                />
              ))}
            </Picker>
          </View>

          <View style={{ marginTop: 14 }}>
            <ThemedText type="subtitle">Variety name *</ThemedText>
            <TextInput
              style={styles.input}
              value={varietyName}
              onChangeText={setVarietyName}
              placeholder="e.g. Mondial"
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          <ThemedText style={{ opacity: 0.65, marginTop: 10 }}>
            Cascade rule: choose crop first, then set variety name.
          </ThemedText>
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

  pickerWrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    borderRadius: 10,
    overflow: "hidden",
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
