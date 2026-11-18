import { Router, Request, Response } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  availableSlotsQuerySchema,
  createBookingSchema,
  confirmBookingSchema,
} from "../validators/booking.validator.js";
import * as bookingService from "../services/booking.service.js";
import { BookingError } from "../services/booking.service.js";

export const router = Router();

// ─── Helper xử lý lỗi ───────────────────────────────

function handleBookingError(error: unknown, res: Response) {
  if (error instanceof BookingError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error("❌ Booking error:", error);
  res.status(500).json({ error: "Lỗi hệ thống" });
}

// ─── GET /api/bookings/available ─────────────────────
// Xem giờ trống: ?date=2026-12-01&fieldType=five&duration=60

router.get("/bookings/available", async (req: Request, res: Response) => {
  try {
    const parsed = availableSlotsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Tham số không hợp lệ",
        details: parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      });
      return;
    }

    const result = await bookingService.getAvailableSlots(parsed.data);
    res.json(result);
  } catch (error) {
    handleBookingError(error, res);
  }
});

// ─── POST /api/bookings ─────────────────────────────
// Tạo booking mới (customer)

router.post(
  "/bookings",
  authenticate,
  validate(createBookingSchema),
  async (req: Request, res: Response) => {
    try {
      const booking = await bookingService.createBooking(req.user!.userId, req.body);
      res.status(201).json({
        message: "Đặt sân thành công",
        booking,
      });
    } catch (error) {
      handleBookingError(error, res);
    }
  }
);

// ─── GET /api/bookings ──────────────────────────────
// Danh sách booking: customer thấy của mình, owner thấy tất cả

router.get("/bookings", authenticate, async (req: Request, res: Response) => {
  try {
    const bookings = await bookingService.listBookings(req.user!.userId, req.user!.role);
    res.json({ bookings });
  } catch (error) {
    handleBookingError(error, res);
  }
});

// ─── GET /api/bookings/:id ──────────────────────────
// Chi tiết booking

router.get("/bookings/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const booking = await bookingService.getBookingById(
      String(req.params.id),
      req.user!.userId,
      req.user!.role
    );
    res.json({ booking });
  } catch (error) {
    handleBookingError(error, res);
  }
});

// ─── PATCH /api/bookings/:id/cancel ─────────────────
// Hủy booking (customer hoặc owner)

router.patch(
  "/bookings/:id/cancel",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { booking, refund } = await bookingService.cancelBooking(
        String(req.params.id),
        req.user!.userId,
        req.user!.role
      );
      res.json({
        message: "Đã hủy booking",
        booking,
        refund,
      });
    } catch (error) {
      handleBookingError(error, res);
    }
  }
);

// ─── PATCH /api/bookings/:id/confirm ────────────────
// Xác nhận booking (owner only)

router.patch(
  "/bookings/:id/confirm",
  authenticate,
  authorize("owner"),
  async (req: Request, res: Response) => {
    try {
      const parsed = confirmBookingSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: "Dữ liệu không hợp lệ",
          details: parsed.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        });
        return;
      }

      const booking = await bookingService.confirmBooking(
        String(req.params.id),
        parsed.data
      );
      res.json({
        message: "Đã xác nhận booking",
        booking,
      });
    } catch (error) {
      handleBookingError(error, res);
    }
  }
);

// ─── GET /api/bookings/:id/payment ──────────────────
// Thông tin chuyển khoản: số tiền cọc, nội dung, chuỗi QR VietQR

router.get("/bookings/:id/payment", authenticate, async (req: Request, res: Response) => {
  try {
    const payment = await bookingService.getPaymentInfo(
      String(req.params.id),
      req.user!.userId,
      req.user!.role
    );
    res.json({ payment });
  } catch (error) {
    handleBookingError(error, res);
  }
});

// ─── PATCH /api/bookings/:id/refund ─────────────────
// Chủ sân đánh dấu đã hoàn cọc cho khách (owner only)

router.patch(
  "/bookings/:id/refund",
  authenticate,
  authorize("owner"),
  async (req: Request, res: Response) => {
    try {
      const booking = await bookingService.markRefunded(String(req.params.id));
      res.json({
        message: "Đã ghi nhận hoàn cọc",
        booking,
      });
    } catch (error) {
      handleBookingError(error, res);
    }
  }
);
