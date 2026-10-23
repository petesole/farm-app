// "@/supabase"  (supabase.ts)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

// Development branch: intentionally fail closed until TEST credentials are provided.
// Never default to the production project from a development build.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing TEST Supabase credentials. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in FarmingMainDev/.env.local before running dev.");
}
if (supabaseUrl.includes("azxaymxnicrsezeoxiau")) {
  throw new Error("Refusing to connect development build to JSPL production Supabase. Set TEST project credentials.");
}

const isWeb = Platform.OS === "web";
const isSSR = isWeb && typeof window === "undefined";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(isWeb ? {} : { storage: AsyncStorage }),
    autoRefreshToken: !isSSR,
    persistSession: !isSSR,
    detectSessionInUrl: isWeb && !isSSR,
  },
});