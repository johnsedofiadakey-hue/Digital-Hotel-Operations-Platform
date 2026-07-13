import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv } from "@repo/shared/server-env";
import { STAFF_BRANCH_COOKIE } from "../../../lib/cookies";

const BRANCH_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365; // this is a fixture, not a session — long-lived

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const branchCode = String(formData.get("branchCode") ?? "")
    .trim()
    .toUpperCase();

  const db = createServiceRoleClient(getServiceEnv());
  const { data: branch } = await db
    .from("branches")
    .select("id")
    .eq("code", branchCode)
    .maybeSingle<{ id: string }>();

  if (!branch) {
    return NextResponse.redirect(new URL("/setup?error=1", request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL("/pin", request.url), { status: 303 });
  response.cookies.set(STAFF_BRANCH_COOKIE, branch.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BRANCH_COOKIE_MAX_AGE_S,
  });
  return response;
}
