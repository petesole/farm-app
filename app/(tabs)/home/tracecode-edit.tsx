import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import {fuelDateISO} from "./fuel_admin_dates";
// app/(tabs)/home/tracecode-edit.tsx
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../../supabase";

/** Adjust if your dashboard route differs */
const BACK_TO_DASHBOARD = "/(tabs)/field-dashboard";

/** ---------- Types ---------- */
type TracecodeRow = {
  tracecode_id: number;
  tracecode_name: string;
  tracecode_size: number | null;

  field_id: number;
  irrigation_type_id: number | null;
  crop_id: number | null;
  variety_id: number | null;
  season_id: number;

  start_date: string | null;
  end_date: string | null;

  planned_planting_date: string | null;
  actual_planting_date: string | null;
  germination_date: string | null;

  plant_population: number | null;
  fuel_budget_id: number | null;
};

type RoleName = "admin" | "manager" | "viewer" | "irrigation" | "unknown";

type FarmRow = { farm_id: number; farm_name: string | null };
type FieldRow = { field_id: number; field_name: string | null; farm_id: number | null };
type SeasonRow = { season_id: number; season_name: string | null };
type IrrRow = { irrigation_type_id: number; irrigation_type: string | null };
type CropRow = { crop_id: number; crop_name: string | null };
type VarietyRow = { variety_id: number; crop_id: number | null; variety_name: string | null };
type FuelBudgetRow = { fuel_budget_id:number; fuel_budget_name:string; crop_id:number|null; active:boolean };

/** ---------- Helpers ---------- */
function norm(s: string | null | undefined) {
  return (s ?? "").toString().trim().toLowerCase();
}

function mapStoredRole(storedRole: string | null): RoleName {
  const r = norm(storedRole);
  if (r === "admin") return "admin";
  if (r === "manager") return "manager";
  if (r === "viewer") return "viewer";
  if (r === "irrigation") return "irrigation";
  return "unknown";
}

/** ---------- Date helpers (DD/MM/YYYY <-> YYYY-MM-DD) ---------- */
function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isDDMMYYYY(s: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s);
}
/** Accept DD/MM/YYYY or ISO; return ISO or null or "__BAD__" */
function toDbDateOrNull(s: string) {
 const t=s.trim(); if(!t)return null;
 if(isISODate(t))return t;
 return fuelDateISO(t)??"__BAD__";
}
/** ISO -> DD/MM/YYYY */
function isoToDDMMYYYY(s: string | null) {
  if (!s) return "";
  const t = s.slice(0, 10);
  if (!isISODate(t)) return s;
  const [yyyy, mm, dd] = t.split("-");
  return `${dd}/${mm}/${yyyy}`;
}
function toNumOrNull(s: string) {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** ---------- UI helpers ---------- */
function Card({ title, children }: { title: string; children: any }) {
  return (
    <ThemedView style={styles.card}>
      <ThemedText type="subtitle">{title}</ThemedText>
      {children}
    </ThemedView>
  );
}

function LabeledInput(props: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboardType?: "default" | "numeric";
  placeholder?: string;
  editable?: boolean;
  normalizeDate?: boolean;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <ThemedText style={styles.label}>{props.label}</ThemedText>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        onBlur={props.normalizeDate ? () => { const iso = fuelDateISO(props.value); if(iso) props.onChangeText(isoToDDMMYYYY(iso)); } : undefined}
        keyboardType={props.keyboardType ?? "default"}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={props.placeholder ?? "-"}
        placeholderTextColor="rgba(120,120,120,0.8)"
        editable={props.editable !== false}
        style={[styles.input, props.editable === false && { opacity: 0.6 }]}
      />
    </View>
  );
}

function SelectorRow(props: {
  label: string;
  valueText: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <ThemedText style={styles.label}>{props.label}</ThemedText>
      <Pressable
        style={[styles.selector, props.disabled && { opacity: 0.5 }]}
        onPress={props.onPress}
        disabled={props.disabled}
      >
        <ThemedText numberOfLines={1}>{props.valueText}</ThemedText>
      </Pressable>
    </View>
  );
}

function SelectModal<T>(props: {
  visible: boolean;
  title: string;
  items: T[];
  getKey: (t: T) => string;
  getLabel: (t: T) => string;
  onPick: (t: T) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return props.items;
    return props.items.filter((it) => props.getLabel(it).toLowerCase().includes(qq));
  }, [q, props.items, props.getLabel]);

  useEffect(() => {
    if (!props.visible) setQ("");
  }, [props.visible]);

  const renderItem = useCallback(
    ({ item }: { item: T }) => (
      <Pressable onPress={() => props.onPick(item)} style={styles.modalItem}>
        <ThemedText numberOfLines={1}>{props.getLabel(item)}</ThemedText>
      </Pressable>
    ),
    [props]
  );

  return (
    <Modal visible={props.visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <ThemedText type="subtitle">{props.title}</ThemedText>
            <Pressable onPress={props.onClose} style={styles.modalCloseBtn}>
              <ThemedText style={{ fontWeight: "700" }}>X</ThemedText>
            </Pressable>
          </View>

          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search…"
            placeholderTextColor="rgba(120,120,120,0.8)"
            style={styles.modalSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={{ maxHeight: 420 }}>
            <FlatList
              data={filtered}
              keyExtractor={(it) => props.getKey(it)}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <ThemedText style={{ opacity: 0.7, paddingVertical: 10 }}>No matches.</ThemedText>
              }
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** ---------- friendly error for active tracecode duplicate ---------- */
function isActiveTracecodeNameDuplicate(err: any) {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  const details = String(err?.details ?? "");
  if (code !== "23505") return false;
  if (msg.includes("tracecode_unique_active_name") || details.includes("tracecode_unique_active_name")) return true;
  if (msg.toLowerCase().includes("duplicate key value")) return true;
  return false;
}

function showTracecodeActiveMessage() {
  Alert.alert("This TraceCode is already active.", "Choose a different name, or close the existing tracecode first.");
}

/** ---------- Screen ---------- */
export default function TracecodeEditScreen() {
  const params = useLocalSearchParams<{
    tracecodeId?: string | string[];
    tracecode_id?: string | string[];
    id?: string | string[];
    mode?: string | string[];
  }>();

  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;

  const tidRaw =
    (Array.isArray(params.tracecodeId) ? params.tracecodeId[0] : params.tracecodeId) ??
    (Array.isArray(params.tracecode_id) ? params.tracecode_id[0] : params.tracecode_id) ??
    (Array.isArray(params.id) ? params.id[0] : params.id);

  const forcedMode = norm(mode);
  const isNew = forcedMode === "new" || !tidRaw;
  const id = isNew ? null : Number(tidRaw);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Roles
  const [roles, setRoles] = useState<RoleName[]>([]);

  // Loaded row (edit mode)
  const [row, setRow] = useState<TracecodeRow | null>(null);

  // Lookups (admin only)
  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [irrs, setIrrs] = useState<IrrRow[]>([]);
  const [crops, setCrops] = useState<CropRow[]>([]);
  const [varieties, setVarieties] = useState<VarietyRow[]>([]);
  const [fuelBudgets,setFuelBudgets] = useState<FuelBudgetRow[]>([]);

  // Modals (admin only)
  const [farmModal, setFarmModal] = useState(false);
  const [fieldModal, setFieldModal] = useState(false);
  const [seasonModal, setSeasonModal] = useState(false);
  const [irrModal, setIrrModal] = useState(false);
  const [cropModal, setCropModal] = useState(false);
  const [varietyModal, setVarietyModal] = useState(false);
  const [fuelBudgetModal,setFuelBudgetModal] = useState(false);

  // Form fields
  const [tracecodeName, setTracecodeName] = useState("");
  const [tracecodeSize, setTracecodeSize] = useState("");

  const [farmId, setFarmId] = useState<number | null>(null);
  const [fieldId, setFieldId] = useState<number | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [irrId, setIrrId] = useState<number | null>(null);
  const [cropId, setCropId] = useState<number | null>(null);
  const [varietyId, setVarietyId] = useState<number | null>(null);
  const [fuelBudgetId,setFuelBudgetId] = useState<number | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [plannedPlantingDate, setPlannedPlantingDate] = useState("");
  const [actualPlantingDate, setActualPlantingDate] = useState("");
  const [germinationDate, setGerminationDate] = useState("");

  const [plantPopulation, setPlantPopulation] = useState("");

  /** role flags */
  const storedRole = roles[0] ?? "unknown";
  const isAdmin = storedRole === "admin";
  const isManager = storedRole === "manager";
  const allowFullAdminEdit = isAdmin && (forcedMode === "admin" || isNew);

  /** ---- Selected display names (admin) ---- */
  const selectedFarm = useMemo(
    () => farms.find((f) => f.farm_id === farmId) ?? null,
    [farms, farmId]
  );
  const selectedField = useMemo(
    () => fields.find((f) => f.field_id === fieldId) ?? null,
    [fields, fieldId]
  );
  const selectedSeason = useMemo(
    () => seasons.find((s) => s.season_id === seasonId) ?? null,
    [seasons, seasonId]
  );
  const selectedIrr = useMemo(
    () => irrs.find((i) => i.irrigation_type_id === irrId) ?? null,
    [irrs, irrId]
  );
  const selectedCrop = useMemo(
    () => crops.find((c) => c.crop_id === cropId) ?? null,
    [crops, cropId]
  );
  const selectedVariety = useMemo(
    () => varieties.find((v) => v.variety_id === varietyId) ?? null,
    [varieties, varietyId]
  );

  const budgetsForCrop = useMemo(()=>fuelBudgets.filter(b=>b.active && b.crop_id===cropId),[fuelBudgets,cropId]);
  const selectedFuelBudget = fuelBudgets.find(b=>b.fuel_budget_id===fuelBudgetId);

  const fieldsForFarm = useMemo(() => {
    if (!farmId) return fields;
    return fields.filter((f) => f.farm_id === farmId);
  }, [fields, farmId]);

  const varietiesForCrop = useMemo(() => {
    if (!cropId) return varieties;
    return varieties.filter((v) => v.crop_id === cropId);
  }, [varieties, cropId]);

  useEffect(() => {
    if (!fieldId) return;
    const f = fields.find((x) => x.field_id === fieldId);
    if (f?.farm_id) setFarmId(f.farm_id);
  }, [fieldId, fields]);

  /** ---------- Load helpers ---------- */
  async function loadRoles() {
    const storedRole = await AsyncStorage.getItem("role");
    return [mapStoredRole(storedRole)];
  }

  async function loadLookupsAdmin() {
    const [farmRes, fieldRes, seasonRes, irrRes, cropRes, varRes, fuelRes] = await Promise.all([
      supabase.from("farm").select("farm_id,farm_name").order("farm_name"),
      supabase.from("field").select("field_id,field_name,farm_id").order("field_name"),
      supabase.from("season").select("season_id,season_name").order("season_name"),
      supabase.from("irrigation_type").select("irrigation_type_id,irrigation_type").order("irrigation_type"),
      supabase.from("crop").select("crop_id,crop_name").order("crop_name"),
      supabase.from("variety").select("variety_id,variety_name,crop_id").order("variety_name"),
      supabase.from("fuel_budget").select("fuel_budget_id,fuel_budget_name,crop_id,active").order("fuel_budget_name"),
    ]);

    if (farmRes.error) throw new Error(`farm: ${farmRes.error.message}`);
    if (fieldRes.error) throw new Error(`field: ${fieldRes.error.message}`);
    if (seasonRes.error) throw new Error(`season: ${seasonRes.error.message}`);
    if (irrRes.error) throw new Error(`irrigation_type: ${irrRes.error.message}`);
    if (cropRes.error) throw new Error(`crop: ${cropRes.error.message}`);
    if (varRes.error) throw new Error(`variety: ${varRes.error.message}`);
    if (fuelRes.error) throw new Error(`fuel_budget: ${fuelRes.error.message}`);

    setFarms((farmRes.data ?? []) as FarmRow[]);
    setFields((fieldRes.data ?? []) as FieldRow[]);
    setSeasons((seasonRes.data ?? []) as SeasonRow[]);
    setIrrs((irrRes.data ?? []) as IrrRow[]);
    setCrops((cropRes.data ?? []) as CropRow[]);
    setVarieties((varRes.data ?? []) as VarietyRow[]);
    setFuelBudgets((fuelRes.data ?? []) as FuelBudgetRow[]);
  }

  async function loadTracecodeAdmin(tid: number) {
    const res = await supabase.from("tracecode").select("*").eq("tracecode_id", tid).single();
    if (res.error) throw new Error(res.error.message);
    return res.data as TracecodeRow;
  }

  async function loadTracecodeManager(tid: number) {
    const res = await supabase
      .from("tracecode")
      .select("tracecode_id,tracecode_name,actual_planting_date,germination_date,plant_population")
      .eq("tracecode_id", tid)
      .single();
    if (res.error) throw new Error(res.error.message);
    return res.data as any as TracecodeRow;
  }

  /** ---------- Init ---------- */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const r = await loadRoles();
        setRoles(r);

        const role = r[0] ?? "unknown";
        const canFullAdminEdit = role === "admin" && (forcedMode === "admin" || isNew);

        if (isNew) {
          if (role !== "admin") {
            Alert.alert("Access denied", "Only admins can create new tracecodes.");
            router.replace(BACK_TO_DASHBOARD);
            return;
          }

          await loadLookupsAdmin();

          setTracecodeName("");
          setTracecodeSize("");
          setFarmId(null);
          setFieldId(null);
          setSeasonId(null);
          setIrrId(null);
          setCropId(null);
          setVarietyId(null);
          setFuelBudgetId(null);

          setStartDate("");
          setEndDate("");
          setPlannedPlantingDate("");
          setActualPlantingDate("");
          setGerminationDate("");
          setPlantPopulation("");

          setRow(null);
          return;
        }

        if (!id || Number.isNaN(id)) {
          Alert.alert("Missing TracecodeID", "No tracecodeId was provided.");
          router.replace(BACK_TO_DASHBOARD);
          return;
        }

        if (canFullAdminEdit) {
          await loadLookupsAdmin();
          const tc = await loadTracecodeAdmin(id);
          setRow(tc);

          setTracecodeName(tc.tracecode_name ?? "");
          setTracecodeSize(tc.tracecode_size?.toString() ?? "");

          setFieldId(tc.field_id ?? null);
          setSeasonId(tc.season_id ?? null);
          setIrrId(tc.irrigation_type_id ?? null);
          setCropId(tc.crop_id ?? null);
          setVarietyId(tc.variety_id ?? null);
          setFuelBudgetId(tc.fuel_budget_id ?? null);

          setStartDate(isoToDDMMYYYY(tc.start_date));
          setEndDate(isoToDDMMYYYY(tc.end_date));
          setPlannedPlantingDate(isoToDDMMYYYY(tc.planned_planting_date));
          setActualPlantingDate(isoToDDMMYYYY(tc.actual_planting_date));
          setGerminationDate(isoToDDMMYYYY(tc.germination_date));

          setPlantPopulation(tc.plant_population?.toString() ?? "");
          return;
        }

        if (role === "manager") {
          const tc = await loadTracecodeManager(id);
          setRow(tc);

          setTracecodeName(tc.tracecode_name ?? "");
          setActualPlantingDate(isoToDDMMYYYY(tc.actual_planting_date));
          setGerminationDate(isoToDDMMYYYY(tc.germination_date));
          setPlantPopulation(tc.plant_population?.toString() ?? "");
          return;
        }

        const tc = await loadTracecodeManager(id);
        setRow(tc);
        setTracecodeName(tc.tracecode_name ?? "");
        setActualPlantingDate(isoToDDMMYYYY(tc.actual_planting_date));
        setGerminationDate(isoToDDMMYYYY(tc.germination_date));
        setPlantPopulation(tc.plant_population?.toString() ?? "");
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load tracecode");
        router.replace(BACK_TO_DASHBOARD);
      } finally {
        setLoading(false);
      }
    })();
  }, [tidRaw, mode, forcedMode, id, isNew]);

  /** ---------- Admin pick handlers ---------- */
  function onPickFarm(f: FarmRow) {
    setFarmId(f.farm_id);
    const currentField = fields.find((x) => x.field_id === fieldId);
    if (currentField && currentField.farm_id !== f.farm_id) setFieldId(null);
    setFarmModal(false);
  }

  function onPickField(f: FieldRow) {
    setFieldId(f.field_id);
    if (f.farm_id) setFarmId(f.farm_id);
    setFieldModal(false);
  }

  function onPickCrop(c: CropRow) {
    setCropId(c.crop_id);
    const currentVar = varieties.find((v) => v.variety_id === varietyId);
    if (currentVar && currentVar.crop_id !== c.crop_id) setVarietyId(null);
    const currentBudget=fuelBudgets.find(b=>b.fuel_budget_id===fuelBudgetId);
    if(currentBudget && currentBudget.crop_id!==c.crop_id)setFuelBudgetId(null);
    setCropModal(false);
  }

  function onPickVariety(v: VarietyRow) {
    setVarietyId(v.variety_id);
    setVarietyModal(false);
  }

  /** ---------- Validation ---------- */
  function validateDatesDDMM(list: { label: string; val: string }[]) {
    for (const f of list) {
      const t = f.val.trim();
      if (!t) continue;
      const iso = toDbDateOrNull(t);
      if (iso === "__BAD__") return `${f.label} must be DD/MM/YYYY or D/M (example: 5/12)`;
    }
    return null;
  }

  /** ---------- Save ---------- */
  async function save() {
    if (!isAdmin && !isManager) {
      Alert.alert("Access denied", "You do not have permission to save changes.");
      return;
    }

    if (isNew && !isAdmin) {
      Alert.alert("Access denied", "Only admins can create new tracecodes.");
      return;
    }

    const opsErr = validateDatesDDMM([
      { label: "Actual planting date", val: actualPlantingDate },
      { label: "Germination date", val: germinationDate },
    ]);
    if (opsErr) return Alert.alert("Check dates", opsErr);

    const actualDb = toDbDateOrNull(actualPlantingDate);
    const germDb = toDbDateOrNull(germinationDate);
    if (actualDb === "__BAD__" || germDb === "__BAD__") {
      Alert.alert("Check dates", "Enter dates as DD/MM/YYYY or D/M (current year).");
      return;
    }

    try {
      setSaving(true);

      if (isManager && !isAdmin) {
        if (!row?.tracecode_id) {
          Alert.alert("Save error", "Missing tracecode ID.");
          return;
        }

        const res = await supabase.rpc("tracecode_ops_update", {
          p_tracecode_id: row.tracecode_id,
          p_actual_planting_date: (actualDb as any) ?? null,
          p_germination_date: (germDb as any) ?? null,
          p_plant_population: toNumOrNull(plantPopulation),
        });

        if (res.error) {
          Alert.alert("Save error", res.error.message);
          return;
        }

        router.replace(BACK_TO_DASHBOARD);
        return;
      }

      const name = tracecodeName.trim();
      if (!name) return Alert.alert("Missing name", "Tracecode name is required.");

      if (!fieldId) return Alert.alert("Missing field", "Field is required.");
      if (!seasonId) return Alert.alert("Missing season", "Season is required.");

      const adminErr = validateDatesDDMM([
        { label: "Start date", val: startDate },
        { label: "End date", val: endDate },
        { label: "Planned planting date", val: plannedPlantingDate },
      ]);
      if (adminErr) return Alert.alert("Check dates", adminErr);

      const startDb = toDbDateOrNull(startDate);
      const endDb = toDbDateOrNull(endDate);
      const planDb = toDbDateOrNull(plannedPlantingDate);
      if (startDb === "__BAD__" || endDb === "__BAD__" || planDb === "__BAD__") {
        Alert.alert("Check dates", "Enter dates as DD/MM/YYYY or D/M (current year).");
        return;
      }

      // Open TraceCodes must not be assigned an inactive fuel budget.
      if (!endDb && fuelBudgetId != null) {
        const chosenBudget = fuelBudgets.find(b => b.fuel_budget_id === fuelBudgetId);
        if (!chosenBudget?.active || chosenBudget.crop_id !== cropId) {
          Alert.alert("Fuel budget unavailable", "This TraceCode is active. Select an active fuel budget for its crop, or clear the fuel budget selection.");
          return;
        }
      }

      const payload: Omit<TracecodeRow, "tracecode_id"> = {
        tracecode_name: name,
        tracecode_size: toNumOrNull(tracecodeSize),

        field_id: fieldId,
        irrigation_type_id: irrId ?? null,
        crop_id: cropId ?? null,
        variety_id: varietyId ?? null,
        season_id: seasonId,

        start_date: (startDb as any) ?? null,
        end_date: (endDb as any) ?? null,

        planned_planting_date: (planDb as any) ?? null,
        actual_planting_date: (actualDb as any) ?? null,
        germination_date: (germDb as any) ?? null,

        plant_population: toNumOrNull(plantPopulation),
        fuel_budget_id: fuelBudgetId,
      };

      if (isNew) {
        const res = await supabase.from("tracecode").insert(payload as any).select("tracecode_id").single();

        if (res.error) {
          if (isActiveTracecodeNameDuplicate(res.error)) {
            showTracecodeActiveMessage();
            return;
          }
          Alert.alert("Save error", res.error.message);
          return;
        }

        router.replace(BACK_TO_DASHBOARD);
        return;
      }

      if (!row?.tracecode_id && !id) {
        Alert.alert("Save error", "Missing tracecode ID.");
        return;
      }
      const tid = row?.tracecode_id ?? (id as number);

      const res = await supabase.from("tracecode").update(payload as any).eq("tracecode_id", tid);

      if (res.error) {
        if (isActiveTracecodeNameDuplicate(res.error)) {
          showTracecodeActiveMessage();
          return;
        }
        Alert.alert("Save error", res.error.message);
        return;
      }

      router.replace(BACK_TO_DASHBOARD);
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save tracecode");
    } finally {
      setSaving(false);
    }
  }

  /** ---------- Render ---------- */
  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={{ marginTop: 8 }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  const modeLabel = allowFullAdminEdit
    ? isNew
      ? "ADMIN (new tracecode)"
      : "ADMIN (full edit)"
    : isManager
      ? "MANAGER (limited edit)"
      : "VIEWER (read-only)";

  return (
    <ThemedView style={styles.container}>
      <JsplModuleHeader title="Trace Control" backLabel="Trace Control" backHref="/(tabs)/field-dashboard" />
      <ThemedText style={{ opacity: 0.55, marginBottom: 6 }}>
        params: mode={String(mode ?? "")} tracecodeIdRaw={String(tidRaw ?? "")}
      </ThemedText>

      {allowFullAdminEdit && (
        <>
          <SelectModal<FarmRow>
            visible={farmModal}
            title="Select Farm"
            items={farms}
            getKey={(t) => String(t.farm_id)}
            getLabel={(t) => t.farm_name ?? `Farm ${t.farm_id}`}
            onPick={onPickFarm}
            onClose={() => setFarmModal(false)}
          />

          <SelectModal<FieldRow>
            visible={fieldModal}
            title="Select Field"
            items={fieldsForFarm}
            getKey={(t) => String(t.field_id)}
            getLabel={(t) => t.field_name ?? `Field ${t.field_id}`}
            onPick={onPickField}
            onClose={() => setFieldModal(false)}
          />

          <SelectModal<SeasonRow>
            visible={seasonModal}
            title="Select Season"
            items={seasons}
            getKey={(t) => String(t.season_id)}
            getLabel={(t) => t.season_name ?? `Season ${t.season_id}`}
            onPick={(t) => {
              setSeasonId(t.season_id);
              setSeasonModal(false);
            }}
            onClose={() => setSeasonModal(false)}
          />

          <SelectModal<IrrRow>
            visible={irrModal}
            title="Select Irrigation Type"
            items={irrs}
            getKey={(t) => String(t.irrigation_type_id)}
            getLabel={(t) => t.irrigation_type ?? `Irr ${t.irrigation_type_id}`}
            onPick={(t) => {
              setIrrId(t.irrigation_type_id);
              setIrrModal(false);
            }}
            onClose={() => setIrrModal(false)}
          />

          <SelectModal<CropRow>
            visible={cropModal}
            title="Select Crop"
            items={crops}
            getKey={(t) => String(t.crop_id)}
            getLabel={(t) => t.crop_name ?? `Crop ${t.crop_id}`}
            onPick={onPickCrop}
            onClose={() => setCropModal(false)}
          />

          <SelectModal<FuelBudgetRow>
            visible={fuelBudgetModal}
            title="Select Fuel Budget"
            items={budgetsForCrop}
            getKey={(b)=>String(b.fuel_budget_id)}
            getLabel={(b)=>b.fuel_budget_name}
            onPick={(b)=>{setFuelBudgetId(b.fuel_budget_id);setFuelBudgetModal(false);}}
            onClose={()=>setFuelBudgetModal(false)}
          />
          <SelectModal<VarietyRow>
            visible={varietyModal}
            title="Select Variety"
            items={varietiesForCrop}
            getKey={(t) => String(t.variety_id)}
            getLabel={(t) => t.variety_name ?? `Variety ${t.variety_id}`}
            onPick={onPickVariety}
            onClose={() => setVarietyModal(false)}
          />
        </>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator>
        <ThemedText type="subtitle" style={{ marginBottom: 6 }}>
          {isNew ? "New Tracecode" : `Edit Tracecode${row?.tracecode_id ? ` (ID ${row.tracecode_id})` : ""}`}
        </ThemedText>

        <ThemedText style={{ opacity: 0.75, marginBottom: 10 }}>Mode: {modeLabel}</ThemedText>

        {allowFullAdminEdit && (
          <>
            <Card title="Basics">
              <LabeledInput
                label="Tracecode name"
                value={tracecodeName}
                onChangeText={setTracecodeName}
                placeholder="e.g. Granite A1"
              />
              <LabeledInput
                label="Tracecode size (ha)"
                value={tracecodeSize}
                onChangeText={setTracecodeSize}
                keyboardType="numeric"
                placeholder="e.g. 12.5"
              />
            </Card>

            <Card title="Location / Setup (names, not IDs)">
              <SelectorRow
                label="Farm"
                valueText={selectedFarm?.farm_name ?? (farmId ? `Farm ${farmId}` : "Select farm…")}
                onPress={() => setFarmModal(true)}
              />
              <SelectorRow
                label="Field (required)"
                valueText={selectedField?.field_name ?? (fieldId ? `Field ${fieldId}` : "Select field…")}
                onPress={() => setFieldModal(true)}
              />
              <SelectorRow
                label="Season (required)"
                valueText={selectedSeason?.season_name ?? (seasonId ? `Season ${seasonId}` : "Select season…")}
                onPress={() => setSeasonModal(true)}
              />
              <SelectorRow
                label="Irrigation type"
                valueText={selectedIrr?.irrigation_type ?? (irrId ? `Irrigation ${irrId}` : "Select irrigation type…")}
                onPress={() => setIrrModal(true)}
              />
            </Card>

            <Card title="Crop (names, not IDs)">
              <SelectorRow
                label="Crop"
                valueText={selectedCrop?.crop_name ?? (cropId ? `Crop ${cropId}` : "Select crop…")}
                onPress={() => setCropModal(true)}
              />
              <SelectorRow
                label="Variety"
                valueText={selectedVariety?.variety_name ?? (varietyId ? `Variety ${varietyId}` : "Select variety…")}
                onPress={() => setVarietyModal(true)}
                disabled={!cropId}
              />
            </Card>

            <Card title="Fuel planning">
              <SelectorRow
                label="Fuel budget"
                valueText={selectedFuelBudget ? selectedFuelBudget.fuel_budget_name + (selectedFuelBudget.active ? "" : " (inactive — change or clear)") : "Select fuel budget…"}
                onPress={()=>setFuelBudgetModal(true)}
                disabled={!cropId}
              />
              <Pressable onPress={()=>setFuelBudgetId(null)} style={{marginTop:8}}>
                <ThemedText style={{opacity:0.7}}>Clear fuel budget selection</ThemedText>
              </Pressable>
            </Card>
            <Card title="Dates (DD/MM/YYYY)">
              <LabeledInput label="Start date" value={startDate} onChangeText={setStartDate}
                normalizeDate placeholder="e.g. 09/02/2026" />
              <LabeledInput label="End date" value={endDate} onChangeText={setEndDate}
                normalizeDate placeholder="e.g. 30/06/2026" />
              <LabeledInput
                label="Planned planting date"
                value={plannedPlantingDate}
                onChangeText={setPlannedPlantingDate}
                normalizeDate
                placeholder="e.g. 15/02/2026"
              />
            </Card>
          </>
        )}

        <Card title={allowFullAdminEdit ? "Operational fields" : "Operational fields (manager editable limited)"}>
          <LabeledInput
            label="Actual planting date (DD/MM/YYYY)"
            value={actualPlantingDate}
            onChangeText={setActualPlantingDate}
                normalizeDate
            placeholder="e.g. 18/02/2026"
            editable={isAdmin || isManager}
          />
          <LabeledInput
            label="Germination date (DD/MM/YYYY)"
            value={germinationDate}
            onChangeText={setGerminationDate}
                normalizeDate
            placeholder="e.g. 28/02/2026"
            editable={isAdmin || isManager}
          />
          <LabeledInput
            label="Plant population (plants/ha)"
            value={plantPopulation}
            onChangeText={setPlantPopulation}
            keyboardType="numeric"
            placeholder="e.g. 250000"
            editable={isAdmin || isManager}
          />
        </Card>

        <ThemedView style={styles.footerRow}>
          <Pressable onPress={() => router.replace(BACK_TO_DASHBOARD)} style={[styles.btn, styles.btnGhost]} disabled={saving}>
            <ThemedText style={styles.btnTextGhost}>Cancel</ThemedText>
          </Pressable>

          <Pressable
            onPress={save}
            style={[styles.btn, (saving || (!isAdmin && !isManager) || (isNew && !isAdmin)) && { opacity: 0.6 }]}
            disabled={saving || (!isAdmin && !isManager) || (isNew && !isAdmin)}
          >
            {saving ? <ActivityIndicator /> : <ThemedText style={styles.btnText}>Save</ThemedText>}
          </Pressable>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

/** ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: { padding: 12, borderRadius: 12, marginBottom: 12, gap: 4 },

  label: { marginTop: 6, opacity: 0.8, fontSize: 12 },

  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },

  selector: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  footerRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 10,
  },

  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
  },
  btnGhost: { backgroundColor: "transparent" },
  btnText: { fontWeight: "700" },
  btnTextGhost: { fontWeight: "700", opacity: 0.9 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 18,
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 14,
    padding: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalCloseBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
  },
  modalSearch: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(120,120,120,0.18)",
  },
});