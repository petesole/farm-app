import { Image, StyleSheet, Text, View } from "react-native";
import { jsplColors as C, jsplSpacing as S, jsplRadii as R } from "@/constants/jspl-design";

/** Shared JSPL header: branding only; does not alter data or permissions. */
export function JsplModuleHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Image source={require("../../assets/images/jspl_farm_logo.png")} resizeMode="contain" style={styles.logo} />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle || "John Sole (Private) Limited"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: C.primaryDark, borderRadius: R.lg, padding: S.lg, flexDirection: "row", alignItems: "center", marginBottom: S.lg },
  logo: { width: 62, height: 62, marginRight: S.lg, borderRadius: R.sm, backgroundColor: C.surface },
  copy: { flex: 1 },
  title: { color: C.surface, fontWeight: "800", fontSize: 22 },
  subtitle: { color: "#DCE9DC", marginTop: S.xs, fontSize: 12 },
});
