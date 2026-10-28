import { JsplModuleHeader } from "@/components/jspl/JsplModuleHeader";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Picker } from "@react-native-picker/picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../../supabase";

type FarmRow = { farm_id: number; farm_name: string | null; active?: boolean };
type Lookup={id:number;name:string;active:boolean};

type FieldRow = {
  field_id: number;
  field_name: string;
  farm_id: number | null;
  field_size: number | null;
  latitude: string | null;
  longitude: string | null;
  discontinued: boolean | null;
  zesa_point_id: number | null;
  rain_gauge_id: number | null;
  fuel_active: boolean | null;
  field_classification_id: number | null;
};

function toNumOrNull(s: string) {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function FieldEditScreen() {
  const { fieldId } = useLocalSearchParams<{ fieldId?: string }>();
  const isNew = fieldId === "new";

  const id = useMemo(() => {
    if (!fieldId || isNew) return null;
    const n = Number(fieldId);
    return Number.isFinite(n) ? n : null;
  }, [fieldId, isNew]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [zesaPoints,setZesaPoints]=useState<Lookup[]>([]);
  const [rainGauges,setRainGauges]=useState<Lookup[]>([]);
  const [classifications,setClassifications]=useState<Lookup[]>([]);

  // Form fields
  const [fieldName, setFieldName] = useState("");
  const [farmId, setFarmId] = useState<number | null>(null);
  const [fieldSize, setFieldSize] = useState("");
  const [soilWaterHolding,setSoilWaterHolding]=useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [zesaPointId, setZesaPointId] = useState("");
  const [rainGaugeId, setRainGaugeId] = useState("");
  const [classificationId, setClassificationId] = useState("");

  const [discontinued, setDiscontinued] = useState(false);
  const [fuelActive, setFuelActive] = useState(false);

  async function loadFarms() {
    const [f,z,r,cl]=await Promise.all([
      supabase.from("farm").select("farm_id,farm_name,active").order("farm_name"),
      supabase.from("zesa_point").select("zesa_point_id,zesa_point,active").order("zesa_point"),
      supabase.from("rain_gauge").select("rain_gauge_id,rain_gauge,active,active_from,active_to").order("rain_gauge"),
      supabase.from("field_classification").select("field_classification_id,field_classification_name,active").order("field_classification_name")
    ]);
    const error=f.error||z.error||r.error||cl.error;
    if(error)throw new Error(error.message);
    setFarms((f.data??[]) as FarmRow[]);
    setZesaPoints((z.data??[]).map(v=>({id:v.zesa_point_id,name:v.zesa_point,active:v.active!==false})));
    setRainGauges((r.data??[]).map(v=>({id:v.rain_gauge_id,name:v.rain_gauge,active:v.active!==false})));
    setClassifications((cl.data??[]).map(v=>({id:v.field_classification_id,name:v.field_classification_name,active:v.active!==false})));
  }

  async function loadField(field_id: number) {
    const res = await supabase
      .from("field")
      .select("*")
      .eq("field_id", field_id)
      .single();

    if (res.error) throw new Error(res.error.message);
    return res.data as FieldRow;
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadFarms();

        if (!isNew && id !== null) {
          const r = await loadField(id);

          setFieldName(r.field_name ?? "");
          setFarmId(r.farm_id ?? null);
          setFieldSize(r.field_size?.toString() ?? "");
          setSoilWaterHolding((r as any).soil_water_holding_pct?.toString() ?? "");
          setLatitude(r.latitude ?? "");
          setLongitude(r.longitude ?? "");
          setZesaPointId(r.zesa_point_id?.toString() ?? "");
          setRainGaugeId(r.rain_gauge_id?.toString() ?? "");
          setClassificationId(r.field_classification_id?.toString() ?? "");
          setDiscontinued(r.discontinued ?? false);
          setFuelActive(r.fuel_active ?? false);
        }
      } catch (e: any) {
        Alert.alert("Load error", e?.message ?? "Failed to load field");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  async function save() {
    if (!fieldName.trim()) {
      Alert.alert("Missing", "Field name is required.");
      return;
    }

    const payload = {
      field_name: fieldName.trim(),
      farm_id: farmId,
      field_size: toNumOrNull(fieldSize),
      soil_water_holding_pct: toNumOrNull(soilWaterHolding),
      latitude: latitude.trim() || null,
      longitude: longitude.trim() || null,
      discontinued,
      zesa_point_id: toNumOrNull(zesaPointId),
      rain_gauge_id: toNumOrNull(rainGaugeId),
      fuel_active: fuelActive,
      field_classification_id: toNumOrNull(classificationId),
    };

    try {
      setSaving(true);

      if (isNew) {
        const res = await supabase.from("field").insert(payload);
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Field created.");
      } else {
        const res = await supabase.from("field").update(payload).eq("field_id", id);
        if (res.error) throw new Error(res.error.message);
        Alert.alert("Saved", "Field updated.");
      }

      router.back();
    } catch (e: any) {
      Alert.alert("Save error", e?.message ?? "Failed to save field");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={{ marginTop: 10 }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <JsplModuleHeader title="Edit Field" />
        <ThemedText type="title">
          {isNew ? "New Field" : "Edit Field"}
        </ThemedText>

        {/* Field Name */}
        <ThemedText style={styles.label}>Field name *</ThemedText>
        <TextInput
          style={styles.input}
          value={fieldName}
          onChangeText={setFieldName}
        />

        {/* Farm */}
        <ThemedText style={styles.label}>Farm</ThemedText>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={farmId}
            onValueChange={(v) => setFarmId(v)}
          >
            <Picker.Item label="Select farm…" value={null} />
            {farms.filter(f=>f.active!==false||(!isNew&&f.farm_id===farmId)).map((f) => (
              <Picker.Item
                key={f.farm_id}
                label={f.farm_name ?? `Farm ${f.farm_id}`}
                value={f.farm_id}
              />
            ))}
          </Picker>
        </View>

        {/* Numeric / text fields */}
        <Input label="Field size (Ha)" value={fieldSize} setValue={setFieldSize} />
        <Input label="Soil water holding (%)" value={soilWaterHolding} setValue={setSoilWaterHolding} />
        <Input label="Latitude" value={latitude} setValue={setLatitude} />
        <Input label="Longitude" value={longitude} setValue={setLongitude} />
        {([
          ["ZESA point",zesaPointId,setZesaPointId,zesaPoints],
          ["Rain gauge",rainGaugeId,setRainGaugeId,rainGauges],
          ["Field classification",classificationId,setClassificationId,classifications]
        ] as [string,string,(s:string)=>void,Lookup[]][]).map(([label,value,onChange,items])=>(
          <View key={label}>
            <ThemedText style={styles.label}>{label}</ThemedText>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={value} onValueChange={onChange}>
                <Picker.Item label={"Select "+label} value=""/>
                {items.filter(item=>item.active||(!isNew&&String(item.id)===value)).map(item=>(
                  <Picker.Item key={item.id} label={item.name+(item.active?"":" (inactive)")} value={String(item.id)}/>
                ))}
              </Picker>
            </View>
          </View>
        ))}

        {/* Switches */}
        <SwitchRow label="Fuel active" value={fuelActive} setValue={setFuelActive} />
        <SwitchRow label="Discontinued" value={discontinued} setValue={setDiscontinued} />

        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>
            {saving ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

function Input({ label, value, setValue }: any) {
  return (
    <>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <TextInput style={styles.input} value={value} onChangeText={setValue} />
    </>
  );
}

function SwitchRow({ label, value, setValue }: any) {
  return (
    <View style={styles.switchRow}>
      <ThemedText>{label}</ThemedText>
      <Switch value={value} onValueChange={setValue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  label: { marginTop: 12, opacity: 0.7 },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },

  pickerWrap: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    marginTop: 6,
  },

  switchRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  saveBtn: {
    marginTop: 20,
    backgroundColor: "#111",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
});

