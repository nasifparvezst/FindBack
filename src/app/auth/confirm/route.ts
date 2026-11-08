import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const types = new Set(["email", "signup", "recovery", "invite", "magiclink", "email_change"]);
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const destination = new URL(type === "recovery" ? "/reset-password" : "/login?confirmed=1", request.url);
  if (!tokenHash || !type || !types.has(type)) return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
  if (error) return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
  return NextResponse.redirect(destination);
}
