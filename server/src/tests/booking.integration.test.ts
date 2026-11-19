import { it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { generateTokens } from "../lib/jwt.js";
import prisma from "../lib/prisma.js";
import { runExpiryJob } from "../services/booking-expiry.service.js";
import { calculateDeposit, getPaymentCode } from "../lib/payment.js";
import { parseTlv, verifyVietQrCrc } from "../lib/vietqr.js";
import {
  createUserWithRole,
  getDescribeDb,
  resetBookingData,
  resetUsers,
} from "./helpers/test-db.js";

const describeDb = await getDescribeDb();

// ─── Helpers ─────────────────────────────────────────

// Tạo ngày tương lai để tránh lỗi "không thể đặt trong quá khứ"
function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Chuyển giờ VN sang UTC ISO string cho ngày tương lai
function futureUtc(daysFromNow: number, vnTime: string): string {
  const date = futureDate(daysFromNow);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = vnTime.split(":").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
  return utc.toISOString();
}

describeDb("Booking Integration Tests", () => {
  let customerToken: string;
  let ownerToken: string;
  let customerId: string;

  beforeAll(async () => {
    await resetUsers();
    const suffix = `booking-${Date.now()}`;
    const { user: customer } = await createUserWithRole("customer", suffix);
    const { user: owner } = await createUserWithRole("owner", suffix);
    customerId = customer.id;
    customerToken = generateTokens({
      userId: customer.id,
      role: customer.role,
    }).accessToken;
    ownerToken = generateTokens({ userId: owner.id, role: owner.role }).accessToken;
  });

  afterAll(async () => {
    await resetBookingData();
    await resetUsers();
  });

  beforeEach(async () => {
    await resetBookingData();
  });

  // ─── Giờ trống ───────────────────────────────────

  it("returns available slots for a date", async () => {
    const date = futureDate(7);
    const res = await request(app)
      .get(`/api/bookings/available?date=${date}&fieldType=five&duration=60`)
      .expect(200);

    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(res.body.fieldType).toBe("five");
    expect(res.body.duration).toBe(60);

    // Mỗi slot phải có đủ field
    const slot = res.body.slots[0];
    expect(slot).toHaveProperty("startTime");
    expect(slot).toHaveProperty("endTime");
    expect(slot).toHaveProperty("startsAt");
    expect(slot).toHaveProperty("endsAt");
    expect(slot).toHaveProperty("availableCount");
    expect(slot.availableCount).toBe(6); // 6 vùng trống
  });

  it("returns 6 available for five, 2 for seven on empty day", async () => {
    const date = futureDate(7);

    const resFive = await request(app)
      .get(`/api/bookings/available?date=${date}&fieldType=five&duration=60`)
      .expect(200);
    expect(resFive.body.slots[0].availableCount).toBe(6);

    const resSeven = await request(app)
      .get(`/api/bookings/available?date=${date}&fieldType=seven&duration=60`)
      .expect(200);
    expect(resSeven.body.slots[0].availableCount).toBe(2);
  });

  // ─── Tạo booking ────────────────────────────────

  it("creates a booking for sân 5", async () => {
    const startsAt = futureUtc(7, "18:00");

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 60 })
      .expect(201);

    expect(res.body.booking.fieldType).toBe("five");
    expect(res.body.booking.status).toBe("pending");
    expect(res.body.booking.totalAmount).toBe(200_000);
    expect(res.body.booking.bookingZones).toHaveLength(1);
    expect(res.body.booking.expiresAt).toBeTruthy();
  });

  it("creates a booking for sân 7 (occupies 3 zones of one surface)", async () => {
    const startsAt = futureUtc(7, "18:00");

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "seven", startsAt, duration: 90 })
      .expect(201);

    expect(res.body.booking.fieldType).toBe("seven");
    expect(res.body.booking.totalAmount).toBe(750_000); // 500k * 1.5h
    expect(res.body.booking.bookingZones).toHaveLength(3);

    // Tất cả 3 zone cùng surface
    const surfaces = res.body.booking.bookingZones.map(
      (bz: { zone: { surface: string } }) => bz.zone.surface
    );
    expect(new Set(surfaces).size).toBe(1);
  });

  it("rejects booking outside operating hours", async () => {
    const startsAt = futureUtc(7, "03:00");

    await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 60 })
      .expect(400);
  });

  it("rejects unauthenticated booking", async () => {
    const startsAt = futureUtc(7, "18:00");

    await request(app)
      .post("/api/bookings")
      .send({ fieldType: "five", startsAt, duration: 60 })
      .expect(401);
  });

  // ─── 4 tình huống bảng 1.2 ───────────────────────

  it("Case 1: sân 7 chiếm cả mặt cỏ nên chỉ còn 3 vùng sân 5, vùng thứ 4 bị từ chối (409)", async () => {
    const startsAt = futureUtc(8, "18:00");
    const book = (fieldType: "five" | "seven") =>
      request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ fieldType, startsAt, duration: 60 });

    const seven = await book("seven").expect(201);
    const sevenSurface = seven.body.booking.bookingZones[0].zone.surface;

    // 3 sân 5 còn lại đều rơi vào mặt cỏ KHÁC
    for (let i = 0; i < 3; i++) {
      const five = await book("five").expect(201);
      expect(five.body.booking.bookingZones[0].zone.surface).not.toBe(sevenSurface);
    }

    // Hết vùng: sân 5 thứ 4 phải bị từ chối
    await book("five").expect(409);
  });

  it("Case 2: allows sân 5 on B1 when sân 7#1 booked on surface A (khác mặt cỏ)", async () => {
    const startsAt = futureUtc(9, "18:00");

    // Book sân 7 → chiếm 1 surface
    await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "seven", startsAt, duration: 60 })
      .expect(201);

    // Book sân 5 cùng giờ → phải thành công (surface khác)
    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 60 })
      .expect(201);

    expect(res.body.booking.fieldType).toBe("five");
  });

  it("Case 3: allows sân 5 A2 when sân 5 A1 same time (khác vùng)", async () => {
    const startsAt = futureUtc(10, "18:00");

    // Book 2 sân 5 cùng giờ → cả 2 đều thành công (vùng khác nhau)
    const first = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 90 })
      .expect(201);

    const second = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 90 })
      .expect(201);

    // 2 booking, 2 vùng khác nhau
    const zone1 = first.body.booking.bookingZones[0].zone.name;
    const zone2 = second.body.booking.bookingZones[0].zone.name;
    expect(zone1).not.toBe(zone2);
  });

  it("Case 4: allows same zone back-to-back (nối tiếp, không chồng)", async () => {
    const startsAt1 = futureUtc(11, "18:00");
    const startsAt2 = futureUtc(11, "19:00");

    await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt: startsAt1, duration: 60 })
      .expect(201);

    await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt: startsAt2, duration: 60 })
      .expect(201);
  });

  // ─── Hủy + xác nhận ─────────────────────────────

  it("cancels a booking and releases zones", async () => {
    const startsAt = futureUtc(12, "18:00");

    const createRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 60 })
      .expect(201);

    const bookingId = createRes.body.booking.id;

    // Hủy
    const cancelRes = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${customerToken}`)
      .expect(200);

    expect(cancelRes.body.booking.status).toBe("cancelled");

    // Kiểm tra booking_zones đã inactive
    const activeCount = await prisma.bookingZone.count({
      where: { bookingId, isActive: true },
    });
    expect(activeCount).toBe(0);

    // Giờ đó phải trống lại → đặt lại thành công
    await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 60 })
      .expect(201);
  });

  it("owner can confirm a pending booking", async () => {
    const startsAt = futureUtc(13, "18:00");

    const createRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 60 })
      .expect(201);

    const confirmRes = await request(app)
      .patch(`/api/bookings/${createRes.body.booking.id}/confirm`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(confirmRes.body.booking.status).toBe("confirmed");
    expect(confirmRes.body.booking.paidAt).toBeTruthy();
    expect(confirmRes.body.booking.expiresAt).toBeNull();
  });

  it("customer cannot confirm a booking (403)", async () => {
    const startsAt = futureUtc(14, "18:00");

    const createRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 60 })
      .expect(201);

    await request(app)
      .patch(`/api/bookings/${createRes.body.booking.id}/confirm`)
      .set("Authorization", `Bearer ${customerToken}`)
      .expect(403);
  });

  // ─── Danh sách booking ──────────────────────────

  it("customer sees only their own bookings", async () => {
    const startsAt = futureUtc(15, "18:00");

    await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "five", startsAt, duration: 60 })
      .expect(201);

    const res = await request(app)
      .get("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.bookings.length).toBeGreaterThanOrEqual(1);
    // Tất cả booking đều của customer này
    for (const b of res.body.bookings) {
      expect(b.user.id).toBe(customerId);
    }
  });

  // ─── Test đồng thời (concurrent) ─────────────────
  // Quan trọng nhất: nhiều request cùng đặt, chỉ đúng số lượng thành công

  it("CONCURRENT: only 6 out of 8 five-a-side bookings succeed (6 zones)", async () => {
    const startsAt = futureUtc(20, "10:00");

    // Gửi 8 request đồng thời cho sân 5 cùng giờ
    const promises = Array.from({ length: 8 }, () =>
      request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ fieldType: "five", startsAt, duration: 60 })
    );

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status === 409);

    // Chính xác 6 thành công (6 vùng), 2 thất bại
    expect(successes).toHaveLength(6);
    expect(failures).toHaveLength(2);
  });

  it("CONCURRENT: only 2 out of 4 seven-a-side bookings succeed (2 surfaces)", async () => {
    const startsAt = futureUtc(21, "10:00");

    // Gửi 4 request đồng thời cho sân 7 cùng giờ
    const promises = Array.from({ length: 4 }, () =>
      request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ fieldType: "seven", startsAt, duration: 60 })
    );

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status === 409);

    // Chính xác 2 thành công (2 mặt cỏ), 2 thất bại
    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(2);
  });

  it("CONCURRENT: no duplicate zones assigned across concurrent bookings", async () => {
    const startsAt = futureUtc(22, "10:00");

    const promises = Array.from({ length: 6 }, () =>
      request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ fieldType: "five", startsAt, duration: 60 })
    );

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.status === 201);

    // Thu thập tất cả zone đã gán
    const assignedZones = successes.flatMap((r) =>
      r.body.booking.bookingZones.map((bz: { zone: { id: string } }) => bz.zone.id)
    );

    // Không có zone nào bị gán trùng
    expect(new Set(assignedZones).size).toBe(assignedZones.length);
  });

  // ─── Hết hạn giữ chỗ (pending) ────────────────────

  const bookAs = (
    token: string,
    fieldType: "five" | "seven",
    startsAt: string,
    duration = 60
  ) =>
    request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({ fieldType, startsAt, duration });

  // Đẩy hạn giữ chỗ về quá khứ để mô phỏng "khách không thanh toán kịp"
  const makeStale = (bookingId: string) =>
    prisma.booking.update({
      where: { id: bookingId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

  it("Expiry: job expires stale pending bookings and releases their zones", async () => {
    const res = await bookAs(customerToken, "seven", futureUtc(9, "18:00")).expect(201);
    const id = res.body.booking.id;
    await makeStale(id);

    expect(await runExpiryJob()).toBe(1);

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id },
      include: { bookingZones: true },
    });
    expect(booking.status).toBe("expired");
    expect(booking.bookingZones).toHaveLength(3);
    expect(booking.bookingZones.every((z) => !z.isActive)).toBe(true);

    // Lượt thứ hai không còn gì để dọn
    expect(await runExpiryJob()).toBe(0);
  });

  it("Expiry: job leaves live pending and confirmed bookings untouched", async () => {
    const live = await bookAs(customerToken, "five", futureUtc(9, "17:00")).expect(201);
    const toConfirm = await bookAs(customerToken, "five", futureUtc(9, "19:00")).expect(
      201
    );
    await request(app)
      .patch(`/api/bookings/${toConfirm.body.booking.id}/confirm`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(await runExpiryJob()).toBe(0);

    for (const [id, status] of [
      [live.body.booking.id, "pending"],
      [toConfirm.body.booking.id, "confirmed"],
    ] as const) {
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id },
        include: { bookingZones: true },
      });
      expect(booking.status).toBe(status);
      expect(booking.bookingZones.every((z) => z.isActive)).toBe(true);
    }
  });

  it("Expiry: a stale pending booking no longer blocks a new one (no job needed)", async () => {
    const startsAt = futureUtc(9, "19:00");
    const first = await bookAs(customerToken, "seven", startsAt).expect(201);
    await bookAs(customerToken, "seven", startsAt).expect(201);
    await bookAs(customerToken, "seven", startsAt).expect(409); // hết 2 mặt cỏ

    await makeStale(first.body.booking.id);

    // Chưa chạy job, nhưng đặt vẫn thành công nhờ dọn ngay khi tạo booking
    await bookAs(customerToken, "seven", startsAt).expect(201);

    const old = await prisma.booking.findUniqueOrThrow({
      where: { id: first.body.booking.id },
    });
    expect(old.status).toBe("expired");
  });

  it("Expiry: available slots ignore stale pending bookings", async () => {
    const startsAt = futureUtc(9, "20:00");
    const first = await bookAs(customerToken, "seven", startsAt).expect(201);
    await bookAs(customerToken, "seven", startsAt).expect(201);

    const url = `/api/bookings/available?date=${futureDate(9)}&fieldType=seven&duration=60`;
    const before = await request(app).get(url).expect(200);
    expect(
      before.body.slots.find((s: { startTime: string }) => s.startTime === "20:00")
    ).toBeUndefined();

    await makeStale(first.body.booking.id);

    const after = await request(app).get(url).expect(200);
    const slot = after.body.slots.find(
      (s: { startTime: string }) => s.startTime === "20:00"
    );
    expect(slot?.availableCount).toBe(1);
  });

  it("Expiry: owner cannot confirm a stale pending booking (409)", async () => {
    const res = await bookAs(customerToken, "five", futureUtc(9, "21:00")).expect(201);
    const id = res.body.booking.id;
    await makeStale(id);

    await request(app)
      .patch(`/api/bookings/${id}/confirm`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(409);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(booking.status).not.toBe("confirmed");

    // Sau khi job chạy thì đã expired, vẫn không xác nhận được
    await runExpiryJob();
    await request(app)
      .patch(`/api/bookings/${id}/confirm`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(409);
  });

  it("Pending limit: a user cannot hold more than the maximum pending bookings (429)", async () => {
    const previous = process.env.MAX_PENDING_BOOKINGS_PER_USER;
    process.env.MAX_PENDING_BOOKINGS_PER_USER = "2";

    try {
      const first = await bookAs(customerToken, "five", futureUtc(10, "17:00")).expect(
        201
      );
      await bookAs(customerToken, "five", futureUtc(10, "19:00")).expect(201);
      await bookAs(customerToken, "five", futureUtc(10, "21:00")).expect(429);

      // Người dùng khác không bị ảnh hưởng
      await bookAs(ownerToken, "five", futureUtc(10, "21:00")).expect(201);

      // Hủy một booking thì đặt thêm được
      await request(app)
        .patch(`/api/bookings/${first.body.booking.id}/cancel`)
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(200);
      await bookAs(customerToken, "five", futureUtc(10, "22:00")).expect(201);
    } finally {
      if (previous === undefined) delete process.env.MAX_PENDING_BOOKINGS_PER_USER;
      else process.env.MAX_PENDING_BOOKINGS_PER_USER = previous;
    }
  });

  it("Pending limit: stale pending bookings do not count towards the limit", async () => {
    const previous = process.env.MAX_PENDING_BOOKINGS_PER_USER;
    process.env.MAX_PENDING_BOOKINGS_PER_USER = "1";

    try {
      const first = await bookAs(customerToken, "five", futureUtc(11, "17:00")).expect(
        201
      );
      await bookAs(customerToken, "five", futureUtc(11, "19:00")).expect(429);

      await makeStale(first.body.booking.id);

      // Booking cũ đã quá hạn nên không còn chiếm "suất" pending
      await bookAs(customerToken, "five", futureUtc(11, "19:00")).expect(201);
    } finally {
      if (previous === undefined) delete process.env.MAX_PENDING_BOOKINGS_PER_USER;
      else process.env.MAX_PENDING_BOOKINGS_PER_USER = previous;
    }
  });

  // ─── Thanh toán QR, đặt cọc, hoàn cọc ─────────────

  const putSettings = (data: Record<string, unknown>) =>
    request(app)
      .put("/api/settings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(data);

  const getSettings = async () =>
    (await request(app).get("/api/settings").expect(200)).body.settings;

  const confirmAs = (bookingId: string, body: Record<string, unknown> = {}) =>
    request(app)
      .patch(`/api/bookings/${bookingId}/confirm`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(body);

  const cancelAs = (token: string, bookingId: string) =>
    request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`);

  const paymentOf = (token: string, bookingId: string) =>
    request(app)
      .get(`/api/bookings/${bookingId}/payment`)
      .set("Authorization", `Bearer ${token}`);

  const BANK = {
    bank_bin: "970436",
    bank_account_no: "0123456789",
    bank_account_name: "NGUYEN VAN A",
  };

  it("Payment: a booking snapshots the deposit (percent of total, rounded up)", async () => {
    const settings = await getSettings();
    const res = await bookAs(customerToken, "five", futureUtc(14, "17:00")).expect(201);

    const { totalAmount, deposit } = res.body.booking;
    expect(deposit).toBeGreaterThan(0);
    expect(deposit).toBe(calculateDeposit(totalAmount, settings.deposit_percent));
  });

  it("Payment: payment info gives a valid VietQR and is hidden from other customers", async () => {
    await putSettings(BANK).expect(200);
    const res = await bookAs(customerToken, "five", futureUtc(14, "19:00")).expect(201);
    const { id, deposit } = res.body.booking;

    const info = (await paymentOf(customerToken, id).expect(200)).body.payment;
    expect(info.awaitingPayment).toBe(true);
    expect(info.deposit).toBe(deposit);
    expect(info.transferContent).toBe(getPaymentCode(id));
    expect(info.bank).toMatchObject({
      bin: BANK.bank_bin,
      accountNo: BANK.bank_account_no,
    });

    expect(verifyVietQrCrc(info.qrPayload)).toBe(true);
    const tlv = parseTlv(info.qrPayload);
    expect(tlv["54"]).toBe(String(deposit));
    expect(parseTlv(tlv["62"])["08"]).toBe(getPaymentCode(id));

    // Khách khác không xem được; chủ sân xem được
    const { user: other } = await createUserWithRole("customer", `other-${Date.now()}`);
    const otherToken = generateTokens({ userId: other.id, role: other.role }).accessToken;
    await paymentOf(otherToken, id).expect(403);
    await paymentOf(ownerToken, id).expect(200);
  });

  it("Payment: no QR once the booking is paid or its hold has expired", async () => {
    await putSettings(BANK).expect(200);

    const paid = await bookAs(customerToken, "five", futureUtc(14, "21:00")).expect(201);
    await confirmAs(paid.body.booking.id).expect(200);
    const paidInfo = (await paymentOf(customerToken, paid.body.booking.id).expect(200))
      .body.payment;
    expect(paidInfo.awaitingPayment).toBe(false);
    expect(paidInfo.qrPayload).toBeNull();

    const stale = await bookAs(customerToken, "five", futureUtc(15, "17:00")).expect(201);
    await makeStale(stale.body.booking.id);
    const staleInfo = (await paymentOf(customerToken, stale.body.booking.id).expect(200))
      .body.payment;
    expect(staleInfo.awaitingPayment).toBe(false);
    expect(staleInfo.qrPayload).toBeNull();
  });

  it("Payment: confirm records the payment and enforces the deposit", async () => {
    const res = await bookAs(customerToken, "five", futureUtc(15, "19:00")).expect(201);
    const { id, deposit } = res.body.booking;

    // Thiếu tiền cọc, sai hình thức: bị từ chối, booking vẫn pending
    await confirmAs(id, { amount: Math.max(deposit - 1000, 1) }).expect(400);
    await confirmAs(id, { method: "momo" }).expect(400);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe(
      "pending"
    );

    const ok = await confirmAs(id, { amount: deposit, transactionId: "FT123456" }).expect(
      200
    );
    expect(ok.body.booking.status).toBe("confirmed");
    expect(ok.body.booking.paymentCode).toBe(getPaymentCode(id));
    expect(ok.body.booking.payments).toHaveLength(1);
    expect(ok.body.booking.payments[0]).toMatchObject({
      amount: deposit,
      method: "bank_transfer",
      status: "completed",
      transactionId: "FT123456",
    });

    // Xác nhận lần hai: không tạo thêm khoản thanh toán
    await confirmAs(id).expect(400);
    expect(await prisma.payment.count({ where: { bookingId: id } })).toBe(1);
  });

  it("Refund: cancelling early returns the deposit, and the owner marks it refunded", async () => {
    const res = await bookAs(customerToken, "five", futureUtc(20, "18:00")).expect(201);
    const { id, deposit } = res.body.booking;
    await confirmAs(id).expect(200);

    const cancelled = await cancelAs(customerToken, id).expect(200);
    expect(cancelled.body.refund).toMatchObject({
      eligible: true,
      amount: deposit,
      reason: "in_time",
    });
    expect(cancelled.body.booking.refundAmount).toBe(deposit);

    const before = (await paymentOf(customerToken, id).expect(200)).body.payment;
    expect(before.refund).toMatchObject({ amount: deposit, due: true, paid: false });

    // Khách không được tự đánh dấu hoàn; chủ sân thì được, và chỉ một lần
    await request(app)
      .patch(`/api/bookings/${id}/refund`)
      .set("Authorization", `Bearer ${customerToken}`)
      .expect(403);

    const refunded = await request(app)
      .patch(`/api/bookings/${id}/refund`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(refunded.body.booking.payments[0].status).toBe("refunded");

    await request(app)
      .patch(`/api/bookings/${id}/refund`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(409);

    const after = (await paymentOf(customerToken, id).expect(200)).body.payment;
    expect(after.refund).toMatchObject({ due: false, paid: true });
  });

  it("Refund: a late cancellation forfeits the deposit, an owner cancellation refunds it", async () => {
    const previous = (await getSettings()).cancel_before_hours;
    await putSettings({ cancel_before_hours: 168 }).expect(200); // phải hủy trước 7 ngày

    try {
      // Khách hủy trong vòng 7 ngày: mất cọc
      const late = await bookAs(customerToken, "five", futureUtc(2, "18:00")).expect(201);
      await confirmAs(late.body.booking.id).expect(200);
      const lateCancel = await cancelAs(customerToken, late.body.booking.id).expect(200);
      expect(lateCancel.body.refund).toMatchObject({
        eligible: false,
        amount: 0,
        reason: "late_cancel",
      });
      await request(app)
        .patch(`/api/bookings/${late.body.booking.id}/refund`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(400);

      // Chủ sân hủy: luôn hoàn đủ, kể cả sát giờ
      const byOwner = await bookAs(customerToken, "five", futureUtc(2, "20:00")).expect(
        201
      );
      await confirmAs(byOwner.body.booking.id).expect(200);
      const ownerCancel = await cancelAs(ownerToken, byOwner.body.booking.id).expect(200);
      expect(ownerCancel.body.refund).toMatchObject({
        eligible: true,
        amount: byOwner.body.booking.deposit,
        reason: "owner_cancelled",
      });
    } finally {
      await putSettings({ cancel_before_hours: previous }).expect(200);
    }
  });

  it("Refund: cancelling an unpaid pending booking owes nothing", async () => {
    const res = await bookAs(customerToken, "five", futureUtc(16, "18:00")).expect(201);
    const cancelled = await cancelAs(customerToken, res.body.booking.id).expect(200);

    expect(cancelled.body.refund).toMatchObject({
      eligible: false,
      amount: 0,
      reason: "no_deposit",
    });
    await request(app)
      .patch(`/api/bookings/${res.body.booking.id}/refund`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(400);
  });

  // ─── Lọc danh sách booking theo ngày ──────────────

  it("List: ?date= returns only the bookings that touch that day", async () => {
    const dayA = await bookAs(customerToken, "five", futureUtc(17, "18:00")).expect(201);
    const dayB = await bookAs(customerToken, "five", futureUtc(18, "18:00")).expect(201);

    const list = (token: string, query: string) =>
      request(app).get(`/api/bookings${query}`).set("Authorization", `Bearer ${token}`);

    const onlyA = await list(ownerToken, `?date=${futureDate(17)}`).expect(200);
    expect(onlyA.body.bookings.map((b: { id: string }) => b.id)).toEqual([
      dayA.body.booking.id,
    ]);

    const onlyB = await list(customerToken, `?date=${futureDate(18)}`).expect(200);
    expect(onlyB.body.bookings.map((b: { id: string }) => b.id)).toEqual([
      dayB.body.booking.id,
    ]);

    const none = await list(ownerToken, `?date=${futureDate(19)}`).expect(200);
    expect(none.body.bookings).toHaveLength(0);

    // Không có tham số: trả tất cả
    const all = await list(ownerToken, "").expect(200);
    expect(all.body.bookings).toHaveLength(2);
  });

  it("List: rejects an impossible date with 400", async () => {
    await request(app)
      .get("/api/bookings?date=2030-02-31")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(400);
  });
});
