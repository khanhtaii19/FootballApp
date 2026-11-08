import { Router, Request, Response } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createBlockSchema,
  listBlocksQuerySchema,
} from "../validators/blocks.validator.js";
import * as blocksService from "../services/blocks.service.js";
import { BlockError } from "../services/blocks.service.js";

export const router = Router();

function handleBlockError(error: unknown, res: Response) {
  if (error instanceof BlockError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error("❌ Block error:", error);
  res.status(500).json({ error: "Lỗi hệ thống" });
}

router.get(
  "/blocks",
  authenticate,
  authorize("owner"),
  async (req: Request, res: Response) => {
    try {
      const parsed = listBlocksQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: "Tham số không hợp lệ",
          details: parsed.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
        return;
      }

      const from = parsed.data.from ? new Date(parsed.data.from) : undefined;
      const to = parsed.data.to ? new Date(parsed.data.to) : undefined;

      const blocks = await blocksService.listBlocks(from, to);
      res.json({ blocks });
    } catch (error) {
      handleBlockError(error, res);
    }
  }
);

router.post(
  "/blocks",
  authenticate,
  authorize("owner"),
  validate(createBlockSchema),
  async (req: Request, res: Response) => {
    try {
      const block = await blocksService.createBlock(req.user!.userId, req.body);
      res.status(201).json({
        message: "Đã khóa vùng sân",
        block,
      });
    } catch (error) {
      handleBlockError(error, res);
    }
  }
);

router.delete(
  "/blocks/:id",
  authenticate,
  authorize("owner"),
  async (req: Request, res: Response) => {
    try {
      const blockId = String(req.params.id);
      const block = await blocksService.cancelBlock(blockId);
      res.json({
        message: "Đã hủy lịch khóa",
        block,
      });
    } catch (error) {
      handleBlockError(error, res);
    }
  }
);
