// Dev: `npm run db:seed` (hoặc `prisma db seed`). Logic nằm ở src/scripts/seed.ts
// để image production chạy được bản đã biên dịch (dist/scripts/seed.js).
import prisma from "../src/lib/prisma.js";
import { runSeed } from "../src/scripts/seed.js";

runSeed()
  .catch((error) => {
    console.error("❌ Seed error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
