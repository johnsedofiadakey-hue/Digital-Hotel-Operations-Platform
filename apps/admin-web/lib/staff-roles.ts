// Mirrors the `roles` table seeded in the Sprint 1 migration. Kept as a
// plain constant rather than queried at request time for the two places
// (form rendering, submit validation) that need to reason about role scope
// before touching the DB — the role set is static, seeded once, and never
// user-editable.
export const BRANCH_SCOPED_ROLES = [
  "kitchen",
  "housekeeping",
  "maintenance",
  "reception",
  "concierge",
  "finance",
  "dept_manager",
  "branch_manager",
] as const;

export type BranchScopedRole = (typeof BRANCH_SCOPED_ROLES)[number];

// §5.3: office roles (branch_manager here, owner is org-scoped and always
// requires one) sign into admin-web with email+password. Every other
// branch-scoped role taps in with a PIN on a shared tablet in staff-pwa.
export const EMAIL_REQUIRED_ROLES = new Set(["branch_manager", "owner"]);

// Every branch-scoped role gets a PIN — including branch_manager, who may
// also need to tap in at a branch tablet even though they also have an
// admin-web login. Owner never gets a PIN (org-scoped, admin-web only).
export const PIN_REQUIRED_ROLES = new Set<string>(BRANCH_SCOPED_ROLES);
