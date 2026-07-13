// Typed against the standard Headers interface (not NextRequest) so this has
// no framework dependency — both NextRequest and the ambient Request satisfy
// it. Best-effort — trusts the platform's edge to have set this correctly
// (true on Vercel). Only used for rate-limiting math, never for authz.
export function clientIp(request: { headers: Headers }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}
