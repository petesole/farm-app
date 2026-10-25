import { supabase } from "../../supabase";
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
        // A cached UI role is not proof of authentication.
        const { data: session, error: userError } = await supabase.auth.getUser();
        if (!alive) return;
        if (userError || !session.user) {
          setLoggedIn(false);
          return;
        }
        const { data: roles, error: rolesError } = await supabase.rpc("my_farm_app_roles");
        if (!alive) return;
        setLoggedIn(!rolesError && Array.isArray(roles) && roles.length > 0);
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
      <Tabs.Screen name="stock-test" options={{ title: "Stock V2", href: Platform.OS === "web" ? "/stock-test" : null }} />
      <Tabs.Screen name="cashbook" options={{ title: "Cashbook", href: Platform.OS === "web" ? "/cashbook" : null }} />
      <Tabs.Screen
        name="irrigation_main_dashboard"
        options={{ title: "Irrigation" }}
      />
      <Tabs.Screen name="scouting" options={{ title: "Scouting" }} />
    </Tabs>
  );
}