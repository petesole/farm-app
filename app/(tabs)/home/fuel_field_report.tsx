// app/(tabs)/home/fuel_field_report.tsx
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "../../../supabase";

type Field = {
  tracecode_id: number;
  tracecode_name: string;
  tracecode_size: number | null;
  fuel_budget_name: string | null;
  season_budget_litres: number | null;
  budget_due_today_litres: number | null;
  actual_fuel_litres: number | null;
};
type Budget = {
  vehicle_job_id: number;
  vehicle_job_name: string;
  total_budget_litres: number | null;
};
type Actual = {
  vehicle_job_id: number;
  vehicle_job_name: string;
  actual_litres: number | null;
  total_quantity_done: number | null;
  last_work_date: string | null;
};
type Job = {
  id: number;
  name: string;
  budget: number;
  actual: number;
  qty: number;
  lastDate: string | null;
};
const num = (v: number | null | undefined) => Number(v ?? 0);
const fmt = (v: number, places = 1) => v.toLocaleString(undefined, { minimumFractionDigits: places, maximumFractionDigits: places });

export default function FuelFieldReport() {
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      const result = await supabase.from("fuel_tracecode_budget_summary_v").select("*").order("tracecode_name");
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
        setFields([]);
      } else {
        const items = (result.data ?? []) as Field[];
        setFields(items);
        setSelectedId(old => old != null && items.some(f => f.tracecode_id === old) ? old : items[0]?.tracecode_id ?? null);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [refreshKey]);

  useEffect(() => {
    let active = true;
    if (selectedId == null) {
      setBudgets([]);
      setActuals([]);
      return;
    }
    (async () => {
      setDetailLoading(true);
      setBudgets([]);
      setActuals([]);
      setError(null);
      const [b, a] = await Promise.all([
        supabase.from("fuel_budget_activity_v")
          .select("vehicle_job_id,vehicle_job_name,total_budget_litres")
          .eq("tracecode_id", selectedId),
        supabase.from("fuel_tracecode_activity_summary_v")
          .select("vehicle_job_id,vehicle_job_name,actual_litres,total_quantity_done,last_work_date")
          .eq("tracecode_id", selectedId),
      ]);
      if (!active) return;
      if (b.error || a.error) setError(b.error?.message ?? a.error?.message ?? "Report unavailable");
      else {
        setBudgets((b.data ?? []) as Budget[]);
        setActuals((a.data ?? []) as Actual[]);
      }
      setDetailLoading(false);
    })();
    return () => { active = false; };
  }, [selectedId, refreshKey]);

  const field = fields.find(f => f.tracecode_id === selectedId);
  const jobs = useMemo(() => {
    const map = new Map<number, Job>();
    for (const b of budgets) {
      const job = map.get(b.vehicle_job_id) ?? { id: b.vehicle_job_id, name: b.vehicle_job_name, budget: 0, actual: 0, qty: 0, lastDate: null };
      job.budget += num(b.total_budget_litres);
      map.set(b.vehicle_job_id, job);
    }
    for (const a of actuals) {
      const job = map.get(a.vehicle_job_id) ?? { id: a.vehicle_job_id, name: a.vehicle_job_name, budget: 0, actual: 0, qty: 0, lastDate: null };
      job.actual += num(a.actual_litres);
      job.qty += num(a.total_quantity_done);
      job.lastDate = a.last_work_date && (!job.lastDate || a.last_work_date > job.lastDate) ? a.last_work_date : job.lastDate;
      map.set(a.vehicle_job_id, job);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [budgets, actuals]);

  const hectares = num(field?.tracecode_size);
  const totalBudget = num(field?.season_budget_litres);
  const totalActual = num(field?.actual_fuel_litres);
  const difference = totalActual - totalBudget;
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}>
        <ThemedText type="title">Fuel Report per Field</ThemedText>
        <Pressable style={s.button} onPress={() => setRefreshKey(k => k + 1)}>
          <ThemedText>Refresh</ThemedText>
        </Pressable>
      </View>
      {error ? <ThemedView style={s.card}><ThemedText style={s.error}>{error}</ThemedText></ThemedView> : null}
      {loading ? <ActivityIndicator /> : (
        <>
          <ThemedView style={s.card}>
            <ThemedText type="subtitle">Select Field / TraceCode</ThemedText>
            {fields.length === 0 ? <ThemedText>No fields with assigned fuel budgets found.</ThemedText> : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.fieldRow}>
                  {fields.map(f => (
                    <Pressable key={f.tracecode_id} onPress={() => setSelectedId(f.tracecode_id)}
                      style={[s.fieldButton, f.tracecode_id === selectedId && s.selected]}>
                      <ThemedText style={s.bold}>{f.tracecode_name}</ThemedText>
                      <ThemedText>{fmt(num(f.tracecode_size))} ha</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </ThemedView>
          {field ? (
            <>
              <ThemedView style={s.card}>
                <ThemedText type="subtitle">{field.tracecode_name}</ThemedText>
                <ThemedText>{field.fuel_budget_name ?? "Fuel budget"} · {fmt(hectares)} ha</ThemedText>
                <View style={s.metrics}>
                  <Metric label="Season estimate" value={fmt(totalBudget) + " L"} />
                  <Metric label="Actual fuel" value={fmt(totalActual) + " L"} />
                  <Metric label="Actual − Budget" value={fmt(difference) + " L"} />
                  <Metric label="Budget L/ha" value={hectares > 0 ? fmt(totalBudget / hectares, 2) : "—"} />
                  <Metric label="Actual L/ha" value={hectares > 0 ? fmt(totalActual / hectares, 2) : "—"} />
                  <Metric label="Budget due to date" value={fmt(num(field.budget_due_today_litres)) + " L"} />
                </View>
                <ThemedText style={s.note}>Variance compares actual fuel so far with the full-season budget. The due-to-date budget is shown separately.</ThemedText>
              </ThemedView>
              <ThemedView style={s.card}>
                <ThemedText type="subtitle">Fuel by Activity</ThemedText>
                <ThemedText style={s.note}>Job estimates use the full programmed budget, including any travel already costed into it. Actuals are the fuel allocated to each job on this field.</ThemedText>
                {detailLoading ? <ActivityIndicator /> : jobs.length === 0 ? (
                  <ThemedText>No activity records available.</ThemedText>
                ) : jobs.map(job => (
                  <View key={job.id} style={s.job}>
                    <ThemedText style={s.bold}>{job.name}</ThemedText>
                    <View style={s.jobNumbers}>
                      <ThemedText>Estimate: {fmt(job.budget)} L</ThemedText>
                      <ThemedText>Actual: {fmt(job.actual)} L</ThemedText>
                      <ThemedText>Variance: {fmt(job.actual - job.budget)} L</ThemedText>
                    </View>
                    {job.lastDate ? <ThemedText style={s.note}>Last recorded: {job.lastDate}</ThemedText> : null}
                  </View>
                ))}
              </ThemedView>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
function Metric({label, value}: {label:string;value:string}) {
  return <ThemedView style={s.metric}>
    <ThemedText style={s.note}>{label}</ThemedText>
    <ThemedText type="subtitle">{value}</ThemedText>
  </ThemedView>;
}
const s = StyleSheet.create({
  page: {padding:18, paddingBottom:40, gap:12},
  header: {flexDirection:"row", justifyContent:"space-between", alignItems:"center", gap:12},
  card: {borderWidth:1, borderColor:"rgba(120,120,120,0.3)", borderRadius:12, padding:14, gap:10},
  button: {borderWidth:1, borderRadius:10, paddingHorizontal:12, paddingVertical:8},
  fieldRow: {flexDirection:"row", gap:8},
  fieldButton: {borderWidth:1, borderColor:"rgba(120,120,120,0.35)", borderRadius:10, padding:10, minWidth:135, gap:4},
  selected: {borderWidth:2},
  metrics: {flexDirection:"row", flexWrap:"wrap", gap:8},
  metric: {borderWidth:1, borderColor:"rgba(120,120,120,0.25)", borderRadius:8, padding:10, minWidth:145, flexGrow:1, gap:4},
  job: {borderTopWidth:1, borderColor:"rgba(120,120,120,0.25)", paddingTop:10, gap:5},
  jobNumbers: {flexDirection:"row", flexWrap:"wrap", gap:12},
  note: {opacity:0.7, fontSize:12},
  bold: {fontWeight:"700"},
  error: {color:"red"},
});
