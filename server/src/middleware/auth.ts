import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type TokenPayload } from "../lib/jwt.js";

// ─── Mở rộng Express Request để có user info ────────

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// ─── Middleware xác thực (authenticate) ──────────────

/**
 * Kiểm tra JWT access token từ header Authorization.
 * Nếu hợp lệ, gắn user info vào req.user.
 * Nếu không, trả 401.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Chưa đăng nhập" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token không hợp lệ hoặc đã hết hạn" });
    return;
  }
}

// ─── Middleware phân quyền (authorize) ───────────────

/**
 * Kiểm tra role của user.
 * Phải đặt SAU middleware authenticate.
 *
 * Ví dụ: authorize("owner") → chỉ chủ sân mới qua được
 */
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Chưa đăng nhập" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: "Bạn không có quyền truy cập chức năng này",
      });
      return;
    }

    next();
  };
}
