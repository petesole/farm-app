import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import "react-native-reanimated";

import { useColorScheme } from "../hooks/use-color-scheme";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // keep your offline init, using your existing lib files
    if (Platform.OS === "web") {
      import("../lib/localdb.web")
        .then((m) => m.initLocalDb?.())
        .catch(() => {});
      return;
    }

    import("../lib/localdb.native")
      .then((m) => m.initLocalDb?.())
      .catch(() => {});
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* This hosts your tabs */}
        <Stack.Screen name="(tabs)" />

        {/* modal route at app/modal.tsx */}
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}