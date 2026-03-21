import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "@/supabase";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

export default function PendingAccessScreen() {
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
    })();
  }, []);

  async function logout() {
    try {
      await supabase.auth.signOut();
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Logout failed", e?.message ?? "Could not log out.");
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.card}>
        <ThemedText type="title">Access Pending</ThemedText>

        <ThemedText style={styles.body}>
          Your account is logged in, but you don’t have permission to use the system yet.
        </ThemedText>

        <ThemedText style={styles.body}>
          Please contact management to approve your role.
        </ThemedText>

        {email ? (
          <ThemedText style={styles.small}>
            Logged in as: <ThemedText style={{ fontWeight: "800" }}>{email}</ThemedText>
          </ThemedText>
        ) : null}

        <ThemedText style={styles.small}>
          Management will assign one of these roles: Admin, Manager, Fuel, Irrigation, or Scouting.
        </ThemedText>

        <Pressable style={styles.btn} onPress={logout}>
          <ThemedText style={styles.btnText}>Logout</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center" },
  card: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.25)",
  },
  body: { marginTop: 10, opacity: 0.85, fontSize: 16, lineHeight: 22 },
  small: { marginTop: 12, opacity: 0.7, fontSize: 13, lineHeight: 18 },
  btn: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
  },
  btnText: { fontWeight: "800" },
});