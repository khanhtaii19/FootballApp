import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Middleware validate request body bằng Zod schema.
 * Nếu lỗi, trả về 400 với danh sách lỗi chi tiết.
 * Nếu hợp lệ, gán dữ liệu đã parse vào req.body.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));

        _res.status(400).json({
          error: "Dữ liệu không hợp lệ",
          details: errors,
        });
        return;
      }
      next(error);
    }
  };
}
