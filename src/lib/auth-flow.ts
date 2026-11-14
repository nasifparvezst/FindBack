import { deploymentOrigin } from "./deployment";

const otpTypes = ["email", "signup", "recovery", "invite", "magiclink", "email_change"] as const;
type OtpType = typeof otpTypes[number];
type AuthClient = { auth: {
  verifyOtp: (args: { token_hash: string; type: OtpType }) => PromiseLike<{ error: unknown }>;
  exchangeCodeForSession: (code: string) => PromiseLike<{ error: unknown }>;
} };
const validToken = (token: string | null): token is string => Boolean(token && token.length <= 4096 && !/[\u0000-\u0020\u007f]/.test(token));

export async function authDestination(kind: "confirm" | "callback", params: URLSearchParams, createClient: () => Promise<AuthClient>, cloud: boolean): Promise<string> {
  const failure = kind === "confirm" ? "/login?error=confirmation" : "/login?error=callback";
  if (!cloud) return failure;
  try {
    if (kind === "confirm") {
      const token = params.get("token_hash"); const type = params.get("type");
      if (!validToken(token) || !otpTypes.includes(type as OtpType)) return failure;
      const { error } = await (await createClient()).auth.verifyOtp({ token_hash: token, type: type as OtpType });
      return error ? failure : type === "recovery" ? "/reset-password" : "/login?confirmed=1";
    }
    const code = params.get("code");
    if (!validToken(code)) return failure;
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
    return error ? failure : params.get("next") === "/reset-password" ? "/reset-password" : "/my-reports";
  } catch { return failure; }
}

export function authRedirectUrl(path: string, requestUrl: string, configuredOrigin?: string): URL {
  const paths = new Set(["/login?error=confirmation", "/login?error=callback", "/login?confirmed=1", "/reset-password", "/my-reports"]);
  const origin = configuredOrigin ? deploymentOrigin(configuredOrigin, "APP_ORIGIN", false) : new URL(requestUrl).origin;
  return new URL(paths.has(path) ? path : "/login?error=callback", origin);
}

export function authFeedback(params: Pick<URLSearchParams, "get">) {
  const error = params.get("error");
  if (error === "confirmation") return { error: true, text: "The confirmation or recovery link is invalid, expired, or could not be verified. Request a new link or try again." };
  if (error === "callback") return { error: true, text: "Sign-in could not be completed. Try again or request a new recovery link." };
  if (params.get("confirmed") === "1") return { error: false, text: "Email confirmed. You can sign in or continue to My Reports if already signed in." };
  return null;
}
