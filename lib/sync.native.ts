import { db, hasLocalDb } from "@/lib/localdb.native";
import { supabase } from "@/supabase";

type QueueRow = {
  id: number;
  table_name: string;
  record_id: string;
  payload: string;
  tries: number;
  last_error: string | null;
};

export async function syncNow(): Promise<{ synced: number; failed: number }> {
  if (!hasLocalDb()) return { synced: 0, failed: 0 };

  const rows = db.getAllSync<QueueRow>("select * from sync_queue order by id asc");

  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    let payload: any;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      db.runSync("delete from sync_queue where id = ?", [row.id]);
      failed += 1;
      continue;
    }

    try {
      const { error } = await supabase.from(row.table_name).upsert(payload);

      if (!error) {
        db.runSync("delete from sync_queue where id = ?", [row.id]);
        synced += 1;
      } else {
        db.runSync(
          "update sync_queue set tries = tries + 1, last_error = ? where id = ?",
          [error.message, row.id]
        );
        failed += 1;
      }
    } catch (e: any) {
      db.runSync(
        "update sync_queue set tries = tries + 1, last_error = ? where id = ?",
        [e?.message ?? "Unknown sync error", row.id]
      );
      failed += 1;
    }
  }

  return { synced, failed };
}
