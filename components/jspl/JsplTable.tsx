import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  formatJsplNumber, jsplCellAlignment, jsplColors, jsplSizes,
  jsplSpacing, jsplType, type JsplCellKind,
} from '../../constants/jspl-design';

export type JsplColumn<Row> = {
  key: string;
  title: string;
  kind?: JsplCellKind;
  width?: number;
  decimals?: number;
  unit?: string;
  onPress?: (row: Row) => void;
  render?: (row: Row) => string | number | null | undefined;
  value?: (row: Row) => string | number | null | undefined;
};

export function JsplTable<Row>({
  rows, columns, rowKey, emptyMessage = 'No records',
}: {
  rows: readonly Row[];
  columns: readonly JsplColumn<Row>[];
  rowKey: (row: Row, index: number) => string;
  emptyMessage?: string;
}) {
  return (
    <ScrollView horizontal contentContainerStyle={styles.scrollContent}>
      <View style={styles.table}>
        <View style={styles.header}>
          {columns.map(column => (
            <Text key={column.key} style={[styles.headerCell, {
              width: column.width ?? 144,
              textAlign: jsplCellAlignment(column.kind ?? 'text'),
            }]}>{column.title}</Text>
          ))}
        </View>
        {rows.length === 0 ? <Text style={styles.empty}>{emptyMessage}</Text> :
          rows.map((row, i) => (
            <View key={rowKey(row, i)} style={[styles.row, i % 2 === 1 && styles.alternate]}>
              {columns.map(column => {
                const kind = column.kind ?? 'text';
                const raw = (column.render ?? column.value)?.(row);
                const display = kind === 'number' && typeof raw === 'number'
                  ? formatJsplNumber(raw, column.decimals ?? 2)
                  : raw == null ? '—' : String(raw);
                const cellStyle = [styles.cell, {
                  width: column.width ?? 144,
                  textAlign: jsplCellAlignment(kind),
                  fontVariant: kind === 'number' ? ['tabular-nums'] as const : undefined,
                }];
                const label = `${display}${column.unit && raw != null ? ` ${column.unit}` : ''}`;
                return column.onPress
                  ? <Pressable key={column.key} accessibilityRole="button" accessibilityLabel={`${column.title}: ${label}`} onPress={() => column.onPress?.(row)} style={[styles.actionCell,{width:column.width??144}]}>
                      <Text style={styles.actionLabel}>{label}</Text>
                    </Pressable>
                  : <Text key={column.key} numberOfLines={1} selectable style={cellStyle}>{label}</Text>;
              })}
            </View>
          ))}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  table: { borderColor: jsplColors.border, borderWidth: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: jsplColors.surface },
  header: { flexDirection: 'row', backgroundColor: jsplColors.background, minHeight: jsplSizes.tableHeaderMinHeight, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: jsplColors.border },
  headerCell: { paddingHorizontal: jsplSpacing.md, paddingVertical: jsplSpacing.sm, fontWeight: '700', fontSize: jsplType.caption, color: jsplColors.text },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: jsplSizes.tableRowMinHeight, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: jsplColors.border },
  alternate: { backgroundColor: '#FAFBFA' },
  cell: { paddingHorizontal: jsplSpacing.md, paddingVertical: jsplSpacing.sm, fontSize: jsplType.body, color: jsplColors.text },
  actionCell: { minHeight: 38, paddingHorizontal: jsplSpacing.sm, justifyContent: 'center' },
  actionLabel: { backgroundColor: jsplColors.primary, color: '#fff', fontWeight: '700', textAlign: 'center', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 5, overflow: 'hidden' },
  empty: { padding: jsplSpacing.xl, textAlign: 'center', color: jsplColors.textSecondary },
});
