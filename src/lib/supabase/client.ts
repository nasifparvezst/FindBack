// Supabase browser client for verified cloud mode.
import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE, remembersSession, sessionCookieOptions } from "@/lib/session-preference";

export function setRememberSession(remember: boolean) {
  document.cookie = serializeCookieHeader(REMEMBER_COOKIE, remember ? "1" : "0", { path: "/", sameSite: "lax", secure: location.protocol === "https:", ...(remember ? { maxAge: REMEMBER_MAX_AGE } : {}) });
}

export async function startCampusGoogleSignIn(): Promise<string | undefined> {
  const failure = "Google sign-in could not start. Try again or use email and password.";
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { cache: "no-store", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "" } });
    if (!response.ok) return failure;
    const settings = await response.json();
    if (settings.external?.google !== true) return "Google sign-in is not enabled yet. Use email and password for now.";
    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { hd: "seu.edu.bd" } } });
    if (error) return failure;
  } catch { return failure; }
}

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. See .env.example.");
  return createBrowserClient(url, key, { cookies: {
    getAll() { return typeof document === "undefined" ? [] : parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" })); },
    setAll(values) {
      if (typeof document === "undefined") return;
      const remember = remembersSession(parseCookieHeader(document.cookie).find(cookie => cookie.name === REMEMBER_COOKIE)?.value);
      values.forEach(({ name, value, options }) => { document.cookie = serializeCookieHeader(name, value, sessionCookieOptions(options, remember)); });
    },
  } });
}
