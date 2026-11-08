import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Seed 6 zones ─────────────────────────────────
  // Sân 7 số 1: [A1 | A2 | A3]
  // Sân 7 số 2: [B1 | B2 | B3]

  const zones = [
    { name: "A1", surface: "A" },
    { name: "A2", surface: "A" },
    { name: "A3", surface: "A" },
    { name: "B1", surface: "B" },
    { name: "B2", surface: "B" },
    { name: "B3", surface: "B" },
  ];

  for (const zone of zones) {
    await prisma.zone.upsert({
      where: { name: zone.name },
      update: {},
      create: zone,
    });
  }
  console.log("✅ 6 zones created (A1-A3, B1-B3)");

  // ─── Seed default settings ───────────────────────

  const settings = [
    { key: "opening_hour", value: "05:00" },
    { key: "closing_hour", value: "23:00" },
    { key: "time_step_minutes", value: "15" },
    { key: "allowed_durations", value: JSON.stringify([60, 90]) },
    { key: "price_5", value: "200000" },
    { key: "price_7", value: "500000" },
    { key: "hold_timeout_minutes", value: "15" },
    { key: "cancel_before_hours", value: "24" },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log("✅ Default settings created");

  // ─── Tài khoản demo ───────────────────────────────
  const ownerPasswordHash = await bcrypt.hash("OwnerPass123", 12);
  await prisma.user.upsert({
    where: { email: "owner@sanbong.vn" },
    update: {},
    create: {
      email: "owner@sanbong.vn",
      passwordHash: ownerPasswordHash,
      name: "Chủ sân demo",
      role: "owner",
      phone: "0900000001",
    },
  });
  console.log("✅ Demo owner: owner@sanbong.vn / OwnerPass123");

  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
