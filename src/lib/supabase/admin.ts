import "server-only";
import { createClient } from "@supabase/supabase-js";
import { adminSecret, AdminAccountError } from "@/lib/admin-accounts";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new AdminAccountError(503, "Supabase is not configured.");
  return createClient(url, adminSecret(process.env), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
