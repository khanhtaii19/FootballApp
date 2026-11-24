import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "./env.js";

// ─── Types ───────────────────────────────────────────

export interface TokenPayload {
  userId: string;
  role: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─── Config ──────────────────────────────────────────

// Giá trị đã được kiểm tra ở lib/env.ts (production không có giá trị mặc định)
const { JWT_SECRET, JWT_REFRESH_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } = env;

// ─── Generate tokens ────────────────────────────────

export function generateTokens(payload: TokenPayload): TokenPair {
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });

  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
  });

  return { accessToken, refreshToken };
}

// ─── Verify access token ────────────────────────────

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

// ─── Verify refresh token ───────────────────────────

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
}
