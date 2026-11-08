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

export async function createUserWithRole(
  role: "customer" | "owner",
  suffix: string
) {
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
