import { Stack } from "expo-router";

export default function HomeStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
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