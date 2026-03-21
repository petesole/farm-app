// app/irrigation/tracecode/[id].tsx
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { supabase } from "../../../supabase";

type DayRow = {
  tracecode_id: number;
  dte: string; // date
  req_mm_day: number;
  irrig_effective_mm: number;
  rainfall_mm: number;
  net_mm_day: number;
  running_depletion_mm: number;
};

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function TracecodeIrrigationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tracecodeId = Number(id);

  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const start = new Date();
    start.setDate(start.getDate() - 10);

    const end = new Date();
    end.setDate(end.getDate() + 10);

    const { data, error } = await supabase.rpc("get_tracecode_water_balance_daily_mm", {
      p_start: toISODate(start),
      p_end: toISODate(end),
    });

    if (error) {
      console.log("Detail error:", error.message);
      setRows([]);
    } else {
      // filter in app (simplest)
      const filtered = (data ?? []).filter((r: any) => r.tracecode_id === tracecodeId);
      setRows(filtered as DayRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!Number.isFinite(tracecodeId)) return;
    load();
  }, [tracecodeId]);

  if (loading) return <ActivityIndicator style={{ marginTop: 30 }} />;

  const todayISO = toISODate(new Date());
  const todayRow = rows.find((r) => r.dte === todayISO);

  return (
    <ScrollView style={{ flex: 1, padding: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 10 }}>
        Tracecode {tracecodeId}
      </Text>

      {todayRow && (
        <View style={{ padding: 12, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, marginBottom: 12 }}>
          <Text style={{ fontWeight: "700" }}>Today</Text>
          <Text>Req: {todayRow.req_mm_day?.toFixed(1)} mm</Text>
          <Text>Irr: {todayRow.irrig_effective_mm?.toFixed(1)} mm</Text>
          <Text>Rain: {todayRow.rainfall_mm?.toFixed(1)} mm</Text>
          <Text style={{ fontWeight: "700" }}>
            Running deficit: {todayRow.running_depletion_mm?.toFixed(1)} mm
          </Text>
        </View>
      )}

      {rows.map((r) => (
        <View key={r.dte} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" }}>
          <Text style={{ fontWeight: r.dte === todayISO ? "700" : "400" }}>
            {r.dte}  | Req {r.req_mm_day?.toFixed(1)} | Irr {r.irrig_effective_mm?.toFixed(1)} | Rain {r.rainfall_mm?.toFixed(1)} | Run {r.running_depletion_mm?.toFixed(1)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}