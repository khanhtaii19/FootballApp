import { describe, expect, it } from "vitest";
import { makeBooking } from "../test/fixtures";
import { depositReceived, isHoldExpired, isLive, matchesSearch, needsRefund, splitForCustomer } from "./bookings";

const NOW = new Date("2030-01-01T10:00:00Z");
const payment = (status: "completed" | "refunded", amount = 60000) => ({
  id: `p-${status}`,
  amount,
  method: "bank_transfer" as const,
  status,
  transactionId: null,
  createdAt: "2030-01-01T00:00:00.000Z",
});

describe("isHoldExpired / isLive", () => {
  it("treats only overdue pending bookings as expired holds", () => {
    expect(isHoldExpired(makeBooking({ status: "pending", expiresAt: "2030-01-01T09:59:00Z" }), NOW)).toBe(true);
    expect(isHoldExpired(makeBooking({ status: "pending", expiresAt: "2030-01-01T10:05:00Z" }), NOW)).toBe(false);
    expect(isHoldExpired(makeBooking({ status: "confirmed", expiresAt: null }), NOW)).toBe(false);
  });

  it("is live when confirmed or pending within its hold", () => {
    expect(isLive(makeBooking({ status: "confirmed" }), NOW)).toBe(true);
    expect(isLive(makeBooking({ status: "pending", expiresAt: "2030-01-01T10:05:00Z" }), NOW)).toBe(true);
    expect(isLive(makeBooking({ status: "pending", expiresAt: "2030-01-01T09:00:00Z" }), NOW)).toBe(false);
    expect(isLive(makeBooking({ status: "cancelled" }), NOW)).toBe(false);
    expect(isLive(makeBooking({ status: "expired" }), NOW)).toBe(false);
  });
});

describe("refund helpers", () => {
  it("needs a refund when cancelled with a positive refund and a held deposit", () => {
    expect(needsRefund(makeBooking({ status: "cancelled", refundAmount: 60000, payments: [payment("completed")] }))).toBe(true);
  });

  it("does not once the deposit was refunded or when nothing is owed", () => {
    expect(needsRefund(makeBooking({ status: "cancelled", refundAmount: 60000, payments: [payment("refunded")] }))).toBe(false);
    expect(needsRefund(makeBooking({ status: "cancelled", refundAmount: 0, payments: [payment("completed")] }))).toBe(false);
    expect(needsRefund(makeBooking({ status: "confirmed", refundAmount: 60000, payments: [payment("completed")] }))).toBe(false);
  });

  it("sums only completed payments as the deposit received", () => {
    expect(depositReceived(makeBooking({ payments: [payment("completed", 60000), payment("refunded", 1000)] }))).toBe(60000);
    expect(depositReceived(makeBooking({ payments: undefined }))).toBe(0);
  });
});

describe("matchesSearch", () => {
  const booking = makeBooking();

  it("matches the transfer code, name, email and phone", () => {
    expect(matchesSearch(booking, "sbabcd1234")).toBe(true);
    expect(matchesSearch(booking, "0901234567")).toBe(true);
    expect(matchesSearch(booking, "a@example")).toBe(true);
  });

  it("ignores accents and case in names", () => {
    expect(matchesSearch(booking, "nguyen van a")).toBe(true);
    expect(matchesSearch(booking, "NGUYỄN")).toBe(true);
  });

  it("matches everything for an empty query and nothing for an unknown one", () => {
    expect(matchesSearch(booking, "   ")).toBe(true);
    expect(matchesSearch(booking, "zzz")).toBe(false);
  });
});

describe("splitForCustomer", () => {
  it("separates upcoming live bookings from history, sorted sensibly", () => {
    const upcomingLate = makeBooking({ id: "u2", startsAt: "2030-01-03T11:00:00Z", endsAt: "2030-01-03T12:00:00Z" });
    const upcomingSoon = makeBooking({ id: "u1", startsAt: "2030-01-02T11:00:00Z", endsAt: "2030-01-02T12:00:00Z" });
    const past = makeBooking({ id: "h1", startsAt: "2029-12-30T11:00:00Z", endsAt: "2029-12-30T12:00:00Z" });
    const cancelled = makeBooking({ id: "h2", status: "cancelled", startsAt: "2030-01-05T11:00:00Z", endsAt: "2030-01-05T12:00:00Z" });

    const { upcoming, history } = splitForCustomer([upcomingLate, past, cancelled, upcomingSoon], NOW);
    expect(upcoming.map((b) => b.id)).toEqual(["u1", "u2"]);
    expect(history.map((b) => b.id)).toEqual(["h2", "h1"]);
  });
});
