import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authDestination, authRedirectUrl } from "@/lib/auth-flow";
import { preventSessionCaching } from "@/lib/http-security";

export async function GET(request: NextRequest) {
  const path = await authDestination("confirm", request.nextUrl.searchParams, createSupabaseServerClient, process.env.NEXT_PUBLIC_DEMO_MODE === "false");
  const response = NextResponse.redirect(authRedirectUrl(path, request.url, process.env.APP_ORIGIN));
  preventSessionCaching(response.headers); return response;
}
