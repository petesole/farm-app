import { supabase } from "@/supabase";
import {fuelDateISO} from "../fuel_admin_dates";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ScheduleInfo = {
  irrigation_schedule_id: number;
  tracecode_id: number;
  tracecode_name: string | null;
  crop_name: string | null;
  scheduled_date: string; // YYYY-MM-DD
  planned_mm: number;
  status: string;
};

type ActiveCycle = {
  irrigation_applied_id: number;
  tracecode_id: number;
  irrigation_schedule_id: number | null;
  start_at: string;
  end_at: string | null;
  mm_applied: number;
};

function normRole(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayDmy() {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function nowHm() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isoToDmy(iso: string) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function normalizeDmy(input: string) {
 const iso=fuelDateISO(input);
 if(!iso)return input.trim();
 const [y,m,d]=iso.split("-");
 return d+"/"+m+"/"+y;
}

function normalizeHm(input: string) {
  const s = input.trim();
  if (!s) return "";
  const parts = s.split(/[:\.\s]+/).filter(Boolean);
  if (parts.length !== 2) return s;

  const h = Number(parts[0]);
  const m = Number(parts[1]);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return s;
  if (h < 0 || h > 23 || m < 0 || m > 59) return s;

  return `${pad2(h)}:${pad2(m)}`;
}

function parseLocalDateTime(dmy: string, hm: string): Date | null {
  const dmyN = normalizeDmy(dmy);
  const hmN = normalizeHm(hm);

  const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmyN);
  const tm = /^(\d{2}):(\d{2})$/.exec(hmN);
  if (!dm || !tm) return null;

  const dd = Number(dm[1]);
  const mm = Number(dm[2]);
  const yy = Number(dm[3]);
  const hh = Number(tm[1]);
  const mi = Number(tm[2]);

  const dt = new Date(yy, mm - 1, dd, hh, mi, 0, 0);

  if (
    dt.getFullYear() !== yy ||
    dt.getMonth() !== mm - 1 ||
    dt.getDate() !== dd ||
    dt.getHours() !== hh ||
    dt.getMinutes() !== mi
  ) return null;

  return dt;
}

export default function IrrigationActual() {
  const { irrigation_schedule_id, tracecode_id } = useLocalSearchParams<{
    irrigation_schedule_id?: string;
    tracecode_id?: string;
  }>();

  const scheduleIdParam = irrigation_schedule_id ? Number(irrigation_schedule_id) : NaN;
  const tracecodeIdParam = tracecode_id ? Number(tracecode_id) : NaN;

  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [roleName, setRoleName] = useState("unknown");
  const canEdit = roleName === "irrigation" || roleName === "admin";

  const [scheduleOptions, setScheduleOptions] = useState<ScheduleInfo[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

  const selectedSchedule = useMemo(
    () => scheduleOptions.find((s) => s.irrigation_schedule_id === selectedScheduleId) ?? null,
    [scheduleOptions, selectedScheduleId]
  );

  const [active, setActive] = useState<ActiveCycle | null>(null);
  const inCycle = !!active;

  const selectableOptions = useMemo(() => {
    if (inCycle) return scheduleOptions;
    return scheduleOptions.filter((s) => ["planned", "scheduled"].includes(String(s.status)));
  }, [inCycle, scheduleOptions]);

  const plannedMmLocked = selectedSchedule ? Math.round(Number(selectedSchedule.planned_mm)) : null;

  const [startDate, setStartDate] = useState<string>(todayDmy());
  const [startTime, setStartTime] = useState<string>(nowHm());
  const [endDate, setEndDate] = useState<string>(todayDmy());
  const [endTime, setEndTime] = useState<string>(nowHm());

  const initRef = useRef(false);

  // ---------- DEBUG (always visible, web-safe) ----------
  const [debugMsg, setDebugMsg] = useState<string>("");

  function dbg(msg: string) {
    console.log("[IrrigationActual]", msg);
    setDebugMsg(`${new Date().toLocaleTimeString()}  ${msg}`);
  }

  const goBack = useCallback(() => {
    router.replace("/(tabs)/irrigation_main_dashboard");
  }, []);

  const fetchRole = useCallback(async () => {
    setRoleLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) {
      setRoleName("unknown");
      setRoleLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("app_user_role")
      .select("role_name")
      .eq("user_id", uid)
      .maybeSingle();

    if (error) {
      setRoleName("unknown");
      setRoleLoading(false);
      return;
    }

    setRoleName(normRole((data as any)?.role_name) || "unknown");
    setRoleLoading(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let tcId: number | null = Number.isFinite(tracecodeIdParam) ? tracecodeIdParam : null;

      if (!tcId && Number.isFinite(scheduleIdParam)) {
        const { data: s, error: se } = await supabase
          .from("vw_irrigation_schedule_list")
          .select(
            "irrigation_schedule_id, tracecode_id, tracecode_name, crop_name, scheduled_date, planned_mm, status"
          )
          .eq("irrigation_schedule_id", scheduleIdParam)
          .single();

        if (se || !s) throw new Error(se?.message || "Schedule not found");

        tcId = (s as any).tracecode_id as number;
        setSelectedScheduleId((s as any).irrigation_schedule_id as number);
      }

      if (!tcId) throw new Error("Missing tracecode_id / irrigation_schedule_id");

      const { data: opts, error: oe } = await supabase
        .from("vw_irrigation_schedule_list")
        .select(
          "irrigation_schedule_id, tracecode_id, tracecode_name, crop_name, scheduled_date, planned_mm, status"
        )
        .eq("tracecode_id", tcId)
        .order("scheduled_date", { ascending: true })
        .order("irrigation_schedule_id", { ascending: true });

      if (oe) throw new Error(oe.message);

      const list = (opts ?? []) as ScheduleInfo[];
      setScheduleOptions(list);

      if (!initRef.current && !Number.isFinite(scheduleIdParam)) {
        const startable = list.filter((s) => ["planned", "scheduled"].includes(String(s.status)));
        setSelectedScheduleId(startable.length ? startable[0].irrigation_schedule_id : null);
      }

      const { data: a, error: ae } = await supabase
        .from("irrigation_applied")
        .select("irrigation_applied_id, tracecode_id, irrigation_schedule_id, start_at, end_at, mm_applied")
        .eq("tracecode_id", tcId)
        .is("end_at", null)
        .order("start_at", { ascending: false })
        .limit(1);

      if (ae) throw new Error(ae.message);

      const running = (a ?? [])[0] as ActiveCycle | undefined;
      setActive(running ?? null);

      if (running?.irrigation_schedule_id) setSelectedScheduleId(running.irrigation_schedule_id);

      if (!initRef.current) {
        setStartDate(todayDmy());
        setStartTime(nowHm());
        setEndDate(todayDmy());
        setEndTime(nowHm());
      }

      initRef.current = true;
      dbg(`Loaded. schedules=${list.length} active=${running ? running.irrigation_applied_id : "none"}`);
    } catch (e: any) {
      dbg(`Load failed: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [scheduleIdParam, tracecodeIdParam]);

  useFocusEffect(
    useCallback(() => {
      initRef.current = false;
      fetchRole();
      load();
    }, [fetchRole, load])
  );

  const startCycle = useCallback(async () => {
    dbg("Start pressed");

    if (!canEdit) return dbg(`Not allowed: role=${roleName}`);
    if (inCycle) return dbg("Already running");
    if (!selectedScheduleId || !selectedSchedule) return dbg("No schedule selected");

    if (!["planned", "scheduled"].includes(String(selectedSchedule.status))) {
      return dbg(`Bad schedule status=${selectedSchedule.status}`);
    }

    const dt = parseLocalDateTime(startDate, startTime);
    if (!dt) return dbg("Bad start date/time");
    if (dt > new Date()) return dbg("Start is in the future");

    const mm = Math.round(Number(selectedSchedule.planned_mm));
    if (!Number.isFinite(mm) || mm <= 0) return dbg("Invalid planned_mm");

    setSaving(true);
    try {
      const { error } = await supabase.from("irrigation_applied").insert([
        {
          tracecode_id: selectedSchedule.tracecode_id,
          irrigation_schedule_id: selectedScheduleId,
          start_at: dt.toISOString(),
          end_at: null,
          mm_applied: mm,
        },
      ]);

      if (error) return dbg(`Start failed: ${error.message}`);

      dbg("Start OK -> back to dashboard");
      goBack();
    } catch (e: any) {
      dbg(`Start crashed: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [canEdit, roleName, inCycle, selectedScheduleId, selectedSchedule, startDate, startTime, goBack]);

  const finishCycle = useCallback(async () => {
    dbg("Finish pressed");

    if (!canEdit) return dbg(`Not allowed: role=${roleName}`);
    if (!active) return dbg("No active irrigation loaded");

    const dt = parseLocalDateTime(endDate, endTime);
    if (!dt) return dbg("Bad end date/time");
    if (dt > new Date()) return dbg("End is in the future");

    const start = new Date(active.start_at);
    if (dt <= start) return dbg("End must be after start");

    setSaving(true);
    dbg(`Attempting update id=${active.irrigation_applied_id}`);

    try {
      const { data, error } = await supabase
        .from("irrigation_applied")
        .update({ end_at: dt.toISOString() })
        .eq("irrigation_applied_id", active.irrigation_applied_id)
        .select("irrigation_applied_id, end_at");

      if (error) return dbg(`Finish failed: ${error.message}`);

      if (!data || data.length === 0) {
        return dbg("Finish failed: 0 rows updated (RLS or wrong id)");
      }

      dbg(`Finish OK: end_at saved for id=${data[0].irrigation_applied_id}`);
      goBack();
    } catch (e: any) {
      dbg(`Finish crashed: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [canEdit, roleName, active, endDate, endTime, goBack]);

  if (loading || roleLoading) return <ActivityIndicator style={{ marginTop: 30 }} />;

  const titleTrace =
    scheduleOptions[0]?.tracecode_name ?? (selectedSchedule ? selectedSchedule.tracecode_name : "Tracecode");
  const titleCrop =
    scheduleOptions[0]?.crop_name ?? (selectedSchedule ? selectedSchedule.crop_name : "");

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "900" }}>{titleTrace}</Text>
          <Text style={{ color: "#666" }}>{titleCrop}</Text>
        </View>

        <Pressable onPress={goBack} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      <Text style={{ fontWeight: "900", marginTop: 8 }}>Role: {roleName}</Text>

      {/* DEBUG BANNER */}
      {debugMsg ? (
        <View style={styles.debugBox}>
          <Text style={{ fontWeight: "900" }}>DEBUG</Text>
          <Text selectable>{debugMsg}</Text>
        </View>
      ) : null}

      {/* Schedule required */}
      <View style={styles.box}>
        <Text style={styles.boxTitle}>Schedule (required)</Text>

        {selectableOptions.length === 0 ? (
          <Text style={{ color: "crimson", fontWeight: "900" }}>
            {inCycle
              ? "Running irrigation found, but no schedule rows returned."
              : "No planned/scheduled schedules found for this tracecode."}
          </Text>
        ) : (
          selectableOptions.map((s) => {
            const selected = s.irrigation_schedule_id === selectedScheduleId;
            const label = `${isoToDmy(s.scheduled_date)} • ${Math.round(Number(s.planned_mm))}mm • ${s.status}`;

            const locked = inCycle && active?.irrigation_schedule_id != null;

            return (
              <Pressable
                key={s.irrigation_schedule_id}
                onPress={() => {
                  if (locked) return;
                  setSelectedScheduleId(s.irrigation_schedule_id);
                }}
                style={[styles.option, selected && styles.optionSelected, locked && { opacity: 0.6 }]}
              >
                <Text style={{ fontWeight: selected ? "900" : "800" }}>
                  {selected ? "● " : "○ "} {label}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>

      <View style={styles.box}>
        <Text style={styles.boxTitle}>{inCycle ? "Finish irrigation" : "Start irrigation"}</Text>

        <Text style={styles.label}>mm (locked to schedule)</Text>
        <View style={styles.locked}>
          <Text style={{ fontWeight: "900" }}>
            {plannedMmLocked == null ? "-" : String(plannedMmLocked)}
          </Text>
        </View>

        {!inCycle ? (
          <>
            <Text style={styles.label}>Start Date (DD/MM/YYYY)</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              onBlur={() => setStartDate((v) => normalizeDmy(v))}
              editable={canEdit && !saving}
              style={styles.input}
              placeholder="DD/MM/YYYY"
            />

            <Text style={styles.label}>Start Time (HH:MM)</Text>
            <TextInput
              value={startTime}
              onChangeText={setStartTime}
              onBlur={() => setStartTime((v) => normalizeHm(v))}
              editable={canEdit && !saving}
              style={styles.input}
              placeholder="HH:MM"
              keyboardType="numbers-and-punctuation"
            />

            <Pressable
              onPress={startCycle}
              disabled={!canEdit || saving || !selectedScheduleId}
              style={[styles.primaryBtn, (!canEdit || saving || !selectedScheduleId) && styles.disabledBtn]}
            >
              <Text style={styles.primaryText}>{saving ? "Saving…" : "Save Start"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ color: "#666", marginBottom: 6 }}>
              Started: {new Date(active.start_at).toLocaleString()}
            </Text>

            <Text style={styles.label}>End Date (DD/MM/YYYY)</Text>
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              onBlur={() => setEndDate((v) => normalizeDmy(v))}
              editable={canEdit && !saving}
              style={styles.input}
              placeholder="DD/MM/YYYY"
            />

            <Text style={styles.label}>End Time (HH:MM)</Text>
            <TextInput
              value={endTime}
              onChangeText={setEndTime}
              onBlur={() => setEndTime((v) => normalizeHm(v))}
              editable={canEdit && !saving}
              style={styles.input}
              placeholder="HH:MM"
              keyboardType="numbers-and-punctuation"
            />

            <Pressable
              onPress={finishCycle}
              disabled={!canEdit || saving}
              style={[styles.primaryBtn, (!canEdit || saving) && styles.disabledBtn]}
            >
              <Text style={styles.primaryText}>{saving ? "Saving…" : "Save Finish"}</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  cancelText: { fontWeight: "900" },

  debugBox: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f0c",
    borderRadius: 10,
    backgroundColor: "#fff",
  },

  box: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  boxTitle: { fontWeight: "900", fontSize: 16, marginBottom: 10 },

  option: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 8,
    backgroundColor: "#fafafa",
  },
  optionSelected: { borderColor: "#111", backgroundColor: "#f0f0f0" },

  label: { fontWeight: "900", marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
    fontWeight: "900",
  },
  locked: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f5f5f5",
  },

  primaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#111",
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "900" },
  disabledBtn: { opacity: 0.4 },
});