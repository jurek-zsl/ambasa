import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(req: Request) {
  const url = new URL(req.url),
    code = url.searchParams.get("code");
  const next =
    url.searchParams.get("next") === "/login?recovery=1"
      ? "/login?recovery=1"
      : "/app";
  if (code) {
    const sb = await serverClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=expired", url.origin));
}
