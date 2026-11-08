import { Router } from "express";
import prisma from "../lib/prisma.js";

export const router = Router();

router.get("/health", async (_req, res) => {
  try {
    // Kiểm tra kết nối DB
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: "connected",
    });
  } catch {
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      database: "disconnected",
    });
  }
});
