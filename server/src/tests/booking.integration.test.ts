import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { generateTokens } from "../lib/jwt.js";
import prisma from "../lib/prisma.js";
import { createUserWithRole, resetBookingData, resetUsers } from "./helpers/test-db.js";

// ─── Chỉ chạy khi có DB ─────────────────────────────

async function canReachDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const describeDb = (await canReachDatabase()) ? describe : describe.skip;

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
    customerToken = generateTokens({ userId: customer.id, role: customer.role }).accessToken;
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

  it("Case 1: rejects sân 5 on A2 when sân 7#1 already booked (chung vùng + giờ chồng)", async () => {
    const startsAt = futureUtc(8, "18:00");

    // Book sân 7 → chiếm 3 vùng surface A
    const first = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ fieldType: "seven", startsAt, duration: 60 })
      .expect(201);

    const bookedSurface = first.body.booking.bookingZones[0].zone.surface;

    // Kiểm tra: sân 5 cùng thời gian → vẫn có thể book (vùng khác surface)
    // Nhưng: đã chiếm 3 vùng surface A hoặc B, nên availableCount giảm
    const date = futureDate(8);
    const slotsRes = await request(app)
      .get(`/api/bookings/available?date=${date}&fieldType=five&duration=60`)
      .expect(200);

    const slot = slotsRes.body.slots.find(
      (s: { startTime: string }) => s.startTime === "18:00"
    );
    // 6 - 3 = 3 vùng còn trống (surface kia)
    expect(slot.availableCount).toBe(3);
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
    const assignedZones = successes.flatMap(
      (r) => r.body.booking.bookingZones.map(
        (bz: { zone: { id: string } }) => bz.zone.id
      )
    );

    // Không có zone nào bị gán trùng
    expect(new Set(assignedZones).size).toBe(assignedZones.length);
  });
});
