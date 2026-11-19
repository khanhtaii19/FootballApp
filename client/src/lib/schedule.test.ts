import { describe, expect, it } from "vitest";
import { makeBooking, zoneByName } from "../test/fixtures";
import { buildGridEvents, hourMarks } from "./schedule";

const base = { date: "2030-01-01", openMin: 300, closeMin: 1380, blocks: [] }; // 05:00-23:00
const NOW = new Date("2030-01-01T00:00:00Z");

const seven = makeBooking({
  id: "seven1",
  fieldType: "seven",
  bookingZones: ["A1", "A2", "A3"].map((n, i) => ({
    id: `bz${i}`,
    zoneId: `zone-${n}`,
    isActive: true,
    zone: zoneByName(n),
  })),
});

describe("buildGridEvents", () => {
  it("puts a five-a-side booking in exactly one zone column", () => {
    const events = buildGridEvents({ ...base, bookings: [makeBooking()], now: NOW });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ zoneName: "A1", kind: "confirmed", title: "Nguyễn Văn A" });
  });

  it("spreads a seven-a-side booking over its three zones", () => {
    const events = buildGridEvents({ ...base, bookings: [seven], now: NOW });
    expect(events.map((e) => e.zoneName).sort()).toEqual(["A1", "A2", "A3"]);
    expect(new Set(events.map((e) => e.bookingId))).toEqual(new Set(["seven1"]));
  });

  it("positions an event proportionally inside the opening hours", () => {
    // 18:00-19:00 trong khung 05:00-23:00 (1080 phút)
    const [event] = buildGridEvents({ ...base, bookings: [makeBooking()], now: NOW });
    expect(event.topPct).toBeCloseTo((780 / 1080) * 100, 5);
    expect(event.heightPct).toBeCloseTo((60 / 1080) * 100, 5);
  });

  it("clips events that start before opening or end after closing", () => {
    const early = makeBooking({
      id: "early",
      startsAt: "2029-12-31T21:00:00.000Z", // 04:00 VN
      endsAt: "2029-12-31T23:00:00.000Z", // 06:00 VN
    });
    const [event] = buildGridEvents({ ...base, bookings: [early], now: NOW });
    expect(event.topPct).toBe(0);
    expect(event.heightPct).toBeCloseTo((60 / 1080) * 100, 5); // chỉ 05:00-06:00 nằm trong khung
  });

  it("skips events entirely outside the visible range", () => {
    const night = makeBooking({
      startsAt: "2030-01-01T16:00:00.000Z", // 23:00 VN
      endsAt: "2030-01-01T17:00:00.000Z",
    });
    expect(buildGridEvents({ ...base, bookings: [night], now: NOW })).toHaveLength(0);
  });

  it("hides cancelled, expired and overdue pending bookings", () => {
    const bookings = [
      makeBooking({ id: "c", status: "cancelled" }),
      makeBooking({ id: "e", status: "expired" }),
      makeBooking({ id: "p-overdue", status: "pending", expiresAt: "2029-12-31T00:00:00.000Z" }),
      makeBooking({ id: "p-live", status: "pending", expiresAt: "2030-01-02T00:00:00.000Z" }),
    ];
    const events = buildGridEvents({ ...base, bookings, now: NOW });
    expect(events.map((e) => e.bookingId)).toEqual(["p-live"]);
    expect(events[0].kind).toBe("pending");
  });

  it("ignores zone rows that were released", () => {
    const released = makeBooking({
      bookingZones: [{ id: "bz", zoneId: "zone-A1", isActive: false, zone: zoneByName("A1") }],
    });
    expect(buildGridEvents({ ...base, bookings: [released], now: NOW })).toHaveLength(0);
  });

  it("renders blocks with their note", () => {
    const block = makeBooking({ id: "blk", fieldType: "block", user: undefined, note: "Bảo trì cỏ" });
    const [event] = buildGridEvents({ ...base, bookings: [], blocks: [block], now: NOW });
    expect(event).toMatchObject({ kind: "block", title: "Khóa sân", subtitle: "Bảo trì cỏ" });
  });

  it("returns nothing for an invalid time range", () => {
    expect(buildGridEvents({ ...base, closeMin: 300, bookings: [makeBooking()], now: NOW })).toEqual([]);
  });
});

describe("hourMarks", () => {
  it("lists whole hours inside the range", () => {
    const marks = hourMarks(300, 1380);
    expect(marks[0]).toBe(5);
    expect(marks.at(-1)).toBe(23);
    expect(marks).toHaveLength(19);
  });

  it("starts at the next whole hour when opening is not on the hour", () => {
    expect(hourMarks(330, 480)).toEqual([6, 7, 8]);
  });
});
