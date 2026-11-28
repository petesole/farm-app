import { supabase } from "../../supabase";
import {stockRequest} from "@/utils/stock-workflow";
import { Redirect, Tabs, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";

export default function TabsLayout() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canFuel, setCanFuel] = useState(false);
  const [canLabour, setCanLabour] = useState(false);
  const [canStock, setCanStock] = useState(false);
  const [canIrrigation, setCanIrrigation] = useState(false);
  const [canPastel, setCanPastel] = useState(false);

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
        const labourAccess = admin || assigned.includes('manager') || assigned.includes('labour');
        const irrigationAccess = admin || assigned.includes('irrigation');
        const pastelAccess = assigned.includes('pastel');
        let stockAccess=false;
        try { stockAccess=!!(await stockRequest("?stock_access=1")).access?.is_stock; } catch { /* Fail closed for Stock only. */ }
        if(!alive)return;
        setCanStock(stockAccess);
        setIsAdmin(admin);
        setCanFuel(fuelAccess);
        setCanLabour(labourAccess);
        setCanIrrigation(irrigationAccess);
        setCanPastel(pastelAccess);
        setLoggedIn(admin || fuelAccess || labourAccess || irrigationAccess || stockAccess || pastelAccess);
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

  if (canIrrigation && !isAdmin && !canFuel && !canLabour && !canStock && pathname !== "/irrigation_main_dashboard" && !pathname.startsWith("/home/irrigation/")) {
    return <Redirect href="/irrigation_main_dashboard" />;
  }

  if (canLabour && !isAdmin && !canFuel && !canStock && !canIrrigation && pathname !== "/labour") {
    return <Redirect href="/labour" />;
  }

  const pastelOnly = canPastel && !isAdmin && !canFuel && !canLabour && !canStock && !canIrrigation;
  const pastelAllowedPath = [
    "/pastel-dashboard",
    "/home/fuel_report",
    "/home/fuel_report_day",
    "/home/fuel_monthly_allocations",
  ].includes(pathname);
  if (pastelOnly && !pastelAllowedPath) {
    return <Redirect href="/pastel-dashboard" />;
  }

  return (
    <Tabs initialRouteName={isAdmin ? "main-dashboard" : canPastel && !canFuel && !canLabour && !canStock && !canIrrigation ? "pastel-dashboard" : canFuel ? "fuel" : canLabour ? "labour" : canIrrigation ? "irrigation_main_dashboard" : "stock-test"} screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}>
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="control-panel" options={{ href: null }} />
      <Tabs.Screen name="companies" options={{ href: null }} />
      <Tabs.Screen name="vehicle-management" options={{ href: null }} />
      <Tabs.Screen name="vehicle-detail" options={{ href: null }} />
      <Tabs.Screen name="vehicle-types" options={{ href: null }} />
      <Tabs.Screen name="vehicle-type-edit" options={{ href: null }} />
      <Tabs.Screen name="fields-control" options={{ href: null }} />
      <Tabs.Screen name="field-control-list" options={{ href: null }} />
      <Tabs.Screen name="field-control-detail" options={{ href: null }} />
      <Tabs.Screen name="main-dashboard" options={{ title: "Main", href: isAdmin ? "/main-dashboard" : null }} />
      <Tabs.Screen name="pastel-dashboard" options={{ title: "Pastel", href: null }} />
      <Tabs.Screen name="field-dashboard" options={{ title: "Trace", href: isAdmin ? "/field-dashboard" : null }} />
      <Tabs.Screen name="potato-market" options={{ title: "Potato Market", href: isAdmin ? "/potato-market" : null }} />
      <Tabs.Screen name="wb-admin" options={{ title: "Weighbridge", href: isAdmin && Platform.OS === "web" ? "/wb-admin" : null }} />
      <Tabs.Screen name="fuel" options={{ title: "Fuel", href: canFuel ? "/fuel" : null }} />
      <Tabs.Screen name="stock-test" options={{ href: canStock ? "/stock-test" : null }} />
      <Tabs.Screen name="labour" options={{ title: "Labour", href: canLabour && !isAdmin ? "/labour" : null }} />
      <Tabs.Screen name="cashbook" options={{ href: null }} />
      <Tabs.Screen
        name="irrigation_main_dashboard"
        options={{ href: canIrrigation && !isAdmin ? "/irrigation_main_dashboard" : null }}
      />
      <Tabs.Screen name="scouting" options={{ href: null }} />
    </Tabs>
  );
}