import { describe, expect, it } from "vitest";
import {
  checkOwnerPassword,
  OwnerCredentialsError,
  resolveOwnerCredentials,
} from "../lib/owner-credentials.js";

describe("checkOwnerPassword", () => {
  it("accepts a long mixed password", () => {
    expect(checkOwnerPassword("SanBong2026Secure")).toEqual([]);
  });

  it.each([
    ["too short", "Ab1cdefg", "ít nhất 12"],
    ["no lowercase", "ABCDEFGHIJKL1234", "chữ thường"],
    ["no uppercase", "abcdefghijkl1234", "chữ hoa"],
    ["no digit", "AbcdefghijklMnop", "chữ số"],
    ["the public demo password", "OwnerPass123", "mật khẩu demo"],
  ])("rejects %s", (_name, password, expected) => {
    expect(checkOwnerPassword(password).join(" ")).toContain(expected);
  });
});

describe("resolveOwnerCredentials", () => {
  it("falls back to the demo owner in development", () => {
    expect(resolveOwnerCredentials({ NODE_ENV: "development" })).toMatchObject({
      email: "owner@sanbong.vn",
      password: "OwnerPass123",
      isDemo: true,
    });
  });

  it("lets development override the demo owner", () => {
    const owner = resolveOwnerCredentials({
      SEED_OWNER_EMAIL: "me@example.com",
      SEED_OWNER_PASSWORD: "x",
    });
    expect(owner).toMatchObject({ email: "me@example.com", isDemo: false });
  });

  it("never creates the public demo owner in production", () => {
    expect(() => resolveOwnerCredentials({ NODE_ENV: "production" })).toThrow(
      OwnerCredentialsError
    );
    expect(() =>
      resolveOwnerCredentials({ NODE_ENV: "production", SEED_OWNER_EMAIL: "a@b.vn" })
    ).toThrow(/SEED_OWNER_PASSWORD/);
    expect(() =>
      resolveOwnerCredentials({
        NODE_ENV: "production",
        SEED_OWNER_EMAIL: "owner@sanbong.vn",
        SEED_OWNER_PASSWORD: "OwnerPass123",
      })
    ).toThrow(/yếu/);
  });

  it("requires a strong password and a real email in production", () => {
    expect(() =>
      resolveOwnerCredentials({
        NODE_ENV: "production",
        SEED_OWNER_EMAIL: "a@b.vn",
        SEED_OWNER_PASSWORD: "short1A",
      })
    ).toThrow(/yếu/);
    expect(() =>
      resolveOwnerCredentials({
        NODE_ENV: "production",
        SEED_OWNER_EMAIL: "not-an-email",
        SEED_OWNER_PASSWORD: "SanBong2026Secure",
      })
    ).toThrow(/không hợp lệ/);
  });

  it("accepts a proper production owner", () => {
    const owner = resolveOwnerCredentials({
      NODE_ENV: "production",
      SEED_OWNER_EMAIL: "chu.san@example.com",
      SEED_OWNER_PASSWORD: "SanBong2026Secure",
      SEED_OWNER_NAME: "Anh Tài",
    });
    expect(owner).toEqual({
      email: "chu.san@example.com",
      password: "SanBong2026Secure",
      name: "Anh Tài",
      phone: null,
      isDemo: false,
    });
  });
});
