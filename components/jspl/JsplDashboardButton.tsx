import { Pressable, StyleSheet, Text } from 'react-native';
import { jsplColors, jsplRadii, jsplSizes, jsplSpacing, jsplType } from '../../constants/jspl-design';

type Props = { title: string; onPress: () => void; description?: string; disabled?: boolean };
/** Standard module dashboard navigation button. Caller supplies verified route action. */
export function JsplDashboardButton({ title, description, onPress, disabled = false }: Props) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}>
    <Text style={styles.title}>{title}</Text>
    {!!description && <Text style={styles.description}>{description}</Text>}
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: jsplSizes.buttonHeight + 14, backgroundColor: jsplColors.surface,
    borderRadius: jsplRadii.md, borderWidth: 1, borderColor: jsplColors.border,
    paddingHorizontal: jsplSpacing.lg, paddingVertical: jsplSpacing.md,
    justifyContent: 'center', gap: jsplSpacing.xs },
  pressed: { backgroundColor: jsplColors.successTint, borderColor: jsplColors.primary },
  disabled: { opacity: 0.5 },
  title: { fontSize: jsplType.cardTitle, fontWeight: '700', color: jsplColors.primaryDark },
  description: { fontSize: jsplType.body, color: jsplColors.textSecondary },
});