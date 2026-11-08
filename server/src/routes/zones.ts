import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";

export const router = Router();

router.get("/zones", async (_req: Request, res: Response) => {
  try {
    const zones = await prisma.zone.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, surface: true },
    });
    res.json({ zones });
  } catch (error) {
    console.error("❌ Zones error:", error);
    res.status(500).json({ error: "Không tải được danh sách vùng" });
  }
});
