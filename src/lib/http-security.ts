import { inspectDeployment, type DeploymentEnv } from "./deployment";

export const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";
export function preventSessionCaching(headers: Headers) {
  headers.set("Cache-Control", NO_STORE); headers.set("Pragma", "no-cache"); headers.set("Expires", "0");
  const vary = headers.get("Vary")?.split(",").map((entry) => entry.trim()) || [];
  if (!vary.some((entry) => entry.toLowerCase() === "cookie")) headers.set("Vary", [...vary, "Cookie"].join(", "));
}

export function securityHeaders(env: DeploymentEnv, production: boolean) {
  const { supabaseOrigin } = inspectDeployment(env, production);
  const connections = ["'self'"];
  if (supabaseOrigin) connections.push(supabaseOrigin, supabaseOrigin.replace(/^http/, "ws"));
  if (!production) connections.push("ws://localhost:*", "ws://127.0.0.1:*");
  // Static-compatible policy: Next hydration and existing inline chart styles need unsafe-inline.
  // Production never enables unsafe-eval. Strict nonce CSP would require dynamic rendering.
  const csp = ["default-src 'self'", `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'", `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    `connect-src ${connections.join(" ")}`, "font-src 'self' data:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(production ? ["upgrade-insecure-requests"] : [])].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp }, { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
  ];
}
