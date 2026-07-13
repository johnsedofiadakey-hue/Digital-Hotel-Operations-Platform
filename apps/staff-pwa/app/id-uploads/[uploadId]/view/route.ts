// "Every access logged" (§13) — logs the access, then generates a
// short-lived signed URL via the service-role client (the only client that
// can read guest-ids at all — see the migration's header comment) and
// redirects to it. This is the *only* path to the file's bytes; there is no
// client-side route around this logging.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@repo/shared/supabase";
import { getServiceEnv, getJwtSecret } from "@repo/shared/server-env";
import { STAFF_SESSION_COOKIE } from "../../../../lib/cookies";
import { getAuthenticatedStaff } from "../../../../lib/staff-session";

const RECEPTION_ROLES = new Set(["reception", "branch_manager", "owner"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const db = createServiceRoleClient(getServiceEnv());
  const staff = await getAuthenticatedStaff(db, token, getJwtSecret());

  if (!staff || !RECEPTION_ROLES.has(staff.roleKey)) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const { data: upload } = await db
    .from("guest_id_uploads")
    .select("id, storage_path, branch_id")
    .eq("id", uploadId)
    .maybeSingle<{ id: string; storage_path: string; branch_id: string }>();

  if (!upload || upload.branch_id !== staff.branchId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await db.from("guest_id_access_log").insert({ upload_id: upload.id, staff_id: staff.staffId });

  const { data: signed, error } = await db.storage.from("guest-ids").createSignedUrl(upload.storage_path, 60);
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "could not sign url" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
