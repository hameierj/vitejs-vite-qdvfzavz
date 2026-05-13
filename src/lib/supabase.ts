import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

let _client: SupabaseClient | null = null;
try {
  _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "cx-v2-auth",
    },
  });
} catch (e) {
  console.error("[supabase] init failed:", e);
}

export const supabase = _client;

export const dbGet = async (table: string, key: string): Promise<any> => {
  if (!_client) return null;
  try {
    const { data } = await _client.from(table).select("value").eq("key", key).single();
    return data?.value ?? null;
  } catch {
    return null;
  }
};

export const dbPut = async (table: string, key: string, value: any): Promise<void> => {
  if (!_client) return;
  try {
    const { error } = await _client.from(table).upsert({ key, value }, { onConflict: "key" });
    if (error) console.error("[supabase] put error:", table, key, error.message);
  } catch (e) {
    console.error("[supabase] put failed:", table, key, e);
  }
};

export const dbDelete = async (table: string, key: string): Promise<void> => {
  if (!_client) return;
  try {
    await _client.from(table).delete().eq("key", key);
  } catch {}
};

export const dbGetAll = async (table: string, prefix: string): Promise<{ key: string; value: any }[]> => {
  if (!_client) return [];
  try {
    const { data } = await _client.from(table).select("key, value").like("key", `${prefix}%`);
    return data || [];
  } catch {
    return [];
  }
};
