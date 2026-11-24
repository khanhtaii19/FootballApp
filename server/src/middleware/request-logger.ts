import type { NextFunction, Request, Response } from "express";

export interface RequestLogEntry {
  time: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string;
  userId?: string;
}

interface Options {
  /** false: tắt hẳn (ví dụ khi chạy test). */
  enabled?: boolean;
  /** true: mỗi dòng là một JSON (dễ lọc/tìm kiếm khi chạy thật). */
  json?: boolean;
  write?: (line: string) => void;
  /** Bỏ qua các đường dẫn này (health check gọi liên tục sẽ làm nhiễu log). */
  ignorePaths?: string[];
}

/**
 * Ghi một dòng log cho mỗi request khi phản hồi xong: method, đường dẫn, mã trạng thái, thời gian.
 * Không ghi query string, header hay body để tránh lộ token/mật khẩu.
 */
export function requestLogger({
  enabled = true,
  json = false,
  write = (line) => process.stdout.write(`${line}\n`),
  ignorePaths = ["/api/health"],
}: Options = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled) {
      next();
      return;
    }

    const started = process.hrtime.bigint();

    res.on("finish", () => {
      const path = req.originalUrl.split("?")[0];
      if (ignorePaths.includes(path)) return;

      const entry: RequestLogEntry = {
        time: new Date().toISOString(),
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        ip: req.ip ?? "unknown",
        ...(req.user?.userId && { userId: req.user.userId }),
      };

      write(
        json
          ? JSON.stringify(entry)
          : `${entry.method} ${entry.path} ${entry.status} ${entry.durationMs}ms`
      );
    });

    next();
  };
}
