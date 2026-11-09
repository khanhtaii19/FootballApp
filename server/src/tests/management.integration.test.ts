import { it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { generateTokens } from "../lib/jwt.js";
import prisma from "../lib/prisma.js";
import { createUserWithRole, resetBookingData, resetUsers } from "./helpers/test-db.js";

const describeDb = await getDescribeDb();

describeDb("Settings, zones & blocks (integration)", () => {
  beforeAll(async () => {
    await resetUsers();
  });

  afterAll(async () => {
    await resetBookingData();
    await resetUsers();
  });

  beforeEach(async () => {
    await resetBookingData();
  });

  it("returns 6 zones", async () => {
    const res = await request(app).get("/api/zones").expect(200);
    expect(res.body.zones).toHaveLength(6);
    expect(res.body.zones.map((z: { name: string }) => z.name).sort()).toEqual([
      "A1",
      "A2",
      "A3",
      "B1",
      "B2",
      "B3",
    ]);
  });

  it("allows owner to update settings, denies customer", async () => {
    const suffix = `${Date.now()}`;
    const { user: owner } = await createUserWithRole("owner", `o-${suffix}`);
    const { user: customer } = await createUserWithRole("customer", `c-${suffix}`);

    const ownerToken = generateTokens({
      userId: owner.id,
      role: owner.role,
    }).accessToken;
    const customerToken = generateTokens({
      userId: customer.id,
      role: customer.role,
    }).accessToken;

    await request(app)
      .put("/api/settings")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ price_5: 250000 })
      .expect(403);

    const updateRes = await request(app)
      .put("/api/settings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ price_5: 250000, price_7: 550000 })
      .expect(200);

    expect(updateRes.body.settings.price_5).toBe(250000);
    expect(updateRes.body.settings.price_7).toBe(550000);

    const publicRes = await request(app).get("/api/settings").expect(200);
    expect(publicRes.body.settings.price_5).toBe(250000);
  });

  it("creates block and rejects overlapping block on same zone", async () => {
    const suffix = `${Date.now()}-block`;
    const { user: owner } = await createUserWithRole("owner", suffix);
    const ownerToken = generateTokens({
      userId: owner.id,
      role: owner.role,
    }).accessToken;

    const zonesRes = await request(app).get("/api/zones").expect(200);
    const zoneA1 = zonesRes.body.zones.find((z: { name: string }) => z.name === "A1");

    const startsAt = "2026-12-01T11:00:00.000Z";
    const endsAt = "2026-12-01T12:00:00.000Z";

    await request(app)
      .post("/api/blocks")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        zoneId: zoneA1.id,
        startsAt,
        endsAt,
        note: "Bảo trì",
      })
      .expect(201);

    await request(app)
      .post("/api/blocks")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        zoneId: zoneA1.id,
        startsAt: "2026-12-01T11:30:00.000Z",
        endsAt: "2026-12-01T13:00:00.000Z",
      })
      .expect(409);

    const listRes = await request(app)
      .get("/api/blocks")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(listRes.body.blocks).toHaveLength(1);
    expect(listRes.body.blocks[0].fieldType).toBe("block");

    await request(app)
      .delete(`/api/blocks/${listRes.body.blocks[0].id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    const activeRows = await prisma.bookingZone.count({
      where: { bookingId: listRes.body.blocks[0].id, isActive: true },
    });
    expect(activeRows).toBe(0);
  });
});
