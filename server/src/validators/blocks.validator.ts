import { z } from "zod";

export const createBlockSchema = z
  .object({
    zoneId: z.string().min(1, "zoneId không được để trống").optional(),
    zoneName: z
      .enum(["A1", "A2", "A3", "B1", "B2", "B3"], {
        errorMap: () => ({ message: "Tên vùng phải là A1–A3 hoặc B1–B3" }),
      })
      .optional(),
    startsAt: z.string().datetime({ message: "startsAt phải là ISO 8601" }),
    endsAt: z.string().datetime({ message: "endsAt phải là ISO 8601" }),
    note: z.string().max(500, "Ghi chú tối đa 500 ký tự").optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.zoneId && !data.zoneName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cần zoneId hoặc zoneName",
        path: ["zoneId"],
      });
    }

    const start = new Date(data.startsAt);
    const end = new Date(data.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return;
    }
    if (start >= end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Thời gian kết thúc phải sau thời gian bắt đầu",
        path: ["endsAt"],
      });
    }
  });

export type CreateBlockInput = z.infer<typeof createBlockSchema>;

export const listBlocksQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
