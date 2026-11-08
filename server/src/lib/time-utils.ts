/**
 * Tiện ích xử lý thời gian cho hệ thống đặt sân.
 * Quy ước: lưu trữ dạng UTC (timestamptz), hiển thị theo Asia/Ho_Chi_Minh (UTC+7).
 * Việt Nam không có DST nên offset luôn cố định.
 */

const VIETNAM_OFFSET_HOURS = 7;
const VIETNAM_OFFSET_MS = VIETNAM_OFFSET_HOURS * 60 * 60 * 1000;

// ─── Parse / format ──────────────────────────────────

/** Parse "HH:MM" → phút từ nửa đêm */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Phút từ nửa đêm → "HH:MM" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Chuyển đổi timezone ────────────────────────────

/**
 * Ngày "YYYY-MM-DD" + giờ "HH:MM" theo giờ Việt Nam → Date UTC.
 * Ví dụ: ("2026-10-15", "18:00") → 2026-10-15T11:00:00.000Z
 */
export function vietnamToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  // Tạo thời điểm Vietnam, trừ 7h để có UTC
  return new Date(Date.UTC(year, month - 1, day, hour - VIETNAM_OFFSET_HOURS, minute));
}

/**
 * Date UTC → chuỗi "HH:MM" giờ Việt Nam.
 */
export function utcToVietnamTime(utcDate: Date): string {
  const vn = new Date(utcDate.getTime() + VIETNAM_OFFSET_MS);
  return `${String(vn.getUTCHours()).padStart(2, "0")}:${String(vn.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Date UTC → chuỗi "YYYY-MM-DD" ngày Việt Nam.
 */
export function utcToVietnamDate(utcDate: Date): string {
  const vn = new Date(utcDate.getTime() + VIETNAM_OFFSET_MS);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vn.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Sinh danh sách giờ ứng viên ────────────────────

/**
 * Sinh tất cả thời điểm bắt đầu hợp lệ trong ngày.
 * @param openingHour  "05:00"
 * @param closingHour  "23:00"
 * @param stepMinutes  15
 * @param durationMinutes 60 | 90
 * @returns mảng phút từ nửa đêm, ví dụ [300, 315, 330, …]
 */
export function generateCandidateTimes(
  openingHour: string,
  closingHour: string,
  stepMinutes: number,
  durationMinutes: number
): number[] {
  const open = timeToMinutes(openingHour);
  const close = timeToMinutes(closingHour);
  const candidates: number[] = [];

  for (let t = open; t + durationMinutes <= close; t += stepMinutes) {
    candidates.push(t);
  }

  return candidates;
}

// ─── Kiểm tra giờ hoạt động ─────────────────────────

/**
 * Kiểm tra xem một khoảng thời gian có nằm trong giờ hoạt động không.
 * So sánh theo giờ Việt Nam.
 */
export function isWithinOperatingHours(
  startsAt: Date,
  endsAt: Date,
  openingHour: string,
  closingHour: string
): boolean {
  const startVN = utcToVietnamTime(startsAt);
  const endVN = utcToVietnamTime(endsAt);

  const startMin = timeToMinutes(startVN);
  const endMin = timeToMinutes(endVN);
  const openMin = timeToMinutes(openingHour);
  const closeMin = timeToMinutes(closingHour);

  // Trường hợp đặc biệt: nếu end = 00:00 (nửa đêm) thì coi là 1440
  const adjustedEnd = endMin === 0 ? 1440 : endMin;

  return startMin >= openMin && adjustedEnd <= closeMin && startMin < adjustedEnd;
}
