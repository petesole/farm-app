import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  label?: string;
  value?: Date | null;
  onChange: (d: Date | null) => void;
  disabled?: boolean;
  showQuickButtons?: boolean;
};

function NumBox({
  value,
  onChange,
  maxLength = 2,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ""))}
      keyboardType="number-pad"
      maxLength={maxLength}
      editable={!disabled}
      style={[styles.numBox, disabled && { opacity: 0.4 }]}
    />
  );
}

export default function DateTimeInput({
  label,
  value,
  onChange,
  disabled,
  showQuickButtons = true,
}: Props) {
  const now = new Date();

  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");

  // Initialize from prop or now
  useEffect(() => {
    const base = value ?? now;

    setDay(String(base.getDate()));
    setMonth(String(base.getMonth() + 1));
    setYear(String(base.getFullYear()));
    setHour(String(base.getHours()));
    setMinute(String(base.getMinutes()));
  }, [value]);

  function buildDate(): Date | null {
    const d = Number(day);
    const m = Number(month);
    const y = Number(year);
    const h = Number(hour);
    const min = Number(minute);

    if (
      !Number.isFinite(d) ||
      !Number.isFinite(m) ||
      !Number.isFinite(y) ||
      !Number.isFinite(h) ||
      !Number.isFinite(min)
    )
      return null;

    if (m < 1 || m > 12) return null;
    if (h < 0 || h > 23) return null;
    if (min < 0 || min > 59) return null;

    const date = new Date(y, m - 1, d, h, min);

    if (
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
    )
      return null;

    return date;
  }

  // Auto update parent when inputs change
  useEffect(() => {
    onChange(buildDate());
  }, [day, month, year, hour, minute]);

  function setFromNow() {
    const n = new Date();
    setDay(String(n.getDate()));
    setMonth(String(n.getMonth() + 1));
    setYear(String(n.getFullYear()));
    setHour(String(n.getHours()));
    setMinute(String(n.getMinutes()));
  }

  function shiftMinutes(offset: number) {
    const base = buildDate();
    if (!base) return;

    const shifted = new Date(base.getTime() + offset * 60000);

    setDay(String(shifted.getDate()));
    setMonth(String(shifted.getMonth() + 1));
    setYear(String(shifted.getFullYear()));
    setHour(String(shifted.getHours()));
    setMinute(String(shifted.getMinutes()));
  }

  return (
    <View style={{ gap: 8 }}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View style={styles.row}>
        <NumBox value={day} onChange={setDay} disabled={disabled} />
        <Text>/</Text>
        <NumBox value={month} onChange={setMonth} disabled={disabled} />
        <Text>/</Text>
        <NumBox
          value={year}
          onChange={setYear}
          maxLength={4}
          disabled={disabled}
        />
      </View>

      <View style={styles.row}>
        <NumBox value={hour} onChange={setHour} disabled={disabled} />
        <Text>:</Text>
        <NumBox value={minute} onChange={setMinute} disabled={disabled} />
      </View>

      {showQuickButtons && !disabled && (
        <View style={styles.quickRow}>
          <Pressable onPress={setFromNow} style={styles.quickBtn}>
            <Text style={styles.quickText}>Now</Text>
          </Pressable>

          <Pressable onPress={() => shiftMinutes(-30)} style={styles.quickBtn}>
            <Text style={styles.quickText}>-30m</Text>
          </Pressable>

          <Pressable onPress={() => shiftMinutes(-60)} style={styles.quickBtn}>
            <Text style={styles.quickText}>-1h</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  numBox: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 8,
    minWidth: 55,
    textAlign: "center",
    fontWeight: "900",
    backgroundColor: "#fff",
  },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  quickBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  quickText: { fontWeight: "900" },
});