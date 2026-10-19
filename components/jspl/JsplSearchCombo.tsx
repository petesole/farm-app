import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { jsplColors, jsplSizes, jsplSpacing, jsplType } from '../../constants/jspl-design';
import { filterJsplOptions, type JsplOption, type JsplSelector } from '../../utils/jspl-input';

type Props = {
  label: string;
  selector: JsplSelector;
  options: readonly JsplOption[];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  includeInactive?: boolean;
  placeholder?: string;
  disabled?: boolean;
};
export function JsplSearchCombo({ label, selector, options, value, onChange,
  includeInactive = false, placeholder = 'Search...', disabled = false }: Props) {
  const selected = options.find(o => o.id === value);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const filtered = useMemo(() =>
    filterJsplOptions(options, selector, query, includeInactive),
    [options, selector, query, includeInactive]);
  return <View style={styles.wrapper}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputRow}>
      <TextInput accessibilityLabel={label} editable={!disabled}
        value={expanded ? query : selected?.label ?? ''}
        placeholder={placeholder}
        onFocus={() => { setQuery(''); setExpanded(true); }}
        onChangeText={v => { setQuery(v); setExpanded(true); }}
        style={styles.input} autoCorrect={false} />
      {!disabled && value != null && <Pressable accessibilityRole="button" accessibilityLabel={'Clear ' + label}
        onPress={() => { onChange(null); setQuery(''); setExpanded(false); }}
        style={styles.clear}><Text style={styles.clearText}>×</Text></Pressable>}
    </View>
    {expanded && !disabled && <ScrollView keyboardShouldPersistTaps="always"
      nestedScrollEnabled style={styles.results}>
      {filtered.length === 0 ? <Text style={styles.empty}>No matching results</Text> :
        filtered.map(o => <Pressable key={String(o.id)} accessibilityRole="button"
          onPress={() => { onChange(o.id); setExpanded(false); setQuery(''); }}
          style={styles.option}><Text style={styles.optionText}>{o.label}</Text></Pressable>)}
      <Pressable onPress={() => setExpanded(false)} style={styles.dismiss}>
        <Text style={styles.dismissText}>Close</Text>
      </Pressable>
    </ScrollView>}
  </View>;
}
const styles = StyleSheet.create({
  wrapper: { gap: jsplSpacing.xs, zIndex: 2 },
  label: { fontSize: jsplType.body, fontWeight: '600', color: jsplColors.text },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: jsplColors.surface,
    borderWidth: 1, borderColor: jsplColors.border, borderRadius: 10 },
  input: { minHeight: jsplSizes.inputHeight, flex: 1, paddingHorizontal: jsplSpacing.md,
    fontSize: jsplType.body, color: jsplColors.text },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: 23, color: jsplColors.textSecondary },
  results: { maxHeight: 240, borderWidth: 1, borderColor: jsplColors.border,
    borderRadius: 10, backgroundColor: jsplColors.surface },
  option: { minHeight: 44, paddingHorizontal: jsplSpacing.md,
    justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: jsplColors.border },
  optionText: { color: jsplColors.text, fontSize: jsplType.body },
  empty: { padding: jsplSpacing.md, color: jsplColors.textSecondary },
  dismiss: { alignItems: 'center', padding: jsplSpacing.sm },
  dismissText: { color: jsplColors.primary, fontWeight: '600' },
});
