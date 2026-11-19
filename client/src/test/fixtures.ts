import type { Booking, PaymentInfo, Zone } from "../lib/types";

export const ZONES: Zone[] = ["A1", "A2", "A3", "B1", "B2", "B3"].map((name) => ({
  id: `zone-${name}`,
  name,
  surface: name.charAt(0),
}));

export function zoneByName(name: string): Zone {
  return ZONES.find((z) => z.name === name)!;
}

export function makeBooking(overrides: Partial<Booking> = {}): Booking {
  const zones = overrides.bookingZones ?? [
    { id: "bz1", zoneId: "zone-A1", isActive: true, zone: zoneByName("A1") },
  ];
  return {
    id: "bk1",
    userId: "u1",
    fieldType: "five",
    startsAt: "2030-01-01T11:00:00.000Z", // 18:00 VN
    endsAt: "2030-01-01T12:00:00.000Z", // 19:00 VN
    status: "confirmed",
    totalAmount: 200000,
    deposit: 60000,
    expiresAt: null,
    paidAt: null,
    cancelledAt: null,
    refundAmount: 0,
    note: null,
    payments: [],
    paymentCode: "SBABCD1234",
    user: { id: "u1", name: "Nguyễn Văn A", email: "a@example.com", phone: "0901234567" },
    ...overrides,
    bookingZones: zones,
  };
}

export function makePaymentInfo(overrides: Partial<PaymentInfo> = {}): PaymentInfo {
  return {
    bookingId: "bk1",
    status: "pending",
    totalAmount: 200000,
    deposit: 60000,
    remainingAtVenue: 140000,
    expiresAt: null,
    awaitingPayment: true,
    transferContent: "SBABCD1234",
    bankConfigured: true,
    bank: { bin: "970436", accountNo: "0123456789", accountName: "NGUYEN VAN A" },
    qrPayload: "00020101021238570010A000000727",
    payments: [],
    refund: { amount: 0, due: false, paid: false },
    ...overrides,
  };
}
