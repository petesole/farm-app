import { Pressable, StyleSheet, Text } from 'react-native';
import { jsplDashboardTheme } from '../../constants/jspl-design';

type Props = { title: string; onPress: () => void; description?: string; count?: number; disabled?: boolean };
/** Standard module dashboard navigation button. Caller supplies verified route action. */
export function JsplDashboardButton({ title, description, count, onPress, disabled = false }: Props) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}>
    <Text style={styles.title}>{title}{count != null ? <Text style={styles.count}> ({count})</Text> : null}</Text>
    {!!description && <Text style={styles.description}>{description}</Text>}
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: jsplDashboardTheme.cardMinHeight, backgroundColor: jsplDashboardTheme.cardBackground,
    borderRadius: jsplDashboardTheme.cardRadius, borderWidth: 1, borderColor: jsplDashboardTheme.cardBorder,
    paddingHorizontal: jsplDashboardTheme.cardPaddingHorizontal, paddingVertical: jsplDashboardTheme.cardPaddingVertical,
    justifyContent: 'center', gap: 8 },
  pressed: { backgroundColor: jsplDashboardTheme.cardPressed, borderColor: jsplDashboardTheme.cardPressedBorder },
  disabled: { opacity: 0.5 },
  title: { fontSize: jsplDashboardTheme.cardTitleSize, fontWeight: '700', color: jsplDashboardTheme.cardTitle },
  count: { color: "#DC2626", fontSize: jsplDashboardTheme.cardTitleSize, fontWeight: "700" },
  description: { fontSize: jsplDashboardTheme.descriptionSize, color: jsplDashboardTheme.cardDescription },
});