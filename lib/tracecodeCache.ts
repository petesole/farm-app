// lib/tracecodeCache.ts
import { supabase } from "@/supabase";
import { Platform } from "react-native";

export type CachedTracecode = {
  tracecode_id: number;
  tracecode_name: string | null;
  crop_id: number | null;
  crop_name: string | null;
  field_id: number | null;
  field_name: string | null;
};

// Helper: only loads localdb on native
async function getLocalDb() {
  if (Platform.OS === "web") return null;
  const mod = await import("@/lib/localdb");
  if (!mod.hasLocalDb()) return null;
  return mod.db;
}

export async function getLocalActiveTracecodes(): Promise<CachedTracecode[]> {
  const db = await getLocalDb();
  if (!db) return [];

  return db.getAllSync<CachedTracecode>(`
    select
      tracecode_id,
      tracecode_name,
      crop_id,
      crop_name,
      field_id,
      field_name
    from tracecode_local
    order by crop_name, tracecode_name
  `);
}

export async function getTracecodeLastRefresh(): Promise<string | null> {
  const db = await getLocalDb();
  if (!db) return null;

  const row = db.getFirstSync<{ v: string }>(
    "select v from app_kv where k = ?",
    ["tracecode_last_refresh"]
  );
  return row?.v ?? null;
}

export async function refreshActiveTracecodesFromSupabase(): Promise<{ count: number }> {
  // Web uses Supabase directly (no local cache)
  const db = await getLocalDb();
  if (!db) return { count: 0 };

  const res = await supabase
    .from("v_scouting_active_tracecodes")
    .select("tracecode_id, tracecode_name, crop_id, crop_name, field_id, field_name")
    .order("crop_name", { ascending: true })
    .order("tracecode_name", { ascending: true });

  if (res.error) throw new Error(res.error.message);

  const rows = (res.data ?? []) as CachedTracecode[];
  const nowIso = new Date().toISOString();

  db.execSync("begin;");
  try {
    db.execSync("delete from tracecode_local;");

    for (const r of rows) {
      db.runSync(
        `insert into tracecode_local
          (tracecode_id, tracecode_name, crop_id, crop_name, field_id, field_name, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
        [
          r.tracecode_id,
          r.tracecode_name ?? null,
          r.crop_id ?? null,
          r.crop_name ?? null,
          r.field_id ?? null,
          r.field_name ?? null,
          nowIso,
        ]
      );
    }

    db.runSync("insert or replace into app_kv (k, v) values (?, ?)", [
      "tracecode_last_refresh",
      nowIso,
    ]);

    db.execSync("commit;");
  } catch (e) {
    db.execSync("rollback;");
    throw e;
  }

  return { count: rows.length };
}
