// Core entity types shared across guest-web, staff-pwa, and admin-web.
// Mirrors the schema in DHOP_Build_Spec.md §14.3.

export type RoomStatus =
  | "vacant_clean"
  | "vacant_dirty"
  | "occupied"
  | "occupied_dnd"
  | "out_of_order";

export type StayState = "reserved" | "active" | "checked_out" | "force_closed" | "no_show";

export type GuestSessionTier = "full" | "limited" | "post_stay";

export type RequestType = "housekeeping" | "maintenance" | "laundry" | "concierge";

export type RequestState =
  | "submitted"
  | "claimed"
  | "in_progress"
  | "done"
  | "confirmed"
  | "cancelled"
  | "reopened";

export type RequestPriority = "normal" | "high" | "urgent";

export type OrderKitchenState = "placed" | "acknowledged" | "preparing" | "ready" | "delivered";

export type OrderPaymentState = "charge_to_room" | "pending" | "paid" | "failed" | "refunded";

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  code: string; // short, globally-unique, human-typeable (e.g. "ACCRA") — §4.5
}

export interface RoomCategory {
  id: string;
  branchId: string;
  name: string;
  requestPriorityDefault: RequestPriority;
}

export interface Room {
  id: string;
  branchId: string;
  categoryId: string;
  roomKey: string; // opaque, printed in the QR — never the primary key, never guessable
  status: RoomStatus;
}

export interface Stay {
  id: string;
  roomId: string;
  state: StayState;
  lastNames: string[];
  phone?: string;
  checkinAt?: string;
  checkoutDue?: string;
  closedAt?: string;
  closedReason?: string;
  deviceCap: number;
}

export interface GuestSession {
  id: string;
  stayId: string;
  tier: GuestSessionTier;
  deviceLabel: string;
  createdAt: string;
  revokedAt?: string;
}

export interface StaffMember {
  id: string;
  branchId: string;
  name: string;
  roleIds: string[];
}

export interface GuestRequest {
  id: string;
  stayId: string;
  branchId: string;
  type: RequestType;
  state: RequestState;
  priority: RequestPriority;
  note?: string;
  claimedBy?: string;
  submittedAt: string;
  claimedAt?: string;
  doneAt?: string;
}

export interface Order {
  id: string;
  stayId: string;
  branchId: string;
  kitchenState: OrderKitchenState;
  paymentState: OrderPaymentState;
  paystackRef?: string;
  totalMinorUnits: number; // pesewas, to avoid float currency math
}

export interface MenuSection {
  id: string;
  branchId: string;
  name: string;
  roomCategoryId?: string; // unset = visible to every room category, §7.3
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  sectionId: string;
  branchId: string;
  name: string;
  description?: string;
  priceMinorUnits: number;
  available: boolean; // the sold-out toggle, §8.3
  sortOrder: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId?: string;
  name: string; // snapshotted at order time
  quantity: number;
  unitPriceMinorUnits: number;
}

export interface Folio {
  id: string;
  stayId: string;
  branchId: string;
}

export interface FolioLine {
  id: string;
  folioId: string;
  branchId: string;
  source: "order" | "service" | "adjustment";
  orderId?: string;
  description: string;
  amountMinorUnits: number;
  flagged: boolean; // charge-to-room posts at placement, flagged until delivered, §8.2
  postedAt: string;
}
