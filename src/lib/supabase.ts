import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when the public Supabase env vars are present. The anon key is safe to ship to browsers. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const BUCKET_ID = "studyvault";

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "StudyVault is not connected to Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file (see README)."
    );
  }
  return supabase;
}
