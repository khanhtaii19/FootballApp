import type { NextFunction, Request, Response } from "express";

/**
 * Giới hạn số lần gọi theo IP — rate limiter đơn giản dùng bộ nhớ.
 * Mỗi IP chỉ được tối đa `maxAttempts` lần trong `windowMs`; vượt quá thì trả 429.
 *
 * - Mỗi lần gọi `rateLimit()` tạo bộ đếm RIÊNG, nên đăng nhập và đăng ký
 *   không dùng chung hạn mức.
 * - `countOnlyFailures`: chỉ tính các lần thất bại (status >= 400). Dùng cho đăng nhập,
 *   để người dùng đăng nhập đúng nhiều lần (hoặc nhiều người chung IP) không bị khóa oan.
 *
 * Ghi chú: sau reverse proxy phải đặt TRUST_PROXY, nếu không mọi người cùng một IP (của proxy).
 * Chạy nhiều instance thì nên dùng Redis thay vì Map trong bộ nhớ.
 */

interface AttemptRecord {
  count: number;
  resetAt: number;
}

interface Options {
  windowMs?: number;
  maxAttempts?: number;
  countOnlyFailures?: boolean;
}

export function rateLimit({
  windowMs = 15 * 60 * 1000, // 15 phút
  maxAttempts = 10,
  countOnlyFailures = false,
}: Options = {}) {
  const attempts = new Map<string, AttemptRecord>();

  // Dọn bộ nhớ định kỳ; unref để không giữ tiến trình sống chỉ vì bộ đếm
  const cleaner = setInterval(
    () => {
      const now = Date.now();
      for (const [key, record] of attempts) {
        if (record.resetAt <= now) attempts.delete(key);
      }
    },
    Math.min(windowMs, 5 * 60 * 1000)
  );
  cleaner.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let record = attempts.get(key);
    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + windowMs };
      attempts.set(key, record);
    }

    if (record.count >= maxAttempts) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Quá nhiều lần thử. Vui lòng đợi rồi thử lại.",
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    record.count++;

    if (countOnlyFailures) {
      // Tính trước rồi hoàn lại nếu thành công: nhờ vậy nhiều request song song
      // cũng không lách được giới hạn trước khi kịp có kết quả.
      const owner = record;
      res.on("finish", () => {
        if (res.statusCode < 400 && owner.count > 0) owner.count--;
      });
    }

    next();
  };
}
