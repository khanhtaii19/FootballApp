import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { getAppSettings } from "./settings.service.js";
import { isOverlapConstraintError } from "../lib/db-errors.js";
import { lockBookingCreation } from "../lib/db-locks.js";
import { getMaxPendingPerUser } from "../lib/booking-limits.js";
import { calculateDeposit, evaluateRefund, getPaymentCode } from "../lib/payment.js";
import { buildVietQrPayload } from "../lib/vietqr.js";
import { expireStaleBookings, liveHoldFilter } from "./booking-expiry.service.js";
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

// ─── Helpers thanh toán ──────────────────────────────

const PAYMENT_SELECT = {
  select: {
    id: true,
    amount: true,
    method: true,
    status: true,
    transactionId: true,
    createdAt: true,
  },
  orderBy: { createdAt: "asc" },
} as const;

/** Gắn mã nội dung chuyển khoản (suy ra từ id) vào booking trả về cho client. */
function withPaymentCode<T extends { id: string }>(booking: T) {
  return { ...booking, paymentCode: getPaymentCode(booking.id) };
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
      ...liveHoldFilter(new Date()),
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
  const deposit = calculateDeposit(totalAmount, settings.deposit_percent);

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
    return prisma.$transaction(
      async (tx) => {
        // Xếp hàng: chỉ một transaction được chọn vùng và ghi tại một thời điểm
        await lockBookingCreation(tx);

        // Nhả ngay các booking pending đã quá hạn (không phải đợi job nền)
        await expireStaleBookings(tx, new Date());

        // Giới hạn số booking đang giữ chỗ của mỗi người
        const maxPending = getMaxPendingPerUser();
        const pendingCount = await tx.booking.count({
          where: { userId, status: "pending" },
        });
        if (pendingCount >= maxPending) {
          throw new BookingError(
            `Bạn đang có ${pendingCount} booking chờ thanh toán (tối đa ${maxPending}). Hãy thanh toán hoặc hủy bớt trước khi đặt thêm`,
            429
          );
        }

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
            deposit,
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
      },
      // Chờ khóa xếp hàng có thể lâu hơn mặc định (2s/5s) khi runner chậm
      { maxWait: 15_000, timeout: 20_000 }
    );
  }
}

// ─── API: Hủy booking ───────────────────────────────

export async function cancelBooking(bookingId: string, userId: string, userRole: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payments: true },
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

  // Chính sách hoàn cọc: hủy sớm hơn X giờ trước giờ đá thì hoàn, chủ sân hủy thì luôn hoàn
  const settings = await getAppSettings();
  const now = new Date();
  const depositPaid = booking.payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount, 0);
  const refund = evaluateRefund({
    depositPaid,
    startsAt: booking.startsAt,
    now,
    cancelBeforeHours: settings.cancel_before_hours,
    cancelledByOwner: userRole === "owner",
  });

  const updated = await prisma.$transaction(async (tx) => {
    // Chỉ hủy khi booking vẫn đang pending/confirmed (tránh hủy chồng lên thay đổi vừa xảy ra)
    const { count } = await tx.booking.updateMany({
      where: { id: bookingId, status: { in: ["pending", "confirmed"] } },
      data: { status: "cancelled", cancelledAt: now, refundAmount: refund.amount },
    });
    if (count === 0) {
      throw new BookingError("Booking vừa thay đổi trạng thái, vui lòng tải lại", 409);
    }

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
        payments: PAYMENT_SELECT,
      },
    });
  });

  return { booking: withPaymentCode(updated), refund };
}

// ─── API: Xác nhận booking (owner) ──────────────────

export interface ConfirmBookingInput {
  amount?: number; // Số tiền thực nhận; mặc định = tiền cọc yêu cầu
  method?: "bank_transfer" | "cash";
  transactionId?: string; // Mã giao dịch ngân hàng (nếu có)
}

export async function confirmBooking(bookingId: string, input: ConfirmBookingInput = {}) {
  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { deposit: true },
  });
  if (!existing) {
    throw new BookingError("Không tìm thấy booking", 404);
  }

  const amount = input.amount ?? existing.deposit;
  if (amount < existing.deposit) {
    throw new BookingError(
      `Số tiền nhận được (${amount}đ) chưa đủ tiền cọc yêu cầu (${existing.deposit}đ)`,
      400
    );
  }

  const now = new Date();

  // Xác nhận + ghi nhận khoản thanh toán trong cùng một transaction.
  // Điều kiện nguyên tử: chỉ xác nhận khi vẫn đang pending VÀ chưa quá hạn, để không
  // xác nhận một booking mà job nền vừa nhả chỗ cho người khác.
  const confirmed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: {
        id: bookingId,
        status: "pending",
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      data: { status: "confirmed", paidAt: now, expiresAt: null },
    });
    if (count === 0) return false;

    if (amount > 0) {
      await tx.payment.create({
        data: {
          bookingId,
          amount,
          method: input.method ?? "bank_transfer",
          status: "completed",
          transactionId: input.transactionId,
        },
      });
    }
    return true;
  });

  if (!confirmed) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    if (!booking) {
      throw new BookingError("Không tìm thấy booking", 404);
    }
    // pending nhưng quá hạn (job chưa kịp dọn) hoặc đã expired
    if (booking.status === "pending" || booking.status === "expired") {
      throw new BookingError("Booking đã hết hạn giữ chỗ, khách cần đặt lại", 409);
    }
    throw new BookingError(
      `Chỉ xác nhận được booking đang chờ (hiện tại: ${booking.status})`,
      400
    );
  }

  const booking = await prisma.booking.findUniqueOrThrow({
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
      payments: PAYMENT_SELECT,
    },
  });
  return withPaymentCode(booking);
}

// ─── API: Thông tin thanh toán (QR) ──────────────────

export async function getPaymentInfo(
  bookingId: string,
  userId: string,
  userRole: string
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payments: PAYMENT_SELECT },
  });

  if (!booking) {
    throw new BookingError("Không tìm thấy booking", 404);
  }
  if (userRole === "customer" && booking.userId !== userId) {
    throw new BookingError("Bạn không có quyền xem booking này", 403);
  }

  const settings = await getAppSettings();
  const now = new Date();
  const transferContent = getPaymentCode(booking.id);
  const bankConfigured = Boolean(settings.bank_bin && settings.bank_account_no);

  // Chỉ phát QR khi booking còn giữ chỗ hợp lệ và có tiền cọc cần thu
  const awaitingPayment =
    booking.status === "pending" && (!booking.expiresAt || booking.expiresAt >= now);
  const qrPayload =
    awaitingPayment && bankConfigured && booking.deposit > 0
      ? buildVietQrPayload({
          bin: settings.bank_bin,
          accountNo: settings.bank_account_no,
          amount: booking.deposit,
          content: transferContent,
        })
      : null;

  const refundPaid = booking.payments.some((p) => p.status === "refunded");
  const refundHeld = booking.payments.some((p) => p.status === "completed");

  return {
    bookingId: booking.id,
    status: booking.status,
    totalAmount: booking.totalAmount,
    deposit: booking.deposit,
    remainingAtVenue: Math.max(booking.totalAmount - booking.deposit, 0),
    expiresAt: booking.expiresAt,
    awaitingPayment,
    transferContent,
    bankConfigured,
    bank: bankConfigured
      ? {
          bin: settings.bank_bin,
          accountNo: settings.bank_account_no,
          accountName: settings.bank_account_name,
        }
      : null,
    qrPayload,
    payments: booking.payments,
    refund: {
      amount: booking.refundAmount,
      due: booking.status === "cancelled" && booking.refundAmount > 0 && refundHeld,
      paid: refundPaid,
    },
  };
}

// ─── API: Đánh dấu đã hoàn cọc (owner) ──────────────

export async function markRefunded(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, refundAmount: true },
  });

  if (!booking) {
    throw new BookingError("Không tìm thấy booking", 404);
  }
  if (booking.status !== "cancelled" || booking.refundAmount <= 0) {
    throw new BookingError("Booking này không có khoản cọc nào cần hoàn", 400);
  }

  const { count } = await prisma.payment.updateMany({
    where: { bookingId, status: "completed" },
    data: { status: "refunded" },
  });
  if (count === 0) {
    throw new BookingError("Khoản cọc của booking này đã được hoàn trước đó", 409);
  }

  const updated = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { payments: PAYMENT_SELECT },
  });
  return withPaymentCode(updated);
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

  const bookings = await prisma.booking.findMany({
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
      payments: PAYMENT_SELECT,
    },
  });
  return bookings.map(withPaymentCode);
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
      payments: PAYMENT_SELECT,
    },
  });

  if (!booking) {
    throw new BookingError("Không tìm thấy booking", 404);
  }

  // Customer chỉ xem được booking của mình
  if (userRole === "customer" && booking.userId !== userId) {
    throw new BookingError("Bạn không có quyền xem booking này", 403);
  }

  return withPaymentCode(booking);
}
