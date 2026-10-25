import { supabase } from "../../supabase";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

export default function TabsLayout() {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canFuel, setCanFuel] = useState(false);

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
        const assigned = !rolesError && Array.isArray(roles) ? roles.map((r: string) => String(r).trim().toLowerCase()) : [];
        const admin = assigned.includes('admin');
        const fuelAccess = admin || assigned.includes('manager') || assigned.includes('fuel');
        setIsAdmin(admin);
        setCanFuel(fuelAccess);
        setLoggedIn(admin || fuelAccess);
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
    <Tabs initialRouteName={isAdmin ? "main-dashboard" : "fuel"} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="main-dashboard" options={{ title: "Main", href: isAdmin ? "/main-dashboard" : null }} />
      <Tabs.Screen name="field-dashboard" options={{ title: "Fields", href: isAdmin ? "/field-dashboard" : null }} />
      <Tabs.Screen name="wb-admin" options={{ title: "Weighbridge", href: isAdmin && Platform.OS === "web" ? "/wb-admin" : null }} />
      <Tabs.Screen name="fuel" options={{ title: "Fuel", href: canFuel ? "/fuel" : null }} />
      <Tabs.Screen name="stock-test" options={{ href: null }} />
      <Tabs.Screen name="cashbook" options={{ href: null }} />
      <Tabs.Screen
        name="irrigation_main_dashboard"
        options={{ href: null }}
      />
      <Tabs.Screen name="scouting" options={{ href: null }} />
    </Tabs>
  );
}