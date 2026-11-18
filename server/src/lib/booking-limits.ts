const DEFAULT_MAX_PENDING_PER_USER = 3;

/**
 * Số booking `pending` (đang giữ chỗ, chưa thanh toán) tối đa mỗi người.
 * Chặn việc một tài khoản giữ chỗ vô hạn để khóa hết lịch.
 * Đọc env mỗi lần gọi để test đổi được; giá trị sai thì dùng mặc định.
 */
export function getMaxPendingPerUser(): number {
  const raw = Number(process.env.MAX_PENDING_BOOKINGS_PER_USER);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_PENDING_PER_USER;
}
