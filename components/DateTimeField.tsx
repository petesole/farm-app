import { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  editable?: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDisplay(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

function parseDisplay(s: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(
    s.trim()
  );
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);
  const hh = Number(m[4]);
  const mi = Number(m[5]);

  if (
    !Number.isFinite(dd) ||
    !Number.isFinite(mm) ||
    !Number.isFinite(yy) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(mi)
  )
    return null;

  const d = new Date(yy, mm - 1, dd, hh, mi, 0, 0);

  // validate date rollover
  if (
    d.getFullYear() !== yy ||
    d.getMonth() !== mm - 1 ||
    d.getDate() !== dd ||
    d.getHours() !== hh ||
    d.getMinutes() !== mi
  )
    return null;

  return d;
}

export function DateTimeField({ label, value, onChange, editable = true }: Props) {
  console.log("✅ DateTimeField loaded from components/DateTimeField.tsx");

  const display = useMemo(() => toDisplay(value), [value]);
  const [text, setText] = useState(display);

  useEffect(() => {
    setText(display);
  }, [display]);

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        editable={editable}
        placeholder="DD/MM/YYYY HH:MM"
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          !editable && { backgroundColor: "#f2f2f2", color: "#777" },
        ]}
        onBlur={() => {
          if (!editable) return;
          const parsed = parseDisplay(text);
          if (!parsed) {
            Alert.alert("Invalid date/time", "Use DD/MM/YYYY HH:MM");
            setText(display);
            return;
          }
          onChange(parsed);
        }}
      />
      <Text style={styles.hint}>
        Format: DD/MM/YYYY HH:MM (e.g. 02/03/2026 14:30)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "900" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    fontWeight: "900",
  },
  hint: { fontSize: 12, color: "#666" },
});