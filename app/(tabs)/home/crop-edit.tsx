// app/(tabs)/crop-edit.tsx
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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../../supabase";

type CropRow = {
  crop_id: number;
  crop_name: string | null;
  price_per_ton: number | null;
  planned_planting_month: number | null;
  average_yield: number | null;
  dr_average_yield: number | null;
  start_week: number | null;
  not_crop: boolean | null;
  top_yield: number | null;
  germination_time: number | null;
};

function toNumOrNull(s: string) {
  const t = s.trim();
  if (!t) return null;
  // allow commas
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(s: string) {
  const n = toNumOrNull(s);
  if (n === null) return null;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function FieldCard(props: { title: string; children: any }) {
  return (
    <ThemedView style={styles.card}>
      <ThemedText type="subtitle">{props.title}</ThemedText>
      {props.children}
    </ThemedView>
  );
}

function LabeledInput(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <ThemedText style={styles.label}>{props.label}</ThemedText>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder ?? "-"}
        placeholderTextColor="rgba(120,120,120,0.8)"
        keyboardType={props.keyboardType ?? "default"}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export default function CropEditScreen() {
  const { cropId } = useLocalSearchParams<{ cropId?: string }>();
  const isNew = cropId === "new";

  const numericId = useMemo(() => {
    if (!cropId || isNew) return null;
    const n = Number(cropId);
    return Number.isFinite(n) ? n : null;
  }, [cropId, isNew]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // form fields
  const [cropName, setCropName] = useState("");
  const [pricePerTon, setPricePerTon] = useState("");
  const [plannedPlantingMonth, setPlannedPlantingMonth] = useState("");
  const [averageYield, setAverageYield] = useState("");
  const [drAverageYield, setDrAverageYield] = useState("");
  const [startWeek, setStartWeek] = useState("");
  const [notCrop, setNotCrop] = useState(false);
  const [topYield, setTopYield] = useState("");
  const [germinationTime, setGerminationTime] = useState("");

  useEffect(() => {
    (async () => {
      if (isNew) return;

      if (numericId === null) {
        Alert.alert("Bad link", "Invalid cropId.");
        router.back();
        return;
      }

      try {
        setLoading(true);
        const res = await supabase
          .from("crop")
          .select(
            "crop_id,crop_name,price_per_ton,planned_planting_month,average_yield,dr_average_yield,start_week,not_crop,top_yield,germination_time"
          )
          .eq("crop_id", numericId)
          .single();

        if (res.error) throw res.error;

        const r = res.data as CropRow;

        setCropName(r.crop_name ?? "");
        setPricePerTon(r.price_per_ton?.toString() ?? "");
        setPlannedPlantingMonth(
          r.planned_planting_month !== null && r.planned_planting_month !== undefined
            ? String(r.planned_planting_month)
            : ""
        );
        setAverageYield(r.average_yield?.toString() ?? "");
        setDrAverageYield(r.dr_average_yield?.toString() ?? "");
        setStartWeek(r.start_week !== null && r.start_week !== undefined ? String(r.start_week) : "");
        setNotCrop(Boolean(r.not_crop));
        setTopYield(r.top_yield?.toString() ?? "");
        setGerminationTime(r.germination_time?.toString() ?? "");
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load crop");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [numericId, isNew]);

  function validate(): string | null {
    if (!cropName.trim()) return "Crop name is required.";

    const m = toIntOrNull(plannedPlantingMonth);
    if (plannedPlantingMonth.trim() && (m === null || m < 1 || m > 12)) {
      return "Planned planting month must be 1–12.";
    }

    const w = toIntOrNull(startWeek);
    if (startWeek.trim() && (w === null || w < 1 || w > 53)) {
      return "Start week must be 1–53.";
    }

    // numeric fields: if user typed something and it isn't a number
    const checkNum = (label: string, txt: string) => {
      if (!txt.trim()) return null;
      if (toNumOrNull(txt) === null) return `${label} must be a number.`;
      return null;
    };

    return (
      checkNum("Price per ton", pricePerTon) ||
      checkNum("Average yield", averageYield) ||
      checkNum("DR average yield", drAverageYield) ||
      checkNum("Top yield", topYield) ||
      checkNum("Germination time", germinationTime) ||
      null
    );
  }

  async function onSave() {
    const err = validate();
    if (err) {
      Alert.alert("Fix this", err);
      return;
    }

    const payload: Partial<CropRow> = {
      crop_name: cropName.trim(),
      price_per_ton: toNumOrNull(pricePerTon),
      planned_planting_month: toIntOrNull(plannedPlantingMonth),
      average_yield: toNumOrNull(averageYield),
      dr_average_yield: toNumOrNull(drAverageYield),
      start_week: toIntOrNull(startWeek),
      not_crop: notCrop,
      top_yield: toNumOrNull(topYield),
      germination_time: toNumOrNull(germinationTime),
    };

    try {
      setSaving(true);

      if (isNew) {
        const res = await supabase.from("crop").insert(payload);
        if (res.error) throw res.error;
        Alert.alert("Saved", "Crop created.");
        router.back();
      } else {
        if (numericId === null) return;
        const res = await supabase.from("crop").update(payload).eq("crop_id", numericId);
        if (res.error) throw res.error;
        Alert.alert("Saved", "Crop updated.");
        router.back();
      }
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save crop");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator />
        <ThemedText style={{ marginTop: 10 }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <ThemedText type="title">{isNew ? "New Crop" : "Edit Crop"}</ThemedText>
        {!isNew ? (
          <ThemedText style={{ opacity: 0.7, marginTop: 4 }}>ID: {String(numericId)}</ThemedText>
        ) : null}

        <FieldCard title="Basic">
          <LabeledInput
            label="Crop name *"
            value={cropName}
            onChangeText={setCropName}
            placeholder="e.g. Potato"
          />

          <View style={{ marginTop: 12 }}>
            <ThemedText style={styles.label}>Not a crop (exclude from crop lists)</ThemedText>
            <View style={styles.switchRow}>
              <Switch value={notCrop} onValueChange={setNotCrop} />
              <ThemedText style={{ opacity: 0.75 }}>{notCrop ? "Yes" : "No"}</ThemedText>
            </View>
          </View>
        </FieldCard>

        <FieldCard title="Planning">
          <LabeledInput
            label="Planned planting month (1–12)"
            value={plannedPlantingMonth}
            onChangeText={setPlannedPlantingMonth}
            keyboardType="numeric"
            placeholder="e.g. 3"
          />
          <LabeledInput
            label="Start week (1–53)"
            value={startWeek}
            onChangeText={setStartWeek}
            keyboardType="numeric"
            placeholder="e.g. 12"
          />
          <LabeledInput
            label="Germination time (days)"
            value={germinationTime}
            onChangeText={setGerminationTime}
            keyboardType="numeric"
            placeholder="e.g. 14"
          />
        </FieldCard>

        <FieldCard title="Economics & Yield">
          <LabeledInput
            label="Price per ton"
            value={pricePerTon}
            onChangeText={setPricePerTon}
            keyboardType="numeric"
            placeholder="e.g. 450"
          />
          <LabeledInput
            label="Average yield"
            value={averageYield}
            onChangeText={setAverageYield}
            keyboardType="numeric"
            placeholder="e.g. 45"
          />
          <LabeledInput
            label="DR average yield"
            value={drAverageYield}
            onChangeText={setDrAverageYield}
            keyboardType="numeric"
            placeholder="e.g. 30"
          />
          <LabeledInput
            label="Top yield"
            value={topYield}
            onChangeText={setTopYield}
            keyboardType="numeric"
            placeholder="e.g. 70"
          />
        </FieldCard>

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
            onPress={onSave}
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
  center: { justifyContent: "center", alignItems: "center" },

  card: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.25)",
  },

  label: { opacity: 0.7, marginBottom: 6 },

  input: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },

  btn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: "#111" },
  btnGhost: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.35)",
  },
  btnTextPrimary: { color: "#fff", fontWeight: "700" },
  btnTextGhost: { color: "#111", fontWeight: "700" },
});
