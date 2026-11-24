import { z } from "zod";

/**
 * Đọc và kiểm tra biến môi trường MỘT LẦN khi khởi động.
 * - Môi trường dev/test: có giá trị mặc định để chạy ngay.
 * - Production: thiếu hoặc yếu là KHÔNG khởi động (fail fast), báo rõ từng lỗi.
 */

export type NodeEnv = "development" | "test" | "production";

export interface AppEnv {
  NODE_ENV: NodeEnv;
  isProduction: boolean;
  PORT: number;
  DATABASE_URL: string | undefined;
  /** Các origin được phép gọi API (CORS). */
  CLIENT_ORIGINS: string[];
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  /** Số proxy phía trước server (Caddy = 1) để lấy đúng IP khách. */
  TRUST_PROXY: boolean | number | string;
  LOG_REQUESTS: boolean;
}

export class EnvError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(
      `Cấu hình môi trường không hợp lệ:\n${issues.map((i) => `  - ${i}`).join("\n")}`
    );
    this.name = "EnvError";
    this.issues = issues;
  }
}

const DEV_JWT_SECRET = "dev-secret";
const DEV_JWT_REFRESH_SECRET = "dev-refresh-secret";

// Dấu hiệu của secret mẫu/yếu (ví dụ "dev-secret-change-in-production")
const WEAK_SECRET = /dev-|change|example|password|secret123/i;
const MIN_SECRET_LENGTH = 32;
const DURATION = /^\d+[smhd]$/;

function parseTrustProxy(
  value: string | undefined,
  isProduction: boolean
): boolean | number | string {
  if (value === undefined || value.trim() === "") return isProduction ? 1 : false;
  const v = value.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // danh sách IP/CIDR theo cú pháp của Express
}

function isHttpsOrLocalhost(origin: string): boolean {
  return origin.startsWith("https://") || /^http:\/\/localhost(:\d+)?$/.test(origin);
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const issues: string[] = [];

  const rawNodeEnv = source.NODE_ENV;
  const NODE_ENV: NodeEnv =
    rawNodeEnv === "production" || rawNodeEnv === "test" ? rawNodeEnv : "development";
  const isProduction = NODE_ENV === "production";

  // ─── PORT ───
  const portResult = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .safeParse(source.PORT === undefined || source.PORT === "" ? 3000 : source.PORT);
  if (!portResult.success) issues.push("PORT phải là số nguyên từ 1 đến 65535");
  const PORT = portResult.success ? portResult.data : 3000;

  // ─── DATABASE_URL ───
  const DATABASE_URL = source.DATABASE_URL?.trim() || undefined;
  if (isProduction && !DATABASE_URL) {
    issues.push("DATABASE_URL là bắt buộc ở production");
  } else if (DATABASE_URL && !/^postgres(ql)?:\/\//.test(DATABASE_URL)) {
    issues.push("DATABASE_URL phải bắt đầu bằng postgresql://");
  }

  // ─── CLIENT_URL (CORS) ───
  const rawOrigins = (source.CLIENT_URL?.trim() || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  for (const origin of rawOrigins) {
    if (!z.string().url().safeParse(origin).success) {
      issues.push(`CLIENT_URL chứa địa chỉ không hợp lệ: "${origin}"`);
    } else if (isProduction && !isHttpsOrLocalhost(origin)) {
      issues.push(`CLIENT_URL phải dùng https:// ở production (đang là "${origin}")`);
    }
  }

  // ─── JWT ───
  let JWT_SECRET = source.JWT_SECRET?.trim() || "";
  let JWT_REFRESH_SECRET = source.JWT_REFRESH_SECRET?.trim() || "";

  if (isProduction) {
    for (const [name, value] of [
      ["JWT_SECRET", JWT_SECRET],
      ["JWT_REFRESH_SECRET", JWT_REFRESH_SECRET],
    ] as const) {
      if (!value) {
        issues.push(`${name} là bắt buộc ở production`);
      } else if (value.length < MIN_SECRET_LENGTH) {
        issues.push(`${name} phải dài ít nhất ${MIN_SECRET_LENGTH} ký tự`);
      } else if (WEAK_SECRET.test(value)) {
        issues.push(
          `${name} đang là giá trị mẫu/yếu, hãy tạo chuỗi ngẫu nhiên (openssl rand -base64 48)`
        );
      }
    }
    if (JWT_SECRET && JWT_SECRET === JWT_REFRESH_SECRET) {
      issues.push("JWT_SECRET và JWT_REFRESH_SECRET phải khác nhau");
    }
  } else {
    JWT_SECRET ||= DEV_JWT_SECRET;
    JWT_REFRESH_SECRET ||= DEV_JWT_REFRESH_SECRET;
  }

  const JWT_EXPIRES_IN = source.JWT_EXPIRES_IN?.trim() || "15m";
  const JWT_REFRESH_EXPIRES_IN = source.JWT_REFRESH_EXPIRES_IN?.trim() || "7d";
  if (!DURATION.test(JWT_EXPIRES_IN)) {
    issues.push('JWT_EXPIRES_IN phải có dạng như "15m", "1h", "7d"');
  }
  if (!DURATION.test(JWT_REFRESH_EXPIRES_IN)) {
    issues.push('JWT_REFRESH_EXPIRES_IN phải có dạng như "15m", "1h", "7d"');
  }

  if (issues.length > 0) throw new EnvError(issues);

  return {
    NODE_ENV,
    isProduction,
    PORT,
    DATABASE_URL,
    CLIENT_ORIGINS: rawOrigins,
    JWT_SECRET,
    JWT_REFRESH_SECRET,
    JWT_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN,
    TRUST_PROXY: parseTrustProxy(source.TRUST_PROXY, isProduction),
    LOG_REQUESTS: source.LOG_REQUESTS !== "false" && NODE_ENV !== "test",
  };
}

/** Giá trị đã kiểm tra, tính một lần khi import. Sai cấu hình production thì ném EnvError ngay. */
export const env: AppEnv = loadEnv();
