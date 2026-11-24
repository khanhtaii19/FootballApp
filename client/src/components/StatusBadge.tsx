import { statusLabel } from "../lib/format";
import type { BookingStatus } from "../lib/types";

export function StatusBadge({ status, expired = false }: { status: BookingStatus; expired?: boolean }) {
  // Pending đã quá hạn hiển thị như "Hết hạn" dù server chưa kịp dọn
  const effective: BookingStatus = expired ? "expired" : status;
  return <span className={`badge badge-${effective}`}>{statusLabel(effective)}</span>;
}
