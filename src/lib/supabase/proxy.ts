import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { preventSessionCaching } from "@/lib/http-security";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) { preventSessionCaching(response.headers); return response; }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookies, headers) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  // Verified signed claims; cookie existence alone never authorizes an action.
  try { await supabase.auth.getClaims(); } catch { /* Auth outages must not grant access; client getUser and database RLS remain authoritative. */ }
  preventSessionCaching(response.headers);
  return response;
}
