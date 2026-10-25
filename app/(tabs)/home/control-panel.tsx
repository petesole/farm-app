import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

function Tile(props: { title: string; subtitle?: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.tile}>
      <ThemedText type="subtitle">{props.title}</ThemedText>
      {props.subtitle ? (
        <ThemedText style={styles.sub}>{props.subtitle}</ThemedText>
      ) : null}
    </Pressable>
  );
}

export default function ControlPanelScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Control Panel</ThemedText>
      <ThemedText style={styles.description}>
        Manage your master data and system settings.
      </ThemedText>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.grid}>
          <Tile
            title="Contracts"
            subtitle="Add, edit and activate contracts"
            onPress={() => router.push({pathname:"/(tabs)/field-control-list",params:{kind:"contract"}})}
          />

          {/* ✅ Users (Invite + Roles) */}
          <Tile
            title="Users"
            subtitle="Invite users and assign roles"
            onPress={() => router.push("/(tabs)/home/user-management")}
          />

          <Tile
            title="Crops"
            subtitle="Crop list + prices/yields"
            onPress={() => router.push("/(tabs)/home/crop-dashboard")}
          />

          <Tile
            title="Varieties"
            subtitle="Varieties per crop"
            onPress={() => router.push("/(tabs)/home/variety-dashboard")}
          />

          <Tile
            title="Farms"
            subtitle="Farm names"
            onPress={() => router.push("/(tabs)/home/farm-dashboard")}
          />

          <Tile
            title="Fields"
            subtitle="Fields per farm"
            onPress={() => router.push("/(tabs)/home/field-master-dashboard")}
          />

          <Tile
            title="Irrigation Types"
            subtitle="Irrigation type list"
            onPress={() => router.push("/(tabs)/home/irrigation-dashboard")}
          />

          <Tile
            title="Seasons"
            subtitle="Season list"
            onPress={() => router.push("/(tabs)/home/season-dashboard")}
          />
        </View>

        <ThemedText style={styles.note}>
          Note: If a dashboard doesn’t exist yet, we’ll create it next.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  description: {
    opacity: 0.7,
    marginTop: 6,
  },
  grid: {
    marginTop: 14,
    gap: 10,
  },
  tile: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.25)",
    borderRadius: 14,
    padding: 14,
  },
  sub: {
    opacity: 0.7,
    marginTop: 6,
  },
  note: {
    opacity: 0.6,
    marginTop: 14,
  },
});