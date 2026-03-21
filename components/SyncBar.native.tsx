// components/SyncBar.tsx
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet } from "react-native";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

// Use native versions directly for now (stable compile)
import { hasLocalDb } from "../lib/localdb.native";
import { syncNow } from "../lib/sync.native";
import { getPendingSyncCount } from "../lib/syncStatus.native";

export function SyncBar() {
  // If no local DB available (web or error), hide bar
  if (!hasLocalDb()) return null;

  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  function refresh() {
    try {
      setPending(getPendingSyncCount());
    } catch {
      setPending(0);
    }
  }

  async function doSync() {
    setSyncing(true);
    try {
      const res = await syncNow();
      refresh();

      if (res.failed > 0) {
        Alert.alert(
          "Sync finished",
          `Synced ${res.synced}. Failed ${res.failed}.`
        );
      } else {
        Alert.alert("Sync finished", `Synced ${res.synced}.`);
      }
    } catch (e: any) {
      Alert.alert("Sync failed", e?.message ?? "Unknown error");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);

  if (pending <= 0) return null;

  return (
    <ThemedView style={styles.bar}>
      <ThemedText style={styles.text}>
        {pending} pending sync
      </ThemedText>

      <Pressable
        onPress={doSync}
        disabled={syncing}
        style={[styles.btn, syncing && { opacity: 0.6 }]}
      >
        <ThemedText style={styles.btnText}>
          {syncing ? "Syncing…" : "Sync now"}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  text: { fontWeight: "700" },
  btn: {
    borderWidth: 1,
    borderColor: "rgba(120,120,120,0.35)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnText: { fontWeight: "700" },
});


