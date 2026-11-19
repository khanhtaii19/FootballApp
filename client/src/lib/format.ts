import type { BookingStatus, FieldType } from "./types";

export const TIME_ZONE = "Asia/Ho_Chi_Minh";
const VN_OFFSET = "+07:00"; // Việt Nam không dùng giờ mùa hè

// ─── Tiền ────────────────────────────────────────────

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

/**
 * Tiền cọc: % tổng tiền, làm tròn lên 1.000đ, không vượt tổng tiền.
 * PHẢI khớp với server (server/src/lib/payment.ts); server mới là nguồn chính xác.
 */
export function calculateDeposit(totalAmount: number, percent: number): number {
  if (totalAmount <= 0 || percent <= 0) return 0;
  const rounded = Math.ceil((totalAmount * percent) / 100 / 1000) * 1000;
  return Math.min(rounded, totalAmount);
}

// ─── Ngày giờ (luôn theo giờ Việt Nam) ───────────────

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function vnParts(date: Date) {
  const map: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(date)) map[part.type] = part.value;
  return map;
}

/** "YYYY-MM-DD" của một thời điểm, theo giờ Việt Nam. */
export function vnDateString(date: Date = new Date()): string {
  const p = vnParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Cộng/trừ ngày trên chuỗi "YYYY-MM-DD" (không phụ thuộc múi giờ máy). */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "18:30" theo giờ Việt Nam. */
export function formatTime(iso: string): string {
  const p = vnParts(new Date(iso));
  return `${p.hour}:${p.minute}`;
}

/** "01/01/2030" theo giờ Việt Nam. */
export function formatDate(iso: string): string {
  const p = vnParts(new Date(iso));
  return `${p.day}/${p.month}/${p.year}`;
}

/** "18:00 - 19:30" */
export function formatRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} - ${formatTime(endIso)}`;
}

/** Nhãn ngày dạng "Thứ năm, 02/01" từ chuỗi "YYYY-MM-DD". */
export function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("vi-VN", { weekday: "long", timeZone: "UTC" }).format(d);
  const [, month, day] = dateStr.split("-");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${day}/${month}`;
}

/** Ghép ngày + giờ Việt Nam ("2030-01-01", "18:00") thành ISO UTC. */
export function vnToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00${VN_OFFSET}`).toISOString();
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Nhãn hiển thị ───────────────────────────────────

export function fieldTypeLabel(type: FieldType | "block"): string {
  switch (type) {
    case "five":
      return "Sân 5";
    case "seven":
      return "Sân 7";
    case "block":
      return "Khóa sân";
  }
}

export function statusLabel(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "Chờ thanh toán";
    case "confirmed":
      return "Đã xác nhận";
    case "cancelled":
      return "Đã hủy";
    case "expired":
      return "Hết hạn";
    case "completed":
      return "Hoàn thành";
  }
}
