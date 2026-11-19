export type Role = "customer" | "owner";
export type FieldType = "five" | "seven";
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "expired" | "completed";

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
}

export interface Zone {
  id: string;
  name: string; // A1..A3, B1..B3
  surface: string;
}

export interface AppSettings {
  opening_hour: string;
  closing_hour: string;
  time_step_minutes: number;
  allowed_durations: number[];
  price_5: number;
  price_7: number;
  hold_timeout_minutes: number;
  cancel_before_hours: number;
  deposit_percent: number;
  bank_bin: string;
  bank_account_no: string;
  bank_account_name: string;
}

export interface Slot {
  startTime: string; // "18:00" (giờ VN)
  endTime: string;
  startsAt: string; // ISO UTC
  endsAt: string;
  availableCount: number;
}

export interface SlotsResponse {
  date: string;
  fieldType: string;
  duration: number;
  slots: Slot[];
}

export interface Payment {
  id: string;
  amount: number;
  method: "bank_transfer" | "cash" | "payos";
  status: "pending" | "completed" | "refunded";
  transactionId: string | null;
  createdAt: string;
}

export interface BookingZone {
  id: string;
  zoneId: string;
  isActive: boolean;
  zone: Zone;
}

export interface Booking {
  id: string;
  userId: string;
  fieldType: FieldType | "block";
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  totalAmount: number;
  deposit: number;
  expiresAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  refundAmount: number;
  note: string | null;
  bookingZones: BookingZone[];
  payments?: Payment[];
  paymentCode?: string;
  user?: { id: string; name: string; email: string; phone: string | null };
}

export interface RefundDecision {
  eligible: boolean;
  amount: number;
  reason: "no_deposit" | "owner_cancelled" | "in_time" | "late_cancel";
  message: string;
}

export interface PaymentInfo {
  bookingId: string;
  status: BookingStatus;
  totalAmount: number;
  deposit: number;
  remainingAtVenue: number;
  expiresAt: string | null;
  awaitingPayment: boolean;
  transferContent: string;
  bankConfigured: boolean;
  bank: { bin: string; accountNo: string; accountName: string } | null;
  qrPayload: string | null;
  payments: Payment[];
  refund: { amount: number; due: boolean; paid: boolean };
}
