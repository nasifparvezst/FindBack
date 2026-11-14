export type DeploymentEnv = Record<string, string | undefined>;
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function deploymentOrigin(value: string, name: string, production: boolean): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid origin.`); }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback.has(url.hostname) && !production))) {
    throw new Error(`${name} must be an HTTPS origin without credentials, a path or query. HTTP loopback is allowed only in development.`);
  }
  return url.origin;
}

export function isPublicSupabaseKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replaceAll("-", "+").replaceAll("_", "/"))) as { role?: string };
    return payload.role === "anon";
  } catch { return false; }
}

/** Validates configuration without returning/logging keys or other environment values. */
export function inspectDeployment(env: DeploymentEnv, production = false) {
  const mode = env.NEXT_PUBLIC_DEMO_MODE ?? "true";
  if (mode !== "true" && mode !== "false") throw new Error("NEXT_PUBLIC_DEMO_MODE must be exactly true or false.");
  for (const [name, value] of Object.entries(env)) {
    if (value && /^NEXT_PUBLIC_.*(?:SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD)/i.test(name)) throw new Error(`Remove the private credential from ${name}.`);
  }
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (key && !isPublicSupabaseKey(key)) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key or legacy anon key, never a secret, service-role key or user token.");
  const supabaseOrigin = env.NEXT_PUBLIC_SUPABASE_URL ? deploymentOrigin(env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL", production) : undefined;
  const appOrigin = env.APP_ORIGIN ? deploymentOrigin(env.APP_ORIGIN, "APP_ORIGIN", production) : undefined;
  if (mode === "false" && production && (!supabaseOrigin || !key || !appOrigin)) throw new Error("Cloud deployment requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and APP_ORIGIN.");
  return { mode: mode === "true" ? "demo" as const : "cloud" as const, supabaseOrigin, appOrigin };
}
