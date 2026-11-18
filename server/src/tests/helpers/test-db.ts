import { describe } from "vitest";
import prisma from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";

export async function resetBookingData() {
  await prisma.bookingZone.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
}

export async function resetUsers() {
  await resetBookingData();
  await prisma.user.deleteMany();
}

export async function createUserWithRole(role: "customer" | "owner", suffix: string) {
  const password = "TestPass123";
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: `${role}-${suffix}@test.local`,
      passwordHash,
      name: role === "owner" ? "Chủ sân test" : "Khách test",
      role,
    },
  });

  return { user, password };
}

/**
 * Trả về `describe` nếu DB test kết nối được.
 * - Local: không có DB thì bỏ qua (describe.skip) để chạy được unit test.
 * - CI: không có DB là lỗi cấu hình, phải đỏ chứ không được xanh giả.
 */
export async function getDescribeDb() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return describe;
  } catch (error) {
    if (process.env.CI) {
      throw new Error("Integration test cần database nhưng không kết nối được trong CI", {
        cause: error,
      });
    }
    return describe.skip;
  }
}
