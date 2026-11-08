import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  minutesToTime,
  vietnamToUtc,
  utcToVietnamTime,
  utcToVietnamDate,
  generateCandidateTimes,
  isWithinOperatingHours,
} from "../lib/time-utils.js";

// ─── Time utils ──────────────────────────────────────

describe("Time Utils", () => {
  describe("timeToMinutes / minutesToTime", () => {
    it("parses 05:00 to 300 minutes", () => {
      expect(timeToMinutes("05:00")).toBe(300);
    });

    it("parses 23:00 to 1380 minutes", () => {
      expect(timeToMinutes("23:00")).toBe(1380);
    });

    it("parses 00:00 to 0 minutes", () => {
      expect(timeToMinutes("00:00")).toBe(0);
    });

    it("converts 300 minutes back to 05:00", () => {
      expect(minutesToTime(300)).toBe("05:00");
    });

    it("converts 1380 minutes back to 23:00", () => {
      expect(minutesToTime(1380)).toBe("23:00");
    });

    it("roundtrips correctly", () => {
      const times = ["00:00", "05:30", "12:45", "18:15", "23:59"];
      for (const t of times) {
        expect(minutesToTime(timeToMinutes(t))).toBe(t);
      }
    });
  });

  describe("vietnamToUtc", () => {
    it("converts 18:00 VN to 11:00 UTC", () => {
      const utc = vietnamToUtc("2026-10-15", "18:00");
      expect(utc.toISOString()).toBe("2026-10-15T11:00:00.000Z");
    });

    it("converts 05:00 VN to 22:00 UTC previous day", () => {
      const utc = vietnamToUtc("2026-10-15", "05:00");
      expect(utc.toISOString()).toBe("2026-10-14T22:00:00.000Z");
    });

    it("converts 00:00 VN to 17:00 UTC previous day", () => {
      const utc = vietnamToUtc("2026-10-15", "00:00");
      expect(utc.toISOString()).toBe("2026-10-14T17:00:00.000Z");
    });
  });

  describe("utcToVietnamTime / utcToVietnamDate", () => {
    it("converts 11:00 UTC to 18:00 VN", () => {
      const utc = new Date("2026-10-15T11:00:00.000Z");
      expect(utcToVietnamTime(utc)).toBe("18:00");
    });

    it("converts 22:00 UTC to 05:00 VN next day", () => {
      const utc = new Date("2026-10-14T22:00:00.000Z");
      expect(utcToVietnamTime(utc)).toBe("05:00");
      expect(utcToVietnamDate(utc)).toBe("2026-10-15");
    });
  });
});

// ─── Candidate time generation ───────────────────────

describe("generateCandidateTimes", () => {
  it("generates correct slots for 60min duration, 15min step", () => {
    const candidates = generateCandidateTimes("05:00", "07:00", 15, 60);
    // 05:00-06:00, 05:15-06:15, ... 06:00-07:00 → 5 slots
    expect(candidates).toEqual([300, 315, 330, 345, 360]);
    expect(candidates).toHaveLength(5);
  });

  it("generates correct slots for 90min duration, 15min step", () => {
    const candidates = generateCandidateTimes("05:00", "07:00", 15, 90);
    // 05:00-06:30, 05:15-06:45, 05:30-07:00 → 3 slots
    expect(candidates).toEqual([300, 315, 330]);
    expect(candidates).toHaveLength(3);
  });

  it("returns empty if duration exceeds window", () => {
    const candidates = generateCandidateTimes("22:00", "23:00", 15, 90);
    expect(candidates).toEqual([]);
  });

  it("handles full day correctly", () => {
    const candidates = generateCandidateTimes("05:00", "23:00", 60, 60);
    // 05:00–06:00, 06:00–07:00, ..., 22:00–23:00 → 18 slots
    expect(candidates).toHaveLength(18);
    expect(candidates[0]).toBe(300); // 05:00
    expect(candidates[candidates.length - 1]).toBe(1320); // 22:00
  });
});

// ─── Operating hours validation ──────────────────────

describe("isWithinOperatingHours", () => {
  const open = "05:00";
  const close = "23:00";

  it("accepts 18:00–19:00 (within hours)", () => {
    const start = vietnamToUtc("2026-12-01", "18:00");
    const end = vietnamToUtc("2026-12-01", "19:00");
    expect(isWithinOperatingHours(start, end, open, close)).toBe(true);
  });

  it("accepts 05:00–06:00 (at opening)", () => {
    const start = vietnamToUtc("2026-12-01", "05:00");
    const end = vietnamToUtc("2026-12-01", "06:00");
    expect(isWithinOperatingHours(start, end, open, close)).toBe(true);
  });

  it("accepts 22:00–23:00 (at closing)", () => {
    const start = vietnamToUtc("2026-12-01", "22:00");
    const end = vietnamToUtc("2026-12-01", "23:00");
    expect(isWithinOperatingHours(start, end, open, close)).toBe(true);
  });

  it("rejects 04:00–05:00 (before opening)", () => {
    const start = vietnamToUtc("2026-12-01", "04:00");
    const end = vietnamToUtc("2026-12-01", "05:00");
    expect(isWithinOperatingHours(start, end, open, close)).toBe(false);
  });

  it("rejects 22:30–00:00 (past closing with 90min)", () => {
    const start = vietnamToUtc("2026-12-01", "22:30");
    const end = vietnamToUtc("2026-12-02", "00:00");
    // end in VN = 00:00 next day → adjustedEnd = 1440 > 1380 → reject
    expect(isWithinOperatingHours(start, end, open, close)).toBe(false);
  });
});

// ─── Price calculation ───────────────────────────────

describe("Price Calculation", () => {
  it("calculates 60min sân 5 correctly (200,000 VND/h)", () => {
    const price = Math.round(200_000 * (60 / 60));
    expect(price).toBe(200_000);
  });

  it("calculates 90min sân 5 correctly (200,000 VND/h)", () => {
    const price = Math.round(200_000 * (90 / 60));
    expect(price).toBe(300_000);
  });

  it("calculates 60min sân 7 correctly (500,000 VND/h)", () => {
    const price = Math.round(500_000 * (60 / 60));
    expect(price).toBe(500_000);
  });

  it("calculates 90min sân 7 correctly (500,000 VND/h)", () => {
    const price = Math.round(500_000 * (90 / 60));
    expect(price).toBe(750_000);
  });
});

// ─── Zone conflict logic ─────────────────────────────

describe("Zone Conflict Logic", () => {
  const hasTimeOverlap = (
    s1: number, e1: number,
    s2: number, e2: number
  ) => s1 < e2 && s2 < e1;

  const hasZoneConflict = (z1: string[], z2: string[]) =>
    z1.some((z) => z2.includes(z));

  const hasConflict = (
    b1: { zones: string[]; start: number; end: number },
    b2: { zones: string[]; start: number; end: number }
  ) => hasZoneConflict(b1.zones, b2.zones) && hasTimeOverlap(b1.start, b1.end, b2.start, b2.end);

  // 4 tình huống từ bảng mục 1.2 trong kế hoạch

  it("Case 1: Sân 7#1 18-19 vs Sân 5 A2 18:30-19:30 → XUNG ĐỘT", () => {
    expect(
      hasConflict(
        { zones: ["A1", "A2", "A3"], start: 1080, end: 1140 },
        { zones: ["A2"], start: 1110, end: 1170 }
      )
    ).toBe(true);
  });

  it("Case 2: Sân 7#1 vs Sân 5 B1 cùng giờ → KHÔNG xung đột (khác mặt cỏ)", () => {
    expect(
      hasConflict(
        { zones: ["A1", "A2", "A3"], start: 1080, end: 1140 },
        { zones: ["B1"], start: 1080, end: 1140 }
      )
    ).toBe(false);
  });

  it("Case 3: Sân 5 A1 vs Sân 5 A2 cùng giờ → KHÔNG xung đột (khác vùng)", () => {
    expect(
      hasConflict(
        { zones: ["A1"], start: 1080, end: 1170 },
        { zones: ["A2"], start: 1080, end: 1170 }
      )
    ).toBe(false);
  });

  it("Case 4: Sân 5 A1 18-19 vs Sân 5 A1 19-20 → KHÔNG xung đột (nối tiếp)", () => {
    expect(
      hasConflict(
        { zones: ["A1"], start: 1080, end: 1140 },
        { zones: ["A1"], start: 1140, end: 1200 }
      )
    ).toBe(false);
  });

  it("Edge: Sân 5 A1 vs Sân 5 A1 chồng 1 phút → XUNG ĐỘT", () => {
    expect(
      hasConflict(
        { zones: ["A1"], start: 1080, end: 1140 },
        { zones: ["A1"], start: 1139, end: 1200 }
      )
    ).toBe(true);
  });
});

// ─── Booking validator ───────────────────────────────

describe("Booking Validators", () => {
  let availableSlotsQuerySchema: typeof import("../validators/booking.validator.js")["availableSlotsQuerySchema"];
  let createBookingSchema: typeof import("../validators/booking.validator.js")["createBookingSchema"];

  beforeEach(async () => {
    const mod = await import("../validators/booking.validator.js");
    availableSlotsQuerySchema = mod.availableSlotsQuerySchema;
    createBookingSchema = mod.createBookingSchema;
  });

  it("accepts valid available slots query", () => {
    const result = availableSlotsQuerySchema.safeParse({
      date: "2026-12-01",
      fieldType: "five",
      duration: "60",  // coerce string → number
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = availableSlotsQuerySchema.safeParse({
      date: "01-12-2026",
      fieldType: "five",
      duration: "60",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid duration", () => {
    const result = availableSlotsQuerySchema.safeParse({
      date: "2026-12-01",
      fieldType: "five",
      duration: "45",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid create booking input", () => {
    const result = createBookingSchema.safeParse({
      fieldType: "seven",
      startsAt: "2026-12-01T11:00:00.000Z",
      duration: 90,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid fieldType", () => {
    const result = createBookingSchema.safeParse({
      fieldType: "eleven",
      startsAt: "2026-12-01T11:00:00.000Z",
      duration: 60,
    });
    expect(result.success).toBe(false);
  });
});
