import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export const updateSettingsSchema = z
  .object({
    opening_hour: z
      .string()
      .regex(timeRegex, "Giờ mở cửa phải dạng HH:MM (00:00–23:59)")
      .optional(),
    closing_hour: z
      .string()
      .regex(timeRegex, "Giờ đóng cửa phải dạng HH:MM (00:00–23:59)")
      .optional(),
    time_step_minutes: z.coerce
      .number()
      .int("Bước thời gian phải là số nguyên")
      .min(5, "Bước thời gian tối thiểu 5 phút")
      .max(60, "Bước thời gian tối đa 60 phút")
      .optional(),
    allowed_durations: z
      .array(z.union([z.literal(60), z.literal(90)]))
      .min(1, "Cần ít nhất một thời lượng (60 hoặc 90 phút)")
      .optional(),
    price_5: z.coerce
      .number()
      .int("Giá sân 5 phải là số nguyên")
      .positive("Giá sân 5 phải lớn hơn 0")
      .optional(),
    price_7: z.coerce
      .number()
      .int("Giá sân 7 phải là số nguyên")
      .positive("Giá sân 7 phải lớn hơn 0")
      .optional(),
    hold_timeout_minutes: z.coerce
      .number()
      .int()
      .min(5, "Hạn giữ chỗ tối thiểu 5 phút")
      .max(60, "Hạn giữ chỗ tối đa 60 phút")
      .optional(),
    cancel_before_hours: z.coerce
      .number()
      .int()
      .min(0, "Số giờ hủy không được âm")
      .max(168, "Số giờ hủy tối đa 168 (7 ngày)")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.opening_hour && data.closing_hour) {
      if (timeToMinutes(data.opening_hour) >= timeToMinutes(data.closing_hour)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Giờ đóng cửa phải sau giờ mở cửa",
          path: ["closing_hour"],
        });
      }
    }
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
