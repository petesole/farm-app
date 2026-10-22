import { supabase } from "../../supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

export default function TabsLayout() {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let alive = true;

    async function checkAuth() {
      try {
        const raw = await AsyncStorage.getItem("app_user");
        const role = await AsyncStorage.getItem("role");

        if (!alive) return;
        if (Platform.OS === "web") { const {data: session} = await supabase.auth.getUser(); if (!alive) return; setLoggedIn(!!session.user); } else { setLoggedIn(!!raw && !!role); }
      } catch {
        if (!alive) return;
        setLoggedIn(false);
      } finally {
        if (alive) setReady(true);
      }
    }

    checkAuth();

    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!loggedIn) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs initialRouteName="field-dashboard" screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="field-dashboard" options={{ title: "Fields" }} />
      <Tabs.Screen name="wb-admin" options={{ title: "Weighbridge", href: Platform.OS === "web" ? "/wb-admin" : null }} />
      <Tabs.Screen name="fuel" options={{ title: "Fuel" }} />
      <Tabs.Screen
        name="irrigation_main_dashboard"
        options={{ title: "Irrigation" }}
      />
      <Tabs.Screen name="scouting" options={{ title: "Scouting" }} />
    </Tabs>
  );
}