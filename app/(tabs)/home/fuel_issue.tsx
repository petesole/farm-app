import { formatJsplDate } from "@/constants/jspl-design";
import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
// app/(tabs)/fuel_issue.tsx
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../../supabase';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

/** Helpers */
function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatMeter(value: number | null) {
  if (value === null || value === undefined) return '';
  return Math.round(value).toString();
}

type VehicleRow = {
  vehicle_id: number;
  vehicle_name: string;
  vehicle_discontinued?: boolean;
  has_meter: boolean | null;
  meter_type: 'HOURS' | 'KM' | null;
  vehicle_type_id: number | string | null;
  tractor_class_id: number | string | null;
};

type DashboardForStock = {
  current_stock: number;
};

type PlannedJob = {
  week_start: string; tracecode_id: number; vehicle_job_id: number;
  target_dap: number; sequence_no: number;
  tracecode_name: string; vehicle_job_name: string;
  budget: number | null; issued: number; tractor_class_id: number | null;
  effective_hectares: number | null; standard_l_per_ha: number | null;
  budget_work_litres: number | null; budget_trip_count: number | null;
  trip_litres_per_trip: number | null; budget_trip_litres: number | null; trips_issued: number; work_issued: number; trip_issued_litres: number;
};
type SplitRow = { key: string; litres: string };
const planKey = (j: PlannedJob) =>
  [j.week_start,j.tracecode_id,j.vehicle_job_id,j.target_dap,j.sequence_no].join('|');

type LastMeterRow = {
  meter_reading: number | null;
};

export default function FuelIssueScreen() {
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [vehicleId, setVehicleId] = useState<number | null>(null);

  const [litres, setLitres] = useState<string>('');
  const [meterReading, setMeterReading] = useState<string>('');
  const [lastMeterReading, setLastMeterReading] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [plannedJobs,setPlannedJobs] = useState<PlannedJob[]>([]);
  const [splits,setSplits] = useState<SplitRow[]>([{key:'',litres:''}]);
  const [unplanned,setUnplanned] = useState(false);
  const [issueMode,setIssueMode] = useState<'WORK'|'TRIP'>('WORK');
  const [planLoading,setPlanLoading] = useState(false);
  const splitTotal = splits.reduce((n,r)=>n+(Number(r.litres)||0),0);
  const loadPlannedJobs = async () => {
    setPlanLoading(true);
    const from=new Date(); from.setDate(from.getDate()-14);
    const to=new Date(); to.setDate(to.getDate()+14);
    const selected=await supabase.from('fuel_weekly_selected_job')
      .select('week_start,tracecode_id,vehicle_job_id,target_dap,sequence_no')
      .gte('week_start',toISODate(from)).lte('week_start',toISODate(to))
      .order('week_start',{ascending:false});
    if(selected.error){Alert.alert('Planning load failed',selected.error.message);setPlanLoading(false);return;}
    const selection=selected.data??[];
    const traceIds=[...new Set(selection.map(j=>j.tracecode_id))];
    if(!traceIds.length){setPlannedJobs([]);setPlanLoading(false);return;}
    const [budget,allocated]=await Promise.all([
      supabase.from('fuel_budget_activity_v')
        .select('tracecode_id,vehicle_job_id,target_dap,sequence_no,tracecode_name,vehicle_job_name,total_budget_litres,tractor_class_id,effective_hectares,standard_l_per_ha,budget_work_litres,budget_trip_count,trip_litres_per_trip,budget_trip_litres')
        .in('tracecode_id',traceIds),
      supabase.from('fuel_allocation')
        .select('tracecode_id,vehicle_job_id,planned_target_dap,planned_sequence_no,fuel_allocated,allocation_kind')
        .not('planned_week_start','is',null).in('tracecode_id',traceIds)
    ]);
    if(budget.error||allocated.error){
      Alert.alert('Planning load failed',budget.error?.message??allocated.error?.message??'Unknown');
      setPlanLoading(false);return;
    }
    const items: PlannedJob[]=selection.map(j=>{
      const b=(budget.data??[]).find(x=>
        x.tracecode_id===j.tracecode_id&&x.vehicle_job_id===j.vehicle_job_id&&
        x.target_dap===j.target_dap&&x.sequence_no===j.sequence_no);
      const issued=(allocated.data??[]).filter(x=>
        x.tracecode_id===j.tracecode_id&&x.vehicle_job_id===j.vehicle_job_id&&
        x.planned_target_dap===j.target_dap&&x.planned_sequence_no===j.sequence_no)
        .reduce((n,x)=>n+Number(x.fuel_allocated||0),0);
      return {...j,tracecode_name:b?.tracecode_name??String(j.tracecode_id),
        vehicle_job_name:b?.vehicle_job_name??String(j.vehicle_job_id),
        budget:b?.total_budget_litres==null?null:Number(b.total_budget_litres),
        tractor_class_id:b?.tractor_class_id==null?null:Number(b.tractor_class_id),
        effective_hectares:b?.effective_hectares==null?null:Number(b.effective_hectares),
        standard_l_per_ha:b?.standard_l_per_ha==null?null:Number(b.standard_l_per_ha),
        budget_work_litres:b?.budget_work_litres==null?null:Number(b.budget_work_litres),
        budget_trip_count:b?.budget_trip_count==null?null:Number(b.budget_trip_count),
        trip_litres_per_trip:b?.trip_litres_per_trip==null?null:Number(b.trip_litres_per_trip),
        budget_trip_litres:b?.budget_trip_litres==null?null:Number(b.budget_trip_litres),issued,
        work_issued:(allocated.data??[]).filter(x=>x.tracecode_id===j.tracecode_id&&x.vehicle_job_id===j.vehicle_job_id&&x.planned_target_dap===j.target_dap&&x.planned_sequence_no===j.sequence_no&&x.allocation_kind!=='TRIP').reduce((n,x)=>n+Number(x.fuel_allocated||0),0),
        trip_issued_litres:(allocated.data??[]).filter(x=>x.tracecode_id===j.tracecode_id&&x.vehicle_job_id===j.vehicle_job_id&&x.planned_target_dap===j.target_dap&&x.planned_sequence_no===j.sequence_no&&x.allocation_kind==='TRIP').reduce((n,x)=>n+Number(x.fuel_allocated||0),0),
        trips_issued:(allocated.data??[]).filter(x=>x.tracecode_id===j.tracecode_id&&x.vehicle_job_id===j.vehicle_job_id&&x.planned_target_dap===j.target_dap&&x.planned_sequence_no===j.sequence_no&&x.allocation_kind==='TRIP').length};
    });
    setPlannedJobs(items);setPlanLoading(false);
  };

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => Number(v.vehicle_id) === Number(vehicleId)) ?? null,
    [vehicles, vehicleId]
  );

  const vehicleType = Number(selectedVehicle?.vehicle_type_id ?? 0);
  const tractorClass = Number(selectedVehicle?.tractor_class_id ?? 0);
  const planEligible = vehicleType === 1 || vehicleType === 2 || [1, 2, 3, 10].includes(tractorClass);
  const vehicleName = (selectedVehicle?.vehicle_name ?? '').toLowerCase();
  const isHarvester = tractorClass === 10 || /harvest|combine|case 2388/.test(vehicleName);
  const visiblePlannedJobs = plannedJobs.filter(j => {
    const jobName=j.vehicle_job_name.toLowerCase();
    const harvesting=/harvest|combin/.test(jobName);
    if(isHarvester) return harvesting;
    if(harvesting) return false;
    if(vehicleType===2) return /tpt|transport|haul|cart|truck|produce/.test(jobName);
    return vehicleType===1 && Number(j.tractor_class_id)===tractorClass;
  });
  const issueUnplanned = !planEligible || unplanned;
  const showMeter = !!selectedVehicle?.has_meter;
  const meterLabel =
    selectedVehicle?.meter_type === 'KM'
      ? 'Meter Reading (KM)'
      : 'Meter Reading (Hours)';

  const meterDelta = useMemo(() => {
    if (
      !selectedVehicle?.has_meter ||
      lastMeterReading === null ||
      !meterReading.trim()
    ) {
      return null;
    }

    const val = Number(String(meterReading).replace(/,/g, '').trim());

    if (!Number.isFinite(val)) return null;

    return val - lastMeterReading;
  }, [meterReading, lastMeterReading, selectedVehicle]);

  const loadVehicles = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('vehicle')
      .select(
        'vehicle_id,vehicle_name,vehicle_discontinued,has_meter,meter_type,vehicle_type_id,tractor_class_id'
      )
      .eq('vehicle_discontinued', false)
      .order('vehicle_name', { ascending: true });

    if (error) {
      Alert.alert('Load failed', error.message);
      setVehicles([]);
      setVehicleId(null);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as VehicleRow[];
    setVehicles(list);

    const stillValid =
      vehicleId !== null && list.some((v) => Number(v.vehicle_id) === Number(vehicleId));

    const nextVehicleId = stillValid
      ? vehicleId
      : list.length
      ? list[0].vehicle_id
      : null;

    setVehicleId(nextVehicleId);
    setLoading(false);
  };

  const loadLastMeterReading = async (selectedVehicleId: number | null) => {
    if (!selectedVehicleId) {
      setLastMeterReading(null);
      return;
    }

    const vehicle = vehicles.find((v) => Number(v.vehicle_id) === Number(selectedVehicleId));

    if (!vehicle?.has_meter) {
      setLastMeterReading(null);
      return;
    }

    const { data, error } = await supabase
      .from('fuel_issue')
      .select('meter_reading')
      .eq('vehicle_id', selectedVehicleId)
      .not('meter_reading', 'is', null)
      .order('fuel_issue_date', { ascending: false })
      .order('fuel_issue_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setLastMeterReading(null);
      return;
    }

    const row = data as LastMeterRow | null;
    setLastMeterReading(row?.meter_reading ?? null);
  };

  useEffect(() => {
    loadVehicles();
    loadPlannedJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMeterReading('');
    loadLastMeterReading(vehicleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setSplits([{key:'',litres:''}]);
    setIssueMode('WORK');
  }, [vehicleId, vehicles]);

  const saveFuelIssue = async () => {
    const qty = Number(String(litres).replace(/,/g, '').trim());
    const meterValue = Number(String(meterReading).replace(/,/g, '').trim());

    if (!vehicleId) {
      Alert.alert('Vehicle required', 'Please select a vehicle.');
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid fuel quantity (litres).');
      return;
    }

    const selected = vehicles.find((v) => Number(v.vehicle_id) === Number(vehicleId));

    if (!selected) {
      Alert.alert('Vehicle not available', 'Please reselect a vehicle.');
      await loadVehicles();
      return;
    }

    if (selected.has_meter) {
      if (!meterReading.trim()) {
        Alert.alert(
          'Meter reading required',
          `Please enter the ${selected.meter_type === 'KM' ? 'KM' : 'hours'} reading.`
        );
        return;
      }

      if (!Number.isInteger(meterValue) || meterValue < 0) {
        Alert.alert('Invalid meter reading', 'Enter a valid whole number.');
        return;
      }

      if (lastMeterReading !== null && meterValue < lastMeterReading) {
        Alert.alert(
          'Meter reading too low',
          `New reading cannot be lower than the last reading of ${formatMeter(lastMeterReading)}.`
        );
        return;
      }
    }

    if (!selected.has_meter && meterReading.trim()) {
      Alert.alert(
        'Meter not applicable',
        'This vehicle is not set up to use meter readings.'
      );
      return;
    }

    if(!issueUnplanned){
      if(issueMode==='TRIP' && (splits.length!==1 || !visiblePlannedJobs.some(j=>planKey(j)===splits[0].key && j.budget_trip_count!==null && j.trips_issued<Math.floor(j.budget_trip_count) && j.trip_litres_per_trip!==null && Math.abs(Number(splits[0].litres)-j.trip_litres_per_trip)<0.001))){
        Alert.alert('One trip only','Select one job with a remaining trip and issue exactly its trip allowance.');return;
      }
      if(splits.some(x=>!visiblePlannedJobs.some(j=>planKey(j)===x.key))){
        Alert.alert('Wrong vehicle class','Select a planned job valid for this vehicle.');return;
      }
      if(!splits.length||splits.some(x=>!x.key||!Number.isFinite(Number(x.litres))||Number(x.litres)<=0)){
        Alert.alert('Planned jobs required','Select a job and litres for every row, or mark issue as unplanned.');return;
      }
      if(new Set(splits.map(x=>x.key)).size!==splits.length){
        Alert.alert('Duplicate planned job','Combine litres into one row per job.');return;
      }
      if(Math.abs(splitTotal-qty)>0.001){
        Alert.alert('Allocation mismatch',`The planned jobs total ${splitTotal} L; the issue is ${qty} L.`);return;
      }
    }
    setSaving(true);

    const { data: dash, error: dashError } = await supabase.rpc('fuel_dashboard', {
      p_today: todayISO,
    });

    if (dashError) {
      setSaving(false);
      Alert.alert('Stock check failed', dashError.message);
      return;
    }

    const currentStock = Number((dash as DashboardForStock)?.current_stock ?? 0);

    if (qty > currentStock) {
      setSaving(false);
      Alert.alert(
        'Insufficient stock',
        `Available stock is ${currentStock.toFixed(0)} L`
      );
      return;
    }

    const result = issueUnplanned
      ? await supabase.from('fuel_issue').insert({
          fuel_issue_date:todayISO,vehicle_id:vehicleId,fuel_issued:qty,
          meter_reading:selected.has_meter?meterValue:null,
          notes:'[UNPLANNED] '+notes.trim(),
        })
      : await supabase.rpc('create_planned_fuel_issue',{
          p_date:todayISO,p_vehicle_id:vehicleId,p_litres:qty,
          p_meter_reading:selected.has_meter?meterValue:null,p_notes:notes.trim(),
          p_allocations:splits.map(x=>{
            const job=plannedJobs.find(j=>planKey(j)===x.key)!;
            return {week_start:job.week_start,tracecode_id:job.tracecode_id,
              vehicle_job_id:job.vehicle_job_id,target_dap:job.target_dap,
              sequence_no:job.sequence_no,litres:Number(x.litres),kind:issueMode};
          }),
        });
    const {error}=result;

    setSaving(false);

    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }

    Alert.alert('Saved', 'Fuel issue captured.');
    router.back();
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={styles.small}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <JsplModuleHeader title="Fuel Issue" />
      <ThemedText type="title">Fuel Issue</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Date</ThemedText>
        <ThemedText style={styles.locked}>{formatJsplDate(todayISO)} (today)</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Vehicle</ThemedText>

        {vehicles.length === 0 ? (
          <ThemedText style={styles.small}>No active vehicles found.</ThemedText>
        ) : (
          <View style={styles.pickerBox}>
            <Picker
              selectedValue={vehicleId}
              onValueChange={(val) => setVehicleId(val == null ? null : Number(val))}
              enabled={!saving}
            >
              {vehicles.map((v) => (
                <Picker.Item
                  key={v.vehicle_id}
                  label={v.vehicle_name}
                  value={v.vehicle_id}
                />
              ))}
            </Picker>
          </View>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">{planEligible ? 'Planned Job Allocation' : 'Unplanned Fuel Issue'}</ThemedText>
        <ThemedText style={styles.small}>Vehicle check: {selectedVehicle?.vehicle_name ?? 'No vehicle matched'} • Type {String(selectedVehicle?.vehicle_type_id ?? 'missing')} • Class {String(selectedVehicle?.tractor_class_id ?? 'missing')} • {planEligible ? 'PLANNED ELIGIBLE' : 'UNPLANNED ONLY'}</ThemedText>
        {planEligible ? <ThemedText style={styles.small}>Select jobs from weekly planning. Fuel may be divided across multiple jobs.</ThemedText> : null}
        {planEligible ? (
          <Pressable style={styles.secondaryBtn} disabled={saving} onPress={()=>setUnplanned(x=>!x)}>
            <ThemedText>{unplanned?'Unplanned issue ✓ (tap for planned)':'Planned issue ✓ (tap for unplanned)'}</ThemedText>
          </Pressable>
        ) : <ThemedText style={styles.small}>Unplanned issue — this vehicle is not a tractor, harvester or truck.</ThemedText>}
        {planEligible && !unplanned ? (
          <View style={{gap:10}}>
            {planLoading ? <ActivityIndicator/> : null}
            {!planLoading&&visiblePlannedJobs.length===0?
              <ThemedText style={styles.small}>No selected weekly jobs in the current window. Select work in Weekly Planning or mark this issue Unplanned.</ThemedText>:null}
            <View style={{flexDirection:'row',gap:8}}>
              <Pressable style={[styles.secondaryBtn,{flex:1}]} disabled={saving} onPress={()=>{setIssueMode('WORK');setSplits([{key:'',litres:''}]);setLitres('');}}>
                <ThemedText>{issueMode==='WORK'?'✓ Field Work':'Field Work'}</ThemedText>
              </Pressable>
              <Pressable style={[styles.secondaryBtn,{flex:1}]} disabled={saving} onPress={()=>{setIssueMode('TRIP');setSplits([{key:'',litres:''}]);setLitres('');}}>
                <ThemedText>{issueMode==='TRIP'?'✓ One Trip':'One Trip'}</ThemedText>
              </Pressable>
            </View>
            {splits.map((split,i)=>{
              const job=visiblePlannedJobs.find(j=>planKey(j)===split.key);
              return <View key={i} style={{gap:6}}>
                <ThemedText style={styles.small}>Job {i+1}</ThemedText>
                <View style={styles.pickerBox}>
                  <Picker selectedValue={split.key} enabled={!saving} onValueChange={key=>{
                    const chosen=visiblePlannedJobs.find(j=>planKey(j)===key);
                    const tripLitres=issueMode==='TRIP'&&chosen?.trip_litres_per_trip!=null?String(chosen.trip_litres_per_trip):'';
                    setSplits(old=>old.map((r,n)=>n===i?{...r,key,litres:issueMode==='TRIP'?tripLitres:r.litres}:r));
                    if(issueMode==='TRIP')setLitres(tripLitres);
                  }}>
                    <Picker.Item label="Select planned job..." value=""/>
                    {visiblePlannedJobs.map(j=><Picker.Item key={planKey(j)}
                      label={`${j.tracecode_name} • ${j.vehicle_job_name} • DAP ${j.target_dap} • ${j.week_start}`}
                      value={planKey(j)}/>)}
                  </Picker>
                </View>
                {job?<View style={{gap:4}}>
                  <ThemedText style={styles.small}>Area: {job.effective_hectares?.toFixed(2) ?? '—'} ha • Field rate: {job.standard_l_per_ha?.toFixed(2) ?? 'N/A'} L/ha</ThemedText>
                  <ThemedText style={styles.small}>Field work: {job.budget_work_litres?.toFixed(1) ?? '—'} L</ThemedText>
                  <ThemedText style={styles.small}>Relocation / trips: {job.budget_trip_count?.toFixed(1) ?? '—'} trips × {job.trip_litres_per_trip?.toFixed(2) ?? '—'} L/trip = {job.budget_trip_litres?.toFixed(1) ?? '—'} L</ThemedText>
                  <ThemedText style={styles.small}>Trips issued: {job.trips_issued} • Remaining: {Math.max(0,Math.floor(job.budget_trip_count??0)-job.trips_issued)}</ThemedText>
                  <ThemedText style={styles.small}>Field work issued: {job.work_issued.toFixed(1)} L • Field work remaining: {job.budget_work_litres==null?'—':(job.budget_work_litres-job.work_issued-(issueMode==='WORK'?(Number(split.litres)||0):0)).toFixed(1)+' L'}</ThemedText>
                  <ThemedText style={styles.small}>Trip fuel issued: {job.trip_issued_litres.toFixed(1)} L • Trip fuel remaining: {job.budget_trip_litres==null?'—':(job.budget_trip_litres-job.trip_issued_litres-(issueMode==='TRIP'?(Number(split.litres)||0):0)).toFixed(1)+' L'}</ThemedText>
                  <ThemedText style={styles.small}>Total budget: {job.budget?.toFixed(1) ?? '—'} L • Previously issued: {job.issued.toFixed(1)} L</ThemedText>
                </View>:null}
                <TextInput style={styles.input} value={split.litres}
                  onChangeText={litres=>setSplits(old=>old.map((r,n)=>n===i?{...r,litres}:r))}
                  placeholder="Litres for this job" keyboardType="numeric" editable={!saving && issueMode==='WORK'}/>
                {splits.length>1?<Pressable onPress={()=>setSplits(old=>old.filter((_,n)=>n!==i))} disabled={saving}>
                  <ThemedText style={styles.small}>Remove job</ThemedText>
                </Pressable>:null}
              </View>;
            })}
            {issueMode==='WORK' ? <Pressable style={styles.secondaryBtn} onPress={()=>setSplits(old=>[...old,{key:'',litres:''}])} disabled={saving}>
              <ThemedText>+ Add another planned job</ThemedText>
            </Pressable> : null}
            <ThemedText style={styles.small}>Allocated to planned jobs: {splitTotal.toFixed(1)} L</ThemedText>
            <Pressable onPress={loadPlannedJobs} disabled={saving}><ThemedText style={styles.small}>Refresh planned jobs</ThemedText></Pressable>
          </View>
        ):<ThemedText style={styles.small}>This issue will be flagged as unplanned and can be allocated later.</ThemedText>}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Fuel Issued (Litres)</ThemedText>
        <TextInput
          style={styles.input}
          value={litres}
          onChangeText={setLitres}
          placeholder="Enter litres"
          keyboardType="numeric"
          editable={!saving && (issueMode==='WORK' || issueUnplanned)}
        />
        <ThemedText style={styles.small}>
          This will be blocked if it exceeds current stock.
        </ThemedText>
      </ThemedView>

      {showMeter ? (
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">{meterLabel}</ThemedText>

          {lastMeterReading !== null ? (
            <ThemedText style={styles.small}>
              Last reading: {formatMeter(lastMeterReading)}
            </ThemedText>
          ) : (
            <ThemedText style={styles.small}>
              No previous meter reading found.
            </ThemedText>
          )}

          <TextInput
            style={styles.input}
            value={meterReading}
            onChangeText={(text) => {
              setMeterReading(text.replace(/[^0-9]/g, ''));
            }}
            placeholder={
              selectedVehicle?.meter_type === 'KM'
                ? 'Enter current KM'
                : 'Enter current hours'
            }
            keyboardType="numeric"
            editable={!saving}
          />

          {meterDelta !== null ? (
            <ThemedText style={styles.small}>
              Since last: {formatMeter(meterDelta)}
            </ThemedText>
          ) : null}
        </ThemedView>
      ) : null}

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Notes (optional)</ThemedText>
        <TextInput
          style={styles.input}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. Potato spraying - Field 12"
          editable={!saving}
        />
      </ThemedView>

      <Pressable
        style={[styles.button, saving ? styles.buttonDisabled : null]}
        onPress={saveFuelIssue}
        disabled={saving}
      >
        <ThemedText style={styles.buttonText}>
          {saving ? 'Saving…' : 'Save Fuel Issue'}
        </ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.replace('/(tabs)/fuel')}
        disabled={saving}
      >
        <ThemedText style={styles.buttonText}>Cancel</ThemedText>
      </Pressable>

      <Pressable style={styles.link} onPress={loadVehicles} disabled={saving}>
        <ThemedText style={styles.small}>Reload vehicles</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  small: { opacity: 0.75 },
  locked: { fontSize: 16, opacity: 0.9 },

  pickerBox: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },

  button: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  secondaryBtn: {borderWidth:1,borderRadius:12,paddingVertical:9,alignItems:'center'},
  buttonText: { fontSize: 16 },

  link: { alignItems: 'center', paddingVertical: 6 },
});