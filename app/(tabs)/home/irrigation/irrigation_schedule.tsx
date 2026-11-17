import {fuelDateISO} from "../fuel_admin_dates";
import { supabase } from "@/supabase";
import {verifiedIrrigationRoles,irrigationRole} from '@/utils/irrigation-access';
import {JsplModuleHeader} from '@/components/jspl/JsplModuleHeader';
import {jsplColors as C} from '@/constants/jspl-design';
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ScheduleRow = {
  irrigation_schedule_id: number;
  tracecode_id: number;
  scheduled_date: string;
  planned_mm: number;
  status: string;
};

function toNum(v: any) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : NaN;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoToDmy(iso: string) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function dmyToIso(dmy: string) { return fuelDateISO(dmy); }

function withTimeout<T>(fn: () => PromiseLike<T>, ms: number) {
  return Promise.race([
    Promise.resolve(fn()),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), ms)),
  ]);
}

export default function IrrigationSchedule() {
  const { tracecode_id } = useLocalSearchParams<{ tracecode_id?: string }>();
  const tracecodeId = Number(tracecode_id);

  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [roleName, setRoleName] = useState<string>("unknown");
  const isAdmin = roleName === "admin";
  const canEdit = isAdmin;

  const [tracecodeName, setTracecodeName] = useState("");
  const [cropName, setCropName] = useState("");

  const [newDate, setNewDate] = useState("");
  const [newMm, setNewMm] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState<string>("");
  const [editMm, setEditMm] = useState<string>("");

  const goBackDashboard = useCallback(() => {
    router.replace("/(tabs)/irrigation_main_dashboard");
  }, []);

  const fetchRole = useCallback(async () => {
    setRoleName(irrigationRole(await verifiedIrrigationRoles(supabase)));
  }, []);

  const fetchTraceInfo = useCallback(async () => {
    if (!Number.isFinite(tracecodeId)) return;

    const { data, error } = await supabase
      .from("tracecode")
      .select("tracecode_name, crop:crop_id (crop_name)")
      .eq("tracecode_id", tracecodeId)
      .single();

    if (error) return;

    if (data) {
      setTracecodeName((data as any).tracecode_name ?? "");
      setCropName((data as any).crop?.crop_name ?? "");
    }
  }, [tracecodeId]);

  const fetchSchedules = useCallback(async () => {
    if (!Number.isFinite(tracecodeId)) {
      setLoading(false);
      setRows([]);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("irrigation_schedule")
      .select("irrigation_schedule_id, tracecode_id, scheduled_date, planned_mm, status")
      .eq("tracecode_id", tracecodeId)
      .order("scheduled_date", { ascending: true })
      .order("irrigation_schedule_id", { ascending: true });

    if (error) {
      Alert.alert("Error", error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ScheduleRow[]);
    }

    setLoading(false);
  }, [tracecodeId]);

  useFocusEffect(
    useCallback(() => {
      fetchRole();
      fetchTraceInfo();
      fetchSchedules();
    }, [fetchRole, fetchTraceInfo, fetchSchedules])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSchedules();
    setRefreshing(false);
  }, [fetchSchedules]);

  const addSchedule = async () => {
    if (!canEdit) return Alert.alert("Access denied", "Only admin can add schedules.");

    const iso = dmyToIso(newDate);
    const mm = toNum(newMm);

    if (!iso) return Alert.alert("Invalid date", "Use DD/MM/YYYY or D/M (e.g. 5/12)");
    if (!Number.isFinite(mm) || mm <= 0) return Alert.alert("Invalid mm", "Must be > 0");

    setSaving(true);
    try {
      const res: any = await withTimeout(
        () =>
          supabase.from("irrigation_schedule").insert({
            tracecode_id: tracecodeId,
            scheduled_date: iso,
            planned_mm: mm,
            status: "planned",
          }),
        15000
      );

      setSaving(false);

      if (res?.error) return Alert.alert("Save failed", res.error.message);

      setNewDate("");
      setNewMm("");
      router.replace("/(tabs)/irrigation_main_dashboard");
    } catch (e: any) {
      setSaving(false);
      Alert.alert("Timeout", "It may have saved. Going back to dashboard.");
      router.replace("/(tabs)/irrigation_main_dashboard");
    }
  };

  const startEdit = (row: ScheduleRow) => {
    if (!canEdit) return;
    if (!["planned", "scheduled"].includes(String(row.status))) return;

    setEditingId(row.irrigation_schedule_id);
    setEditDate(isoToDmy(row.scheduled_date));
    setEditMm(String(row.planned_mm));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDate("");
    setEditMm("");
  };

  const saveEdit = async () => {
    if (!canEdit) return;
    if (editingId === null) return;

    const iso = dmyToIso(editDate);
    const mm = toNum(editMm);

    if (!iso) return Alert.alert("Invalid date", "Use DD/MM/YYYY or D/M (e.g. 5/12)");
    if (!Number.isFinite(mm) || mm <= 0) return Alert.alert("Invalid mm", "Must be > 0");

    setSaving(true);
    try {
      const res: any = await withTimeout(
        () =>
          supabase
            .from("irrigation_schedule")
            .update({ scheduled_date: iso, planned_mm: mm })
            .eq("irrigation_schedule_id", editingId)
            .in("status", ["planned", "scheduled"]),
        15000
      );

      setSaving(false);

      if (res?.error) return Alert.alert("Save failed", res.error.message);

      cancelEdit();
      fetchSchedules();
    } catch (e: any) {
      setSaving(false);
      Alert.alert("Timeout", "Edit may have saved. Refreshing list.");
      cancelEdit();
      fetchSchedules();
    }
  };

  if (loading) {
    return (
      <View style={{flex:1,padding:16,backgroundColor:C.background}}><JsplModuleHeader title="Irrigation Schedule" backLabel="Back to Irrigation" onBack={goBackDashboard}/><View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View></View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      data={rows}
      keyExtractor={(x) => String(x.irrigation_schedule_id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      ListHeaderComponent={
        <View style={styles.header}>
          <JsplModuleHeader title="Irrigation Schedule" subtitle={tracecodeName+' · '+cropName} backLabel="Back to Irrigation" onBack={goBackDashboard}/>
          {!isAdmin?<Text style={{color:C.textSecondary}}>View only — scheduling is available to Admin.</Text>:null}

          <View style={styles.addBox}>
            <Text style={styles.addTitle}>Add planned irrigation</Text>

            <View style={styles.addRow}>
              <TextInput
                value={newDate}
                onChangeText={setNewDate}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#888"
                editable={canEdit && !saving}
                style={[styles.input, styles.phoneInputWide]}
              />

              <TextInput
                value={newMm}
                onChangeText={setNewMm}
                placeholder="planned mm"
                placeholderTextColor="#888"
                keyboardType="decimal-pad"
                editable={canEdit && !saving}
                style={[styles.input, styles.phoneInputNarrow]}
              />

              <Pressable
                onPress={addSchedule}
                disabled={!canEdit || saving}
                style={[styles.btn, (!canEdit || saving) && styles.dimmed]}
              >
                <Text style={styles.btnText}>{saving ? "Saving…" : "Add"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const canInlineEdit = canEdit && ["planned", "scheduled"].includes(String(item.status));
        const isEditing = editingId === item.irrigation_schedule_id;

        return (
          <View style={styles.card}>
            <View style={styles.rowTop}>
              <Text style={styles.date}>{isoToDmy(item.scheduled_date)}</Text>
              <Text style={styles.status}>{String(item.status)}</Text>
            </View>

            {!isEditing ? (
              <>
                <Text style={styles.cardText}>Planned: {item.planned_mm} mm</Text>

                {canInlineEdit ? (
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => startEdit(item)}
                      disabled={saving}
                      style={[styles.smallBtn, styles.outlineBtn]}
                    >
                      <Text style={styles.outlineBtnText}>Edit</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.editRow}>
                  <TextInput
                    value={editDate}
                    onChangeText={setEditDate}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor="#888"
                    editable={!saving}
                    style={[styles.input, styles.phoneInputWide]}
                  />
                  <TextInput
                    value={editMm}
                    onChangeText={setEditMm}
                    placeholder="planned mm"
                    placeholderTextColor="#888"
                    keyboardType="decimal-pad"
                    editable={!saving}
                    style={[styles.input, styles.phoneInputNarrow]}
                  />
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={cancelEdit}
                    disabled={saving}
                    style={[styles.smallBtn, saving && styles.dimmed]}
                  >
                    <Text style={styles.smallBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={saveEdit}
                    disabled={saving}
                    style={[styles.smallBtnPrimary, saving && styles.dimmed]}
                  >
                    <Text style={styles.smallBtnPrimaryText}>{saving ? "Saving…" : "Save"}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        );
      }}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.surface,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.surface,
  },

  loadingText: {
    marginTop: 10,
    color: C.text,
  },

  header: {
    padding: 16,
    backgroundColor: C.surface,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },

  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },

  cancelText: {
    fontWeight: "900",
    color: "#000",
  },

  traceName: {
    fontSize: 22,
    fontWeight: "900",
    color: C.primaryDark,
  },

  cropName: {
    fontSize: 18,
    fontWeight: "900",
    color: C.primaryDark,
    marginBottom: 10,
  },

  role: {
    marginBottom: 10,
    fontWeight: "800",
    color: C.text,
  },

  addBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    borderRadius: 10,
    backgroundColor: C.surface,
  },

  addTitle: {
    fontWeight: "900",
    marginBottom: 8,
    color: C.text,
  },

  addRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },

  editRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    alignItems: "center",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: C.text,
    backgroundColor: C.surface,
    minHeight: 44,
  },

  phoneInputWide: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 140,
  },

  phoneInputNarrow: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 110,
  },

  btn: {
    backgroundColor: C.primaryDark,
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },

  btnText: {
    color: C.surface,
    fontWeight: "900",
  },

  card: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    borderRadius: 10,
    backgroundColor: C.surface,
  },

  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  date: {
    fontWeight: "900",
    color: C.text,
  },

  status: {
    fontWeight: "900",
    opacity: 0.8,
    color: C.text,
  },

  cardText: {
    color: C.text,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    flexWrap: "wrap",
  },

  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#eee",
  },

  smallBtnText: {
    fontWeight: "900",
    color: "#000",
  },

  smallBtnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.primaryDark,
  },

  smallBtnPrimaryText: {
    color: C.surface,
    fontWeight: "900",
  },

  outlineBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
  },

  outlineBtnText: {
    fontWeight: "900",
    color: C.text,
  },

  dimmed: {
    opacity: 0.4,
  },
});
