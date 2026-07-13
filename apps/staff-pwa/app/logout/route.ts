import { NextResponse, type NextRequest } from "next/server";
import { STAFF_SESSION_COOKIE } from "../../lib/cookies";

// Idle timeout and explicit "switch user" both land here — clears the PIN
// session but leaves the branch-setup cookie alone (§5.1: the tablet stays
// assigned to its branch, only the signed-in staff member changes).
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/pin", request.url), { status: 303 });
  response.cookies.delete(STAFF_SESSION_COOKIE);
  return response;
}
