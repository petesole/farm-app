import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { supabase } from "@/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

function norm(s: string | null | undefined) {
  return (s ?? "").toString().trim().toLowerCase();
}

function landingForRole(roleName: string) {
  const r = norm(roleName);

  if (r === "admin" || r === "manager") return "/(tabs)/field-dashboard";
  if (r === "fuel" || r === "viewer") return "/(tabs)/fuel";
  if (r === "irrigation") return "/(tabs)/irrigation_main_dashboard";
  if (r === "scouting" || r === "scout" || r === "scouter") {
    return "/(tabs)/scouting";
  }

  return "/login";
}

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const canSubmit = useMemo(() => {
    return norm(username).length > 0 && password.length > 0 && !busy;
  }, [username, password, busy]);

  async function onLogin() {
    try {
      setBusy(true);
      setStatus("Signing in...");

      const u = norm(username);
      const p = password;

      const { data, error } = await supabase
        .from("login")
        .select("user_id, username, role, active")
        .eq("username", u)
        .eq("password", p)
        .eq("active", true)
        .maybeSingle();

      if (error) {
        setStatus(`Login error: ${error.message}`);
        return;
      }

      if (!data) {
        setStatus("Invalid username or password.");
        return;
      }

      const role = norm(data.role);

      await AsyncStorage.setItem(
        "app_user",
        JSON.stringify({
          user_id: data.user_id,
          username: data.username,
          role,
        })
      );

      await AsyncStorage.setItem("role", role);

      router.replace(landingForRole(role));
    } catch (e: any) {
      setStatus(`Login exception: ${e?.message ?? "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Login</ThemedText>

      <View style={{ height: 14 }} />

      <ThemedText style={styles.label}>Username</ThemedText>
      <TextInput
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        placeholder="username"
      />

      <View style={{ height: 10 }} />

      <ThemedText style={styles.label}>Password</ThemedText>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        placeholder="password"
      />

      <View style={{ height: 16 }} />

      <Pressable
        disabled={!canSubmit}
        onPress={onLogin}
        style={[styles.btn, !canSubmit && { opacity: 0.5 }]}
      >
        {busy ? (
          <ActivityIndicator />
        ) : (
          <ThemedText style={styles.btnText}>Sign In</ThemedText>
        )}
      </Pressable>

      {status ? <ThemedText style={styles.status}>{status}</ThemedText> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  label: {
    opacity: 0.7,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.4)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(150,150,150,0.4)",
  },
  btnText: {
    fontWeight: "700",
  },
  status: {
    marginTop: 14,
    opacity: 0.8,
  },
});