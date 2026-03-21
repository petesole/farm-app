import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "@/supabase";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";

type RoleName = "admin" | "manager" | "viewer" | "irrigation";

function norm(s: string) {
  return s.trim().toLowerCase();
}

function RolePill(props: { label: RoleName; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.pill, props.active && styles.pillActive]}
    >
      <ThemedText style={[styles.pillText, props.active && styles.pillTextActive]}>
        {props.label.toUpperCase()}
      </ThemedText>
    </Pressable>
  );
}

export default function UserManagementScreen() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [roleName, setRoleName] = useState<RoleName>("viewer");
  const [sending, setSending] = useState(false);

  const cleanEmail = useMemo(() => norm(email), [email]);

  useEffect(() => {
    (async () => {
      try {
        setChecking(true);

        const { data: authRes, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw new Error(authErr.message);

        const uid = authRes.user?.id;
        if (!uid) {
          setIsAdmin(false);
          return;
        }

        const { data, error } = await supabase
          .from("app_user_role")
          .select("role_name")
          .eq("user_id", uid)
          .maybeSingle();

        if (error) throw new Error(error.message);

        const r = norm((data?.role_name ?? "") as string);
        setIsAdmin(r === "admin");

        if (r !== "admin") {
          Alert.alert("Access denied", "Admin only.");
          router.back();
        }
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to check role");
        router.back();
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  async function invite() {
    if (!isAdmin) return;

    const em = cleanEmail;
    if (!em || !em.includes("@")) {
      Alert.alert("Check email", "Please enter a valid email address.");
      return;
    }

    try {
      setSending(true);

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email: em, role_name: roleName },
      });

      if (error) {
        Alert.alert("Invite failed", error.message);
        return;
      }

      Alert.alert("Invite sent", `${data?.email ?? em} invited as ${data?.role_name ?? roleName}.`);
      setEmail("");
      setRoleName("viewer");
    } catch (e: any) {
      Alert.alert("Invite failed", e?.message ?? "Unknown error");
    } finally {
      setSending(false);
    }
  }

  if (checking) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
        <ThemedText style={{ marginTop: 10, opacity: 0.7 }}>Checking admin…</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Users</ThemedText>
      <ThemedText style={{ opacity: 0.7, marginTop: 6 }}>
        Invite a new user by email and assign their role.
      </ThemedText>

      <View style={styles.card}>
        <ThemedText style={styles.label}>Email</ThemedText>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="name@company.com"
          placeholderTextColor="rgba(120,120,120,0.8)"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={styles.input}
        />

        <ThemedText style={[styles.label, { marginTop: 14 }]}>Role</ThemedText>
        <View style={styles.pillRow}>
          {(["viewer", "irrigation", "manager", "admin"] as RoleName[]).map((r) => (
            <RolePill key={r} label={r} active={roleName === r} onPress={() => setRoleName(r)} />
          ))}
        </View>

        <Pressable
          onPress={invite}
          disabled={!isAdmin || sending}
          style={[styles.primaryBtn, (sending || !isAdmin) && { opacity: 0.6 }]}
        >
          {sending ? (
            <ActivityIndicator />
          ) : (
            <ThemedText style={styles.primaryBtnText}>Send Invite</ThemedText>
          )}
        </Pressable>

        <ThemedText style={{ opacity: 0.6, marginTop: 12 }}>
          The user will receive an email invite. After they accept, they can sign in and their role
          will already be set.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.25)",
    borderRadius: 14,
    padding: 14,
  },

  label: { opacity: 0.75, fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pillActive: { backgroundColor: "#111" },
  pillText: { fontWeight: "800", opacity: 0.8 },
  pillTextActive: { color: "#fff", opacity: 1 },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: "#111",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
});