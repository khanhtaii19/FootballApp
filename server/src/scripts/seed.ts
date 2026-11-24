import bcrypt from "bcrypt";
import prisma from "../lib/prisma.js";
import { resolveOwnerCredentials } from "../lib/owner-credentials.js";

/**
 * Nạp dữ liệu nền: 6 vùng sân, cấu hình mặc định, tài khoản chủ sân.
 * An toàn để chạy lặp lại (mỗi lần khởi động container): chỉ TẠO nếu chưa có,
 * không ghi đè giá/cấu hình hay mật khẩu mà chủ sân đã đổi.
 *
 * Production: bắt buộc SEED_OWNER_EMAIL và SEED_OWNER_PASSWORD (mạnh), không có tài khoản demo.
 */
export async function runSeed() {
  console.log("🌱 Seeding database...");

  // Sân 7 số 1: [A1 | A2 | A3]   Sân 7 số 2: [B1 | B2 | B3]
  const zones = [
    { name: "A1", surface: "A" },
    { name: "A2", surface: "A" },
    { name: "A3", surface: "A" },
    { name: "B1", surface: "B" },
    { name: "B2", surface: "B" },
    { name: "B3", surface: "B" },
  ];
  for (const zone of zones) {
    await prisma.zone.upsert({ where: { name: zone.name }, update: {}, create: zone });
  }
  console.log("✅ 6 zones ready (A1-A3, B1-B3)");

  const settings = [
    { key: "opening_hour", value: "05:00" },
    { key: "closing_hour", value: "23:00" },
    { key: "time_step_minutes", value: "15" },
    { key: "allowed_durations", value: JSON.stringify([60, 90]) },
    { key: "price_5", value: "200000" },
    { key: "price_7", value: "500000" },
    { key: "hold_timeout_minutes", value: "15" },
    { key: "cancel_before_hours", value: "24" },
    { key: "deposit_percent", value: "30" },
  ];
  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log("✅ Default settings ready");

  // Đã có chủ sân và không yêu cầu tạo thêm: bỏ qua, để container khởi động lại
  // sau lần đầu mà không cần giữ SEED_OWNER_PASSWORD trong .env
  const ownerCount = await prisma.user.count({ where: { role: "owner" } });
  if (ownerCount > 0 && !process.env.SEED_OWNER_EMAIL) {
    console.log("✅ Owner account already exists");
    console.log("🎉 Seeding complete!");
    return;
  }

  const owner = resolveOwnerCredentials();
  const existing = await prisma.user.findUnique({ where: { email: owner.email } });
  if (existing) {
    console.log(`✅ Owner ${owner.email} already exists (password unchanged)`);
  } else {
    await prisma.user.create({
      data: {
        email: owner.email,
        passwordHash: await bcrypt.hash(owner.password, 12),
        name: owner.name,
        role: "owner",
        phone: owner.phone,
      },
    });
    // Không bao giờ in mật khẩu thật; chỉ in tài khoản demo ở môi trường dev
    console.log(
      owner.isDemo
        ? `✅ Demo owner created: ${owner.email} / ${owner.password}`
        : `✅ Owner created: ${owner.email}`
    );
  }

  console.log("🎉 Seeding complete!");
}

// Chạy trực tiếp: node dist/scripts/seed.js
if (require.main === module) {
  runSeed()
    .catch((error) => {
      console.error("❌ Seed error:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
