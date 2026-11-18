import type { Prisma } from "@prisma/client";

// Khóa tư vấn (advisory lock) dùng chung cho mọi thao tác ghi vào lịch sân.
const BOOKING_LOCK_KEY = 7420001;

/**
 * Xếp hàng các transaction tạo booking/block: transaction sau chờ transaction
 * trước commit xong rồi mới đọc vùng bận. Nhờ vậy các transaction không tranh
 * nhau khóa ở exclusion constraint (dễ chờ lẫn nhau khi tải đồng thời).
 * Khóa tự nhả khi transaction commit hoặc rollback. Exclusion constraint
 * `no_overlap` vẫn là chốt chặn cuối cùng nếu có đường ghi nào bỏ qua khóa này.
 *
 * Dùng SELECT trả về cột int thay vì `void` để Prisma đọc kết quả được.
 */
export async function lockBookingCreation(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${BOOKING_LOCK_KEY}::bigint)) AS l`;
}
