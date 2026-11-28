import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "@/supabase";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

type Issue = {
  fuel_issue_id: number;
  fuel_issue_date: string;
  fuel_issued: number;
  vehicle_name: string | null;
  notes: string | null;
};

type Tracecode = {
  tracecode_id: number;
  tracecode_name: string;
  crop_id: number;
  crop_name: string;
};

type VehicleJob = {
  vehicle_job_id: number;
  vehicle_job_name: string;
  crop_id: number | null;
};

export default function AssignUnplannedFuelScreen() {
  const params = useLocalSearchParams<{ fuel_issue_id?: string | string[] }>();
  const fuelIssueId = useMemo(
    () => Number(Array.isArray(params.fuel_issue_id) ? params.fuel_issue_id[0] : params.fuel_issue_id),
    [params.fuel_issue_id]
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [tracecodes, setTracecodes] = useState<Tracecode[]>([]);
  const [jobs, setJobs] = useState<VehicleJob[]>([]);
  const [tracecodeId, setTracecodeId] = useState<number | null>(null);
  const [vehicleJobId, setVehicleJobId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!Number.isFinite(fuelIssueId) || fuelIssueId <= 0) {
        setError("Missing or invalid fuel issue.");
        setLoading(false);
        return;
      }

      setLoading(true);
      const [issueRes, rolesRes] = await Promise.all([
        supabase
          .from("fuel_issue")
          .select("fuel_issue_id,fuel_issue_date,fuel_issued,vehicle_id,notes")
          .eq("fuel_issue_id", fuelIssueId)
          .single(),
        supabase.rpc("my_farm_app_roles"),
      ]);

      if (!active) return;
      if (issueRes.error) {
        setError(issueRes.error.message);
        setLoading(false);
        return;
      }
      const roles = (rolesRes.data ?? []) as string[];
      setIsAdmin(!rolesRes.error && roles.includes("admin"));

      const vehicleRes = await supabase
        .from("vehicle")
        .select("vehicle_name")
        .eq("vehicle_id", issueRes.data.vehicle_id)
        .single();
      if (!active) return;

      const date = issueRes.data.fuel_issue_date;
      const [traceRes, jobsRes] = await Promise.all([
        supabase
          .from("tracecode")
          .select("tracecode_id,tracecode_name,crop_id,crop:crop_id(crop_id,crop_name),start_date,end_date")
          .not("crop_id", "is", null)
          .lte("start_date", date)
          .or(`end_date.is.null,end_date.gte.${date}`)
          .order("tracecode_name", { ascending: true })
          .limit(3000),
        supabase
          .from("vehicle_job")
          .select("vehicle_job_id,vehicle_job_name,crop_id,discontinue")
          .eq("discontinue", false)
          .order("vehicle_job_name", { ascending: true })
          .limit(2000),
      ]);
      if (!active) return;

      if (traceRes.error || jobsRes.error) {
        setError(traceRes.error?.message ?? jobsRes.error?.message ?? "Could not load assignment choices.");
        setLoading(false);
        return;
      }

      const traceRows: Tracecode[] = (traceRes.data ?? []).map((row: any) => ({
        tracecode_id: Number(row.tracecode_id),
        tracecode_name: row.tracecode_name,
        crop_id: Number(row.crop_id),
        crop_name: row.crop?.crop_name ?? "Crop",
      }));
      const jobRows: VehicleJob[] = (jobsRes.data ?? []).map((row: any) => ({
        vehicle_job_id: Number(row.vehicle_job_id),
        vehicle_job_name: row.vehicle_job_name,
        crop_id: row.crop_id == null ? null : Number(row.crop_id),
      }));

      setIssue({
        fuel_issue_id: Number(issueRes.data.fuel_issue_id),
        fuel_issue_date: date,
        fuel_issued: Number(issueRes.data.fuel_issued) || 0,
        vehicle_name: vehicleRes.data?.vehicle_name ?? "Other",
        notes: issueRes.data.notes,
      });
      setTracecodes(traceRows);
      setJobs(jobRows);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [fuelIssueId]);

  const selectedTrace = tracecodes.find((t) => t.tracecode_id === tracecodeId) ?? null;
  const eligibleJobs = selectedTrace
    ? jobs.filter((j) => j.crop_id == null || j.crop_id === selectedTrace.crop_id)
    : [];

  const save = async () => {
    if (!isAdmin) {
      Alert.alert("Not authorised", "Only Admin can assign unplanned trips.");
      return;
    }
    if (!tracecodeId || !vehicleJobId) {
      Alert.alert("Choose both fields", "Select a Trace Code and Vehicle Job before saving.");
      return;
    }

    setSaving(true);
    const { error: saveError } = await supabase.rpc("admin_assign_unplanned_fuel_issue", {
      p_fuel_issue_id: fuelIssueId,
      p_tracecode_id: tracecodeId,
      p_vehicle_job_id: vehicleJobId,
    });
    setSaving(false);

    if (saveError) {
      Alert.alert("Assignment failed", saveError.message);
      return;
    }
    router.back();
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText>Loading trip and assignment choices…</ThemedText>
      </ThemedView>
    );
  }

  if (error || !issue) {
    return (
      <ThemedView style={styles.container}>
        <JsplModuleHeader title="Assign Unplanned Trip" />
        <ThemedText type="title">Assign Unplanned Trip</ThemedText>
        <ThemedText style={styles.error}>{error ?? "Fuel issue not found."}</ThemedText>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <ThemedText style={styles.buttonText}>Back to report</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (!isAdmin) {
    return (
      <ThemedView style={styles.container}>
        <JsplModuleHeader title="Assign Unplanned Trip" />
        <ThemedText type="title">Assign Unplanned Trip</ThemedText>
        <ThemedText style={styles.error}>Only Admin can assign unplanned trips.</ThemedText>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <ThemedText style={styles.buttonText}>Back to report</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const description = String(issue.notes ?? "Unplanned trip").replace(/^\[UNPLANNED\]\s*/i, "").trim();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <JsplModuleHeader title="Assign Unplanned Trip" />
      <ThemedText type="title">Assign Unplanned Trip</ThemedText>
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">{description || "Unplanned trip"}</ThemedText>
        <ThemedText style={styles.small}>
          {issue.fuel_issue_date} · {issue.vehicle_name} · {issue.fuel_issued.toFixed(0)} L · Ref #{issue.fuel_issue_id}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Trace Code</ThemedText>
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={tracecodeId}
            onValueChange={(value) => {
              const next = value == null ? null : Number(value);
              setTracecodeId(next);
              setVehicleJobId(null);
            }}
            enabled={!saving}
          >
            <Picker.Item label="Choose Trace Code…" value={null} />
            {tracecodes.map((trace) => (
              <Picker.Item
                key={trace.tracecode_id}
                label={`${trace.crop_name} · ${trace.tracecode_name}`}
                value={trace.tracecode_id}
              />
            ))}
          </Picker>
        </View>

        <ThemedText type="subtitle">Vehicle Job</ThemedText>
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={vehicleJobId}
            onValueChange={(value) => setVehicleJobId(value == null ? null : Number(value))}
            enabled={!saving && !!selectedTrace}
          >
            <Picker.Item label={selectedTrace ? "Choose Vehicle Job…" : "Choose a Trace Code first"} value={null} />
            {eligibleJobs.map((job) => (
              <Picker.Item
                key={job.vehicle_job_id}
                label={job.vehicle_job_name}
                value={job.vehicle_job_id}
              />
            ))}
          </Picker>
        </View>

        {selectedTrace && eligibleJobs.length === 0 && (
          <ThemedText style={styles.error}>No active Vehicle Jobs match this crop.</ThemedText>
        )}

        <Pressable
          style={[styles.button, (saving || !tracecodeId || !vehicleJobId) && styles.buttonDisabled]}
          onPress={save}
          disabled={saving || !tracecodeId || !vehicleJobId}
        >
          <ThemedText style={styles.buttonText}>{saving ? "Saving…" : "Save Assignment"}</ThemedText>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()} disabled={saving}>
          <ThemedText style={styles.buttonText}>Cancel</ThemedText>
        </Pressable>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 18 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  small: { opacity: 0.75 },
  error: { color: "red" },
  pickerBox: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  button: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 8 },
  secondaryButton: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontWeight: "700" },
});
