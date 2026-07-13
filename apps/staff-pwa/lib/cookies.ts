// Long-lived, set once when a tablet is set up (§5.1) — not sensitive, so
// not httpOnly is fine, but keeping it httpOnly anyway since nothing client-
// side needs to read it directly (routes are all server-rendered/handled).
export const STAFF_BRANCH_COOKIE = "dhop_staff_branch_id";

// Random per-tablet identifier so PIN lockouts (§5.1) are scoped to the
// physical device that got the PINs wrong, not the whole branch.
export const STAFF_TABLET_COOKIE = "dhop_staff_tablet_id";

export const STAFF_SESSION_COOKIE = "dhop_staff_session";
