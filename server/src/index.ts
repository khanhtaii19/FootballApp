import "dotenv/config";
import app from "./app.js";
import prisma from "./lib/prisma.js";
import { startExpiryJob } from "./jobs/expire-bookings.job.js";
import { env } from "./lib/env.js";

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
});

// Job nền: nhả booking pending quá hạn thanh toán
const stopExpiryJob = startExpiryJob();

// Tắt server gọn gàng: dừng job, đóng kết nối, ngắt Prisma
function shutdown(signal: string) {
  console.log(`\n${signal} nhận được, đang tắt server...`);
  stopExpiryJob();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Nếu còn kết nối treo, ép thoát sau 10 giây
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
