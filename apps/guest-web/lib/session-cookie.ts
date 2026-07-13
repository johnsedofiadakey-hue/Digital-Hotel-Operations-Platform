export const GUEST_SESSION_COOKIE = "dhop_guest_session";
// Short-lived, set only on outcome B so the vacant page's "notify reception"
// tap knows which room without trusting a client-supplied id (§4.3 outcome B).
export const VACANT_ROOM_COOKIE = "dhop_vacant_room_id";
