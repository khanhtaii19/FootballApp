import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRemaining, useCountdown } from "./countdown";

describe("formatRemaining", () => {
  it("formats minutes and seconds", () => {
    expect(formatRemaining(605_000)).toBe("10:05");
    expect(formatRemaining(59_000)).toBe("00:59");
    expect(formatRemaining(0)).toBe("00:00");
  });

  it("rounds partial seconds up and never goes negative", () => {
    expect(formatRemaining(1_200)).toBe("00:02");
    expect(formatRemaining(-5_000)).toBe("00:00");
  });

  it("switches to h:mm:ss from one hour", () => {
    expect(formatRemaining(3_725_000)).toBe("1:02:05");
  });
});

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2030-01-01T00:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("counts down every second and flags expiry", () => {
    const { result } = renderHook(() => useCountdown("2030-01-01T00:01:05Z"));
    expect(result.current).toEqual({ remainingMs: 65_000, expired: false });

    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.remainingMs).toBe(60_000);

    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toEqual({ remainingMs: 0, expired: true });
  });

  it("does nothing without an expiry", () => {
    const { result } = renderHook(() => useCountdown(null));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toEqual({ remainingMs: 0, expired: false });
  });

  it("restarts when the expiry changes", () => {
    const { result, rerender } = renderHook(({ at }) => useCountdown(at), {
      initialProps: { at: "2030-01-01T00:00:10Z" },
    });
    expect(result.current.remainingMs).toBe(10_000);

    rerender({ at: "2030-01-01T00:10:00Z" });
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.remainingMs).toBe(599_000);
  });
});
