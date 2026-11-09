import { Request, Response, NextFunction } from "express";

/**
 * Bộ giới hạn đăng nhập sai — rate limiter đơn giản dùng bộ nhớ.
 * Mỗi IP chỉ được thử tối đa `maxAttempts` lần trong `windowMs`.
 * Nếu vượt quá, trả 429 (Too Many Requests).
 *
 * Ghi chú: Production nên dùng Redis thay vì Map trong bộ nhớ
 * để hoạt động đúng khi có nhiều instance.
 */

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, AttemptRecord>();

// Dọn dẹp bộ nhớ mỗi 5 phút
setInterval(
  () => {
    const now = Date.now();
    for (const [key, record] of attempts) {
      if (record.resetAt <= now) {
        attempts.delete(key);
      }
    }
  },
  5 * 60 * 1000
);

export function rateLimit({
  windowMs = 15 * 60 * 1000, // 15 phút
  maxAttempts = 10, // tối đa 10 lần
} = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    const record = attempts.get(key);

    if (!record || record.resetAt <= now) {
      // Tạo mới hoặc reset
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxAttempts) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      res.status(429).json({
        error: "Quá nhiều lần thử. Vui lòng đợi rồi thử lại.",
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    record.count++;
    next();
  };
}
