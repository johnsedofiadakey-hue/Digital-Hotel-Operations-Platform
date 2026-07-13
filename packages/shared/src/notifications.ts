// Notification fanout routing table — §11. This is the event -> recipient
// -> channel mapping as data, matching the spec's table exactly, so the
// routing decision lives in one reviewable place instead of being
// reconstructed ad hoc at each call site.
//
// IMPORTANT — no FCM/Hubtel/Twilio credentials exist anywhere in this
// project (see HANDOVER.md). This module defines *what should happen*, not
// a working delivery pipeline. Every "notify X" call site already in this
// codebase (force-close, SLA breaches, outcome-B nudges, second-device
// lockouts, ...) logs its own security_events/audit_log row as a
// lightweight capture-the-intent stub — this table doesn't replace those or
// rewire them; it's the reference for whoever wires up real push/SMS/
// WhatsApp senders later, so each channel only needs to be built once and
// pointed at this table rather than re-deriving the routing rules.

export type NotificationChannel = "realtime" | "push" | "sms" | "whatsapp" | "internal";

export type NotificationEvent =
  | "new_order"
  | "order_status_change"
  | "new_request"
  | "sla_breach_1"
  | "sla_breach_2"
  | "outcome_b_nudge"
  | "checkin_guard_force_close"
  | "security_event_spike"
  | "payment_failure_spike"
  | "checkout_reminder"
  | "feedback_request";

export type NotificationRecipient =
  | "kitchen_station"
  | "guest"
  | "department_pool"
  | "department_manager"
  | "branch_manager"
  | "reception"
  | "super_admin";

interface RoutingRule {
  recipient: NotificationRecipient;
  channels: NotificationChannel[];
  // "SMS if unacknowledged after 10 min" (§11) — deduplication/escalation
  // timing beyond the base channel list. Not enforced by this table itself;
  // callers (e.g. the SLA sweep) are responsible for the timing, this just
  // documents the intended shape once they do.
  note?: string;
}

export const NOTIFICATION_ROUTING: Record<NotificationEvent, RoutingRule> = {
  new_order: {
    recipient: "kitchen_station",
    channels: ["realtime", "push"],
    note: "Audible chime is part of the realtime delivery, not a separate channel — see apps/staff-pwa/lib/chime.ts.",
  },
  order_status_change: { recipient: "guest", channels: ["realtime", "whatsapp"] },
  new_request: { recipient: "department_pool", channels: ["realtime", "push"] },
  sla_breach_1: { recipient: "department_manager", channels: ["push"] },
  sla_breach_2: {
    recipient: "branch_manager",
    channels: ["push", "sms"],
    note: "SMS if unacknowledged after 10 min of the push.",
  },
  outcome_b_nudge: { recipient: "reception", channels: ["realtime", "push"] },
  checkin_guard_force_close: { recipient: "branch_manager", channels: ["push"] },
  security_event_spike: { recipient: "branch_manager", channels: ["push"] },
  payment_failure_spike: { recipient: "super_admin", channels: ["internal"] },
  checkout_reminder: { recipient: "guest", channels: ["realtime", "whatsapp", "sms"] },
  feedback_request: { recipient: "guest", channels: ["whatsapp", "sms"] },
};

// Guest-facing messages prefer WhatsApp over SMS whenever both are listed
// (§11's stated rule: "cost + Ghana habit") — this just picks the first
// available channel a real sender exists for, given a set of channels the
// guest has actually opted into.
export function pickGuestChannel(
  available: NotificationChannel[],
  optedIn: Set<NotificationChannel>,
): NotificationChannel | null {
  const preferenceOrder: NotificationChannel[] = ["whatsapp", "sms", "push", "realtime"];
  for (const channel of preferenceOrder) {
    if (available.includes(channel) && optedIn.has(channel)) return channel;
  }
  return null;
}
