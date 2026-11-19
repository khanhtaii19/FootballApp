import { describe, expect, it } from "vitest";
import {
  addDays,
  calculateDeposit,
  fieldTypeLabel,
  formatDate,
  formatDayLabel,
  formatRange,
  formatTime,
  formatVnd,
  minutesToTime,
  statusLabel,
  timeToMinutes,
  vnDateString,
  vnToIso,
} from "./format";

describe("formatVnd", () => {
  it("uses dot separators and the đ suffix", () => {
    expect(formatVnd(60000)).toBe("60.000đ");
    expect(formatVnd(1500000)).toBe("1.500.000đ");
    expect(formatVnd(0)).toBe("0đ");
  });
});

describe("calculateDeposit (must match the server)", () => {
  it("takes the percentage and rounds up to 1,000đ", () => {
    expect(calculateDeposit(200_000, 30)).toBe(60_000);
    expect(calculateDeposit(300_000, 30)).toBe(90_000);
    expect(calculateDeposit(333_333, 30)).toBe(100_000);
    expect(calculateDeposit(250_000, 33)).toBe(83_000);
  });

  it("never exceeds the total and is zero for empty input", () => {
    expect(calculateDeposit(200_000, 100)).toBe(200_000);
    expect(calculateDeposit(500, 30)).toBe(500);
    expect(calculateDeposit(0, 30)).toBe(0);
    expect(calculateDeposit(200_000, 0)).toBe(0);
  });
});

describe("Vietnam time helpers", () => {
  it("formats times in Asia/Ho_Chi_Minh regardless of the machine zone", () => {
    expect(formatTime("2030-01-01T11:00:00.000Z")).toBe("18:00");
    expect(formatTime("2030-01-01T17:00:00.000Z")).toBe("00:00"); // nửa đêm không thành "24:00"
    expect(formatDate("2030-01-01T11:00:00.000Z")).toBe("01/01/2030");
    expect(formatRange("2030-01-01T11:00:00.000Z", "2030-01-01T12:30:00.000Z")).toBe("18:00 - 19:30");
  });

  it("rolls the date over at 17:00 UTC", () => {
    expect(vnDateString(new Date("2030-01-01T16:59:00Z"))).toBe("2030-01-01");
    expect(vnDateString(new Date("2030-01-01T17:00:00Z"))).toBe("2030-01-02");
  });

  it("builds a UTC ISO string from a Vietnam date and time", () => {
    expect(vnToIso("2030-01-01", "18:00")).toBe("2030-01-01T11:00:00.000Z");
    expect(vnToIso("2030-01-01", "00:00")).toBe("2029-12-31T17:00:00.000Z");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2030-01-31", 1)).toBe("2030-02-01");
    expect(addDays("2030-01-01", -1)).toBe("2029-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("converts between 'HH:MM' and minutes", () => {
    expect(timeToMinutes("05:30")).toBe(330);
    expect(minutesToTime(1080)).toBe("18:00");
    expect(minutesToTime(timeToMinutes("09:05"))).toBe("09:05");
  });

  it("labels a day with its weekday", () => {
    // 03/01/2030 là thứ Năm
    expect(formatDayLabel("2030-01-03")).toMatch(/^Thứ [Nn]ăm, 03\/01$/);
  });
});

describe("labels", () => {
  it("names field types and statuses in Vietnamese", () => {
    expect(fieldTypeLabel("five")).toBe("Sân 5");
    expect(fieldTypeLabel("seven")).toBe("Sân 7");
    expect(fieldTypeLabel("block")).toBe("Khóa sân");
    expect(statusLabel("pending")).toBe("Chờ thanh toán");
    expect(statusLabel("expired")).toBe("Hết hạn");
  });
});
