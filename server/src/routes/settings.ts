import { Router, Request, Response } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { updateSettingsSchema } from "../validators/settings.validator.js";
import * as settingsService from "../services/settings.service.js";

export const router = Router();

router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const settings = await settingsService.getAppSettings();
    res.json({ settings });
  } catch (error) {
    console.error("❌ Settings error:", error);
    res.status(500).json({ error: "Không tải được cấu hình" });
  }
});

router.put(
  "/settings",
  authenticate,
  authorize("owner"),
  validate(updateSettingsSchema),
  async (req: Request, res: Response) => {
    try {
      const settings = await settingsService.updateAppSettings(req.body);
      res.json({
        message: "Cập nhật cấu hình thành công",
        settings,
      });
    } catch (error) {
      console.error("❌ Settings update error:", error);
      res.status(500).json({ error: "Không cập nhật được cấu hình" });
    }
  }
);
