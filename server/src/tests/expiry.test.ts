import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMaxPendingPerUser } from "../lib/booking-limits.js";

// Job import service → prisma; mock để unit test không cần database
vi.mock("../services/booking-expiry.service.js", () => ({
  runExpiryJob: vi.fn(async () => 0),
}));

const { startExpiryJob, getExpiryIntervalMs } =
  await import("../jobs/expire-bookings.job.js");

describe("getMaxPendingPerUser", () => {
  const original = process.env.MAX_PENDING_BOOKINGS_PER_USER;

  afterEach(() => {
    if (original === undefined) delete process.env.MAX_PENDING_BOOKINGS_PER_USER;
    else process.env.MAX_PENDING_BOOKINGS_PER_USER = original;
  });

  it("defaults to 3 when unset", () => {
    delete process.env.MAX_PENDING_BOOKINGS_PER_USER;
    expect(getMaxPendingPerUser()).toBe(3);
  });

  it("reads a valid positive integer from env", () => {
    process.env.MAX_PENDING_BOOKINGS_PER_USER = "5";
    expect(getMaxPendingPerUser()).toBe(5);
  });

  it.each(["0", "-2", "abc", "1.5", ""])("falls back to default for %j", (v) => {
    process.env.MAX_PENDING_BOOKINGS_PER_USER = v;
    expect(getMaxPendingPerUser()).toBe(3);
  });
});

describe("getExpiryIntervalMs", () => {
  const original = process.env.EXPIRY_JOB_INTERVAL_SECONDS;

  afterEach(() => {
    if (original === undefined) delete process.env.EXPIRY_JOB_INTERVAL_SECONDS;
    else process.env.EXPIRY_JOB_INTERVAL_SECONDS = original;
  });

  it("defaults to 60 seconds", () => {
    delete process.env.EXPIRY_JOB_INTERVAL_SECONDS;
    expect(getExpiryIntervalMs()).toBe(60_000);
  });

  it("reads seconds from env and ignores invalid values", () => {
    process.env.EXPIRY_JOB_INTERVAL_SECONDS = "30";
    expect(getExpiryIntervalMs()).toBe(30_000);
    process.env.EXPIRY_JOB_INTERVAL_SECONDS = "0";
    expect(getExpiryIntervalMs()).toBe(60_000);
    process.env.EXPIRY_JOB_INTERVAL_SECONDS = "abc";
    expect(getExpiryIntervalMs()).toBe(60_000);
  });
});

describe("startExpiryJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs immediately on start and then every interval", async () => {
    const run = vi.fn(async () => 0);
    const stop = startExpiryJob(1000, run);

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(4);

    stop();
  });

  it("stops running after the returned stop function is called", async () => {
    const run = vi.fn(async () => 0);
    const stop = startExpiryJob(1000, run);

    await vi.advanceTimersByTimeAsync(1000);
    const callsBeforeStop = run.mock.calls.length;
    stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(callsBeforeStop);
  });

  it("does not overlap runs while the previous one is still going", async () => {
    let finish: () => void = () => {};
    const run = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = () => resolve(0);
        })
    );
    const stop = startExpiryJob(1000, run);

    await vi.advanceTimersByTimeAsync(5000); // 5 lần tick nhưng lượt đầu chưa xong
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    stop();
  });

  it("keeps running after a failed run and logs the error", async () => {
    const run = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue(2);
    const stop = startExpiryJob(1000, run);

    await vi.advanceTimersByTimeAsync(0);
    expect(console.error).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalled(); // đã nhả 2 booking

    stop();
  });
});
