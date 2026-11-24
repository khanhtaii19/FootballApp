import type { Booking } from "./types";

/** Booking pending đã quá hạn thanh toán (server có thể chưa kịp dọn). */
export function isHoldExpired(booking: Booking, now: Date = new Date()): boolean {
  return (
    booking.status === "pending" &&
    booking.expiresAt !== null &&
    new Date(booking.expiresAt).getTime() < now.getTime()
  );
}

/** Đang giữ chỗ thật sự: confirmed, hoặc pending còn hạn. */
export function isLive(booking: Booking, now: Date = new Date()): boolean {
  if (booking.status === "confirmed") return true;
  return booking.status === "pending" && !isHoldExpired(booking, now);
}

/** Booking đã hủy và chủ sân còn phải hoàn cọc cho khách. */
export function needsRefund(booking: Booking): boolean {
  return (
    booking.status === "cancelled" &&
    booking.refundAmount > 0 &&
    (booking.payments ?? []).some((p) => p.status === "completed")
  );
}

/** Tổng tiền cọc đã nhận (payment completed). */
export function depositReceived(booking: Booking): number {
  return (booking.payments ?? [])
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount, 0);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .trim();
}

/** Tìm theo mã chuyển khoản, tên, email hoặc số điện thoại (không phân biệt dấu). */
export function matchesSearch(booking: Booking, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const haystack = [
    booking.paymentCode ?? "",
    booking.user?.name ?? "",
    booking.user?.email ?? "",
    booking.user?.phone ?? "",
  ]
    .map(normalize)
    .join(" ");
  return haystack.includes(q);
}

/** Chia booking của khách thành "sắp tới" và "lịch sử". */
export function splitForCustomer(bookings: Booking[], now: Date = new Date()) {
  const upcoming: Booking[] = [];
  const history: Booking[] = [];
  for (const b of bookings) {
    const isFuture = new Date(b.endsAt).getTime() > now.getTime();
    (isFuture && isLive(b, now) ? upcoming : history).push(b);
  }
  upcoming.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  history.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, history };
}
