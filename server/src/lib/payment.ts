/** Làm tròn lên bội số của 1.000đ cho tiền cọc dễ chuyển khoản. */
const DEPOSIT_ROUNDING = 1000;

/**
 * Tiền cọc = % tổng tiền, làm tròn lên 1.000đ, không vượt quá tổng tiền.
 * Tổng tiền <= 0 (ví dụ block của chủ sân) thì không cọc.
 */
export function calculateDeposit(totalAmount: number, percent: number): number {
  if (totalAmount <= 0 || percent <= 0) return 0;
  const raw = (totalAmount * percent) / 100;
  const rounded = Math.ceil(raw / DEPOSIT_ROUNDING) * DEPOSIT_ROUNDING;
  return Math.min(rounded, totalAmount);
}

/**
 * Mã nội dung chuyển khoản của một booking, ví dụ "SBK3X9QZ2A".
 * Suy ra từ id nên không cần lưu thêm cột; chủ sân đối chiếu sao kê bằng mã này.
 */
export function getPaymentCode(bookingId: string): string {
  const alnum = bookingId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `SB${alnum.slice(-8)}`;
}

export type RefundReason = "no_deposit" | "owner_cancelled" | "in_time" | "late_cancel";

export interface RefundDecision {
  eligible: boolean;
  amount: number; // VND phải hoàn lại cho khách
  reason: RefundReason;
  message: string;
}

const REFUND_MESSAGES: Record<RefundReason, string> = {
  no_deposit: "Chưa có tiền cọc nào cần hoàn",
  owner_cancelled: "Chủ sân hủy nên khách được hoàn đủ tiền cọc",
  in_time: "Hủy đúng hạn nên được hoàn đủ tiền cọc",
  late_cancel: "Hủy quá sát giờ đá nên không được hoàn tiền cọc",
};

export interface RefundInput {
  depositPaid: number; // tổng tiền cọc đã nhận (payment completed)
  startsAt: Date;
  now: Date;
  cancelBeforeHours: number; // hủy trước giờ đá ít nhất bấy nhiêu giờ thì được hoàn
  cancelledByOwner: boolean;
}

/** Quyết định hoàn cọc khi hủy booking. */
export function evaluateRefund(input: RefundInput): RefundDecision {
  const { depositPaid, startsAt, now, cancelBeforeHours, cancelledByOwner } = input;

  const decide = (reason: RefundReason, amount: number): RefundDecision => ({
    eligible: amount > 0,
    amount,
    reason,
    message: REFUND_MESSAGES[reason],
  });

  if (depositPaid <= 0) return decide("no_deposit", 0);
  if (cancelledByOwner) return decide("owner_cancelled", depositPaid);

  const hoursBefore = (startsAt.getTime() - now.getTime()) / 3_600_000;
  return hoursBefore >= cancelBeforeHours
    ? decide("in_time", depositPaid)
    : decide("late_cancel", 0);
}
