import { isLive } from "./bookings";
import { fieldTypeLabel, formatTime, vnToIso } from "./format";
import type { Booking } from "./types";

export type GridEventKind = "pending" | "confirmed" | "block";

export interface GridEvent {
  key: string;
  bookingId: string;
  zoneName: string;
  kind: GridEventKind;
  title: string;
  subtitle: string;
  /** Vị trí trong cột (0-100) so với khoảng [openMin, closeMin] */
  topPct: number;
  heightPct: number;
}

interface BuildArgs {
  date: string; // "YYYY-MM-DD" (giờ VN)
  bookings: Booking[];
  blocks: Booking[];
  openMin: number; // phút từ 00:00, ví dụ 300 = 05:00
  closeMin: number;
  now?: Date;
}

/**
 * Biến booking + block thành các khối hiển thị trên lưới lịch (mỗi vùng một khối).
 * Sân 7 chiếm 3 vùng nên cho ra 3 khối cùng bookingId.
 * Bỏ qua booking đã hủy/hết hạn và booking pending đã quá hạn thanh toán.
 */
export function buildGridEvents({
  date,
  bookings,
  blocks,
  openMin,
  closeMin,
  now = new Date(),
}: BuildArgs): GridEvent[] {
  const dayStart = Date.parse(vnToIso(date, "00:00"));
  const span = closeMin - openMin;
  if (span <= 0) return [];

  const events: GridEvent[] = [];

  for (const booking of [...bookings, ...blocks]) {
    if (!isLive(booking, now)) continue;

    const startMin = (Date.parse(booking.startsAt) - dayStart) / 60000;
    const endMin = (Date.parse(booking.endsAt) - dayStart) / 60000;
    const from = Math.max(startMin, openMin);
    const to = Math.min(endMin, closeMin);
    if (to <= from) continue; // nằm ngoài khung giờ đang xem

    const isBlock = booking.fieldType === "block";
    const kind: GridEventKind = isBlock ? "block" : booking.status === "pending" ? "pending" : "confirmed";
    const title = isBlock ? "Khóa sân" : (booking.user?.name ?? "Khách");
    const subtitle = isBlock
      ? (booking.note ?? "")
      : `${fieldTypeLabel(booking.fieldType)} · ${formatTime(booking.startsAt)}-${formatTime(booking.endsAt)}`;

    for (const bz of booking.bookingZones) {
      if (!bz.isActive) continue;
      events.push({
        key: `${booking.id}:${bz.zone.name}`,
        bookingId: booking.id,
        zoneName: bz.zone.name,
        kind,
        title,
        subtitle,
        topPct: ((from - openMin) / span) * 100,
        heightPct: ((to - from) / span) * 100,
      });
    }
  }

  return events;
}

/** Nhãn giờ chẵn để vẽ trục thời gian, ví dụ [5, 6, ..., 23]. */
export function hourMarks(openMin: number, closeMin: number): number[] {
  const marks: number[] = [];
  for (let h = Math.ceil(openMin / 60); h * 60 <= closeMin; h++) marks.push(h);
  return marks;
}
