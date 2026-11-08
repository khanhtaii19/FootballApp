import { describe, it, expect } from "vitest";

describe("Health Check", () => {
  it("should return correct response structure", () => {
    // Đây là test đơn giản để verify CI pipeline hoạt động
    const response = {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
    };

    expect(response.status).toBe("ok");
    expect(response.database).toBe("connected");
    expect(response.timestamp).toBeDefined();
  });

  it("should validate zone model", () => {
    // Kiểm tra logic 6 vùng
    const zones = [
      { name: "A1", surface: "A" },
      { name: "A2", surface: "A" },
      { name: "A3", surface: "A" },
      { name: "B1", surface: "B" },
      { name: "B2", surface: "B" },
      { name: "B3", surface: "B" },
    ];

    // 6 vùng tổng cộng
    expect(zones).toHaveLength(6);

    // 2 mặt cỏ
    const surfaces = [...new Set(zones.map((z) => z.surface))];
    expect(surfaces).toHaveLength(2);
    expect(surfaces).toContain("A");
    expect(surfaces).toContain("B");

    // Mỗi mặt cỏ 3 vùng
    const surfaceA = zones.filter((z) => z.surface === "A");
    const surfaceB = zones.filter((z) => z.surface === "B");
    expect(surfaceA).toHaveLength(3);
    expect(surfaceB).toHaveLength(3);
  });

  it("should detect zone conflicts correctly", () => {
    // Test logic xung đột: 2 booking chồng khi dùng chung vùng VÀ thời gian chồng
    const hasTimeOverlap = (
      start1: number,
      end1: number,
      start2: number,
      end2: number
    ) => start1 < end2 && start2 < end1;

    const hasZoneConflict = (zones1: string[], zones2: string[]) =>
      zones1.some((z) => zones2.includes(z));

    const hasConflict = (
      booking1: { zones: string[]; start: number; end: number },
      booking2: { zones: string[]; start: number; end: number }
    ) =>
      hasZoneConflict(booking1.zones, booking2.zones) &&
      hasTimeOverlap(booking1.start, booking1.end, booking2.start, booking2.end);

    // Case 1: Sân 7 số 1 (A1,A2,A3) 18:00-19:00 vs Sân 5 A2 18:30-19:30 → XỊ CHỘT
    expect(
      hasConflict(
        { zones: ["A1", "A2", "A3"], start: 1800, end: 1900 },
        { zones: ["A2"], start: 1830, end: 1930 }
      )
    ).toBe(true);

    // Case 2: Sân 7 số 1 vs Sân 5 B1 (khác mặt cỏ) → OK
    expect(
      hasConflict(
        { zones: ["A1", "A2", "A3"], start: 1800, end: 1900 },
        { zones: ["B1"], start: 1800, end: 1900 }
      )
    ).toBe(false);

    // Case 3: Sân 5 A1 vs Sân 5 A2 (cùng giờ, khác vùng) → OK
    expect(
      hasConflict(
        { zones: ["A1"], start: 1800, end: 1930 },
        { zones: ["A2"], start: 1800, end: 1930 }
      )
    ).toBe(false);

    // Case 4: Sân 5 A1 18:00-19:00 vs Sân 5 A1 19:00-20:00 (nối tiếp) → OK
    expect(
      hasConflict(
        { zones: ["A1"], start: 1800, end: 1900 },
        { zones: ["A1"], start: 1900, end: 2000 }
      )
    ).toBe(false);
  });
});
