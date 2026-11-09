import { it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import { generateTokens } from "../lib/jwt.js";
import { createUserWithRole, resetUsers } from "./helpers/test-db.js";

const describeDb = await getDescribeDb();

describeDb("Auth API (integration)", () => {
  beforeAll(async () => {
    await resetUsers();
  });

  afterAll(async () => {
    await resetUsers();
  });

  beforeEach(async () => {
    await resetUsers();
  });

  it("returns 403 when customer calls owner-only route", async () => {
    const suffix = `${Date.now()}-customer`;
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: `customer-${suffix}@test.local`,
        password: "TestPass123",
        name: "Khách hàng",
      })
      .expect(201);

    const { accessToken } = registerRes.body;

    await request(app)
      .get("/api/auth/owner-test")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403)
      .expect((res) => {
        expect(res.body.error).toMatch(/quyền/i);
      });
  });

  it("returns 200 when owner calls owner-only route", async () => {
    const suffix = `${Date.now()}-owner`;
    const { user } = await createUserWithRole("owner", suffix);
    const { accessToken } = generateTokens({
      userId: user.id,
      role: user.role,
    });

    await request(app)
      .get("/api/auth/owner-test")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toMatch(/chủ sân/i);
      });
  });

  it("returns 401 without token on protected route", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });
});
