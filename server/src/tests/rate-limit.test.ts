import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "../middleware/rate-limit.js";

function fakeRequest(ip = "1.2.3.4") {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

function fakeResponse() {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
    body?: unknown;
  };
  res.statusCode = 200;
  res.headers = {};
  return Object.assign(res, {
    setHeader(name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  });
}

/** Chạy một request qua middleware; trả về true nếu được cho qua. `finishWith` mô phỏng mã trạng thái cuối. */
function hit(limiter: ReturnType<typeof rateLimit>, ip: string, finishWith = 200) {
  const res = fakeResponse();
  const next = vi.fn() as unknown as NextFunction;
  limiter(fakeRequest(ip), res as unknown as Response, next);
  const passed = (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0;
  if (passed) {
    res.statusCode = finishWith;
    res.emit("finish");
  }
  return { passed, res };
}

describe("rateLimit", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2030-01-01T00:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("lets requests through until the limit and then answers 429 with Retry-After", () => {
    const limiter = rateLimit({ windowMs: 60_000, maxAttempts: 3 });

    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);

    const blocked = hit(limiter, "1.1.1.1");
    expect(blocked.passed).toBe(false);
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.headers["Retry-After"]).toBe("60");
  });

  it("counts each IP separately", () => {
    const limiter = rateLimit({ maxAttempts: 1 });
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
    expect(hit(limiter, "1.1.1.1").passed).toBe(false);
    expect(hit(limiter, "2.2.2.2").passed).toBe(true);
  });

  it("opens again after the window", () => {
    const limiter = rateLimit({ windowMs: 60_000, maxAttempts: 1 });
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
    expect(hit(limiter, "1.1.1.1").passed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
  });

  it("gives every limiter its own counter", () => {
    const login = rateLimit({ maxAttempts: 1 });
    const register = rateLimit({ maxAttempts: 1 });
    expect(hit(login, "1.1.1.1").passed).toBe(true);
    expect(hit(login, "1.1.1.1").passed).toBe(false);
    expect(hit(register, "1.1.1.1").passed).toBe(true); // không bị ảnh hưởng bởi login
  });

  describe("countOnlyFailures", () => {
    it("does not lock out successful requests", () => {
      const limiter = rateLimit({ maxAttempts: 2, countOnlyFailures: true });
      for (let i = 0; i < 10; i++) {
        expect(hit(limiter, "1.1.1.1", 200).passed).toBe(true);
      }
    });

    it("blocks after enough failures, even if earlier requests succeeded", () => {
      const limiter = rateLimit({ maxAttempts: 2, countOnlyFailures: true });
      expect(hit(limiter, "1.1.1.1", 200).passed).toBe(true);
      expect(hit(limiter, "1.1.1.1", 401).passed).toBe(true);
      expect(hit(limiter, "1.1.1.1", 401).passed).toBe(true);
      expect(hit(limiter, "1.1.1.1", 200).passed).toBe(false);
    });

    it("counts parallel attempts before their results arrive", () => {
      const limiter = rateLimit({ maxAttempts: 2, countOnlyFailures: true });
      // 3 request cùng lúc, chưa cái nào kết thúc
      const results = [1, 2, 3].map(() => {
        const res = fakeResponse();
        const next = vi.fn() as unknown as NextFunction;
        limiter(fakeRequest("1.1.1.1"), res as unknown as Response, next);
        return (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0;
      });
      expect(results).toEqual([true, true, false]);
    });
  });
});
