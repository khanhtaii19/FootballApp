import prisma from "../lib/prisma.js";
import { hashPassword, comparePassword } from "../lib/password.js";
import {
  generateTokens,
  verifyRefreshToken,
  type TokenPayload,
} from "../lib/jwt.js";
import type { RegisterInput, LoginInput } from "../validators/auth.validator.js";

// ─── Custom errors ───────────────────────────────────

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ─── Đăng ký ─────────────────────────────────────────

export async function register(input: RegisterInput) {
  // Kiểm tra email đã tồn tại chưa
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new AuthError("Email đã được đăng ký", 409);
  }

  // Băm mật khẩu
  const passwordHash = await hashPassword(input.password);

  // Tạo user
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone,
      role: "customer", // Mặc định là khách hàng
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  // Tạo token pair
  const tokens = generateTokens({ userId: user.id, role: user.role });

  return { user, ...tokens };
}

// ─── Đăng nhập ───────────────────────────────────────

export async function login(input: LoginInput) {
  // Tìm user theo email
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    // Thông báo chung, không tiết lộ email có tồn tại hay không
    throw new AuthError("Email hoặc mật khẩu không đúng");
  }

  // So sánh mật khẩu
  const valid = await comparePassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Email hoặc mật khẩu không đúng");
  }

  // Tạo token pair
  const tokens = generateTokens({ userId: user.id, role: user.role });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    },
    ...tokens,
  };
}

// ─── Refresh token ───────────────────────────────────

export async function refresh(refreshToken: string) {
  let payload: TokenPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AuthError("Refresh token không hợp lệ hoặc đã hết hạn");
  }

  // Kiểm tra user còn tồn tại không
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AuthError("Người dùng không tồn tại");
  }

  // Tạo token pair mới
  const tokens = generateTokens({ userId: user.id, role: user.role });

  return { user, ...tokens };
}

// ─── Lấy thông tin người dùng ────────────────────────

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AuthError("Người dùng không tồn tại", 404);
  }

  return user;
}
