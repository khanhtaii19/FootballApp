import { z } from "zod";

// ─── Xem giờ trống ───────────────────────────────────

export const availableSlotsQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD"),
  fieldType: z.enum(["five", "seven"], {
    errorMap: () => ({ message: "Loại sân phải là 'five' hoặc 'seven'" }),
  }),
  duration: z.coerce
    .number()
    .int()
    .refine((v) => [60, 90].includes(v), "Thời lượng phải là 60 hoặc 90 phút"),
});

export type AvailableSlotsQuery = z.infer<typeof availableSlotsQuerySchema>;

// ─── Tạo booking ─────────────────────────────────────

export const createBookingSchema = z.object({
  fieldType: z.enum(["five", "seven"], {
    errorMap: () => ({ message: "Loại sân phải là 'five' hoặc 'seven'" }),
  }),
  startsAt: z.string().datetime({ message: "startsAt phải là ISO 8601" }),
  duration: z
    .number()
    .int()
    .refine((v) => [60, 90].includes(v), "Thời lượng phải là 60 hoặc 90 phút"),
  note: z.string().max(500, "Ghi chú tối đa 500 ký tự").optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// ─── Hủy / xác nhận booking ─────────────────────────

export const bookingIdParamSchema = z.object({
  id: z.string().min(1, "Booking ID không được để trống"),
});
