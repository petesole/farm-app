import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { router } from "expo-router";
import { supabase } from "@/supabase";
import { formatJsplDate, formatJsplNumber, jsplColors as C, jsplSpacing as S, jsplRadii as R } from "@/constants/jspl-design";

type Activity = { activity_id: number; activity_name: string; labour_measure: "Kgs" | "Unit"; active: boolean };
type Trace = { tracecode_id: number; tracecode_name: string; tracecode_size: number | null; crop_id: number | null; access_tc_id: number | null };
type DraftLine = { key: number; tracecode_id: number; activity_id: number; labour_qty: number; kgs: number | null; unit_cost: number };
type SavedLine = { id: number; labour_date: string; tracecode_id: number | null; activity_id: number; activity_name: string; labour_measure: string; labour_qty: number; kgs: number | null; unit_cost: number; total_cost: number; cost_per_ha: number | null };

function today(): string {
  const d = new Date();
  return [String(d.getDate()).padStart(2, "0"), String(d.getMonth() + 1).padStart(2, "0"), d.getFullYear()].join("/");
}
function parseDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return match[3] + "-" + match[2] + "-" + match[1];
}
function cost(value: number): string { return "$" + formatJsplNumber(value); }

export default function LabourDashboard() {
  const [date, setDate] = useState(today());
  const [checkedDate, setCheckedDate] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [activityId, setActivityId] = useState("");
  const [traceId, setTraceId] = useState("");
  const [qty, setQty] = useState("");
  const [kgs, setKgs] = useState("");
  const [rate, setRate] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [saved, setSaved] = useState<SavedLine[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isoDate = parseDate(date);
  const selected = activities.find(a => String(a.activity_id) === activityId);
  const filtered = useMemo(() => activities.filter(a => a.activity_name.toLowerCase().includes(activitySearch.toLowerCase())), [activities, activitySearch]);
  const draftCost = draft.reduce((sum, line) => {
    const activity = activities.find(a => a.activity_id === line.activity_id);
    return sum + (activity?.labour_measure === "Kgs" ? (line.kgs || 0) : line.labour_qty) * line.unit_cost;
  }, 0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [activitiesResult, tracesResult] = await Promise.all([
          supabase.from("labour_v2_activity").select("activity_id,activity_name,labour_measure,active").eq("active", true).order("activity_name"),
          supabase.from("tracecode").select("tracecode_id,tracecode_name,tracecode_size,crop_id,access_tc_id").not("start_date", "is", null).is("end_date", null).order("tracecode_name"),
        ]);
        if (activitiesResult.error) throw activitiesResult.error;
        if (tracesResult.error) throw tracesResult.error;
        if (alive) {
          setActivities((activitiesResult.data || []) as Activity[]);
          setTraces((tracesResult.data || []) as Trace[]);
        }
      } catch (e: any) {
        if (alive) setError(e.message || "Unable to load Labour setup");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setCheckedDate(null);
    setLocked(false);
    setDraft([]);
    setSaved([]);
    if (!isoDate) return;
    (async () => {
      try {
        const [day, lines] = await Promise.all([
          supabase.rpc("labour_v2_is_date_locked", { p_date: isoDate }),
          supabase.from("labour_v2_costs").select("id,labour_date,tracecode_id,activity_id,activity_name,labour_measure,labour_qty,kgs,unit_cost,total_cost,cost_per_ha").eq("labour_date", isoDate).order("id", { ascending: true }).limit(250),
        ]);
        if (day.error) throw day.error;
        if (lines.error) throw lines.error;
        if (alive) {
          setLocked(Boolean(day.data));
          setSaved((lines.data || []) as SavedLine[]);
          setCheckedDate(isoDate);
          setError("");
        }
      } catch (e: any) { if (alive) setError(e.message || "Unable to check saved date"); }
    })();
    return () => { alive = false; };
  }, [isoDate]);

  function clearEntry() {
    setTraceId(""); setActivityId(""); setQty(""); setKgs(""); setRate(""); setActivitySearch("");
  }

  function addDraft() {
    if (!isoDate || checkedDate !== isoDate || locked) { setError("Choose an unsaved date. Saved dates cannot be changed by a Labour Inputter."); return; }
    if (!traceId) { setError("Select a Trace Code."); return; }
    if (!selected) { setError("Select a Labour Activity."); return; }
    const amount = Number(qty), kilograms = Number(kgs), unitCost = Number(rate);
    if (!qty.trim() || !Number.isFinite(amount) || amount <= 0) { setError("Enter Labour Qty greater than zero."); return; }
    if (selected.labour_measure === "Kgs" && kgs.trim() && (!Number.isFinite(kilograms) || kilograms < 0)) { setError("Enter valid Kgs or leave blank, as in Access."); return; }
    if (!rate.trim() || !Number.isFinite(unitCost) || unitCost < 0) { setError("Enter a valid Unit Cost."); return; }
    setDraft(lines => [...lines, { key: nextKey, tracecode_id: Number(traceId), activity_id: selected.activity_id, labour_qty: amount, kgs: selected.labour_measure === "Kgs" && kgs.trim() ? kilograms : null, unit_cost: unitCost }]);
    setNextKey(key => key + 1);
    setError(""); clearEntry();
  }

  async function saveDay() {
    if (!isoDate || checkedDate !== isoDate || locked || busy) { setError("This date is unavailable or already submitted."); return; }
    if (!draft.length) { setError("Add at least one Labour line before final save."); return; }
    setBusy(true); setError("");
    try {
      const { error: saveError } = await supabase.rpc("labour_v2_submit_day", {
        p_date: isoDate,
        p_lines: draft.map(({ tracecode_id, activity_id, labour_qty, kgs, unit_cost }) => ({ tracecode_id, activity_id, labour_qty, kgs, unit_cost })),
      });
      if (saveError) throw saveError;
      // Confirm both the date lock and saved lines from the database.
      const [day, lines] = await Promise.all([
        supabase.from("labour_v2_day").select("labour_date").eq("labour_date", isoDate).single(),
        supabase.from("labour_v2_costs").select("id,labour_date,tracecode_id,activity_id,activity_name,labour_measure,labour_qty,kgs,unit_cost,total_cost,cost_per_ha").eq("labour_date", isoDate).order("id", { ascending: true }).limit(250),
      ]);
      if (day.error || !day.data) throw day.error || new Error("Save completed but the date lock could not be verified.");
      if (lines.error) throw lines.error;
      setLocked(true); setSaved((lines.data || []) as SavedLine[]); setDraft([]);
      setCheckedDate(isoDate);
    } catch (e: any) {
      setError(e.message || "Unable to submit the day's Labour");
      // Refresh lock status in case the save succeeded but the follow-up read failed.
      const status = await supabase.rpc("labour_v2_is_date_locked", { p_date: isoDate });
      if (!status.error && status.data === true) setLocked(true);
    } finally { setBusy(false); }
  }

  function traceLabel(id: number | null) {
    const t = traces.find(t => t.tracecode_id === id);
    return t ? t.tracecode_name + (t.access_tc_id == null ? "" : " · Access " + t.access_tc_id) : (id == null ? "General" : "Trace " + id);
  }
  function activityLabel(id: number) { return activities.find(a => a.activity_id === id)?.activity_name || "Activity " + id; }

  return <ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}>
      <View style={{ flex: 1 }}><Text style={styles.headerTitle}>Labour</Text><Text style={styles.headerSub}>John Sole (Private) Limited · Daily Labour</Text></View>
      <Image source={require("../../assets/images/jspl_farm_logo.png")} resizeMode="contain" style={styles.logo} />
    </View>
    <View style={styles.top}>
      <Text style={styles.heading}>Labour Form</Text>
      <Pressable onPress={() => router.replace("/(tabs)/main-dashboard")} style={styles.outline}><Text style={styles.outlineText}>← Back to Dashboard</Text></Pressable>
    </View>
    <View style={styles.row}>
      <Pressable style={styles.outline} onPress={() => router.push("/labour-history")}><Text style={styles.outlineText}>Labour Input History</Text></Pressable>
      <Pressable style={styles.outline} onPress={() => router.push("/labour-reports")}><Text style={styles.outlineText}>Daily / Weekly / AO Reports</Text></Pressable>
      <Pressable style={styles.outline} onPress={() => router.push("/labour-summary")}><Text style={styles.outlineText}>Current / Last Week Summaries</Text></Pressable>
    </View>
    {!!error && <View style={styles.error}><Text style={{ color: C.danger }}>{error}</Text></View>}
    {loading ? <ActivityIndicator color={C.primary} /> : <>
      <View style={styles.panel}>
        <Text style={styles.label}>Labour Date (dd/mm/yyyy)</Text>
        <TextInput value={date} onChangeText={setDate} placeholder="dd/mm/yyyy" keyboardType="numbers-and-punctuation" style={styles.input} />
        {!isoDate ? <Text style={styles.helper}>Enter a valid date in dd/mm/yyyy format.</Text> :
          checkedDate !== isoDate ? <ActivityIndicator color={C.primary} /> :
          locked ? <Text style={styles.locked}>SAVED — This date is locked. Labour Inputters cannot add, edit or delete entries for it.</Text> :
          <Text style={styles.helper}>Not yet saved. Add all Labour lines below, review, then save the whole day once.</Text>}
      </View>
      {isoDate && checkedDate === isoDate && !locked && <View style={styles.panel}>
        <Text style={styles.heading}>Add Labour Line</Text>
        <Text style={styles.label}>Trace Code</Text>
        <View style={styles.picker}><Picker selectedValue={traceId} onValueChange={value => setTraceId(String(value))}>
          <Picker.Item value="" label="Select Trace Code..." />
          {traces.map(t => <Picker.Item key={t.tracecode_id} value={String(t.tracecode_id)} label={t.tracecode_name + " (ID " + t.tracecode_id + (t.access_tc_id == null ? "" : " / Access " + t.access_tc_id) + ")" + (t.crop_id == null ? " · No Crop" : "")} />)}
        </Picker></View>
        <Text style={styles.label}>Find Labour Activity</Text>
        <TextInput value={activitySearch} onChangeText={setActivitySearch} placeholder="Search Access activities" style={styles.input} />
        <View style={styles.picker}><Picker selectedValue={activityId} onValueChange={value => setActivityId(String(value))}>
          <Picker.Item value="" label="Select Activity..." />
          {filtered.map(a => <Picker.Item key={a.activity_id} value={String(a.activity_id)} label={a.activity_name} />)}
        </Picker></View>
        <View style={styles.row}>
          <View style={styles.field}><Text style={styles.label}>Labour Qty</Text><TextInput value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="0" style={styles.input}/></View>
          {selected?.labour_measure === "Kgs" && <View style={styles.field}><Text style={styles.label}>Kgs</Text><TextInput value={kgs} onChangeText={setKgs} keyboardType="decimal-pad" placeholder="0" style={styles.input}/></View>}
          <View style={styles.field}><Text style={styles.label}>Unit Cost ($)</Text><TextInput value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="0.00" style={styles.input}/></View>
        </View>
        <Pressable onPress={addDraft} style={styles.outline}><Text style={styles.outlineText}>+ Add Line to Date</Text></Pressable>
      </View>}
      {isoDate && checkedDate === isoDate && !locked && <View style={styles.panel}>
        <Text style={styles.heading}>Unsaved Labour — {formatJsplDate(isoDate)}</Text>
        {draft.length === 0 ? <Text style={styles.helper}>No lines added yet.</Text> : draft.map(line => {
          const activity = activities.find(a => a.activity_id === line.activity_id);
          const lineCost = (activity?.labour_measure === "Kgs" ? line.kgs || 0 : line.labour_qty) * line.unit_cost;
          return <View style={styles.line} key={line.key}>
            <View style={{ flex: 1 }}><Text style={styles.lineHeading}>{traceLabel(line.tracecode_id)} · {activityLabel(line.activity_id)}</Text><Text style={styles.helper}>Qty {line.labour_qty} · Kgs {line.kgs ?? "—"} · {cost(line.unit_cost)} per unit · {cost(lineCost)}</Text></View>
            <Pressable style={styles.outline} onPress={() => setDraft(lines => lines.filter(x => x.key !== line.key))}><Text style={styles.outlineText}>Remove</Text></Pressable>
          </View>;
        })}
        <Text style={styles.total}>Daily total: {cost(draftCost)} · {draft.length} lines</Text>
        <Text style={styles.helper}>Final Save is permanent for the Labour Inputter. Review all lines before saving.</Text>
        <Pressable disabled={!draft.length || busy} onPress={saveDay} style={[styles.primary, (!draft.length || busy) && { opacity: 0.5 }]}>
          <Text style={styles.primaryText}>{busy ? "Saving…" : "Final Save — Lock Date"}</Text>
        </Pressable>
      </View>}
      {isoDate && checkedDate === isoDate && locked && <View style={styles.panel}>
        <Text style={styles.heading}>Saved Labour — {formatJsplDate(isoDate)}</Text>
        {saved.length === 0 ? <Text style={styles.helper}>Date was submitted. No visible lines; ask Admin to review.</Text> :
          saved.map(line => <View style={styles.line} key={line.id}>
            <View style={{ flex: 1 }}><Text style={styles.lineHeading}>{traceLabel(line.tracecode_id)} · {line.activity_name}</Text>
              <Text style={styles.helper}>Qty {line.labour_qty} · Kgs {line.kgs ?? "—"} · Rate {cost(line.unit_cost)} · {cost(line.total_cost)}{line.cost_per_ha == null ? "" : " · " + cost(line.cost_per_ha) + "/ha"}</Text></View>
          </View>)}
        <Text style={styles.helper}>Read only. Admin corrections will use the separate audited correction workflow.</Text>
      </View>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: C.background, padding: S.xl, flexGrow: 1, gap: S.lg },
  header: { backgroundColor: C.primaryDark, borderRadius: R.lg, padding: S.lg, flexDirection: "row", alignItems: "center", gap: S.md },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.surface },
  headerSub: { color: "#DCE9DC", fontSize: 12, marginTop: 5 },
  logo: { width: 66, height: 66, backgroundColor: C.surface, borderRadius: R.sm },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.md, flexWrap: "wrap" },
  heading: { fontSize: 19, fontWeight: "800", color: C.primaryDark },
  panel: { backgroundColor: C.surface, padding: S.lg, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, gap: S.sm },
  label: { fontSize: 13, fontWeight: "700", color: C.text },
  input: { minHeight: 44, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, color: C.text, backgroundColor: C.surface },
  picker: { borderWidth: 1, borderColor: C.border, borderRadius: R.sm, overflow: "hidden" },
  row: { flexDirection: "row", gap: S.md, flexWrap: "wrap", alignItems: "center" },
  field: { minWidth: 140, flex: 1, gap: 5 },
  total: { fontSize: 18, color: C.primaryDark, fontWeight: "800", marginTop: S.sm },
  helper: { fontSize: 12, color: C.textSecondary },
  locked: { fontSize: 13, color: C.primaryDark, fontWeight: "700" },
  primary: { padding: S.md, backgroundColor: C.primary, borderRadius: R.sm, minHeight: 44, justifyContent: "center" },
  primaryText: { color: C.surface, fontWeight: "800" },
  outline: { borderWidth: 1, borderColor: C.primary, borderRadius: R.sm, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 40, justifyContent: "center" },
  outlineText: { color: C.primaryDark, fontWeight: "700" },
  error: { backgroundColor: C.dangerTint, borderRadius: R.sm, padding: S.md },
  line: { flexDirection: "row", gap: S.md, alignItems: "center", paddingVertical: S.md, borderBottomWidth: 1, borderColor: C.border },
  lineHeading: { fontSize: 14, color: C.text, fontWeight: "700" },
});