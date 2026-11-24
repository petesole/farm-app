import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/supabase';
import { formatJsplDate, formatJsplNumber, jsplColors as C } from '@/constants/jspl-design';
import { parseJsplDateInput } from '@/utils/jspl-input';
import { JsplModuleHeader } from './JsplModuleHeader';

type Mode = 'request' | 'history' | 'admin';
type Option = { id: string; label: string };
type Source = { source_type: string; source_id: string };
type Row = Source & {
  labour_date: string;
  labour_week: string;
  tracecode_name: string;
  activity_name: string;
  labour_qty: number | null;
  kgs: number | null;
  unit_cost: number | null;
  total_cost: number | null;
  farm_name: string;
  crop_name: string;
  season_name: string | null;
  company: string;
  payment_reference?: string;
  payment_date?: string;
};
type Request = { id: string; request_number: number; requested_date: string; lines: Row[] };
type Periods = { days: string[]; weeks: string[]; historyOptions?: Partial<Record<Dimension, (string | null)[]>> };

const dimensions = [
  ['season_name', 'Season'], ['farm_name', 'Farm'], ['crop_name', 'Crop'],
  ['tracecode_name', 'Trace'], ['company', 'Company'], ['activity_name', 'Activity'],
] as const;
type Dimension = typeof dimensions[number][0];

const sourceKey = (row: Source) => JSON.stringify([row.source_type, row.source_id]);
const amount = (value?: number | null) => value == null ? '—' : '$' + formatJsplNumber(value, 2);
const quantity = (value: number | null) => value == null ? '—' : formatJsplNumber(value, 2);
const total = (rows: Row[]) => rows.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0);
const message = (error: unknown) => (error as { message?: string })?.message || 'Unable to load Labour payments.';
const matches = (row: Row, filters: Partial<Record<Dimension, string>>, omit?: Dimension) =>
  dimensions.every(([key]) => key === omit || !filters[key] || row[key] === filters[key]);

async function read<T>(mode: Mode | 'draft', period?: string, week = false, filters = {}) {
  const { data, error } = await supabase.rpc('labour_payment_read', {
    p_mode: mode, p_period: period || null, p_week: week, p_filters: filters,
  });
  if (error) throw error;
  return data as T;
}

function Dropdown({ label, value, options, change, disabled }: {
  label: string; value: string; options: Option[]; change: (value: string) => void; disabled?: boolean;
}) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.pickerWrapper}>
      <Picker accessibilityLabel={label} mode="dropdown" enabled={!disabled}
        selectedValue={value} onValueChange={change} style={styles.picker}>
        {options.map(option => <Picker.Item key={option.id} value={option.id} label={option.label} />)}
      </Picker>
    </View>
  </View>;
}

function Button({ label, action, disabled, checked }: {
  label: string; action: () => void; disabled?: boolean; checked?: boolean;
}) {
  return <Pressable accessibilityRole={checked === undefined ? 'button' : 'checkbox'}
    accessibilityState={{ disabled, checked }} accessibilityLabel={label}
    disabled={disabled} onPress={action} style={[styles.button, disabled && styles.disabled]}>
    <Text style={styles.buttonText}>{checked === undefined ? label : checked ? '☑ ' + label : '☐ ' + label}</Text>
  </Pressable>;
}

function PaymentTable({ rows, history, selected, toggle, remove, disabled }: {
  rows: Row[]; history?: boolean; selected?: Set<string>; toggle?: (row: Row) => void;
  remove?: (row: Row) => void; disabled?: boolean;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  useEffect(() => setPage(0), [rows]);
  const columns = [
    { label: 'Work date', width: 120, value: (r: Row) => formatJsplDate(r.labour_date) },
    { label: 'Week', width: 85, value: (r: Row) => r.labour_week },
    { label: 'Trace code', width: 190, value: (r: Row) => r.tracecode_name },
    { label: 'Activity', width: 200, value: (r: Row) => r.activity_name },
    { label: 'Company', width: 85, value: (r: Row) => r.company },
    { label: 'People', width: 85, value: (r: Row) => quantity(r.labour_qty) },
    { label: 'Kgs', width: 85, value: (r: Row) => quantity(r.kgs) },
    { label: 'Unit cost', width: 100, value: (r: Row) => amount(r.unit_cost) },
    { label: 'Value', width: 105, value: (r: Row) => amount(r.total_cost) },
    ...(history ? [
      { label: 'Cashbook reference', width: 200, value: (r: Row) => r.payment_reference },
      { label: 'Payment date', width: 120, value: (r: Row) => r.payment_date ? formatJsplDate(r.payment_date) : '—' },
    ] : []),
  ];
  const actionWidth = toggle || remove ? 125 : 0;
  const width = columns.reduce((sum, column) => sum + column.width, actionWidth);
  return <View style={styles.table}>
    <ScrollView horizontal nestedScrollEnabled>
    <View style={{ width }}>
      <View style={[styles.line, styles.header]}>
        {actionWidth > 0 && <Text style={[styles.cell, styles.headerText, { width: actionWidth }]}>Action</Text>}
        {columns.map(column => <Text key={column.label} style={[styles.cell, styles.headerText, { width: column.width }]}>{column.label}</Text>)}
      </View>
      {rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => <View key={sourceKey(row)} style={styles.line}>
        {toggle && <View style={[styles.cell, { width: actionWidth }]}>
          <Button label="Select" checked={selected?.has(sourceKey(row)) ?? false} action={() => toggle(row)} disabled={disabled} />
        </View>}
        {remove && <View style={[styles.cell, { width: actionWidth }]}>
          <Button label="Remove" action={() => remove(row)} disabled={disabled} />
        </View>}
        {columns.map(column => <Text key={column.label} style={[styles.cell, { width: column.width }]}>{column.value(row)}</Text>)}
      </View>)}
    </View>
    </ScrollView>
    {lastPage > 0 && <View style={styles.fields}>
      <Button label="Previous" disabled={currentPage === 0} action={() => setPage(currentPage - 1)} />
      <Text>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, rows.length)} of {rows.length}</Text>
      <Button label="Next" disabled={currentPage === lastPage} action={() => setPage(currentPage + 1)} />
    </View>}
  </View>;
}

export default function LabourPayments({ mode }: { mode: Mode }) {
  const [periods, setPeriods] = useState<Periods>({ days: [], weeks: [] });
  const [byWeek, setByWeek] = useState(false);
  const [period, setPeriod] = useState('');
  const [filters, setFilters] = useState<Partial<Record<Dimension, string>>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState(new Set<string>());
  const [draft, setDraft] = useState<Request | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [adminRequest, setAdminRequest] = useState('');
  const [account, setAccount] = useState('');
  const [payee, setPayee] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const paymentDate = parseJsplDateInput(date);
  const request = requests.find(item => item.id === adminRequest);

  const refresh = useCallback(async () => {
    if (mode === 'admin') {
      const result = await read<{ requests: Request[]; accounts: Option[] }>('admin');
      setRequests(result.requests);
      setAccounts(result.accounts);
    } else {
      const [available, saved] = await Promise.all([
        read<Periods>(mode), mode === 'request' ? read<Request | null>('draft') : null,
      ]);
      setPeriods(available);
      setDraft(saved);
      setDate(current => current || (saved?.requested_date ? formatJsplDate(saved.requested_date) : ''));
    }
    setRevision(current => current + 1);
  }, [mode]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    refresh().catch(failure => { if (active) setError(message(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]));

  const historyFilters = useMemo(() => mode === 'history' && !period
    ? JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))
    : '{}', [mode, period, filters]);

  useEffect(() => {
    setRows([]);
    setSelected(new Set());
    if (!period && historyFilters === '{}') { setLoadingRows(false); return; }
    let active = true;
    setLoadingRows(true);
    read<{ rows: Row[] }>(mode, period, byWeek, JSON.parse(historyFilters))
      .then(result => {
        if (!active) return;
        setRows(result.rows);
        if (period) setFilters(current => {
          const next = { ...current };
          for (const [key] of dimensions) {
            if (next[key] && !result.rows.some(row => row[key] === next[key] && matches(row, next, key))) delete next[key];
          }
          return next;
        });
      })
      .catch(failure => { if (active) setError(message(failure)); })
      .finally(() => { if (active) setLoadingRows(false); });
    return () => { active = false; };
  }, [mode, period, byWeek, revision, historyFilters]);

  const visible = useMemo(() => rows.filter(row => matches(row, filters)), [rows, filters]);
  const checked = visible.filter(row => selected.has(sourceKey(row)));
  const allChecked = visible.length > 0 && checked.length === visible.length;

  async function change(action: string, sources: Source[] = []) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data, error: failure } = await supabase.rpc('labour_payment_change', {
        p_action: action, p_date: paymentDate ?? null,
        p_sources: sources.map(({ source_type, source_id }) => ({ source_type, source_id })),
        p_request: (mode === 'admin' ? request?.id : draft?.id) ?? null,
        p_account: account || null, p_payee: payee || null, p_reference: reference || null,
      });
      if (failure) throw failure;
      if (action === 'submit') { setNotice('Request ' + data + ' sent to Cashbook.'); setDate(''); }
      if (action === 'cashbook') {
        setNotice('Cashbook draft created. Confirm the payment in Cashbook History when it is paid.');
        setAdminRequest('');
        setPayee('');
        setReference('');
      }
      await refresh();
    } catch (failure) { setError(message(failure)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const locked = loading || loadingRows || busy;
  const periodsForMode = byWeek ? periods.weeks : periods.days;
  const dateLabel = mode === 'admin' ? 'Actual payment date' : 'Requested payment date';
  const dateInput = <View style={styles.field}>
    <Text style={styles.label}>{dateLabel}</Text>
    <TextInput accessibilityLabel={dateLabel} value={date} onChangeText={setDate}
      placeholder="dd/mm/yyyy" editable={!busy} style={styles.input} />
  </View>;
  const title = mode === 'history' ? 'Historical Payments' : mode === 'admin' ? 'Labour Requests for Cashbook' : 'Labour Payment Request';

  return <ScrollView contentContainerStyle={styles.page}>
    <JsplModuleHeader title={title} backLabel={mode === 'admin' ? 'Back to Cashbook' : 'Back to Labour'}
      backHref={mode === 'admin' ? '/(tabs)/cashbook' : '/(tabs)/labour'} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
    {loading ? <ActivityIndicator color={C.primary} /> : mode === 'admin' ? <View style={styles.card}>
      <Dropdown label="Submitted request" value={adminRequest} disabled={busy}
        options={[{ id: '', label: requests.length ? 'Choose a request' : 'No requests awaiting a Cashbook draft' },
          ...requests.map(item => ({ id: item.id, label: 'Request ' + item.request_number + ' · ' + formatJsplDate(item.requested_date) + ' · ' + amount(total(item.lines)) }))]}
        change={value => {
          setAdminRequest(value);
          setDate(formatJsplDate(requests.find(item => item.id === value)?.requested_date));
          setReference(value ? 'Labour request ' + requests.find(item => item.id === value)?.request_number : '');
        }} />
      {request && <>
        <PaymentTable rows={request.lines} />
        <Text style={styles.heading}>Total {amount(total(request.lines))}</Text>
        <View style={styles.fields}>
          {dateInput}
          <Dropdown label="Cashbook account" value={account} disabled={busy} change={setAccount}
            options={[{ id: '', label: 'Choose an account' }, ...accounts]} />
          <View style={styles.field}><Text style={styles.label}>Payee</Text>
            <TextInput accessibilityLabel="Payee" style={styles.input} value={payee} onChangeText={setPayee} editable={!busy} maxLength={120} />
          </View>
          <View style={styles.field}><Text style={styles.label}>Cashbook reference</Text>
            <TextInput accessibilityLabel="Cashbook reference" style={styles.input} value={reference} onChangeText={setReference} editable={!busy} maxLength={120} />
          </View>
        </View>
        <Button label="Create Cashbook Draft" disabled={busy || !account || !payee.trim() || !reference.trim() || !paymentDate}
          action={() => void change('cashbook')} />
      </>}
    </View> : <>
      <View style={styles.card}>
        {mode === 'request' && <Text style={styles.heading}>Outstanding Labour</Text>}
        <View style={styles.fields}>
          {mode === 'request' && dateInput}
          <Dropdown label="Filter by" value={byWeek ? 'week' : 'day'} disabled={busy}
            options={[{ id: 'day', label: 'Work date' }, { id: 'week', label: 'Work week' }]}
            change={value => { setPeriod(''); setFilters({}); setByWeek(value === 'week'); }} />
          <Dropdown label={byWeek ? 'Work week' : 'Work date'} value={period} disabled={busy}
            options={[{ id: '', label: periodsForMode.length ? 'Choose ' + (byWeek ? 'a week' : 'a date') : 'No matching periods' },
              ...[...new Set(period ? [...periodsForMode, period] : periodsForMode)].sort().reverse().map(id => ({ id, label: byWeek ? id : formatJsplDate(id) }))]}
            change={value => { setPeriod(value); setFilters({}); }} />
          {dimensions.map(([key, label]) => {
            const available = mode === 'history' && !period ? periods.historyOptions?.[key] ?? []
              : rows.filter(row => matches(row, filters, key)).map(row => row[key]);
            const values = [...new Set(available.filter((value): value is string => !!value))]
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            return <Dropdown key={key} label={label} value={filters[key] || ''} disabled={locked || (!period && mode === 'request')}
              options={[{ id: '', label: 'All' }, ...values.map(id => ({ id, label: id }))]}
              change={value => { setFilters(current => ({ ...current, [key]: value })); setSelected(new Set()); }} />;
          })}
        </View>
        {mode === 'request' && <View style={styles.fields}>
          <Button label={allChecked ? 'Uncheck All' : 'Check All'} disabled={locked || !visible.length}
            action={() => setSelected(new Set(allChecked ? [] : visible.map(sourceKey)))} />
          <Button label="Confirm Payment Request" disabled={locked || !checked.length || !paymentDate}
            action={() => void change('add', checked)} />
          <Text>{checked.length} selected · {amount(total(checked))}</Text>
        </View>}
        {loadingRows ? <ActivityIndicator color={C.primary} /> : visible.length
          ? <PaymentTable rows={visible} history={mode === 'history'} disabled={busy} selected={selected}
              toggle={mode === 'request' ? row => setSelected(current => {
                const next = new Set(current);
                const key = sourceKey(row);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              }) : undefined} />
          : <Text>{period || historyFilters !== '{}' ? 'No Labour lines match these filters.'
              : mode === 'history' ? 'Choose a filter to view payment history.' : 'Choose a work date or week to see Labour lines.'}</Text>}
      </View>
      {mode === 'request' && <View style={styles.card}>
        <Text style={styles.heading}>Payment Request{draft ? ' ' + draft.request_number : ''}</Text>
        {draft?.lines.length ? <PaymentTable rows={draft.lines} disabled={busy} remove={row => void change('remove', [row])} />
          : <Text>No Labour lines added yet.</Text>}
        <Text style={styles.heading}>Request total {amount(total(draft?.lines ?? []))}</Text>
        <Button label="Send to Cashbook" disabled={busy || !paymentDate || !draft?.lines.length} action={() => void change('submit')} />
      </View>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: C.background, padding: 20, gap: 14 },
  card: { backgroundColor: '#fff', padding: 14, gap: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  fields: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  field: { minWidth: 155, flexGrow: 1, flexBasis: 155, gap: 4 },
  label: { color: C.text, fontWeight: '600' },
  heading: { color: C.primaryDark, fontSize: 17, fontWeight: '700' },
  pickerWrapper: { borderWidth: 1, borderColor: C.border, borderRadius: 7, overflow: 'hidden' },
  picker: { height: 44, width: '100%', color: C.text },
  input: { minHeight: 46, paddingHorizontal: 10, borderWidth: 1, borderColor: C.border, borderRadius: 7, color: C.text },
  button: { alignSelf: 'flex-start', borderWidth: 1, borderColor: C.primary, borderRadius: 6, padding: 8 },
  buttonText: { fontWeight: '700', color: C.primaryDark },
  disabled: { opacity: 0.45 },
  error: { color: C.danger, fontWeight: '700' },
  header: { backgroundColor: C.primaryDark },
  headerText: { color: '#fff', fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: C.border },
  cell: { padding: 8 },
  table: { gap: 8 },
});
