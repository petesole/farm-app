import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { supabase } from "@/supabase";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { jsplColors as C, jsplSpacing as S, jsplRadii as R } from "@/constants/jspl-design";

type Vehicle = { vehicle_id: number; vehicle_name: string; vehicle_model: string | null; vehicle_discontinued: boolean; has_meter: boolean; meter_type: string | null };
const blank = { vehicle_name: "", vehicle_model: "", has_meter: false, meter_type: "HOURS" };
export default function VehicleManagement() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [hasMeter, setHasMeter] = useState(false);
  const [meterType, setMeterType] = useState("HOURS");
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const { data, error: e } = await supabase.from("vehicle")
      .select("vehicle_id,vehicle_name,vehicle_model,vehicle_discontinued,has_meter,meter_type")
      .order("vehicle_name");
    if (e) setError(e.message);
    else setVehicles((data ?? []) as Vehicle[]);
  }
  useEffect(() => {
    (async () => {
      const { data: u, error: ue } = await supabase.auth.getUser();
      if (ue || !u.user) { setAllowed(false); return; }
      const { data, error: e } = await supabase.rpc("my_farm_app_roles");
      const admin = !e && Array.isArray(data) && data.some((r: string) => String(r).toLowerCase() === "admin");
      setAllowed(admin);
      if (admin) void load();
    })();
  }, []);
  function edit(v: Vehicle | null) {
    setSelected(v);
    setName(v?.vehicle_name ?? blank.vehicle_name);
    setModel(v?.vehicle_model ?? blank.vehicle_model);
    setHasMeter(v?.has_meter ?? blank.has_meter);
    setMeterType(v?.meter_type ?? blank.meter_type);
    setError("");
  }
  async function save() {
    if (!name.trim()) { setError("Vehicle name is required."); return; }
    setBusy(true); setError("");
    const payload = { vehicle_name: name.trim(), vehicle_model: model.trim() || null,
      has_meter: hasMeter, meter_type: hasMeter ? meterType : null };
    const response = selected
      ? await supabase.from("vehicle").update(payload).eq("vehicle_id", selected.vehicle_id).select("vehicle_id")
      : await supabase.from("vehicle").insert({ ...payload, vehicle_discontinued: false }).select("vehicle_id");
    setBusy(false);
    if (response.error) { setError(response.error.message); return; }
    if (!response.data?.length) { setError("No vehicle saved. Check access permissions."); return; }
    edit(null); await load();
  }
  function changeStatus(v: Vehicle) {
    Alert.alert(v.vehicle_discontinued ? "Reactivate vehicle?" : "Discontinue vehicle?",
      v.vehicle_discontinued ? "Return this vehicle to Fuel Issue selection?" : "Hide this vehicle from new Fuel Issue selection? Its fuel history will remain intact.",
      [{ text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: async () => {
        setBusy(true);
        const { data, error: e } = await supabase.from("vehicle")
          .update({ vehicle_discontinued: !v.vehicle_discontinued }).eq("vehicle_id", v.vehicle_id).select("vehicle_id");
        setBusy(false);
        if (e || !data?.length) setError(e?.message ?? "Could not update vehicle.");
        else await load();
      }}]);
  }
  if (allowed === null) return <ActivityIndicator />;
  if (!allowed) return <Redirect href="/(tabs)/fuel" />;
  return <ScrollView contentContainerStyle={styles.page}>
    <JsplModuleHeader title="Vehicle Management" showMain />
    <Pressable style={styles.link} onPress={() => router.push("/(tabs)/control-panel")}><Text style={styles.linkText}>Control Panel</Text></Pressable>
    <Text style={styles.heading}>{selected ? "Edit Vehicle" : "Add Vehicle"}</Text>
    <Text style={styles.label}>Vehicle name</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Vehicle name / number" />
    <Text style={styles.label}>Model (optional)</Text><TextInput style={styles.input} value={model} onChangeText={setModel} placeholder="Model" />
    <View style={styles.row}><Text style={styles.label}>Has meter</Text><Switch value={hasMeter} onValueChange={setHasMeter}/></View>
    {hasMeter && <View style={styles.row}>
      {["HOURS","KM"].map(t => <Pressable key={t} style={[styles.choice,meterType===t&&styles.chosen]} onPress={() => setMeterType(t)}><Text>{t}</Text></Pressable>)}
    </View>}
    <View style={styles.row}>
      <Pressable disabled={busy} style={styles.action} onPress={save}><Text style={styles.actionText}>{busy ? "Saving..." : selected ? "Save Changes" : "Add Vehicle"}</Text></Pressable>
      {selected && <Pressable style={styles.choice} onPress={() => edit(null)}><Text>Cancel Edit</Text></Pressable>}
    </View>
    {!!error && <Text style={styles.error}>{error}</Text>}
    <View style={styles.row}><Text style={styles.heading}>Vehicles</Text><View style={{flex:1}}/><Text>Show discontinued</Text><Switch value={showInactive} onValueChange={setShowInactive}/></View>
    {vehicles.filter(v => showInactive || !v.vehicle_discontinued).map(v => <View key={v.vehicle_id} style={styles.vehicle}>
      <View style={{flex:1}}><Text style={styles.vehicleTitle}>{v.vehicle_name}</Text><Text>{v.vehicle_model ?? ""}{v.vehicle_discontinued ? " · Discontinued" : " · Active"}</Text></View>
      <Pressable style={styles.choice} onPress={() => edit(v)}><Text>Edit</Text></Pressable>
      <Pressable disabled={busy} style={styles.choice} onPress={() => changeStatus(v)}><Text>{v.vehicle_discontinued ? "Reactivate" : "Discontinue"}</Text></Pressable>
    </View>)}
  </ScrollView>;
}
const styles=StyleSheet.create({
 page:{padding:S.xl,backgroundColor:C.background,flexGrow:1},heading:{fontSize:19,fontWeight:"700",color:C.text,marginVertical:S.md},
 label:{fontWeight:"600",color:C.text,marginBottom:S.xs},input:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:R.md,padding:S.md,marginBottom:S.md},
 row:{flexDirection:"row",alignItems:"center",gap:S.md,marginBottom:S.md,flexWrap:"wrap"},action:{padding:S.md,backgroundColor:C.primary,borderRadius:R.md},
 actionText:{color:C.surface,fontWeight:"700"},choice:{padding:S.sm,borderColor:C.border,borderWidth:1,borderRadius:R.sm,backgroundColor:C.surface},
 chosen:{borderColor:C.primary,backgroundColor:C.successTint},vehicle:{flexDirection:"row",alignItems:"center",gap:S.md,padding:S.md,borderBottomWidth:1,borderBottomColor:C.border},
 vehicleTitle:{fontWeight:"700",color:C.text},error:{color:C.danger,margin:S.md},link:{alignSelf:"flex-start",padding:S.sm},linkText:{color:C.primary,fontWeight:"700"}
});
