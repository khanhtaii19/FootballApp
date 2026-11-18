import { z } from "zod";

// ─── Xem giờ trống ───────────────────────────────────

export const availableSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải dạng YYYY-MM-DD"),
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

// ─── Xác nhận đã nhận cọc (owner) ────────────────────

export const confirmBookingSchema = z.object({
  amount: z
    .number({ invalid_type_error: "Số tiền phải là số" })
    .int("Số tiền phải là số nguyên")
    .positive("Số tiền phải lớn hơn 0")
    .optional(),
  method: z
    .enum(["bank_transfer", "cash"], {
      errorMap: () => ({ message: "Hình thức phải là 'bank_transfer' hoặc 'cash'" }),
    })
    .optional(),
  transactionId: z
    .string()
    .trim()
    .min(1)
    .max(100, "Mã giao dịch tối đa 100 ký tự")
    .optional(),
});

export type ConfirmBookingBody = z.infer<typeof confirmBookingSchema>;
