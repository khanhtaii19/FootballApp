import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { getAppSettings } from "./settings.service.js";
import { isOverlapConstraintError } from "../lib/db-errors.js";
import {
  vietnamToUtc,
  minutesToTime,
  generateCandidateTimes,
  isWithinOperatingHours,
} from "../lib/time-utils.js";
import type {
  AvailableSlotsQuery,
  CreateBookingInput,
} from "../validators/booking.validator.js";

// ─── Custom error ────────────────────────────────────

export class BookingError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "BookingError";
  }
}

// ─── Types ───────────────────────────────────────────

interface BusyPeriod {
  zoneId: string;
  startsAt: Date;
  endsAt: Date;
}

interface AvailableSlot {
  startTime: string; // "18:00" (giờ VN)
  endTime: string; // "19:00" (giờ VN)
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  availableCount: number; // số vùng/mặt cỏ còn trống
}

// ─── Helpers ─────────────────────────────────────────

function hasTimeOverlap(
  busyPeriods: BusyPeriod[],
  zoneId: string,
  startsAt: Date,
  endsAt: Date
): boolean {
  return busyPeriods.some(
    (p) => p.zoneId === zoneId && p.startsAt < endsAt && p.endsAt > startsAt
  );
}

// ─── API: Xem giờ trống ──────────────────────────────

export async function getAvailableSlots(query: AvailableSlotsQuery): Promise<{
  date: string;
  fieldType: string;
  duration: number;
  slots: AvailableSlot[];
}> {
  const settings = await getAppSettings();
  const zones = await prisma.zone.findMany({ orderBy: { name: "asc" } });

  // Validate thời lượng
  if (!settings.allowed_durations.includes(query.duration)) {
    throw new BookingError(
      `Thời lượng ${query.duration} phút không được phép. Cho phép: ${settings.allowed_durations.join(", ")} phút`
    );
  }

  // Sinh giờ ứng viên
  const candidates = generateCandidateTimes(
    settings.opening_hour,
    settings.closing_hour,
    settings.time_step_minutes,
    query.duration
  );

  if (candidates.length === 0) {
    return {
      date: query.date,
      fieldType: query.fieldType,
      duration: query.duration,
      slots: [],
    };
  }

  // Khoảng thời gian cả ngày (UTC) để query 1 lần
  const dayStartUtc = vietnamToUtc(query.date, minutesToTime(candidates[0]));
  const lastCandidate = candidates[candidates.length - 1];
  const dayEndUtc = vietnamToUtc(
    query.date,
    minutesToTime(lastCandidate + query.duration)
  );

  // Lấy TẤT CẢ booking_zones active trong ngày — chỉ 1 query
  const busyPeriods: BusyPeriod[] = await prisma.bookingZone.findMany({
    where: {
      isActive: true,
      startsAt: { lt: dayEndUtc },
      endsAt: { gt: dayStartUtc },
    },
    select: { zoneId: true, startsAt: true, endsAt: true },
  });

  // Kiểm tra từng giờ ứng viên
  const slots: AvailableSlot[] = [];

  for (const candidateMin of candidates) {
    const startTime = minutesToTime(candidateMin);
    const endTime = minutesToTime(candidateMin + query.duration);
    const startsAt = vietnamToUtc(query.date, startTime);
    const endsAt = vietnamToUtc(query.date, endTime);

    let availableCount = 0;

    if (query.fieldType === "five") {
      // Đếm số vùng còn trống
      for (const zone of zones) {
        if (!hasTimeOverlap(busyPeriods, zone.id, startsAt, endsAt)) {
          availableCount++;
        }
      }
    } else {
      // Đếm số mặt cỏ còn trống (cả 3 vùng phải rảnh)
      for (const surface of ["A", "B"]) {
        const surfaceZones = zones.filter((z) => z.surface === surface);
        const allFree = surfaceZones.every(
          (z) => !hasTimeOverlap(busyPeriods, z.id, startsAt, endsAt)
        );
        if (allFree) availableCount++;
      }
    }

    if (availableCount > 0) {
      slots.push({
        startTime,
        endTime,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        availableCount,
      });
    }
  }

  return {
    date: query.date,
    fieldType: query.fieldType,
    duration: query.duration,
    slots,
  };
}

// ─── API: Tạo booking ───────────────────────────────

export async function createBooking(userId: string, input: CreateBookingInput) {
  const settings = await getAppSettings();
  const zones = await prisma.zone.findMany({ orderBy: { name: "asc" } });

  // Validate thời lượng
  if (!settings.allowed_durations.includes(input.duration)) {
    throw new BookingError(`Thời lượng ${input.duration} phút không được phép`);
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + input.duration * 60 * 1000);

  // Validate giờ hoạt động
  if (
    !isWithinOperatingHours(
      startsAt,
      endsAt,
      settings.opening_hour,
      settings.closing_hour
    )
  ) {
    throw new BookingError(
      `Giờ đặt phải trong khung ${settings.opening_hour} – ${settings.closing_hour}`
    );
  }

  // Validate không đặt trong quá khứ
  if (startsAt <= new Date()) {
    throw new BookingError("Không thể đặt sân trong quá khứ");
  }

  // Tính giá (chụp lúc đặt)
  const pricePerHour = input.fieldType === "five" ? settings.price_5 : settings.price_7;
  const totalAmount = Math.round(pricePerHour * (input.duration / 60));

  // Hạn giữ chỗ
  const expiresAt = new Date(Date.now() + settings.hold_timeout_minutes * 60 * 1000);

  // Khi nhiều request cùng chọn một vùng, constraint chỉ cho một request thắng.
  // Các request thua KHÔNG được báo hết sân ngay: transaction của chúng đã bị
  // hủy nên phải mở transaction mới, đọc lại vùng bận và chọn vùng khác.
  // Mỗi vòng có ít nhất một request thành công nên số vòng tối đa ~ số vùng.
  const maxAttempts = zones.length + 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await tryCreateBooking();
    } catch (error) {
      if (!isOverlapConstraintError(error)) throw error;
      // Lùi một chút ngẫu nhiên để các request đang tranh nhau lệch nhịp
      await new Promise((r) => setTimeout(r, Math.random() * 20));
    }
  }

  throw new BookingError("Vừa có người đặt trước, mời chọn giờ khác", 409);

  function tryCreateBooking() {
    return prisma.$transaction(async (tx) => {
      // Tìm booking_zones active chồng thời gian
      const busy = await tx.bookingZone.findMany({
        where: {
          isActive: true,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { zoneId: true },
      });
      const busyZoneIds = new Set(busy.map((b) => b.zoneId));

      // Chọn vùng
      let selectedZoneIds: string[];

      if (input.fieldType === "five") {
        // Tìm bất kỳ vùng rảnh nào
        const freeZone = zones.find((z) => !busyZoneIds.has(z.id));
        if (!freeZone) {
          throw new BookingError("Không còn sân 5 trống trong khung giờ này", 409);
        }
        selectedZoneIds = [freeZone.id];
      } else {
        // Tìm mặt cỏ rảnh (cả 3 vùng phải free)
        let freeSurfaceZones: typeof zones | null = null;
        for (const surface of ["A", "B"]) {
          const surfaceZones = zones.filter((z) => z.surface === surface);
          const allFree = surfaceZones.every((z) => !busyZoneIds.has(z.id));
          if (allFree) {
            freeSurfaceZones = surfaceZones;
            break;
          }
        }
        if (!freeSurfaceZones) {
          throw new BookingError("Không còn sân 7 trống trong khung giờ này", 409);
        }
        selectedZoneIds = freeSurfaceZones.map((z) => z.id);
      }

      // Tạo booking
      const booking = await tx.booking.create({
        data: {
          userId,
          fieldType: input.fieldType,
          startsAt,
          endsAt,
          status: "pending",
          totalAmount,
          expiresAt,
          note: input.note,
        },
      });

      // Tạo booking_zones (chốt chặn cuối = exclusion constraint)
      await tx.bookingZone.createMany({
        data: selectedZoneIds.map((zoneId) => ({
          bookingId: booking.id,
          zoneId,
          startsAt,
          endsAt,
          isActive: true,
        })),
      });

      // Trả về booking đầy đủ
      return tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: {
          bookingZones: {
            include: {
              zone: { select: { id: true, name: true, surface: true } },
            },
          },
        },
      });
    });
  }
}

// ─── API: Hủy booking ───────────────────────────────

export async function cancelBooking(bookingId: string, userId: string, userRole: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingZones: true },
  });

  if (!booking) {
    throw new BookingError("Không tìm thấy booking", 404);
  }

  // Chỉ chủ booking hoặc owner mới được hủy
  if (booking.userId !== userId && userRole !== "owner") {
    throw new BookingError("Bạn không có quyền hủy booking này", 403);
  }

  if (booking.status === "cancelled" || booking.status === "expired") {
    throw new BookingError("Booking đã bị hủy hoặc hết hạn", 400);
  }

  if (booking.status === "completed") {
    throw new BookingError("Không thể hủy booking đã hoàn thành", 400);
  }

  return prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "cancelled" },
    });

    // Nhả vùng
    await tx.bookingZone.updateMany({
      where: { bookingId },
      data: { isActive: false },
    });

    return tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        bookingZones: {
          include: {
            zone: { select: { id: true, name: true, surface: true } },
          },
        },
      },
    });
  });
}

// ─── API: Xác nhận booking (owner) ──────────────────

export async function confirmBooking(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw new BookingError("Không tìm thấy booking", 404);
  }

  if (booking.status !== "pending") {
    throw new BookingError(
      `Chỉ xác nhận được booking đang chờ (hiện tại: ${booking.status})`,
      400
    );
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "confirmed",
      paidAt: new Date(),
      expiresAt: null, // Bỏ hạn giữ chỗ
    },
    include: {
      bookingZones: {
        include: {
          zone: { select: { id: true, name: true, surface: true } },
        },
      },
      user: {
        select: { id: true, name: true, email: true, phone: true },
      },
    },
  });
}

// ─── API: Danh sách booking ──────────────────────────

export async function listBookings(userId: string, userRole: string) {
  const where: Prisma.BookingWhereInput = {
    fieldType: { not: "block" }, // Ẩn block khỏi danh sách booking
  };

  // Customer chỉ thấy booking của mình
  if (userRole === "customer") {
    where.userId = userId;
  }

  return prisma.booking.findMany({
    where,
    orderBy: { startsAt: "desc" },
    include: {
      bookingZones: {
        include: {
          zone: { select: { id: true, name: true, surface: true } },
        },
      },
      user: {
        select: { id: true, name: true, email: true, phone: true },
      },
    },
  });
}

// ─── API: Chi tiết booking ──────────────────────────

export async function getBookingById(
  bookingId: string,
  userId: string,
  userRole: string
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingZones: {
        include: {
          zone: { select: { id: true, name: true, surface: true } },
        },
      },
      user: {
        select: { id: true, name: true, email: true, phone: true },
      },
    },
  });

  if (!booking) {
    throw new BookingError("Không tìm thấy booking", 404);
  }

  // Customer chỉ xem được booking của mình
  if (userRole === "customer" && booking.userId !== userId) {
    throw new BookingError("Bạn không có quyền xem booking này", 403);
  }

  return booking;
}
