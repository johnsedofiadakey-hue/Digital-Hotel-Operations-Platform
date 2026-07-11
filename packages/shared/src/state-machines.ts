// Valid state transitions, enforced identically wherever a transition is attempted
// (Edge Functions, RLS-guarded RPCs, and UI optimistic updates). See
// DHOP_Build_Spec.md §3.1, §6.2, §8.1, §8.2 for the flows these encode.

import type {
  OrderKitchenState,
  OrderPaymentState,
  RequestState,
  RoomStatus,
  StayState,
} from "./types.js";

export const STAY_TRANSITIONS: Record<StayState, StayState[]> = {
  reserved: ["active", "no_show"],
  active: ["checked_out", "force_closed"],
  checked_out: [],
  force_closed: [],
  no_show: [],
};

export const ROOM_STATUS_TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  vacant_clean: ["occupied", "out_of_order"],
  vacant_dirty: ["vacant_clean", "out_of_order"],
  occupied: ["vacant_dirty", "occupied_dnd"],
  occupied_dnd: ["occupied", "vacant_dirty"],
  // Occupied -> OOO is deliberately absent: a guest is in the room.
  // A room move (change stay.room_id) must happen first.
  out_of_order: ["vacant_dirty"],
};

export const REQUEST_TRANSITIONS: Record<RequestState, RequestState[]> = {
  submitted: ["claimed", "cancelled"],
  claimed: ["in_progress", "cancelled"],
  in_progress: ["done"],
  done: ["confirmed", "reopened"],
  confirmed: [],
  cancelled: [],
  reopened: ["claimed", "in_progress"],
};

export const ORDER_KITCHEN_TRANSITIONS: Record<OrderKitchenState, OrderKitchenState[]> = {
  placed: ["acknowledged"],
  acknowledged: ["preparing"],
  preparing: ["ready"],
  ready: ["delivered"],
  delivered: [],
};

export const ORDER_PAYMENT_TRANSITIONS: Record<OrderPaymentState, OrderPaymentState[]> = {
  charge_to_room: ["refunded"],
  pending: ["paid", "failed"],
  paid: ["refunded"],
  failed: [],
  refunded: [],
};

export function canTransition<T extends string>(
  table: Record<T, T[]>,
  from: T,
  to: T,
): boolean {
  return table[from]?.includes(to) ?? false;
}

// An order only ever reaches the kitchen queue once it is funded — see §8.2.
export function isOrderFunded(paymentState: OrderPaymentState): boolean {
  return paymentState === "paid" || paymentState === "charge_to_room";
}
