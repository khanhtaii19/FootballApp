import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { lockBookingCreation } from "../lib/db-locks.js";

/**
 * Điều kiện lọc `booking_zones` đang THỰC SỰ giữ chỗ.
 * Booking `pending` đã quá hạn không còn giữ chỗ, kể cả khi job chưa kịp
 * chuyển nó sang `expired` (job chạy mỗi phút nên luôn có khoảng trễ).
 */
export function liveHoldFilter(now: Date): Prisma.BookingZoneWhereInput {
  return {
    isActive: true,
    booking: {
      OR: [
        { status: { not: "pending" } },
        { expiresAt: null },
        { expiresAt: { gte: now } },
      ],
    },
  };
}

/**
 * Chuyển các booking `pending` quá hạn sang `expired` và nhả vùng.
 * Gọi bên trong transaction đang giữ khóa xếp hàng (lockBookingCreation).
 * Trả về số booking đã hết hạn.
 */
export async function expireStaleBookings(
  tx: Prisma.TransactionClient,
  now: Date = new Date()
): Promise<number> {
  const stale = await tx.booking.findMany({
    where: { status: "pending", expiresAt: { lt: now } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  const ids = stale.map((b) => b.id);

  // Điều kiện status: "pending" giữ cho đúng nếu booking vừa được xác nhận/hủy
  // trong lúc ta đang chạy (confirm/cancel không dùng khóa xếp hàng).
  const { count } = await tx.booking.updateMany({
    where: { id: { in: ids }, status: "pending" },
    data: { status: "expired" },
  });

  // Chỉ nhả vùng của những booking THỰC SỰ vừa chuyển sang expired
  await tx.bookingZone.updateMany({
    where: { bookingId: { in: ids }, booking: { status: "expired" } },
    data: { isActive: false },
  });

  return count;
}

/** Chạy một lượt dọn dẹp độc lập (dùng cho job nền). */
export async function runExpiryJob(now: Date = new Date()): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      await lockBookingCreation(tx);
      return expireStaleBookings(tx, now);
    },
    { maxWait: 15_000, timeout: 20_000 }
  );
}
