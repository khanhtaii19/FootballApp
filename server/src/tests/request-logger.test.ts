import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requestLogger } from "../middleware/request-logger.js";

function run(
  options: Parameters<typeof requestLogger>[0],
  reqOverrides: Record<string, unknown> = {},
  status = 200
) {
  const lines: string[] = [];
  const middleware = requestLogger({ ...options, write: (line) => lines.push(line) });

  const req = {
    method: "GET",
    originalUrl: "/api/bookings?date=2030-01-01",
    ip: "9.9.9.9",
    ...reqOverrides,
  } as unknown as Request;
  const res = Object.assign(new EventEmitter(), {
    statusCode: status,
  }) as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  middleware(req, res, next);
  res.emit("finish");
  return { lines, next: next as unknown as ReturnType<typeof vi.fn> };
}

describe("requestLogger", () => {
  it("always lets the request continue", () => {
    expect(run({}).next).toHaveBeenCalledTimes(1);
    expect(run({ enabled: false }).next).toHaveBeenCalledTimes(1);
  });

  it("writes a short human line in development", () => {
    const { lines } = run({});
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^GET \/api\/bookings 200 \d+(\.\d+)?ms$/);
  });

  it("writes one JSON object per request in production", () => {
    const { lines } = run(
      { json: true },
      { user: { userId: "u1", role: "customer" } },
      404
    );
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      method: "GET",
      path: "/api/bookings",
      status: 404,
      ip: "9.9.9.9",
      userId: "u1",
    });
    expect(typeof entry.durationMs).toBe("number");
    expect(new Date(entry.time).toString()).not.toBe("Invalid Date");
  });

  it("never logs the query string (it could carry personal data)", () => {
    const { lines } = run({ json: true });
    expect(lines[0]).not.toContain("2030-01-01");
    expect(lines[0]).not.toContain("?");
  });

  it("stays silent when disabled", () => {
    expect(run({ enabled: false }).lines).toEqual([]);
  });

  it("skips health checks so they do not flood the log", () => {
    expect(run({}, { originalUrl: "/api/health" }).lines).toEqual([]);
  });

  it("omits userId for anonymous requests", () => {
    const entry = JSON.parse(run({ json: true }).lines[0]);
    expect(entry).not.toHaveProperty("userId");
  });
});
