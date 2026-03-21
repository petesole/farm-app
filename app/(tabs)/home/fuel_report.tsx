// app/(tabs)/fuel-report.tsx
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { supabase } from "../../../supabase";

/** Helpers */
function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthKeyFromDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}`;
}

function monthRangeFromKey(monthKey: string) {
  const [y, m] = monthKey.split("/").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // last day of month
  return { startISO: toISODate(start), endISO: toISODate(end) };
}

function formatNum(v: number | null | undefined, decimals = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return Number(v).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDateShort(iso: string) {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`; // DD/MM
}

type FuelDailyRow = {
  report_date: string; // YYYY-MM-DD
  yesterday_closing: number | null;
  opening: number | null;
  supplied: number | null;
  issued: number | null;
  closing: number | null;
  on_loss: number | null;
  diff: number | null;
  total_diff: number | null;
};

export default function FuelReportScreen() {
  const [monthKey, setMonthKey] = useState<string>(() =>
    monthKeyFromDate(new Date())
  );
  const [rows, setRows] = useState<FuelDailyRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const { startISO, endISO } = useMemo(
    () => monthRangeFromKey(monthKey),
    [monthKey]
  );

  // Column widths: keep these aligned for BOTH header + rows
  const COL = {
    date: 0.55,
    yest: 0.65,
    open: 0.65,
    rec: 0.6,
    iss: 0.6,
    close: 0.65,
    on: 0.55,
    diff: 0.55,
    total: 0.7,
  };

  function changeMonth(offset: number) {
    const [y, m] = monthKey.split("/").map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    setMonthKey(monthKeyFromDate(d));
  }

  async function loadData(isRefresh = false) {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);

      const { data, error } = await supabase
        .from("fuel_daily_report")
        .select(
          "report_date,yesterday_closing,opening,supplied,issued,closing,on_loss,diff,total_diff"
        )
        .gte("report_date", startISO)
        .lte("report_date", endISO)
        .order("report_date", { ascending: true });

      if (error) throw error;

      setRows((data ?? []) as FuelDailyRow[]);
    } catch (e: any) {
      Alert.alert(
        "Fuel report error",
        e?.message ??
          "Failed to load fuel report. Check your view name and connection."
      );
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }

  useEffect(() => {
    loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startISO, endISO]);

  const totals = useMemo(() => {
    const sum = (key: keyof FuelDailyRow) =>
      rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

    return {
      total_on_loss: sum("on_loss"),
      total_supplied: sum("supplied"),
      total_issued: sum("issued"),
      total_diff: sum("diff"),
      total_total_diff: sum("total_diff"),
    };
  }, [rows]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Fuel Report</ThemedText>

      {/* Month Picker */}
      <ThemedView style={styles.card}>
        <ThemedView style={styles.monthRow}>
          <Pressable
            onPress={() => changeMonth(-1)}
            style={({ pressed }) => [styles.monthBtn, pressed && styles.pressed]}
          >
            <ThemedText type="subtitle">{"<"}</ThemedText>
          </Pressable>

          <ThemedView style={styles.monthCenter}>
            <ThemedText type="subtitle">{monthKey}</ThemedText>
            <ThemedText style={styles.smallMuted}>
              {startISO} to {endISO}
            </ThemedText>
          </ThemedView>

          <Pressable
            onPress={() => changeMonth(1)}
            style={({ pressed }) => [styles.monthBtn, pressed && styles.pressed]}
          >
            <ThemedText type="subtitle">{">"}</ThemedText>
          </Pressable>
        </ThemedView>

        <Pressable
          onPress={() => loadData(true)}
          style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
        >
          <ThemedText>{refreshing ? "Refreshing..." : "Refresh"}</ThemedText>
        </Pressable>
      </ThemedView>

      {/* Loading */}
      {loading ? (
        <ThemedView style={styles.loadingWrap}>
          <ActivityIndicator />
          <ThemedText style={styles.smallMuted}>Loading report…</ThemedText>
        </ThemedView>
      ) : null}

      {/* Monthly Totals */}
      {!loading ? (
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Monthly Totals
          </ThemedText>

          <ThemedView style={styles.summaryGrid}>
            <SummaryItem label="ON Loss" value={formatNum(totals.total_on_loss)} />
            <SummaryItem label="Supplied" value={formatNum(totals.total_supplied)} />
            <SummaryItem label="Issued" value={formatNum(totals.total_issued)} />
            <SummaryItem label="Diff" value={formatNum(totals.total_diff)} />
            <SummaryItem label="Total Diff" value={formatNum(totals.total_total_diff)} />
          </ThemedView>

          <ThemedText style={styles.smallMuted}>
            Tip: Total Diff = ON Loss + Diff (summed per day)
          </ThemedText>
        </ThemedView>
      ) : null}

      {/* Daily Table */}
      {!loading ? (
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Daily Details (tap a line for allocations)
          </ThemedText>

          {rows.length === 0 ? (
            <ThemedText style={styles.smallMuted}>
              No dip/issue/received data found for this month.
            </ThemedText>
          ) : (
            <>
              {/* Header row */}
              <ThemedView style={[styles.tableRow, styles.tableHeader]}>
                <Cell text="Date" flex={COL.date} bold />
                <Cell text="Yest" flex={COL.yest} bold right />
                <Cell text="Open" flex={COL.open} bold right />
                <Cell text="Rec" flex={COL.rec} bold right />
                <Cell text="Iss" flex={COL.iss} bold right />
                <Cell text="Close" flex={COL.close} bold right />
                <Cell text="ON" flex={COL.on} bold right />
                <Cell text="Diff" flex={COL.diff} bold right />
                <Cell text="Total" flex={COL.total} bold right />
              </ThemedView>

              {rows.map((r) => (
                <Pressable
                  key={r.report_date}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/home/fuel_report_day",
                      params: { date: r.report_date },
                    })
                  }
                  style={({ pressed }) => [
                    styles.rowPressable,
                    pressed && styles.pressedRow,
                  ]}
                >
                  <ThemedView style={styles.tableRow}>
                    <Cell text={formatDateShort(r.report_date)} flex={COL.date} />
                    <Cell text={formatNum(r.yesterday_closing)} flex={COL.yest} right />
                    <Cell text={formatNum(r.opening)} flex={COL.open} right />
                    <Cell text={formatNum(r.supplied)} flex={COL.rec} right />
                    <Cell text={formatNum(r.issued)} flex={COL.iss} right />
                    <Cell text={formatNum(r.closing)} flex={COL.close} right />
                    <Cell text={formatNum(r.on_loss)} flex={COL.on} right />
                    <Cell text={formatNum(r.diff)} flex={COL.diff} right />
                    <Cell text={formatNum(r.total_diff)} flex={COL.total} right />
                  </ThemedView>
                </Pressable>
              ))}
            </>
          )}
        </ThemedView>
      ) : null}
    </ScrollView>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView style={styles.summaryItem}>
      <ThemedText style={styles.smallMuted}>{label}</ThemedText>
      <ThemedText type="subtitle">{value}</ThemedText>
    </ThemedView>
  );
}

function Cell({
  text,
  flex,
  right,
  bold,
}: {
  text: string;
  flex: number;
  right?: boolean;
  bold?: boolean;
}) {
  return (
    <ThemedView style={[styles.cell, { flex }]}>
      <ThemedText
        style={[
          styles.cellText,
          right ? styles.right : null,
          bold ? styles.bold : null,
        ]}
        numberOfLines={1}
      >
        {text}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  monthBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  monthCenter: {
    alignItems: "center",
    flex: 1,
    gap: 2,
  },
  refreshBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  loadingWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  sectionTitle: {
    marginBottom: 2,
  },
  smallMuted: {
    opacity: 0.7,
    fontSize: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  summaryItem: {
    minWidth: "48%",
    paddingVertical: 6,
    gap: 2,
  },

  tableHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    opacity: 0.9,
    paddingBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 3,
  },
  rowPressable: {
    borderRadius: 10,
  },
  pressedRow: {
    opacity: 0.6,
  },

  cell: {
    minWidth: 0,
  },
  cellText: {
    fontSize: 11,
  },
  right: {
    textAlign: "right",
  },
  bold: {
    fontWeight: "700",
  },
});
