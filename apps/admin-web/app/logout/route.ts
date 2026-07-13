import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabase-server";

export async function GET(request: NextRequest) {
  const db = await createSupabaseServerClient();
  await db.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
