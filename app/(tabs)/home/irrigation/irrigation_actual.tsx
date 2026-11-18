import { supabase } from "@/supabase";
import { verifiedIrrigationRoles } from "@/utils/irrigation-access";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { jsplColors as C } from "@/constants/jspl-design";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type Application = {
  irrigation_applied_id: number;
  applied_date: string;
  mm_applied: number;
  effective_mm: number | null;
  notes: string | null;
};
type PendingPlan = { irrigation_schedule_id:number; scheduled_date:string; planned_mm:number; status:string };
const pad = (v: number) => String(v).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const displayDate = (s: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : s;
};
function entryDate(raw: string): string | null {
  const s = raw.trim();
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s);
  if (!match) return null;
  const d = Number(match[1]), m = Number(match[2]), y = match[3] ? Number(match[3]) : new Date().getFullYear();
  const candidate = new Date(y, m - 1, d);
  if (candidate.getFullYear() !== y || candidate.getMonth() + 1 !== m || candidate.getDate() !== d) return null;
  return isoDate(candidate);
}
function dateAllowed(iso: string): boolean {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 9);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const date = new Date(iso + "T12:00:00");
  return date >= start && date < new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
}
export default function IrrigationActual() {
  const { tracecode_id } = useLocalSearchParams<{ tracecode_id?: string }>();
  const traceId = Number(tracecode_id);
  const [roleAllowed, setRoleAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [traceName, setTraceName] = useState("");
  const [rows, setRows] = useState<Application[]>([]);
  const [plans, setPlans] = useState<PendingPlan[]>([]);
  const [linkedSchedule, setLinkedSchedule] = useState<number|null>(null);
  const [date, setDate] = useState(displayDate(isoDate(new Date())));
  const [mm, setMm] = useState("");
  const [notes, setNotes] = useState("");
  const back = () => router.replace("/(tabs)/irrigation_main_dashboard");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const roles = await verifiedIrrigationRoles(supabase);
      const allowed = roles.includes("admin") || roles.includes("irrigation");
      setRoleAllowed(allowed);
      if (!allowed) throw new Error("Irrigation access is not assigned to this account.");
      if (!Number.isInteger(traceId) || traceId <= 0) throw new Error("Invalid field selection.");
      const [trace, history, upcoming] = await Promise.all([
        supabase.from("tracecode").select("tracecode_name,crop:crop_id(crop_name)").eq("tracecode_id", traceId).single(),
        supabase.from("irrigation_applied").select("irrigation_applied_id,applied_date,mm_applied,effective_mm,notes").eq("tracecode_id", traceId).order("applied_date", { ascending: false }).order("irrigation_applied_id", { ascending: false }).limit(150),
        supabase.from("irrigation_schedule").select("irrigation_schedule_id,scheduled_date,planned_mm,status").eq("tracecode_id", traceId).in("status",["planned","scheduled"]).order("scheduled_date",{ascending:true}),
      ]);
      if (trace.error) throw trace.error;
      if (history.error) throw history.error;
      if (upcoming.error) throw upcoming.error;
      const cropRel = (trace.data as any)?.crop;
      const cropName = Array.isArray(cropRel) ? cropRel[0]?.crop_name : cropRel?.crop_name;
      setTraceName(`${(trace.data as any)?.tracecode_name ?? ""} · ${cropName ?? ""}`);
      setRows((history.data ?? []) as Application[]);
      setPlans((upcoming.data ?? []) as PendingPlan[]);
    } catch (e: any) { setError(e?.message || "Unable to load irrigation history."); }
    finally { setLoading(false); }
  }, [traceId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const save = async () => {
    if (!roleAllowed || saving) return;
    const day = entryDate(date);
    const amount = Number(mm);
    if (!day || !dateAllowed(day)) return Alert.alert("Invalid date", "Choose a valid date within the last 10 calendar days, including today.");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 200) return Alert.alert("Invalid amount", "Enter actual irrigation in millimetres (greater than 0 and up to 200).");
    setSaving(true);
    try {
      // End the recorded event immediately; this is an actual application, not a running cycle.
      // Database triggers calculate applied_date, effective_mm and rebuild the field dashboard.
      const { error: saveError } = await supabase.from("irrigation_applied").insert({
        tracecode_id: traceId,
        irrigation_schedule_id: linkedSchedule,
        start_at: `${day}T12:00:00+02:00`,
        end_at: `${day}T12:01:00+02:00`,
        mm_applied: amount,
        notes: notes.trim() || null,
      });
      if (saveError) throw saveError;
      setMm(""); setNotes(""); setLinkedSchedule(null);
      await refresh();
      Alert.alert("Saved", "Actual irrigation recorded.");
    } catch (e: any) { Alert.alert("Not saved", e?.message || "Please retry."); }
    finally { setSaving(false); }
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <JsplModuleHeader title="Irrigation History" subtitle={traceName} backLabel="Back to Irrigation" onBack={back} />
      {loading ? <ActivityIndicator size="large" /> : error ? <Text style={styles.error}>{error}</Text> : <>
        {roleAllowed ? <View style={styles.card}>
          <Text style={styles.heading}>Record actual irrigation</Text>
          <Text style={styles.help}>Entries are allowed for the last 10 calendar days. Enter the actual millimetres applied, not the planned amount.</Text>
          <Text style={styles.label}>Date (DD/MM/YYYY)</Text>
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="DD/MM/YYYY" />
          <Text style={styles.label}>Actual mm applied</Text>
          <TextInput style={styles.input} value={mm} onChangeText={setMm} keyboardType="decimal-pad" placeholder="mm" />
          {plans.length ? <>
            <Text style={styles.label}>Link to planned irrigation (optional)</Text>
            <Text style={styles.help}>Select the matching plan to mark it completed. The actual mm is entered independently.</Text>
            <Pressable onPress={()=>setLinkedSchedule(null)} style={[styles.option,linkedSchedule===null&&styles.chosen]}>
              <Text>Unplanned irrigation</Text>
            </Pressable>
            {plans.map(p=><Pressable key={p.irrigation_schedule_id} onPress={()=>setLinkedSchedule(p.irrigation_schedule_id)}
                style={[styles.option,linkedSchedule===p.irrigation_schedule_id&&styles.chosen]}>
              <Text>{displayDate(p.scheduled_date)} · planned {Number(p.planned_mm).toFixed(1)} mm</Text>
            </Pressable>)}
          </> : null}
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notes" />
          <Pressable style={[styles.button, saving && styles.disabled]} disabled={saving} onPress={save}><Text style={styles.buttonText}>{saving ? "Saving…" : "Save Irrigation"}</Text></Pressable>
        </View> : null}
        <View style={styles.card}>
          <Text style={styles.heading}>Field irrigation history</Text>
          {rows.length === 0 ? <Text>No irrigation recorded for this field.</Text> : rows.map(x =>
            <View key={x.irrigation_applied_id} style={styles.history}>
              <Text style={styles.bold}>{displayDate(x.applied_date)} · {Number(x.mm_applied).toFixed(1)} mm</Text>
              {x.notes ? <Text>{x.notes}</Text> : null}
            </View>
          )}
          <Text style={styles.help}>Historical records are read-only in the phone app.</Text>
        </View>
      </>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  body: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16, marginTop: 12 },
  heading: { color: C.primaryDark, fontSize: 18, fontWeight: "800", marginBottom: 8 },
  label: { color: C.text, fontWeight: "700", marginTop: 12, marginBottom: 5 },
  help: { color: C.textSecondary, marginVertical: 7 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 11, color: C.text },
  option: { borderWidth:1, borderColor:C.border, borderRadius:8, padding:10, marginTop:6 },
  chosen: { backgroundColor:C.successTint, borderColor:C.primary },
  history: { borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 11 },
  bold: { fontWeight: "700", color: C.text },
  button: { marginTop: 18, backgroundColor: C.primaryDark, borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.5 },
  error: { color: "#b00020", marginTop: 16 },
});
