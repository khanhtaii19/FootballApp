import { describe, it, expect } from "vitest";
import { buildVietQrPayload, crc16, parseTlv, verifyVietQrCrc } from "../lib/vietqr.js";
import { calculateDeposit, evaluateRefund, getPaymentCode } from "../lib/payment.js";
import { updateSettingsSchema } from "../validators/settings.validator.js";
import { confirmBookingSchema } from "../validators/booking.validator.js";

describe("crc16 (CCITT-FALSE)", () => {
  it("matches the standard check value for '123456789'", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("pads to 4 uppercase hex characters", () => {
    expect(crc16("")).toBe("FFFF");
    expect(crc16("A")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("buildVietQrPayload", () => {
  const input = {
    bin: "970436",
    accountNo: "0123456789",
    amount: 60000,
    content: "SBK3X9QZ2A",
  };

  it("builds a payload with a valid trailing CRC", () => {
    const payload = buildVietQrPayload(input);
    expect(payload.startsWith("000201010212")).toBe(true);
    expect(payload.slice(-8, -4)).toBe("6304");
    expect(verifyVietQrCrc(payload)).toBe(true);
  });

  it("detects tampering through the CRC", () => {
    const payload = buildVietQrPayload(input);
    const tampered = payload.replace("60000", "10000");
    expect(verifyVietQrCrc(tampered)).toBe(false);
  });

  it("encodes bank, account, amount, currency and content in the right fields", () => {
    const tlv = parseTlv(buildVietQrPayload(input));

    expect(tlv["00"]).toBe("01"); // phiên bản
    expect(tlv["01"]).toBe("12"); // QR động
    expect(tlv["53"]).toBe("704"); // VND
    expect(tlv["54"]).toBe("60000");
    expect(tlv["58"]).toBe("VN");

    const merchant = parseTlv(tlv["38"]);
    expect(merchant["00"]).toBe("A000000727"); // NAPAS
    expect(merchant["02"]).toBe("QRIBFTTA"); // chuyển tới số tài khoản
    expect(parseTlv(merchant["01"])).toEqual({ "00": "970436", "01": "0123456789" });

    expect(parseTlv(tlv["62"])["08"]).toBe("SBK3X9QZ2A");
  });

  it("handles long account numbers and large amounts", () => {
    const payload = buildVietQrPayload({
      ...input,
      accountNo: "123456789012345",
      amount: 15_000_000,
    });
    const tlv = parseTlv(payload);
    expect(tlv["54"]).toBe("15000000");
    expect(parseTlv(parseTlv(tlv["38"])["01"])["01"]).toBe("123456789012345");
    expect(verifyVietQrCrc(payload)).toBe(true);
  });

  it.each([
    ["bad bin", { bin: "9704" }],
    ["bad account", { accountNo: "12ab" }],
    ["zero amount", { amount: 0 }],
    ["negative amount", { amount: -5 }],
    ["fractional amount", { amount: 100.5 }],
    ["accented content", { content: "Đặt sân" }],
    ["too long content", { content: "A".repeat(26) }],
  ])("rejects %s", (_name, override) => {
    expect(() => buildVietQrPayload({ ...input, ...override })).toThrow();
  });
});

describe("calculateDeposit", () => {
  it("takes the percentage and rounds up to 1,000đ", () => {
    expect(calculateDeposit(200_000, 30)).toBe(60_000);
    expect(calculateDeposit(300_000, 30)).toBe(90_000);
    expect(calculateDeposit(333_333, 30)).toBe(100_000); // 99.999,9 -> 100.000
    expect(calculateDeposit(250_000, 33)).toBe(83_000); // 82.500 -> 83.000
  });

  it("never exceeds the total", () => {
    expect(calculateDeposit(200_000, 100)).toBe(200_000);
    expect(calculateDeposit(500, 30)).toBe(500);
  });

  it("is zero for no total or no percent", () => {
    expect(calculateDeposit(0, 30)).toBe(0);
    expect(calculateDeposit(200_000, 0)).toBe(0);
  });
});

describe("getPaymentCode", () => {
  it("is SB + the last 8 letters/digits of the id, uppercased", () => {
    // "clx1abcd2efgh3ij4k5l" -> "CLX1ABCD2EFGH3IJ4K5L" -> 8 ký tự cuối "H3IJ4K5L"
    expect(getPaymentCode("clx1abcd2efgh3ij4k5l")).toBe("SBH3IJ4K5L");
  });

  it("is deterministic and fits the 25-char QR content limit", () => {
    const id = "cmabc123def456ghi789";
    expect(getPaymentCode(id)).toBe(getPaymentCode(id));
    expect(getPaymentCode(id).length).toBeLessThanOrEqual(25);
  });

  it("ignores non-alphanumeric characters", () => {
    // "a-b_c-d_e-f_g-h_i" -> "ABCDEFGHI" -> 8 ký tự cuối "BCDEFGHI"
    expect(getPaymentCode("a-b_c-d_e-f_g-h_i")).toBe("SBBCDEFGHI");
  });
});

describe("evaluateRefund", () => {
  const now = new Date("2030-01-10T00:00:00Z");
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3_600_000);
  const base = {
    depositPaid: 60_000,
    now,
    cancelBeforeHours: 24,
    cancelledByOwner: false,
  };

  it("refunds in full when cancelled early enough", () => {
    const r = evaluateRefund({ ...base, startsAt: hoursFromNow(48) });
    expect(r).toMatchObject({ eligible: true, amount: 60_000, reason: "in_time" });
  });

  it("refunds at exactly the deadline", () => {
    const r = evaluateRefund({ ...base, startsAt: hoursFromNow(24) });
    expect(r.eligible).toBe(true);
  });

  it("forfeits the deposit when cancelled too late", () => {
    const r = evaluateRefund({ ...base, startsAt: hoursFromNow(23.9) });
    expect(r).toMatchObject({ eligible: false, amount: 0, reason: "late_cancel" });
  });

  it("forfeits when the match has already started", () => {
    const r = evaluateRefund({ ...base, startsAt: hoursFromNow(-1) });
    expect(r.reason).toBe("late_cancel");
  });

  it("always refunds in full when the owner cancels", () => {
    const r = evaluateRefund({
      ...base,
      startsAt: hoursFromNow(1),
      cancelledByOwner: true,
    });
    expect(r).toMatchObject({
      eligible: true,
      amount: 60_000,
      reason: "owner_cancelled",
    });
  });

  it("owes nothing when no deposit was paid", () => {
    const r = evaluateRefund({ ...base, depositPaid: 0, startsAt: hoursFromNow(48) });
    expect(r).toMatchObject({ eligible: false, amount: 0, reason: "no_deposit" });
  });

  it("with a 0-hour policy, any future cancellation is refunded", () => {
    const r = evaluateRefund({
      ...base,
      cancelBeforeHours: 0,
      startsAt: hoursFromNow(0.5),
    });
    expect(r.eligible).toBe(true);
  });
});

describe("settings validator (deposit and bank)", () => {
  it("accepts valid deposit and bank info", () => {
    const parsed = updateSettingsSchema.safeParse({
      deposit_percent: 30,
      bank_bin: "970436",
      bank_account_no: "0123456789",
      bank_account_name: "NGUYEN VAN A",
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["deposit below 1", { deposit_percent: 0 }],
    ["deposit above 100", { deposit_percent: 101 }],
    ["fractional deposit", { deposit_percent: 12.5 }],
    ["short bin", { bank_bin: "9704" }],
    ["non-numeric bin", { bank_bin: "97043A" }],
    ["short account", { bank_account_no: "12345" }],
    ["account with letters", { bank_account_no: "12345678AB" }],
    ["empty account name", { bank_account_name: "   " }],
  ])("rejects %s", (_name, body) => {
    expect(updateSettingsSchema.safeParse(body).success).toBe(false);
  });
});

describe("confirm booking validator", () => {
  it("allows an empty body (defaults to the required deposit)", () => {
    expect(confirmBookingSchema.safeParse({}).success).toBe(true);
  });

  it("accepts amount, method and transaction id", () => {
    const parsed = confirmBookingSchema.safeParse({
      amount: 60_000,
      method: "cash",
      transactionId: "FT26110012345",
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["zero amount", { amount: 0 }],
    ["fractional amount", { amount: 10.5 }],
    ["string amount", { amount: "60000" }],
    ["unknown method", { method: "momo" }],
    ["empty transaction id", { transactionId: "  " }],
  ])("rejects %s", (_name, body) => {
    expect(confirmBookingSchema.safeParse(body).success).toBe(false);
  });
});
