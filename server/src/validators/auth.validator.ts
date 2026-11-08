import { z } from "zod";

// ─── Đăng ký ─────────────────────────────────────────

export const registerSchema = z.object({
  email: z
    .string()
    .email("Email không hợp lệ")
    .max(255, "Email quá dài")
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "Mật khẩu tối thiểu 8 ký tự")
    .max(72, "Mật khẩu tối đa 72 ký tự") // bcrypt limit
    .regex(/[A-Z]/, "Mật khẩu cần ít nhất 1 chữ hoa")
    .regex(/[a-z]/, "Mật khẩu cần ít nhất 1 chữ thường")
    .regex(/[0-9]/, "Mật khẩu cần ít nhất 1 chữ số"),
  name: z
    .string()
    .min(2, "Tên tối thiểu 2 ký tự")
    .max(100, "Tên tối đa 100 ký tự")
    .trim(),
  phone: z
    .string()
    .regex(/^(0|\+84)[0-9]{9}$/, "Số điện thoại không hợp lệ")
    .optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Đăng nhập ───────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .email("Email không hợp lệ")
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Mật khẩu không được để trống"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─── Refresh token ───────────────────────────────────

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token không được để trống"),
});

export type RefreshInput = z.infer<typeof refreshSchema>;
