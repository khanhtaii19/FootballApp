import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

/**
 * Băm mật khẩu với bcrypt (12 rounds)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * So sánh mật khẩu với bản băm
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
