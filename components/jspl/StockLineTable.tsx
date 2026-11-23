import type {ReactNode} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {jsplColors, jsplSpacing, jsplType} from '@/constants/jspl-design';

export type StockLineColumn = {label: string; width: number; grow?: number};
type Line = {key: string | number; cells: ReactNode[]};

export function StockLineTable({columns, rows}: {columns: StockLineColumn[]; rows: Line[]}) {
  const minWidth = columns.reduce((width, column) => width + column.width, 0)
    + (columns.length - 1) * jsplSpacing.sm;
  const cellStyles = columns.map(column => ({
    flexBasis: column.width, minWidth: column.width, flexGrow: column.grow ?? 0, flexShrink: 0,
  }));
  return <ScrollView horizontal nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
    <View style={[styles.table, {minWidth}]}>
      <View style={styles.row}>{columns.map((column, i) => <View key={i} style={cellStyles[i]}>
        {column.label ? <Text style={styles.heading}>{column.label}</Text> : null}
      </View>)}</View>
      {rows.map(row => <View key={row.key} style={styles.row}>
        {columns.map((_, i) => <View key={i} style={cellStyles[i]}>{row.cells[i]}</View>)}
      </View>)}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: {flexGrow: 1},
  table: {flexGrow: 1, gap: jsplSpacing.sm},
  row: {flexDirection: 'row', gap: jsplSpacing.sm, alignItems: 'flex-start'},
  heading: {fontSize: jsplType.body, fontWeight: '600', color: jsplColors.text},
});
