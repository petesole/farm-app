// lib/sync.web.ts
export async function syncNow(): Promise<{ synced: number; failed: number }> {
  // Web: no local sync queue (Supabase is live)
  return { synced: 0, failed: 0 };
}
