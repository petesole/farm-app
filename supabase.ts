// "@/supabase"  (supabase.ts)
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const supabaseUrl = "https://azxaymxnicrsezeoxiau.supabase.co";
const supabaseAnonKey = "sb_publishable_ZS4RL-MxFMNztg9M_DRdLw_ZtN_TSsy";

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