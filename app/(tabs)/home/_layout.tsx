import { Stack, router } from "expo-router";
import { Pressable, Text } from "react-native";

export default function HomeStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="rainfall/rainfall_index"
        options={{
          headerShown: true,
          title: "Rainfall",
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/(tabs)/home/rainfall/rainfall_record")}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ fontWeight: "900" }}>Record</Text>
            </Pressable>
          ),
        }}
      />

      <Stack.Screen
        name="rainfall/rainfall_record"
        options={{
          headerShown: true,
          title: "Record Rainfall",
        }}
      />

      <Stack.Screen
        name="rainfall/rainfall_edit"
        options={{
          headerShown: true,
          title: "Rainfall History",
        }}
      />

      <Stack.Screen name="tracecode-new" />
      <Stack.Screen name="tracecode-edit" />
      <Stack.Screen name="control-panel" />
      <Stack.Screen name="crop-dashboard" />
      <Stack.Screen name="crop-edit" />
      <Stack.Screen name="variety-dashboard" />
      <Stack.Screen name="variety-edit" />
      <Stack.Screen name="farm-dashboard" />
      <Stack.Screen name="farm-edit" />
      <Stack.Screen name="field-master-dashboard" />
      <Stack.Screen name="field-edit" />
      <Stack.Screen name="season-dashboard" />
      <Stack.Screen name="season-edit" />
      <Stack.Screen name="irrigation-dashboard" />
      <Stack.Screen name="irrigation-edit" />
      <Stack.Screen name="rain-gauge-dashboard" />
      <Stack.Screen name="rain-gauge-edit" />
      <Stack.Screen name="field-classification-dashboard" />
      <Stack.Screen name="field-classification-edit" />
      <Stack.Screen name="zesa-point-dashboard" />
      <Stack.Screen name="zesa-point-edit" />
    </Stack>
  );
}