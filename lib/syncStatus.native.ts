import { db, hasLocalDb } from "@/lib/localdb.native";

export function getPendingSyncCount(): number {
  if (!hasLocalDb()) return 0;
  const row = db.getFirstSync<{ c: number }>("select count(*) as c from sync_queue");
  return row?.c ?? 0;
}
