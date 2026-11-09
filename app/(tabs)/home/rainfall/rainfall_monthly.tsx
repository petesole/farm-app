import { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { JsplSearchCombo } from "@/components/jspl/JsplSearchCombo";
import { jsplColors as C, jsplSpacing as S, jsplRadii as R } from "@/constants/jspl-design";
import { labourExportXLSX } from "@/lib/labour-xlsx-export";
import { displayJsplDate, parseJsplDateInput } from "@/utils/jspl-input";
import { supabase } from "@/supabase";

type Reading = { rainfall_id: number; rainfall_date: string; rain_gauge_id: number; rainfall_received: number | null };
const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
const palette = ["#15694d", "#3166a8", "#a85b16", "#774c97", "#087f88", "#a44465"];
const format = (n: number | null) => n === null ? "—" : n.toLocaleString("en", { maximumFractionDigits: 1 });
const seasonName = (year: number) => `${year}/${String(year + 1).slice(-2)}`;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]!);

export function RainfallReport({ dashboard = false }: { dashboard?: boolean }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [gauges, setGauges] = useState<{id:string;label:string;active:boolean|null;from:string|null;to:string|null}[]>([]);
  const [checkDate, setCheckDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate()-1);
    return [yesterday.getDate(),yesterday.getMonth()+1].map(value => String(value).padStart(2,"0")).join("/")+"/"+yesterday.getFullYear();
  });
  const [gauge, setGauge] = useState("average");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    if (dashboard) {
      setIsAdmin(false);
      void supabase.rpc("my_farm_app_roles").then(({data,error}) => {
        if (active && !error) setIsAdmin((data ?? []).includes("admin"));
      });
    }
    setError("");
    void (async () => {
      try {
        const names = await supabase.from("rain_gauge").select("rain_gauge_id,rain_gauge,active,active_from,active_to").order("rain_gauge");
        if (names.error) throw names.error;
        const all: Reading[] = [];
        for (let offset = 0; active; offset += 500) {
          const result = await supabase.from("rainfall").select("rainfall_id,rainfall_date,rain_gauge_id,rainfall_received")
            .order("rainfall_id").range(offset, offset + 499);
          if (result.error) throw result.error;
          all.push(...(result.data ?? []));
          if ((result.data?.length ?? 0) < 500) break;
        }
        if (active) {
          setGauges((names.data ?? []).map(row => ({ id:String(row.rain_gauge_id), active:row.active,from:row.active_from,to:row.active_to,label:row.rain_gauge ?? `Gauge ${row.rain_gauge_id}` })));
          setReadings(all);
        }
      } catch (e) {
        if (active) setError((e as {message?: string})?.message ?? "Unable to load rainfall.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [dashboard]));

  const seasons = useMemo(() => {
    const byDay = new Map<string, { sum:number; count:number }>();
    for (const row of readings) {
      if (row.rainfall_received == null || (gauge !== "average" && gauge !== String(row.rain_gauge_id))) continue;
      const day = byDay.get(row.rainfall_date) ?? { sum:0, count:0 };
      day.sum += Number(row.rainfall_received);
      day.count++;
      byDay.set(row.rainfall_date, day);
    }
    const bySeason = new Map<number, (number | null)[]>();
    const now = new Date();
    const currentSeason = now.getFullYear() - (now.getMonth() < 8 ? 1 : 0);
    for (const year of [currentSeason - 1, currentSeason]) {
      bySeason.set(year, Array<number | null>(12).fill(null));
    }
    for (const [date, day] of byDay) {
      const year = Number(date.slice(0,4));
      const month = Number(date.slice(5,7));
      const season = month >= 9 ? year : year - 1;
      if (dashboard && !bySeason.has(season)) continue;
      const index = (month + 3) % 12;
      const values = bySeason.get(season) ?? Array<number | null>(12).fill(null);
      values[index] = (values[index] ?? 0) + day.sum / day.count;
      bySeason.set(season, values);
    }
    return [...bySeason].sort(([a],[b]) => a-b).map(([year, values], index) => ({
      year, values, color:palette[index % palette.length],
      total:values.reduce<number>((sum,n) => sum + (n ?? 0), 0),
    }));
  }, [dashboard, gauge, readings]);

  const selectedDate = parseJsplDateInput(checkDate);
  const required = selectedDate ? gauges.filter(item =>
    (!item.from || item.from <= selectedDate) && (item.to ? selectedDate <= item.to : item.active !== false)
  ) : [];
  const dailyReadings = new Map(readings.filter(row => row.rainfall_date === selectedDate && row.rainfall_received != null)
    .map(row => [String(row.rain_gauge_id), Number(row.rainfall_received)]));
  const missing = required.filter(item => !dailyReadings.has(item.id));

  const gaugeLabel = gauge === "average" ? "Average" : gauges.find(item => item.id === gauge)?.label ?? "Gauge";
  const title = `Monthly Rainfall - ${gaugeLabel}`;
  const peak = Math.max(0, ...seasons.flatMap(season => season.values.map(n => n ?? 0)));
  const step = Math.max(25, Math.ceil(peak / 100) * 25);
  const ceiling = step * 4;
  const width = Math.max(80, seasons.length * 40 + 12);
  const hasReadings = seasons.some(season => season.values.some(value => value !== null));
  const columns = [{label:"Month",field:"month"}, ...seasons.map(s => ({label:seasonName(s.year),field:String(s.year)}))];
  const rows = [
    {month:"Season total (mm)", ...Object.fromEntries(seasons.map(s => [s.year, s.values.some(value => value !== null) ? s.total : null]))},
    ...months.map((month,i) => ({month,...Object.fromEntries(seasons.map(s => [s.year,s.values[i]]))})),
  ] as Record<string, string | number | null>[];

  function output(kind: "print" | "excel") {
    setError("");
    try {
      if (kind === "excel") {
        labourExportXLSX(title, columns, rows);
        return;
      }
      if (typeof window === "undefined") throw Error("Print is available in a desktop browser.");
      const popup = window.open("", "_blank");
      if (!popup) throw Error("Allow pop-ups to open print preview.");
      const bars = months.map((month,i) => `<div class="month"><div class="bars">${seasons.map(s => {
        const n = s.values[i];
        return `<span title="${seasonName(s.year)}: ${format(n)} mm" style="background:${n == null ? "transparent" : s.color};height:${n == null ? 0 : Math.max(1,n/ceiling*100)}%"></span>`;
      }).join("")}</div><div class="years">${seasons.map(s => `<span style="color:${s.color}">${s.year}</span>`).join("")}</div>${month}</div>`).join("");
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>
        body{font:13px Arial,sans-serif;color:#163b2c}table{width:100%;border-collapse:collapse}th,td{padding:4px 7px;border:1px solid #cbd9d2;text-align:right}th:first-child,td:first-child{text-align:left}tr:first-child{font-weight:bold}
        .chart{display:flex;gap:5px;margin:12px 0}.month{flex:1;text-align:center}.bars{height:120px;display:flex;align-items:end;gap:2px;border-bottom:1px solid #888}.bars span,.years span{flex:1}.years{display:flex;gap:2px;font-size:8px;font-weight:bold}
        @page{size:A4 landscape;margin:10mm}@media print{button{display:none}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
        </style></head><body><h1>${escape(title)} (mm)</h1><button onclick="window.print()">Print</button> <button onclick="window.close()">Close</button>
        <p>${seasons.map(s => `<strong style="color:${s.color}">${seasonName(s.year)}: ${s.values.some(value => value !== null) ? format(s.total)+" mm" : "No readings"}</strong>`).join(" · ")}</p><div class="chart">${bars}</div>
        <table><thead><tr>${columns.map(col => `<th>${escape(col.label)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(col => `<td>${col.field === "month" ? escape(String(row[col.field])) : format(row[col.field] as number | null)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
      popup.document.close();
      popup.focus();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return <ScrollView contentContainerStyle={styles.page}>
    <JsplModuleHeader title={dashboard ? "Rainfall" : "Monthly Rainfall"} backLabel={dashboard ? (isAdmin ? "Back to Main" : undefined) : "Back to Rainfall"} backHref={dashboard ? "/(tabs)/main-dashboard" : "/home/rainfall/rainfall_index"}/>
    {dashboard && <View style={styles.actions}>
      <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push({pathname:"/home/rainfall/rainfall_record",params:{mode:"add"}})}><Text style={styles.actionText}>Add New Rainfall</Text></Pressable>
      {isAdmin && <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push({pathname:"/home/rainfall/rainfall_record",params:{mode:"edit"}})}><Text style={styles.actionText}>Edit Saved Rainfall</Text></Pressable>}
    </View>}
    {dashboard && <View style={styles.reportCard}>
      <Text style={styles.heading}>Gauge Status by Date</Text>
      <Text style={{color:C.textSecondary}}>Reading date (dd/mm/yyyy)</Text>
      <TextInput accessibilityLabel="Gauge status date" value={checkDate} onChangeText={setCheckDate}
        onBlur={() => { if (selectedDate) setCheckDate(displayJsplDate(selectedDate)); }}
        keyboardType="numbers-and-punctuation" style={styles.dateInput}/>
      {loading ? <Text>Checking readings…</Text> : !selectedDate ? <Text>Enter a valid reading date.</Text> : !required.length ? <Text>No gauges required for this date.</Text> : <>
        <Text style={{fontWeight:"700",color:C.primaryDark}}>{required.length-missing.length} of {required.length} gauges recorded · {missing.length} missing</Text>
        {required.map(item => <View key={item.id} style={styles.gaugeStatus}>
          <Text style={{flex:1}}>{item.label}</Text>
          <Text style={{fontWeight:"700",color:dailyReadings.has(item.id)?C.primaryDark:C.danger}}>{dailyReadings.has(item.id) ? format(dailyReadings.get(item.id)!)+" mm" : "Not recorded"}</Text>
        </View>)}
      </>}
    </View>}
    {dashboard && <Text style={styles.heading}>Monthly Comparison · Last Season and This Season</Text>}
    <JsplSearchCombo label="Gauge" selector="product" options={[{id:"average",label:"Average"},...gauges.map(({id,label}) => ({id,label}))]} value={gauge} onChange={value => setGauge(String(value ?? "average"))}/>
    <Text style={{color:C.textSecondary}}>Average adds each day’s mean across recorded gauges. A dash means no reading.</Text>
    {loading && <Text>Loading rainfall…</Text>}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {!loading && !hasReadings && <Text>No rainfall readings for this selection.</Text>}
    {!loading && hasReadings && <>
      <View style={styles.totals}>
        {seasons.map(s => <Text key={s.year} style={[styles.total,{borderLeftColor:s.color}]}>{seasonName(s.year)} total: {format(s.total)} mm</Text>)}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => output("print")}><Text style={styles.actionText}>Print</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => output("excel")}><Text style={styles.actionText}>Export to Excel</Text></Pressable>
      </View>
      <ScrollView horizontal>
        <View style={styles.reportCard}>
          <Text style={{fontWeight:"700"}}>Rainfall (mm)</Text>
          <View style={{flexDirection:"row"}}>
            <View style={{width:46,height:185,justifyContent:"space-between"}}>{[4,3,2,1,0].map(n => <Text key={n}>{n*step}</Text>)}</View>
            {months.map((month,i) => <View key={month} style={{width,alignItems:"center"}}>
              <View style={{height:180,flexDirection:"row",alignItems:"flex-end",gap:3,borderBottomWidth:1,borderColor:C.border}}>
                {seasons.map(s => {
                  const n=s.values[i];
                  return <View key={s.year} accessible accessibilityLabel={`${month} ${seasonName(s.year)}: ${n == null ? "no reading" : format(n)+" mm"}`} style={{width:35,height:n == null ? 1 : Math.max(2,n/ceiling*180),backgroundColor:n == null ? "transparent" : s.color}}/>;
                })}
              </View>
              <View style={{flexDirection:"row",gap:3}}>
                {seasons.map(s => <Text key={s.year} style={{width:35,textAlign:"center",fontSize:11,fontWeight:"700",color:s.color}}>{s.year}</Text>)}
              </View>
              <Text style={{fontWeight:"700",marginTop:5}}>{month}</Text>
            </View>)}
          </View>
          <View style={{marginTop:14}}>
            {[{month:"Month",...Object.fromEntries(seasons.map(s => [s.year,seasonName(s.year)]))},...rows].map((row,i) => <View key={i} style={{flexDirection:"row",borderBottomWidth:1,borderColor:C.border,paddingVertical:6,backgroundColor:i===0?C.successTint:C.surface}}>
              {columns.map(col => {
                const cell=(row as Record<string,string|number|null>)[col.field];
                return <Text key={col.field} style={{width:col.field==="month"?130:90,fontWeight:i<2?"700":"400"}}>{typeof cell==="string"?cell:format(cell)}</Text>;
              })}
            </View>)}
          </View>
        </View>
      </ScrollView>
    </>}
  </ScrollView>;
}

export default function RainfallMonthlyReport() { return <RainfallReport />; }

const styles = StyleSheet.create({
  dateInput: {maxWidth:180,borderWidth:1,borderColor:C.border,borderRadius:R.sm,padding:S.sm,marginVertical:S.sm,color:C.text},
  gaugeStatus: {flexDirection:"row",gap:S.sm,paddingVertical:S.xs,borderBottomWidth:1,borderColor:C.border},
  heading: {color:C.primaryDark,fontSize:20,fontWeight:"800"},
  page: {padding:S.lg,gap:S.md,backgroundColor:C.background,flexGrow:1},
  totals: {flexDirection:"row",flexWrap:"wrap",gap:S.sm},
  total: {fontWeight:"800",color:C.primaryDark,backgroundColor:C.surface,borderLeftWidth:4,borderRadius:R.sm,padding:S.md},
  actions: {flexDirection:"row",flexWrap:"wrap",gap:S.sm},
  action: {backgroundColor:C.primaryDark,paddingHorizontal:S.md,paddingVertical:S.sm,borderRadius:R.sm},
  actionText: {color:C.surface,fontWeight:"700"},
  reportCard: {padding:S.md,backgroundColor:C.surface,borderColor:C.border,borderWidth:1,borderRadius:R.lg},
});
