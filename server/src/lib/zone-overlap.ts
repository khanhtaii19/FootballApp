import prisma from "./prisma.js";

/**
 * Tìm booking_zone đang active chồng thời gian trên một trong các vùng.
 * Dùng cho block (Phần 3) và sẽ tái sử dụng khi tạo booking (Phần 4).
 */
export async function findActiveZoneOverlap(
  zoneIds: string[],
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string
) {
  if (zoneIds.length === 0) {
    return null;
  }

  return prisma.bookingZone.findFirst({
    where: {
      zoneId: { in: zoneIds },
      isActive: true,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeBookingId ? { bookingId: { not: excludeBookingId } } : {}),
    },
    include: {
      zone: { select: { name: true } },
      booking: { select: { id: true, fieldType: true, status: true } },
    },
  });
}
