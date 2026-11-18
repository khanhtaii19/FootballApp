import { runExpiryJob } from "../services/booking-expiry.service.js";

const DEFAULT_INTERVAL_SECONDS = 60;

/** Chu kỳ chạy job (ms), đọc từ EXPIRY_JOB_INTERVAL_SECONDS, mặc định 60 giây. */
export function getExpiryIntervalMs(): number {
  const raw = Number(process.env.EXPIRY_JOB_INTERVAL_SECONDS);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_SECONDS;
  return seconds * 1000;
}

/**
 * Khởi động job nền nhả các booking `pending` đã quá hạn thanh toán.
 * - Không chạy chồng: lượt mới bị bỏ qua nếu lượt trước chưa xong.
 * - Lỗi chỉ được ghi log, không làm sập server.
 * - Trả về hàm dừng job (dùng khi tắt server).
 */
export function startExpiryJob(
  intervalMs: number = getExpiryIntervalMs(),
  run: () => Promise<number> = runExpiryJob
): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const released = await run();
      if (released > 0) {
        console.log(`⏱️  Đã nhả ${released} booking hết hạn giữ chỗ`);
      }
    } catch (error) {
      console.error("❌ Lỗi job hết hạn booking:", error);
    } finally {
      running = false;
    }
  };

  void tick(); // dọn ngay khi server khởi động
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref(); // không giữ tiến trình sống chỉ vì job

  return () => clearInterval(timer);
}
