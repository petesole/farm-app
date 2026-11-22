import { supabase } from "@/supabase";
import { verifiedIrrigationRoles } from "@/utils/irrigation-access";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { jsplColors as C } from "@/constants/jspl-design";
import { displayJsplDate } from "@/utils/jspl-input";
import { Picker } from "@react-native-picker/picker";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, View, useWindowDimensions,
} from "react-native";

type Field = {
  tracecode_id: number;
  tracecode_name: string;
  crop_id: number;
  crop: { crop_name: string } | { crop_name: string }[] | null;
};
type Cached = {
  tracecode_id: number;
  last_irrigation_date: string | null;
  daily_req: number | null;
  acc_req: number | null;
  net_mm: number | null;
  next_app: string | null;
  next_app_mm: number | null;
};
type Applied = { tracecode_id: number; applied_date: string; mm_applied: number; irrigation_applied_id: number };
type Row = {
  tracecode_id: number; trace: string; crop: string; crop_id: number;
  lastDate: string | null; lastMm: number | null;
  daily: number | null; accumulated: number | null; net: number | null;
  nextDate: string | null; nextMm: number | null;
};
const fmt = (v: number | null) => v == null ? "—" : Number(v).toFixed(1);
const date = (v: string | null) => v ? displayJsplDate(v) : "—";
const columns = [
  { key: "crop", title: "Crop", width: 140 },
  { key: "trace", title: "Trace Code", width: 190 },
  { key: "lastDate", title: "Last Irrigation", width: 130 },
  { key: "lastMm", title: "Last mm", width: 90 },
  { key: "daily", title: "Daily mm", width: 90 },
  { key: "accumulated", title: "Accumulated", width: 115 },
  { key: "net", title: "Net mm", width: 90 },
  { key: "nextDate", title: "Next Date", width: 110 },
  { key: "nextMm", title: "Next mm", width: 90 },
  { key: "open", title: "Action", width: 110 },
] as const;

export default function IrrigationMainDashboard() {
  const { width } = useWindowDimensions();
  const isPhone = width < 700;
  const [rows, setRows] = useState<Row[]>([]);
  const [cropId, setCropId] = useState("all");
  const [traceId, setTraceId] = useState("all");
  const [roles, setRoles] = useState<string[]>([]);
  const isAdmin = roles.includes("admin");
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadRoles = useCallback(async () => setRoles(await verifiedIrrigationRoles(supabase)), []);
  useEffect(() => { void loadRoles(); }, [loadRoles]);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      // This is the sole field inclusion rule: crop assigned and end_date IS NULL.
      // Do not filter by a planting/start date, irrigation type, or dashboard cache membership.
      const { data: fields, error: fieldsError } = await supabase
        .from("tracecode")
        .select("tracecode_id,tracecode_name,crop_id,crop:crop_id(crop_name)")
        .not("crop_id", "is", null)
        .is("end_date", null)
        .order("tracecode_name", { ascending: true })
        .limit(2000);
      if (fieldsError) throw fieldsError;
      const f = (fields ?? []) as Field[];

      // Metrics are optional. Missing cache rows never hide an eligible field.
      const [cacheResult, appliedResult] = await Promise.all([
        supabase.from("irrigation_dashboard_cache")
          .select("tracecode_id,last_irrigation_date,daily_req,acc_req,net_mm,next_app,next_app_mm")
          .limit(2000),
        supabase.from("irrigation_applied")
          .select("tracecode_id,applied_date,mm_applied,irrigation_applied_id")
          .order("applied_date", { ascending: false })
          .order("irrigation_applied_id", { ascending: false })
          .limit(5000),
      ]);
      if (appliedResult.error) throw appliedResult.error;
      const metrics = new Map<number, Cached>();
      if (!cacheResult.error) for (const c of (cacheResult.data ?? []) as Cached[]) {
        metrics.set(Number(c.tracecode_id), c);
      }
      const latest = new Map<number, Applied>();
      for (const a of (appliedResult.data ?? []) as Applied[]) {
        if (!latest.has(Number(a.tracecode_id))) latest.set(Number(a.tracecode_id), a);
      }
      setRows(f.map(t => {
        const c = metrics.get(Number(t.tracecode_id));
        const a = latest.get(Number(t.tracecode_id));
        const crop = Array.isArray(t.crop) ? t.crop[0]?.crop_name : t.crop?.crop_name;
        return {
          tracecode_id: Number(t.tracecode_id), trace: t.tracecode_name,
          crop: crop ?? "Unspecified crop", crop_id: Number(t.crop_id),
          lastDate: a?.applied_date ?? c?.last_irrigation_date ?? null,
          lastMm: a?.mm_applied == null ? null : Number(a.mm_applied),
          daily: c?.daily_req == null ? null : Number(c.daily_req),
          accumulated: c?.acc_req == null ? null : Number(c.acc_req),
          net: c?.net_mm == null ? null : Number(c.net_mm),
          nextDate: c?.next_app ?? null,
          nextMm: c?.next_app_mm == null ? null : Number(c.next_app_mm),
        };
      }));
    } catch (e: any) {
      setError(e?.message ?? "Unable to load current fields.");
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const crops = useMemo(() => {
    const list = new Map<number, string>();
    for (const r of rows) list.set(r.crop_id, r.crop);
    return [...list.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const traces = useMemo(() => rows
    .filter(r => cropId === "all" || String(r.crop_id) === cropId)
    .sort((a, b) => a.trace.localeCompare(b.trace)), [rows, cropId]);
  const selectedTrace = traces.some(r => String(r.tracecode_id) === traceId) ? traceId : "all";
  const visible = useMemo(() => traces.filter(r => selectedTrace === "all" || String(r.tracecode_id) === selectedTrace), [traces, selectedTrace]);
  const open = (id: number) => router.push({ pathname: "/(tabs)/home/irrigation/irrigation_actual", params: { tracecode_id: String(id) } });

  const filters = (
    <View style={styles.filters}>
      <View style={styles.filter}>
        <Text style={styles.label}>Crop</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={cropId} onValueChange={v => { setCropId(String(v)); setTraceId("all"); }} style={styles.picker}>
            <Picker.Item label="All crops" value="all" />
            {crops.map(([id, name]) => <Picker.Item key={id} label={name} value={String(id)} />)}
          </Picker>
        </View>
      </View>
      <View style={styles.filter}>
        <Text style={styles.label}>Trace Code</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={selectedTrace} onValueChange={v => setTraceId(String(v))} style={styles.picker}>
            <Picker.Item label="All trace codes" value="all" />
            {traces.map(t => <Picker.Item key={t.tracecode_id} label={t.trace} value={String(t.tracecode_id)} />)}
          </Picker>
        </View>
      </View>
    </View>
  );

  const record = ({ item: r }: { item: Row }) => (
    <View style={styles.card}>
      <Text style={styles.trace}>{r.trace}</Text>
      <Text style={styles.crop}>{r.crop}</Text>
      <View style={styles.metrics}>
        <Detail label="Last irrigation" value={date(r.lastDate)} />
        <Detail label="Last applied" value={fmt(r.lastMm) + " mm"} />
        <Detail label="Daily" value={fmt(r.daily)} />
        <Detail label="Accumulated" value={fmt(r.accumulated)} />
        <Detail label="Net" value={fmt(r.net)} />
        <Detail label="Next" value={date(r.nextDate)} />
      </View>
      <Pressable style={styles.open} onPress={() => open(r.tracecode_id)}>
        <Text style={styles.openText}>Open</Text>
      </Pressable>
    </View>
  );
  const value = (r: Row, key: string) => {
    if (key === "crop") return r.crop;
    if (key === "trace") return r.trace;
    if (key === "lastDate") return date(r.lastDate);
    if (key === "nextDate") return date(r.nextDate);
    if (key === "lastMm") return fmt(r.lastMm);
    if (key === "daily") return fmt(r.daily);
    if (key === "accumulated") return fmt(r.accumulated);
    if (key === "net") return fmt(r.net);
    if (key === "nextMm") return fmt(r.nextMm);
    return "";
  };

  return <View style={styles.screen}>
    <JsplModuleHeader title="Irrigation" backLabel={isAdmin ? "Back to Main" : undefined} backHref="/(tabs)/main-dashboard" />
    <View style={styles.actions}>
      <Text style={styles.count}>{visible.length} of {rows.length} current crop fields</Text>
      <Pressable style={styles.panButton} onPress={() => router.push("/(tabs)/home/irrigation/pan-readings")}>
        <Text style={styles.panButtonText}>View Pan Readings</Text>
      </Pressable>
    </View>
    {filters}
    {busy ? <ActivityIndicator style={{marginTop:24}} size="large"/> :
     error ? <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable onPress={refresh}><Text>Retry</Text></Pressable></View> :
     isPhone ? <FlatList data={visible} keyExtractor={r => String(r.tracecode_id)} renderItem={record}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}
        ListEmptyComponent={<Text style={styles.empty}>No matching trace codes.</Text>}
        contentContainerStyle={{paddingBottom:40}}/> :
     <View style={{flex:1}}>
       <View style={styles.tableScroll}><FlatList horizontal data={[1]} renderItem={() =>
         <View><View style={styles.tableHead}>{columns.map(c=><Text key={c.key} style={[styles.headCell,{width:c.width}]}>{c.title}</Text>)}</View>
          <FlatList data={visible} keyExtractor={r=>String(r.tracecode_id)} renderItem={({item:r})=>
            <View style={styles.tableRow}>{columns.map(c => c.key==="open" ?
              <Pressable key={c.key} style={[styles.tableCell,{width:c.width}]} onPress={()=>open(r.tracecode_id)}><Text style={styles.openLink}>Open</Text></Pressable>
              : <Text key={c.key} style={[styles.tableCell,{width:c.width}]}>{value(r,c.key)}</Text>)}</View>}
            ListEmptyComponent={<Text style={styles.empty}>No matching trace codes.</Text>}
          /></View>} keyExtractor={() => "table"} /></View>
     </View>}
  </View>;
}
function Detail({label,value}:{label:string;value:string}){
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:C.background,padding:12},
  actions:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginTop:12},
  count:{color:C.textSecondary,fontWeight:"700"},
  panButton:{backgroundColor:C.primaryDark,paddingVertical:12,paddingHorizontal:16,borderRadius:8},
  panButtonText:{color:"#fff",fontWeight:"800"},
  filters:{flexDirection:"row",flexWrap:"wrap",gap:12,marginVertical:12},
  filter:{minWidth:180,flex:1},
  label:{fontWeight:"700",color:C.text,marginBottom:5},
  pickerWrap:{borderWidth:1,borderColor:C.border,borderRadius:8,backgroundColor:"#fff",overflow:"hidden"},
  picker:{color:C.text,height:50},
  card:{padding:14,marginBottom:10,borderWidth:1,borderColor:C.border,borderRadius:12,backgroundColor:"#fff"},
  trace:{fontWeight:"900",fontSize:17,color:C.primaryDark},
  crop:{color:C.textSecondary,marginTop:3},
  metrics:{flexDirection:"row",flexWrap:"wrap",marginTop:10,gap:7},
  detail:{width:"31%",minWidth:85,backgroundColor:C.background,borderRadius:7,padding:7},
  detailLabel:{fontSize:11,color:C.textSecondary},
  detailValue:{fontWeight:"700",color:C.text,marginTop:4},
  open:{alignSelf:"flex-start",marginTop:12,paddingVertical:10,paddingHorizontal:22,borderRadius:8,backgroundColor:C.primaryDark},
  openText:{color:"#fff",fontWeight:"800"},
  tableScroll:{flex:1,marginTop:5},
  tableHead:{flexDirection:"row",backgroundColor:"#eaf0ec"},
  headCell:{padding:10,fontWeight:"800",color:C.text,borderBottomWidth:1,borderColor:C.border},
  tableRow:{flexDirection:"row",borderBottomWidth:1,borderColor:C.border,backgroundColor:"#fff"},
  tableCell:{padding:10,color:C.text},
  openLink:{fontWeight:"800",color:C.primaryDark},
  center:{alignItems:"center",padding:24},
  error:{color:"#b00020"},
  empty:{padding:18,color:C.textSecondary},
});
