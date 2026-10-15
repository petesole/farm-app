// First-stage weighbridge UI: read-only harvest eligibility preview.
// No writes or posting before production migration/RLS deployment.
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { supabase } from "../../../supabase";

type HarvestRow = {
  tracecode_id: number;
  tracecode_name: string | null;
  tracecode_size: number | null;
  start_date: string | null;
  end_date: string | null;
  season_id: number;
  crop_id: number | null;
  crop?: { crop_name: string | null } | null;
  season?: { season_name: string | null } | null;
};
type ControlRow = { season_id: number; crop_id: number; harvest_enabled: boolean };
type Eligible = HarvestRow & { cropName: string; seasonName: string };

function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function parseEnteredDate(text: string): string | null {
  const t = text.trim();
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(t);
  const ymd = m
    ? [Number(m[3] ?? new Date().getFullYear()), Number(m[2]), Number(m[1])]
    : /^(\d{4})-(\d{2})-(\d{2})$/.test(t)
      ? t.split("-").map(Number)
      : null;
  if (!ymd) return null;
  const [y, mo, day] = ymd;
  const d = new Date(y, mo - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function WeighbridgeHarvestPreview() {
  const [dateText, setDateText] = useState(() => {
    const [y, m, d] = todayLocal().split("-");
    return `${d}/${m}/${y}`;
  });
  const [rows, setRows] = useState<HarvestRow[]>([]);
  const [controls, setControls] = useState<ControlRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [slipNumber,setSlipNumber] = useState("");
  const [netKg,setNetKg] = useState("");
  const [destination,setDestination] = useState<"field_to_stock"|"field_to_customer">("field_to_stock");
  const [customer,setCustomer] = useState("");
  const [saving,setSaving] = useState(false);
  const selectedDate = parseEnteredDate(dateText);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [tr, control] = await Promise.all([
          supabase.from("tracecode")
            .select("tracecode_id,tracecode_name,tracecode_size,start_date,end_date,season_id,crop_id,crop:crop_id(crop_name),season:season_id(season_name)")
            .limit(10000),
          supabase.from("wb_harvest_control").select("season_id,crop_id,harvest_enabled"),
        ]);
        if (tr.error) throw new Error(tr.error.message);
        if (control.error) throw new Error(control.error.message);
        if (mounted) {
          setRows((tr.data ?? []) as unknown as HarvestRow[]);
          setControls((control.data ?? []) as ControlRow[]);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Unable to load harvest controls");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const options = useMemo((): Eligible[] => {
    if (!selectedDate) return [];
    const enabled = new Set(controls.filter(x => x.harvest_enabled).map(x => `${x.season_id}:${x.crop_id}`));
    return rows.filter(t =>
      t.crop_id != null &&
      enabled.has(`${t.season_id}:${t.crop_id}`) &&
      (!t.start_date || t.start_date.slice(0, 10) <= selectedDate) &&
      (!t.end_date || t.end_date.slice(0, 10) >= selectedDate)
    ).map(t => ({
      ...t,
      cropName: t.crop?.crop_name ?? "Unnamed crop",
      seasonName: t.season?.season_name ?? "Unnamed season",
    })).sort((a, b) => a.cropName.localeCompare(b.cropName) || (a.tracecode_name ?? "").localeCompare(b.tracecode_name ?? ""));
  }, [controls, rows, selectedDate]);

  const byCrop = useMemo(() => {
    const groups = new Map<string, Eligible[]>();
    for (const t of options) {
      const k = `${t.seasonName} — ${t.cropName}`;
      groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    return Array.from(groups.entries());
  }, [options]);

  const selectedTrace = options.find(t=>String(t.tracecode_id)===selectedKey);
  async function saveDraft(){
    const kg=Number(netKg.replace(/,/g,""));
    if(!selectedDate || !selectedTrace || !slipNumber.trim() || !Number.isFinite(kg) || kg<=0){
      Alert.alert("Incomplete", "Choose an eligible trace code and enter the slip number and positive net weight in kg.");return;
    }
    if(destination==="field_to_customer"&&!customer.trim()){
      Alert.alert("Missing customer", "Enter the customer for a direct delivery.");return;
    }
    setSaving(true);
    try{
      const {error}=await supabase.from("wb_farm_slip").insert({
        slip_number:slipNumber.trim(),weigh_date:selectedDate,
        crop_id:selectedTrace.crop_id,season_id:selectedTrace.season_id,
        movement_type:destination,status:"draft",net_kg:kg,
        ...(destination==="field_to_customer"?{customer_name:customer.trim()}:{})
      });
      if(error)throw error;
      Alert.alert("Draft saved","Slip saved as draft. It has NOT been confirmed or added to stock/harvest totals. Field allocations and scanning follow in the next stage.");
      setSlipNumber("");setNetKg("");setCustomer("");
    }catch(e:any){Alert.alert("Could not save",e?.message??"Unknown error");}
    finally{setSaving(false);}
  }
  return (
    <ThemedView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">Weighbridge — Harvest</ThemedText>
        <ThemedText style={styles.note}>Draft entry only: saving does not post harvested tonnes or stock.</ThemedText>
        <ThemedText style={styles.caption}>Weighbridge date (dd/mm/yyyy; e.g. 5/12 assumes current year)</ThemedText>
        <TextInput value={dateText} onChangeText={setDateText} placeholder="dd/mm/yyyy" style={styles.input} />
        {!selectedDate ? <ThemedText style={styles.warning}>Enter a valid date.</ThemedText> : null}
        {loading ? <ActivityIndicator /> : error ? (
          <ThemedText style={styles.warning}>Harvest configuration unavailable: {error}. The database migration and permissions must be installed before this screen can load.</ThemedText>
        ) : byCrop.length === 0 ? (
          <ThemedText>No eligible trace codes for this date. Check Harvesting Control and trace-code start/end dates.</ThemedText>
        ) : byCrop.map(([heading, values]) => (
          <View key={heading} style={styles.group}>
            <ThemedText type="subtitle">{heading}</ThemedText>
            {values.map(t => (
              <Pressable
                key={t.tracecode_id}
                onPress={() => setSelectedKey(String(t.tracecode_id))}
                style={[styles.row,selectedKey===String(t.tracecode_id)&&styles.selected]}
              >
                <ThemedText>{t.tracecode_name ?? `Trace #${t.tracecode_id}`}</ThemedText>
                <ThemedText style={styles.caption}>{t.tracecode_size ?? "—"} ha</ThemedText>
              </Pressable>
            ))}
          </View>
        ))}
        <View style={styles.group}>
          <ThemedText type="subtitle">New Farm WB draft</ThemedText>
          <ThemedText style={styles.caption}>Selected trace code: {selectedTrace?.tracecode_name??"Select a field above"}</ThemedText>
          <TextInput style={styles.input} placeholder="Farm WB slip number" value={slipNumber} onChangeText={setSlipNumber}/>
          <TextInput style={styles.input} placeholder="Net weight (kg)" keyboardType="decimal-pad" value={netKg} onChangeText={setNetKg}/>
          <View style={{flexDirection:"row",gap:8}}>
            <Pressable style={[styles.row,{flex:1},destination==="field_to_stock"&&styles.selected]} onPress={()=>setDestination("field_to_stock")}><ThemedText>Farm stock</ThemedText></Pressable>
            <Pressable style={[styles.row,{flex:1},destination==="field_to_customer"&&styles.selected]} onPress={()=>setDestination("field_to_customer")}><ThemedText>Customer</ThemedText></Pressable>
          </View>
          {destination==="field_to_customer"?<TextInput style={styles.input} placeholder="Customer name" value={customer} onChangeText={setCustomer}/>:null}
          <Pressable disabled={saving||!selectedTrace} onPress={saveDraft} style={[styles.selected,{padding:14,borderRadius:10,opacity:saving||!selectedTrace?0.5:1}]}>
            <ThemedText>{saving?"Saving…":"Save draft slip"}</ThemedText>
          </Pressable>
          <ThemedText style={styles.note}>Draft only. Allocations, scanned documents and confirmation are not yet available; do not treat drafts as dispatched or harvested weights.</ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  note: { opacity: 0.7, lineHeight: 19 },
  caption: { opacity: 0.72 },
  warning: { color: "#b45309" },
  input: { borderWidth: 1, borderColor: "#999", borderRadius: 10, padding: 12 },
  group: { gap: 8, padding: 12, borderWidth: 1, borderColor: "#aaa", borderRadius: 12 },
  row: { padding: 12, borderWidth: 1, borderColor: "#aaa", borderRadius: 9, flexDirection: "row", justifyContent: "space-between" },
  selected: { borderColor: "#2563eb", borderWidth: 2 },
});
