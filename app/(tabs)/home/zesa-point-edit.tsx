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

type Row = {
  zesa_point_id: number;
  zesa_point: string | null;
  zesa_location: string | null;
  zesa_point_no: string | null;
  zesa_account_name: string | null;
};

export default function ZesaPointEditScreen() {
  const { zesaPointId } = useLocalSearchParams<{ zesaPointId?: string }>();
  const isNew = zesaPointId === "new";

  const id = useMemo(() => {
    if (!zesaPointId || isNew) return null;
    const n = Number(zesaPointId);
    return Number.isFinite(n) ? n : null;
  }, [zesaPointId, isNew]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [zesaPoint, setZesaPoint] = useState("");
  const [zesaLocation, setZesaLocation] = useState("");
  const [zesaPointNo, setZesaPointNo] = useState("");
  const [zesaAccountName, setZesaAccountName] = useState("");

  async function loadRow(zesa_point_id: number) {
    const res = await supabase
      .from("zesa_point")
      .select("zesa_point_id,zesa_point,zesa_location,zesa_point_no,zesa_account_name")
      .eq("zesa_point_id", zesa_point_id)
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data as Row;
  }

  useEffect(() => {
    (async () => {
      if (isNew) return;
      if (id === null) {
        Alert.alert("Bad link", "Invalid zesaPointId.");
        router.back();
        return;
      }
      try {
        setLoading(true);
        const r = await loadRow(id);
        setZesaPoint(r.zesa_point ?? "");
        setZesaLocation(r.zesa_location ?? "");
        setZesaPointNo(r.zesa_point_no ?? "");
        setZesaAccountName(r.zesa_account_name ?? "");
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load Zesa point");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  async function save() {
    const point = zesaPoint.trim();
    if (!point) {
      Alert.alert("Missing", "Zesa point is required.");
      return;
    }

    const payload = {
      zesa_point: point,
      zesa_location: zesaLocation.trim() || null,
      zesa_point_no: zesaPointNo.trim() || null,
      zesa_account_name: zesaAccountName.trim() || null,
    };

    try {
      setSaving(true);

      if (isNew) {
        const res = await supabase.from("zesa_point").insert(payload);
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Zesa point created.");
      } else {
        const res = await supabase.from("zesa_point").update(payload).eq("zesa_point_id", id);
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Zesa point updated.");
      }

      router.back();
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save Zesa point");
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
        <ThemedText type="title">{isNew ? "New Zesa Point" : "Edit Zesa Point"}</ThemedText>
        {!isNew ? <ThemedText style={{ opacity: 0.7 }}>ID: {String(id)}</ThemedText> : null}

        <ThemedView style={styles.card}>
          <Field label="Zesa point *" value={zesaPoint} onChangeText={setZesaPoint} placeholder="e.g. Pump House" />
          <Field label="Location" value={zesaLocation} onChangeText={setZesaLocation} placeholder="e.g. North Farm" />
          <Field label="Point No" value={zesaPointNo} onChangeText={setZesaPointNo} placeholder="e.g. 123456" />
          <Field
            label="Account name"
            value={zesaAccountName}
            onChangeText={setZesaAccountName}
            placeholder="e.g. Florinova (Pvt) Ltd"
          />
        </ThemedView>

        <Pressable style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
          <Text style={styles.saveText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <ThemedText style={{ opacity: 0.7, marginBottom: 6 }}>{props.label}</ThemedText>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder ?? "-"}
        placeholderTextColor="rgba(120,120,120,0.8)"
        autoCapitalize="words"
        autoCorrect={false}
      />
    </View>
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
