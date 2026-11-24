import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../lib/env.js";

const STRONG_A = "k3J9xQ7mVb2LzP8wRt5YhN1cFd6GsAe0UoIq4XyZ";
const STRONG_B = "Tz8Wn2Qe5Ra9Lk1Vb7Hc3Xs6Dm4Fp0Yg+JuNiOt/Ar";

const production = (
  overrides: Record<string, string | undefined> = {}
): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://sanbong:pw@db:5432/sanbong?schema=public",
  CLIENT_URL: "https://sanbong.example.com",
  JWT_SECRET: STRONG_A,
  JWT_REFRESH_SECRET: STRONG_B,
  ...overrides,
});

function issuesOf(source: NodeJS.ProcessEnv): string[] {
  try {
    loadEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error.issues;
    throw error;
  }
  return [];
}

describe("loadEnv in development and test", () => {
  it("works with no variables at all, using safe local defaults", () => {
    const env = loadEnv({});
    expect(env).toMatchObject({
      NODE_ENV: "development",
      isProduction: false,
      PORT: 3000,
      CLIENT_ORIGINS: ["http://localhost:5173"],
      JWT_SECRET: "dev-secret",
      JWT_REFRESH_SECRET: "dev-refresh-secret",
      JWT_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "7d",
      TRUST_PROXY: false,
      LOG_REQUESTS: true,
    });
  });

  it("treats unknown NODE_ENV values as development", () => {
    expect(loadEnv({ NODE_ENV: "staging" }).NODE_ENV).toBe("development");
  });

  it("does not log requests during tests", () => {
    expect(loadEnv({ NODE_ENV: "test" }).LOG_REQUESTS).toBe(false);
  });

  it("allows the sample secrets from .env.example", () => {
    expect(() =>
      loadEnv({
        JWT_SECRET: "dev-secret-change-in-production",
        JWT_REFRESH_SECRET: "dev-refresh-secret-change-in-production",
      })
    ).not.toThrow();
  });
});

describe("loadEnv in production", () => {
  it("accepts a complete, strong configuration", () => {
    const env = loadEnv(production());
    expect(env.isProduction).toBe(true);
    expect(env.JWT_SECRET).toBe(STRONG_A);
    expect(env.CLIENT_ORIGINS).toEqual(["https://sanbong.example.com"]);
    expect(env.TRUST_PROXY).toBe(1); // sau Caddy
  });

  it("refuses to start without secrets or database", () => {
    const issues = issuesOf({
      NODE_ENV: "production",
      CLIENT_URL: "https://x.example.com",
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DATABASE_URL"),
        expect.stringContaining("JWT_SECRET là bắt buộc"),
        expect.stringContaining("JWT_REFRESH_SECRET là bắt buộc"),
      ])
    );
  });

  it("refuses the sample secrets from .env.example", () => {
    const issues = issuesOf(
      production({
        JWT_SECRET: "dev-secret-change-in-production-padding-padding",
        JWT_REFRESH_SECRET: "dev-refresh-secret-change-in-production-padding",
      })
    );
    expect(issues.filter((i) => i.includes("mẫu/yếu"))).toHaveLength(2);
  });

  it("refuses short secrets", () => {
    expect(issuesOf(production({ JWT_SECRET: "k3J9xQ7mVb2L" }))).toEqual([
      expect.stringContaining("ít nhất 32 ký tự"),
    ]);
  });

  it("refuses identical access and refresh secrets", () => {
    expect(issuesOf(production({ JWT_REFRESH_SECRET: STRONG_A }))).toEqual([
      expect.stringContaining("phải khác nhau"),
    ]);
  });

  it("requires https for client origins, except localhost", () => {
    expect(issuesOf(production({ CLIENT_URL: "http://sanbong.example.com" }))).toEqual([
      expect.stringContaining("https://"),
    ]);
    expect(() =>
      loadEnv(production({ CLIENT_URL: "http://localhost:8080" }))
    ).not.toThrow();
  });

  it("reports every problem at once, not just the first", () => {
    const issues = issuesOf({
      NODE_ENV: "production",
      PORT: "abc",
      CLIENT_URL: "ftp//x",
    });
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });

  it("describes all issues in the error message", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(/JWT_SECRET là bắt buộc/);
  });
});

describe("loadEnv individual settings", () => {
  it("parses PORT and rejects invalid ports", () => {
    expect(loadEnv({ PORT: "8080" }).PORT).toBe(8080);
    expect(issuesOf({ PORT: "0" })).toEqual([expect.stringContaining("PORT")]);
    expect(issuesOf({ PORT: "70000" })).toEqual([expect.stringContaining("PORT")]);
    expect(issuesOf({ PORT: "abc" })).toEqual([expect.stringContaining("PORT")]);
  });

  it("supports several CORS origins and trims trailing slashes", () => {
    expect(
      loadEnv({ CLIENT_URL: "http://localhost:5173/, https://app.example.com" })
        .CLIENT_ORIGINS
    ).toEqual(["http://localhost:5173", "https://app.example.com"]);
  });

  it.each([
    ["true", true],
    ["false", false],
    ["2", 2],
    ["loopback, 10.0.0.0/8", "loopback, 10.0.0.0/8"],
  ])("parses TRUST_PROXY=%s", (value, expected) => {
    expect(loadEnv({ TRUST_PROXY: value }).TRUST_PROXY).toBe(expected);
  });

  it("validates token lifetimes", () => {
    expect(
      loadEnv({ JWT_EXPIRES_IN: "1h", JWT_REFRESH_EXPIRES_IN: "30d" }).JWT_EXPIRES_IN
    ).toBe("1h");
    expect(issuesOf({ JWT_EXPIRES_IN: "soon" })).toEqual([
      expect.stringContaining("JWT_EXPIRES_IN"),
    ]);
  });

  it("rejects a DATABASE_URL that is not PostgreSQL", () => {
    expect(issuesOf({ DATABASE_URL: "mysql://u:p@h/db" })).toEqual([
      expect.stringContaining("postgresql://"),
    ]);
  });

  it("lets operators turn request logging off", () => {
    expect(loadEnv({ LOG_REQUESTS: "false" }).LOG_REQUESTS).toBe(false);
  });
});
