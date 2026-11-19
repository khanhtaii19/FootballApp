import { clearSession, getSession, saveSession } from "./session";
import type {
  AppSettings,
  Booking,
  FieldType,
  PaymentInfo,
  RefundDecision,
  SlotsResponse,
  User,
  Zone,
} from "./types";

const API_BASE: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  details: FieldIssue[];

  constructor(message: string, status: number, details: FieldIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

// ─── Làm mới token ───────────────────────────────────
// Nhiều request cùng gặp 401 chỉ gọi /auth/refresh một lần.
let refreshing: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
  const session = getSession();
  if (!session) return Promise.resolve(false);

  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string; refreshToken?: string };
        saveSession({
          ...session,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken ?? session.refreshToken,
        });
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

// ─── Hàm gọi API chung ───────────────────────────────

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** false: không gắn token và không tự làm mới khi 401 (đăng nhập, đăng ký). */
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const send = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = auth ? getSession()?.accessToken : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await send();

  if (res.status === 401 && auth && getSession()) {
    if (await refreshTokens()) {
      res = await send();
    } else {
      clearSession(); // phiên hết hạn: đưa người dùng về trang đăng nhập
    }
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Phản hồi không có JSON
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { error?: unknown; details?: unknown };
    const message = typeof payload.error === "string" ? payload.error : "Yêu cầu thất bại";
    const details = Array.isArray(payload.details) ? (payload.details as FieldIssue[]) : [];
    throw new ApiError(message, res.status, details);
  }
  return data as T;
}

/** Gộp lỗi trường (nếu có) thành một thông báo dễ đọc. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.details.length > 0
      ? error.details.map((d) => d.message).join(". ")
      : error.message;
  }
  return error instanceof Error ? error.message : "Đã có lỗi xảy ra";
}

// ─── Endpoints ───────────────────────────────────────

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface BlockInput {
  zoneName: string;
  startsAt: string;
  endsAt: string;
  note?: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResult>("/auth/login", { method: "POST", body: { email, password }, auth: false }),

  register: (input: { email: string; password: string; name: string; phone?: string }) =>
    request<AuthResult>("/auth/register", { method: "POST", body: input, auth: false }),

  getSettings: async () => (await request<{ settings: AppSettings }>("/settings")).settings,

  updateSettings: async (partial: Partial<AppSettings>) =>
    (await request<{ settings: AppSettings }>("/settings", { method: "PUT", body: partial }))
      .settings,

  getZones: async () => (await request<{ zones: Zone[] }>("/zones")).zones,

  getSlots: (date: string, fieldType: FieldType, duration: number) =>
    request<SlotsResponse>(
      `/bookings/available?date=${date}&fieldType=${fieldType}&duration=${duration}`
    ),

  createBooking: async (input: {
    fieldType: FieldType;
    startsAt: string;
    duration: number;
    note?: string;
  }) => (await request<{ booking: Booking }>("/bookings", { method: "POST", body: input })).booking,

  listBookings: async (date?: string) =>
    (await request<{ bookings: Booking[] }>(date ? `/bookings?date=${date}` : "/bookings"))
      .bookings,

  getBooking: async (id: string) => (await request<{ booking: Booking }>(`/bookings/${id}`)).booking,

  getPaymentInfo: async (id: string) =>
    (await request<{ payment: PaymentInfo }>(`/bookings/${id}/payment`)).payment,

  cancelBooking: (id: string) =>
    request<{ booking: Booking; refund: RefundDecision }>(`/bookings/${id}/cancel`, {
      method: "PATCH",
    }),

  confirmBooking: async (
    id: string,
    body: { amount?: number; method?: "bank_transfer" | "cash"; transactionId?: string } = {}
  ) =>
    (await request<{ booking: Booking }>(`/bookings/${id}/confirm`, { method: "PATCH", body }))
      .booking,

  markRefunded: async (id: string) =>
    (await request<{ booking: Booking }>(`/bookings/${id}/refund`, { method: "PATCH" })).booking,

  listBlocks: async (from: string, to: string) =>
    (
      await request<{ blocks: Booking[] }>(
        `/blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      )
    ).blocks,

  createBlock: async (input: BlockInput) =>
    (await request<{ block: Booking }>("/blocks", { method: "POST", body: input })).block,

  deleteBlock: (id: string) => request<{ block: Booking }>(`/blocks/${id}`, { method: "DELETE" }),
};
