import { supabase } from "@/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type HistoryRow = {
  rainfall_id: number;
  rainfall_date: string; // YYYY-MM-DD
  rainfall_received: number;
};

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function RainGaugeHistoryScreen() {
  const { rain_gauge_id } = useLocalSearchParams<{ rain_gauge_id: string }>();
  const gaugeId = Number(rain_gauge_id);

  const navigation = useNavigation();
  const [gaugeName, setGaugeName] = useState<string>("");
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAdmin, setIsAdmin] = useState(false);

  // edit modal-ish
  const [editing, setEditing] = useState<HistoryRow | null>(null);
  const [editValue, setEditValue] = useState("");

  const title = useMemo(() => gaugeName || "Rainfall History", [gaugeName]);

  function goBackToIndex() {
    // as requested
    router.replace("/(tabs)/home/rainfall/rainfall_index");
  }

  const load = useCallback(async () => {
    setLoading(true);

    // role check
    const userRes = await supabase.auth.getUser();
    const userId = userRes.data.user?.id ?? "";

    const { data: roles } = await supabase
      .from("app_user_role")
      .select("role_name")
      .eq("user_id", userId);

    const admin = (roles ?? []).some((r: any) => r.role_name === "admin");
    setIsAdmin(admin);

    const { data: g, error: gErr } = await supabase
      .from("rain_gauge")
      .select("rain_gauge")
      .eq("rain_gauge_id", gaugeId)
      .single();

    if (!gErr) setGaugeName(g?.rain_gauge ?? "");

    const { data, error } = await supabase
      .from("rainfall")
      .select("rainfall_id,rainfall_date,rainfall_received")
      .eq("rain_gauge_id", gaugeId)
      .order("rainfall_date", { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data ?? []) as HistoryRow[]);
    }

    setLoading(false);
  }, [gaugeId]);

  useFocusEffect(
    useCallback(() => {
      // Add Cancel button at the top (header)
      navigation.setOptions({
        title,
        headerRight: () => (
          <Pressable onPress={goBackToIndex} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontWeight: "900" }}>Cancel</Text>
          </Pressable>
        ),
      });

      load();
    }, [load, navigation, title])
  );

  async function saveEdit() {
    if (!editing) return;
    const mm = Number(String(editValue).replace(",", "."));
    if (!Number.isFinite(mm) || mm < 0) {
      Alert.alert("Invalid value", "Rainfall must be a number ≥ 0.");
      return;
    }

    const { error } = await supabase
      .from("rainfall")
      .update({ rainfall_received: mm })
      .eq("rainfall_id", editing.rainfall_id);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    setEditing(null);
    setEditValue("");
    // same idea: after saving an edit, return to rainfall index
    goBackToIndex();
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={{ paddingTop: 24 }}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <FlatList
            data={rows}
            keyExtractor={(item) => String(item.rainfall_id)}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  if (!isAdmin) return;
                  setEditing(item);
                  setEditValue(String(Number(item.rainfall_received ?? 0)));
                }}
                style={styles.row}
              >
                <Text style={{ width: 120, fontWeight: "800" }}>{fmtDate(item.rainfall_date)}</Text>
                <Text style={{ flex: 1, textAlign: "right", fontWeight: "800" }}>
                  {Number(item.rainfall_received ?? 0).toFixed(1)} mm
                </Text>
                {isAdmin ? <Text style={styles.editHint}>Edit</Text> : null}
              </Pressable>
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />

          {editing ? (
            <View style={styles.editBox}>
              <Text style={{ fontWeight: "900" }}>Edit {fmtDate(editing.rainfall_date)}</Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <TextInput
                  value={editValue}
                  onChangeText={setEditValue}
                  keyboardType="decimal-pad"
                  style={styles.editInput}
                />
                <Pressable onPress={saveEdit} style={styles.editSave}>
                  <Text style={{ color: "white", fontWeight: "900" }}>Save</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditing(null);
                    setEditValue("");
                  }}
                  style={styles.editCancel}
                >
                  <Text style={{ fontWeight: "900" }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "white",
  },
  editHint: { marginLeft: 10, color: "#06c", fontWeight: "800" },
  editBox: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "white",
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: "right",
  },
  editSave: {
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#0a7",
  },
  editCancel: {
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#eee",
  },
});