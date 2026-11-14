// Supabase SSR server client; used by confirmation and PKCE callback routes.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. See .env.example.");
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(values) {
        // These clients are created in Route Handlers, where cookie writes are supported.
        // A failed write must fail the Auth flow rather than report a session that was not saved.
        values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
