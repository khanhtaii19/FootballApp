import bcrypt from "bcrypt";
import prisma from "../lib/prisma.js";
import { checkOwnerPassword } from "../lib/owner-credentials.js";

/**
 * Đặt lại mật khẩu cho một tài khoản chủ sân (khi quên mật khẩu).
 *
 *   docker compose -f docker-compose.prod.yml exec -e NEW_OWNER_PASSWORD='MatKhauMoi123456' \
 *     server node dist/scripts/reset-owner-password.js owner@example.com
 *
 * Mật khẩu lấy từ biến môi trường để không nằm trong lịch sử lệnh.
 */
export async function resetOwnerPassword(email: string, newPassword: string) {
  const problems = checkOwnerPassword(newPassword);
  if (problems.length > 0) {
    throw new Error(`Mật khẩu mới yếu: ${problems.join(", ")}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "owner") {
    throw new Error(`Không tìm thấy tài khoản chủ sân với email ${email}`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });
}

if (require.main === module) {
  const email = process.argv[2];
  const password = process.env.NEW_OWNER_PASSWORD;

  if (!email || !password) {
    console.error(
      "Cách dùng: NEW_OWNER_PASSWORD=... node dist/scripts/reset-owner-password.js <email>"
    );
    process.exit(1);
  }

  resetOwnerPassword(email, password)
    .then(() => console.log(`✅ Đã đặt lại mật khẩu cho ${email}`))
    .catch((error) => {
      console.error("❌", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
