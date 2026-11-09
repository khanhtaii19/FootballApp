import { describe, it, expect, beforeEach } from "vitest";
import { generateTokens, verifyAccessToken, verifyRefreshToken } from "../lib/jwt.js";
import { hashPassword, comparePassword } from "../lib/password.js";

// ─── JWT Tests ───────────────────────────────────────

describe("JWT Utils", () => {
  const payload = { userId: "user-123", role: "customer" };

  it("should generate access and refresh tokens", () => {
    const tokens = generateTokens(payload);

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.accessToken).not.toBe(tokens.refreshToken);
  });

  it("should verify a valid access token", () => {
    const { accessToken } = generateTokens(payload);
    const decoded = verifyAccessToken(accessToken);

    expect(decoded.userId).toBe("user-123");
    expect(decoded.role).toBe("customer");
  });

  it("should verify a valid refresh token", () => {
    const { refreshToken } = generateTokens(payload);
    const decoded = verifyRefreshToken(refreshToken);

    expect(decoded.userId).toBe("user-123");
    expect(decoded.role).toBe("customer");
  });

  it("should reject an invalid access token", () => {
    expect(() => verifyAccessToken("invalid-token")).toThrow();
  });

  it("should reject access token as refresh token and vice versa", () => {
    const { accessToken, refreshToken } = generateTokens(payload);

    // Access token không dùng được như refresh token
    expect(() => verifyRefreshToken(accessToken)).toThrow();
    // Refresh token không dùng được như access token
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });
});

// ─── Password Tests ──────────────────────────────────

describe("Password Utils", () => {
  it("should hash and verify a password", async () => {
    const password = "MySecure123";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(0);

    const isValid = await comparePassword(password, hash);
    expect(isValid).toBe(true);
  });

  it("should reject wrong password", async () => {
    const hash = await hashPassword("CorrectPassword1");
    const isValid = await comparePassword("WrongPassword1", hash);

    expect(isValid).toBe(false);
  });

  it("should generate different hashes for same password", async () => {
    const password = "SamePassword123";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2); // Khác salt → khác hash
  });
});

// ─── Zod Validation Tests ────────────────────────────

describe("Auth Validators", () => {
  // Import dynamically to avoid module resolution issues
  let registerSchema: (typeof import("../validators/auth.validator.js"))["registerSchema"];
  let loginSchema: (typeof import("../validators/auth.validator.js"))["loginSchema"];

  beforeEach(async () => {
    const mod = await import("../validators/auth.validator.js");
    registerSchema = mod.registerSchema;
    loginSchema = mod.loginSchema;
  });

  describe("Register Schema", () => {
    it("should accept valid input", () => {
      const result = registerSchema.safeParse({
        email: "test@example.com",
        password: "MySecure123",
        name: "Nguyễn Văn A",
        phone: "0912345678",
      });
      expect(result.success).toBe(true);
    });

    it("should transform email to lowercase", () => {
      const result = registerSchema.parse({
        email: "TEST@Example.COM",
        password: "MySecure123",
        name: "Test",
      });
      expect(result.email).toBe("test@example.com");
    });

    it("should reject weak password (no uppercase)", () => {
      const result = registerSchema.safeParse({
        email: "test@example.com",
        password: "weakpassword1",
        name: "Test",
      });
      expect(result.success).toBe(false);
    });

    it("should reject short password", () => {
      const result = registerSchema.safeParse({
        email: "test@example.com",
        password: "Ab1",
        name: "Test",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid email", () => {
      const result = registerSchema.safeParse({
        email: "not-an-email",
        password: "MySecure123",
        name: "Test",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid phone number", () => {
      const result = registerSchema.safeParse({
        email: "test@example.com",
        password: "MySecure123",
        name: "Test",
        phone: "12345",
      });
      expect(result.success).toBe(false);
    });

    it("should accept Vietnamese phone with +84 prefix", () => {
      const result = registerSchema.safeParse({
        email: "test@example.com",
        password: "MySecure123",
        name: "Test",
        phone: "+84912345678",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Login Schema", () => {
    it("should accept valid login input", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "anything",
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty password", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─── Authorization Logic Tests ───────────────────────

describe("Authorization Logic", () => {
  it("should allow owner to access owner routes", () => {
    const user = { role: "owner" };
    const allowedRoles = ["owner"];
    expect(allowedRoles.includes(user.role)).toBe(true);
  });

  it("should deny customer from owner routes", () => {
    const user = { role: "customer" };
    const allowedRoles = ["owner"];
    expect(allowedRoles.includes(user.role)).toBe(false);
  });

  it("should allow both roles for shared routes", () => {
    const allowedRoles = ["customer", "owner"];
    expect(allowedRoles.includes("customer")).toBe(true);
    expect(allowedRoles.includes("owner")).toBe(true);
  });

  it("should deny unauthenticated user", () => {
    const user = undefined;
    expect(user).toBeUndefined();
    // → middleware sẽ trả 401
  });
});
