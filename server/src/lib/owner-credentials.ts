/**
 * Tài khoản chủ sân khi seed và đổi mật khẩu.
 * Dev: có tài khoản demo cho tiện. Production: bắt buộc đặt mật khẩu mạnh riêng,
 * không bao giờ dùng mật khẩu công khai trong README.
 */

export interface OwnerCredentials {
  email: string;
  password: string;
  name: string;
  phone: string | null;
  isDemo: boolean;
}

const DEMO = {
  email: "owner@sanbong.vn",
  password: "OwnerPass123",
  name: "Chủ sân demo",
  phone: "0900000001",
} as const;

const MIN_OWNER_PASSWORD_LENGTH = 12;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mật khẩu chủ sân: ≥ 12 ký tự, có chữ hoa, chữ thường và số. Trả về danh sách lỗi (rỗng nếu hợp lệ). */
export function checkOwnerPassword(password: string): string[] {
  const problems: string[] = [];
  if (password.length < MIN_OWNER_PASSWORD_LENGTH) {
    problems.push(`phải dài ít nhất ${MIN_OWNER_PASSWORD_LENGTH} ký tự`);
  }
  if (!/[a-z]/.test(password)) problems.push("phải có chữ thường");
  if (!/[A-Z]/.test(password)) problems.push("phải có chữ hoa");
  if (!/\d/.test(password)) problems.push("phải có chữ số");
  if (password === DEMO.password) problems.push("không được dùng mật khẩu demo");
  return problems;
}

export class OwnerCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerCredentialsError";
  }
}

export function resolveOwnerCredentials(
  source: NodeJS.ProcessEnv = process.env
): OwnerCredentials {
  const isProduction = source.NODE_ENV === "production";
  const email = source.SEED_OWNER_EMAIL?.trim() || (isProduction ? "" : DEMO.email);
  const password = source.SEED_OWNER_PASSWORD ?? (isProduction ? "" : DEMO.password);

  if (isProduction) {
    if (!email) {
      throw new OwnerCredentialsError("Production: cần đặt SEED_OWNER_EMAIL");
    }
    if (!password) {
      throw new OwnerCredentialsError(
        "Production: cần đặt SEED_OWNER_PASSWORD (mật khẩu chủ sân)"
      );
    }
    const problems = checkOwnerPassword(password);
    if (problems.length > 0) {
      throw new OwnerCredentialsError(`SEED_OWNER_PASSWORD yếu: ${problems.join(", ")}`);
    }
  }

  if (!EMAIL.test(email)) {
    throw new OwnerCredentialsError(`SEED_OWNER_EMAIL không hợp lệ: "${email}"`);
  }

  const isDemo = email === DEMO.email && password === DEMO.password;
  return {
    email,
    password,
    name: source.SEED_OWNER_NAME?.trim() || (isDemo ? DEMO.name : "Chủ sân"),
    phone: source.SEED_OWNER_PHONE?.trim() || (isDemo ? DEMO.phone : null),
    isDemo,
  };
}
