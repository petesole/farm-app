// app/(tabs)/home/fuel_admin_home.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

function norm(s: string | null | undefined) {
  return (s ?? "").toString().trim().toLowerCase();
}

export default function FuelAdminHomeScreen() {
  const [loading, setLoading] = useState(true);
  const [roleName, setRoleName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const storedRole = await AsyncStorage.getItem("role");
        setRoleName(norm(storedRole) || null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={styles.small}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (roleName !== "admin") {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Fuel Admin</ThemedText>
        <ThemedText style={styles.error}>Access denied. Admin only.</ThemedText>

        <Pressable style={styles.button} onPress={() => router.back()}>
          <ThemedText style={styles.buttonText}>Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Fuel Admin</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText style={styles.small}>
          Admin correction tools for historical fuel records.
        </ThemedText>
      </ThemedView>

      <ThemedText style={styles.heading}>Corrections</ThemedText>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_dip_edit" as any)}
      >
        <ThemedText style={styles.buttonText}>Fuel Dip Edit</ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_issue_edit" as any)}
      >
        <ThemedText style={styles.buttonText}>Fuel Issue Edit</ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_received_edit" as any)}
      >
        <ThemedText style={styles.buttonText}>Fuel Received Edit</ThemedText>
      </Pressable>

      <ThemedText style={styles.heading}>Budget Management</ThemedText>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_budget_manage" as any)}
      >
        <ThemedText style={styles.buttonText}>Fuel Budgets</ThemedText>
      </Pressable>

      <ThemedText style={styles.heading}>Planning</ThemedText>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_planning" as any)}
      >
        <ThemedText style={styles.buttonText}>Fuel Planning</ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_weekly_plan" as any)}
      >
        <ThemedText style={styles.buttonText}>Weekly Fuel Planning</ThemedText>
      </Pressable>

      <ThemedText style={styles.heading}>Daily Functions</ThemedText>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_issue")}
      >
        <ThemedText style={styles.buttonText}>Fuel Issue</ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_received")}
      >
        <ThemedText style={styles.buttonText}>Fuel Received</ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_unallocated")}
      >
        <ThemedText style={styles.buttonText}>Fuel Unallocated</ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_report")}
      >
        <ThemedText style={styles.buttonText}>Fuel Report</ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_field_report" as any)}
      >
        <ThemedText style={styles.buttonText}>Fuel Report per Field</ThemedText>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push("/(tabs)/home/fuel_monthly_allocations" as any)}
      >
        <ThemedText style={styles.buttonText}>Monthly Allocations</ThemedText>
      </Pressable>

      <Pressable style={styles.button} onPress={() => router.back()}>
        <ThemedText style={styles.buttonText}>Back</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 12,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 18,
  },

  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },

  heading: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },

  small: {
    opacity: 0.75,
  },

  button: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },

  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },

  error: {
    color: "red",
  },
});