import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, describeError } from "./api";
import { getSession, saveSession } from "./session";

const user = { id: "u1", email: "a@example.com", name: "A", role: "customer" as const };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function authOf(init: RequestInit | undefined): string | undefined {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers.Authorization;
}

function authHeader(call: unknown[]): string | undefined {
  return authOf(call[1] as RequestInit | undefined);
}

describe("api request basics", () => {
  it("sends the access token and unwraps the payload", async () => {
    saveSession({ accessToken: "tok", refreshToken: "ref", user });
    fetchMock.mockResolvedValueOnce(json({ bookings: [{ id: "b1" }] }));

    const bookings = await api.listBookings();

    expect(bookings).toEqual([{ id: "b1" }]);
    expect(authHeader(fetchMock.mock.calls[0])).toBe("Bearer tok");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/bookings$/);
  });

  it("passes the date filter as a query parameter", async () => {
    fetchMock.mockResolvedValueOnce(json({ bookings: [] }));
    await api.listBookings("2030-01-01");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/bookings\?date=2030-01-01$/);
  });

  it("throws an ApiError carrying the server message and field details", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: "Dữ liệu không hợp lệ", details: [{ field: "price_5", message: "Giá phải lớn hơn 0" }] }, 400)
    );

    const error = await api.updateSettings({ price_5: 0 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect(describeError(error)).toBe("Giá phải lớn hơn 0");
  });

  it("falls back to a generic message when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 502 }));
    const error = await api.getZones().catch((e: unknown) => e);
    expect((error as ApiError).message).toBe("Yêu cầu thất bại");
  });
});

describe("token refresh", () => {
  it("refreshes once on 401 and retries with the new token", async () => {
    saveSession({ accessToken: "old", refreshToken: "ref1", user });
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) return json({ accessToken: "new", refreshToken: "ref2" });
      const auth = authOf(init);
      return auth === "Bearer new" ? json({ bookings: [] }) : json({ error: "expired" }, 401);
    });

    await expect(api.listBookings()).resolves.toEqual([]);

    expect(getSession()?.accessToken).toBe("new");
    expect(getSession()?.refreshToken).toBe("ref2");
  });

  it("shares one refresh call between concurrent requests", async () => {
    saveSession({ accessToken: "old", refreshToken: "ref1", user });
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/auth/refresh")) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return json({ accessToken: "new", refreshToken: "ref2" });
      }
      const auth = authOf(init);
      return auth === "Bearer new" ? json({ bookings: [] }) : json({ error: "expired" }, 401);
    });

    await Promise.all([api.listBookings(), api.listBookings(), api.listBookings()]);

    expect(refreshCalls).toBe(1);
  });

  it("clears the session and fails when the refresh token is rejected", async () => {
    saveSession({ accessToken: "old", refreshToken: "bad", user });
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/auth/refresh") ? json({ error: "invalid" }, 401) : json({ error: "expired" }, 401)
    );

    const error = await api.listBookings().catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(401);
    expect(getSession()).toBeNull();
  });

  it("does not try to refresh for login failures", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "Email hoặc mật khẩu không đúng" }, 401));

    const error = await api.login("a@example.com", "wrong").catch((e: unknown) => e);

    expect((error as ApiError).message).toBe("Email hoặc mật khẩu không đúng");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
