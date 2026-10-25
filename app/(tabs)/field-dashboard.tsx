import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { supabase } from "@/supabase";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type FieldReportRow = {
  season_name: string | null;
  crop_name: string | null;
  tracecode_id: number | null;
  tracecode_name: string | null;
  tracecode_size: number | null;
  irrigation_type: string | null;
  field_name: string | null;
  farm_name: string | null;
  dap: number | null;
  growdays: number | null;
  growweeks: number | null;
  plant_population: number | null;
  fuel_budget_name?: string | null;
  variety_name?: string | null;
  planned_planting_date?: string | null;
  actual_planting_date?: string | null;
  end_date?: string | null;
};

type AppRole = "ADMIN" | "MANAGER" | "IRRIGATOR" | "VIEWER" | "UNKNOWN";

function norm(s: string | null | undefined) {
  return (s ?? "").toString().trim().toLowerCase();
}

function mapStoredRole(storedRole: string | null): AppRole {
  const r = norm(storedRole);

  if (r === "admin") return "ADMIN";
  if (r === "manager") return "MANAGER";
  if (r === "irrigation") return "IRRIGATOR";
  if (r === "viewer") return "VIEWER";

  return "UNKNOWN";
}

function formatPlantPop(value: number | null) {
  if (value === null || value === undefined) return "";
  return Number(value).toLocaleString();
}

function formatSize(value: number | null) {
  if (value === null || value === undefined) return "";
  return Number(value).toFixed(1);
}

export default function FieldDashboard() {
  const [rows, setRows] = useState<FieldReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [sortColumn,setSortColumn]=useState<keyof FieldReportRow>("season_name");
  const [sortDirection,setSortDirection]=useState<"asc"|"desc">("asc");
  const [cropFilter,setCropFilter] = useState<string|null>(null);
  const [showCont, setShowCont] = useState(false);

  const [role, setRole] = useState<AppRole>("UNKNOWN");
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const canNew = isAdmin;
  const canEdit = isAdmin;
  const canViewTab = isAdmin;

  const loadRole = useCallback(async (): Promise<AppRole> => {
    const { data: identity, error: identityError } = await supabase.auth.getUser();
    if (identityError || !identity.user) {
      setRole("UNKNOWN");
      setRoleLoaded(true);
      return "UNKNOWN";
    }
    const { data: roles, error: roleError } = await supabase.rpc("my_farm_app_roles");
    const nextRole: AppRole = !roleError && Array.isArray(roles) &&
      roles.some((role: string) => norm(role) === "admin") ? "ADMIN" : "UNKNOWN";
    setRole(nextRole);
    setRoleLoaded(true);
    return nextRole;
  }, []);

  const fetchRowsForRole = useCallback(async (nextRole: AppRole) => {
    const allowed = nextRole === "ADMIN";

    if (!allowed) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("field_report_v2")
      .select(
        "season_name,crop_name,tracecode_id,tracecode_name,tracecode_size,irrigation_type,field_name,farm_name,dap,growdays,growweeks,plant_population"
      )
      .order("farm_name")
      .order("field_name")
      .order("tracecode_name");

    if (error) {
      console.log("field_report_v2 error:", error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    // Fuel budget belongs to the TraceCode, not the permanent field.
    // Fetch it separately so the existing field_report_v2 view needs no changes.
    const budgetRes=await supabase.from("tracecode")
      .select("tracecode_id,end_date,planned_planting_date,actual_planting_date,variety:variety_id(variety_name),fuel_budget:fuel_budget_id(fuel_budget_name)")
      .limit(10000);
    if(budgetRes.error){
      console.log("field fuel budget lookup error:",budgetRes.error.message);
    }
    const budgetNames=new Map<number,string|null>(
      (budgetRes.data??[]).map((r:any)=>[
        r.tracecode_id,
        (Array.isArray(r.fuel_budget)?r.fuel_budget[0]?.fuel_budget_name:r.fuel_budget?.fuel_budget_name)??null
      ])
    );
    const traceDetails=new Map<number,any>((budgetRes.data??[]).map((r:any)=>[Number(r.tracecode_id),r]));
    setRows(((data??[]) as FieldReportRow[]).map(r=>{
      const d=traceDetails.get(Number(r.tracecode_id));
      const variety=Array.isArray(d?.variety)?d.variety[0]:d?.variety;
      return {...r,
        fuel_budget_name:r.tracecode_id==null?null:budgetNames.get(r.tracecode_id)??null,
        variety_name:variety?.variety_name??null,
        planned_planting_date:d?.planned_planting_date??null,
        actual_planting_date:d?.actual_planting_date??null,
        end_date:d?.end_date??null
      };
    }));
    setLoading(false);
  }, []);

  const reloadAll = useCallback(async () => {
    const nextRole = await loadRole();
    await fetchRowsForRole(nextRole);
  }, [loadRole, fetchRowsForRole]);

  // Refresh whenever returning from Trace Edit; the tab screen stays mounted.
  useFocusEffect(
    useCallback(() => {
      void reloadAll();
    }, [reloadAll])
  );

  

  useEffect(() => {
    if (!roleLoaded) return;
    if (canViewTab) return;

    setRedirecting(true);

    const t = setTimeout(() => {
      router.push("/fuel");
    }, 0);

    return () => clearTimeout(t);
  }, [roleLoaded, canViewTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  }, [reloadAll]);

  const seasonRows = useMemo(()=>rows.filter(r=>!r.end_date && (showCont ? norm(r.season_name)==="cont" : norm(r.season_name)!=="cont")),[rows,showCont]);
  const activeCrops = useMemo(()=>[...new Set(seasonRows.map(r=>r.crop_name?.trim()).filter((x):x is string=>Boolean(x)))].sort((a,b)=>a.localeCompare(b)),[seasonRows]);

  const filtered = useMemo(() => {
    const q = norm(search);

    const byCrop=seasonRows.filter(r=>!cropFilter||norm(r.crop_name)===norm(cropFilter));
    if (!q) return byCrop;

    return byCrop.filter((r) => {
      const hay = [
        r.tracecode_name,
        r.crop_name,
        r.season_name,
        r.field_name,
        r.farm_name,
        r.irrigation_type,
        r.plant_population?.toString() ?? "",
        r.tracecode_id?.toString() ?? "",
      ]
        .map((x) => norm(x))
        .join(" ");

      return hay.includes(q);
    });
  }, [seasonRows,search,cropFilter]);

  const sortedRows=useMemo(()=>[...filtered].sort((a,b)=>{
    const av=a[sortColumn],bv=b[sortColumn];
    const result=av==null||av==="" ? (bv==null||bv===""?0:1) : bv==null||bv==="" ? -1 :
      typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:"base"});
    return (av==null||av==="")||(bv==null||bv==="")?result:(sortDirection==="asc"?result:-result);
  }),[filtered,sortColumn,sortDirection]);
  const displayDate=(value:string|null|undefined)=>value?value.slice(0,10).split("-").reverse().join("/"):"";
  const sortHeader=(label:string,key:keyof FieldReportRow,style:any)=>(
    <Pressable onPress={()=>{if(sortColumn===key)setSortDirection(d=>d==="asc"?"desc":"asc");else{setSortColumn(key);setSortDirection("asc");}}}
      style={[styles.cell,styles.headerText,style]}>
      <Text style={styles.headerText}>{label} {sortColumn===key?(sortDirection==="asc"?"▲":"▼"):"↕"}</Text>
    </Pressable>
  );

  const totalHa = useMemo(() => {
    return filtered.reduce((sum, r) => sum + (Number(r.tracecode_size) || 0), 0);
  }, [filtered]);

  const goToTracecodeEdit = (tracecodeId?: number | null) => {
    if (tracecodeId) {
      router.push({
        pathname: "/(tabs)/home/tracecode-edit",
        params: {
          tracecode_id: String(tracecodeId),
          ...(isAdmin ? { mode: "admin" } : {}),
        },
      });
    } else {
      router.push({
        pathname: "/(tabs)/home/tracecode-edit",
        params: {
          ...(isAdmin ? { mode: "admin" } : {}),
        },
      });
    }
  };



  if (!roleLoaded || redirecting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Checking access…</Text>
      </View>
    );
  }

  if (!canViewTab) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Access denied.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading field report…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <JsplModuleHeader title="Trace" subtitle="John Sole (Private) Limited · TraceCode Dashboard" showMain={isAdmin} />
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Field Dashboard</Text>
      </View>

      <View style={styles.topRow}>
        <View style={styles.toggleWrap}>
          <Pressable
            style={[styles.toggleBtn, !showCont && styles.toggleBtnActive]}
            onPress={() => setShowCont(false)}
          >
            <Text style={[styles.toggleText, !showCont && styles.toggleTextActive]}>
              CURRENT
            </Text>
          </Pressable>

          <Pressable
            style={[styles.toggleBtn, showCont && styles.toggleBtnActive]}
            onPress={() => setShowCont(true)}
          >
            <Text style={[styles.toggleText, showCont && styles.toggleTextActive]}>
              CONT
            </Text>
          </Pressable>
        </View>

        <View style={styles.actionsRight}>
          {isAdmin && (
            
          )}

          {canNew && (
            <Pressable style={styles.newBtn} onPress={() => goToTracecodeEdit(null)}>
              <Text style={styles.newBtnText}>NEW</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search tracecode id, tracecode, crop, season, field, farm, irrigation…"
          placeholderTextColor="#888"
          style={styles.search}
        />
        <Text style={styles.countText}>Total Ha: {totalHa.toFixed(1)}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cropStrip} contentContainerStyle={styles.cropStripContent}>
        <Pressable onPress={()=>setCropFilter(null)} style={[styles.cropChip,cropFilter===null&&styles.cropChipSelected]}>
          <Text style={[styles.cropChipText,cropFilter===null&&styles.cropChipTextSelected]}>All crops</Text>
        </Pressable>
        {activeCrops.map(crop=><Pressable key={crop} onPress={()=>setCropFilter(current=>norm(current)===norm(crop)?null:crop)} style={[styles.cropChip,norm(cropFilter)===norm(crop)&&styles.cropChipSelected]}>
          <Text style={[styles.cropChipText,norm(cropFilter)===norm(crop)&&styles.cropChipTextSelected]}>{crop}</Text>
        </Pressable>)}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScrollView horizontal>
          <View>
            <View style={[styles.row, styles.headerRow]}>
              {sortHeader("Season","season_name",styles.cSeason)}
              {sortHeader("Trace ID","tracecode_id",styles.cTraceId)}
              {sortHeader("TraceCode","tracecode_name",styles.cTrace)}
              {sortHeader("Size","tracecode_size",styles.cSize)}
              {sortHeader("Irr","irrigation_type",styles.cIrr)}
              {sortHeader("Farm","farm_name",styles.cFarm)}
              {sortHeader("Crop","crop_name",styles.cCrop)}
              {sortHeader("Variety","variety_name",styles.cVariety)}
              {sortHeader("PPD","planned_planting_date",styles.cDate)}
              {sortHeader("APD","actual_planting_date",styles.cDate)}
              {sortHeader("DAP","dap",styles.cDap)}
              {sortHeader("Grow","growdays",styles.cGrow)}
              {sortHeader("Plant Pop","plant_population",styles.cPlantPop)}
              <Text style={[styles.cell,styles.headerText,styles.cEdit]}>Edit</Text>
            </View>
            {sortedRows.map((r,idx)=>(
              <View key={r.tracecode_id??idx} style={[styles.row,idx%2===1&&styles.rowAlt]}>
                <Text style={[styles.cell,styles.cSeason]}>{r.season_name??""}</Text>
                <Text style={[styles.cell,styles.cTraceId]}>{r.tracecode_id??""}</Text>
                <Text style={[styles.cell,styles.cTrace]}>{r.tracecode_name??""}</Text>
                <Text style={[styles.cell,styles.cSize]}>{formatSize(r.tracecode_size)}</Text>
                <Text style={[styles.cell,styles.cIrr]}>{r.irrigation_type??""}</Text>
                <Text style={[styles.cell,styles.cFarm]}>{r.farm_name??""}</Text>
                <Text style={[styles.cell,styles.cCrop]}>{r.crop_name??""}</Text>
                <Text style={[styles.cell,styles.cVariety]}>{r.variety_name??""}</Text>
                <Text style={[styles.cell,styles.cDate]}>{displayDate(r.planned_planting_date)}</Text>
                <Text style={[styles.cell,styles.cDate]}>{displayDate(r.actual_planting_date)}</Text>
                <Text style={[styles.cell,styles.cDap]}>{r.dap??""}</Text>
                <Text style={[styles.cell,styles.cGrow]}>{r.growdays!=null && r.growweeks!=null?`${r.growdays}d / ${r.growweeks.toFixed(1)}w`:""}</Text>
                <Text style={[styles.cell,styles.cPlantPop]}>{formatPlantPop(r.plant_population)}</Text>
                <View style={[styles.cell,styles.cEdit]}>{canEdit&&<Pressable style={styles.editBtn} onPress={()=>goToTracecodeEdit(r.tracecode_id)}><Text style={styles.editBtnText}>Edit</Text></Pressable>}</View>
              </View>
            ))}

            {filtered.length === 0 && (
              <View style={styles.empty}>
                <Text>No rows match your filter/search.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: "#f5f6f8" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#444" },

  headingRow: { marginBottom: 6 },
  heading: { fontSize: 18, fontWeight: "800", color: "#111" },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  actionsRight: { flexDirection: "row", gap: 8 },

  controlBtn: {
    width: 64,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#2d2d2d",
    alignItems: "center",
  },
  controlBtnText: { color: "#fff", fontWeight: "800" },

  newBtn: {
    width: 64,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#111",
    alignItems: "center",
  },
  newBtnText: { color: "#fff", fontWeight: "800" },

  toggleWrap: {
    flexDirection: "row",
    backgroundColor: "#e7e8ec",
    borderRadius: 12,
    padding: 4,
  },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  toggleBtnActive: { backgroundColor: "#fff" },
  toggleText: { color: "#555", fontWeight: "700" },
  toggleTextActive: { color: "#111" },

  searchWrap: { marginBottom: 10 },
  search: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 6,
  },
  countText: { color: "#444", fontWeight: "700" },
  cropStrip: {flexGrow:0,marginBottom:10},
  cropStripContent: {alignItems:"center",gap:8,paddingRight:12},
  cropChip: {backgroundColor:"#fff",borderColor:"#d1d5db",borderWidth:1,borderRadius:20,paddingVertical:8,paddingHorizontal:14},
  cropChipSelected: {backgroundColor:"#111",borderColor:"#111"},
  cropChipText: {fontWeight:"700",color:"#333"},
  cropChipTextSelected: {color:"#fff"},

  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 42,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  rowAlt: { backgroundColor: "#fafafa" },
  headerRow: {
    backgroundColor: "#eef1f4",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },

  cell: {
    paddingHorizontal: 5,
    paddingVertical: 8,
    color: "#111",
  },
  headerText: {
    fontWeight: "800",
    color: "#111",
  },

  cSeason: { width: 95 },
  cVariety: { width: 110 },
  cDate: { width: 105 },
  cCrop: { width: 94 },
  cFuelBudget: { width: 170 },
  cTraceId: { width: 65 },
  cTrace: { width: 95 },
  cSize: { width: 55 },
  cPlantPop: { width: 80 },
  cIrr: { width: 80 },
  cField: { width: 82 },
  cFarm: { width: 88 },
  cDap: { width: 52 },
  cGrow: { width: 88 },
  cEdit: { width: 65 },

  editBtn: {
    backgroundColor: "#111",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  editBtnText: {
    color: "#fff",
    fontWeight: "700",
  },

  empty: {
    padding: 16,
    alignItems: "center",
    backgroundColor: "#fff",
  },
});