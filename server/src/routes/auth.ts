import { Router, Request, Response } from "express";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from "../validators/auth.validator.js";
import { validate } from "../middleware/validate.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import * as authService from "../services/auth.service.js";
import { AuthError } from "../services/auth.service.js";

export const router = Router();

// ─── Helper xử lý lỗi ───────────────────────────────

function handleAuthError(error: unknown, res: Response) {
  if (error instanceof AuthError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error("❌ Auth error:", error);
  res.status(500).json({ error: "Lỗi hệ thống" });
}

// ─── POST /api/auth/register ─────────────────────────

router.post(
  "/auth/register",
  validate(registerSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({
        message: "Đăng ký thành công",
        ...result,
      });
    } catch (error) {
      handleAuthError(error, res);
    }
  }
);

// ─── POST /api/auth/login ────────────────────────────

router.post(
  "/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, maxAttempts: 10 }),
  validate(loginSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await authService.login(req.body);
      res.json({
        message: "Đăng nhập thành công",
        ...result,
      });
    } catch (error) {
      handleAuthError(error, res);
    }
  }
);

// ─── POST /api/auth/refresh ──────────────────────────

router.post(
  "/auth/refresh",
  validate(refreshSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await authService.refresh(req.body.refreshToken);
      res.json({
        message: "Làm mới token thành công",
        ...result,
      });
    } catch (error) {
      handleAuthError(error, res);
    }
  }
);

// ─── GET /api/auth/me ────────────────────────────────

router.get(
  "/auth/me",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = await authService.getProfile(req.user!.userId);
      res.json({ user });
    } catch (error) {
      handleAuthError(error, res);
    }
  }
);

// ─── GET /api/auth/owner-test ────────────────────────
// Route test: chỉ owner mới truy cập được

router.get(
  "/auth/owner-test",
  authenticate,
  authorize("owner"),
  (_req: Request, res: Response) => {
    res.json({ message: "Bạn là chủ sân! 🏟️" });
  }
);
