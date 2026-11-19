import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type SubmitEvent } from "react";
import { api, describeError } from "../lib/api";
import { depositReceived, isHoldExpired, needsRefund } from "../lib/bookings";
import { formatVnd } from "../lib/format";
import type { Booking } from "../lib/types";
import { Notice } from "./Notice";

/** Các thao tác của chủ sân trên một booking hoặc một lịch khóa. */
export function OwnerActions({ booking }: { booking: Booking }) {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [amount, setAmount] = useState(String(booking.deposit));
  const [transactionId, setTransactionId] = useState("");
  const [method, setMethod] = useState<"bank_transfer" | "cash">("bank_transfer");
  const [message, setMessage] = useState<string | null>(null);

  const done = () => queryClient.invalidateQueries();

  const confirm = useMutation({
    mutationFn: () =>
      api.confirmBooking(booking.id, {
        amount: Number(amount),
        method,
        transactionId: transactionId.trim() || undefined,
      }),
    onSuccess: () => {
      setShowConfirm(false);
      return done();
    },
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelBooking(booking.id),
    onSuccess: (result) => {
      setMessage(result.refund.eligible ? `${result.refund.message}: ${formatVnd(result.refund.amount)}` : null);
      return done();
    },
  });

  const refund = useMutation({ mutationFn: () => api.markRefunded(booking.id), onSuccess: done });
  const unblock = useMutation({ mutationFn: () => api.deleteBlock(booking.id), onSuccess: done });

  const error = confirm.error ?? cancel.error ?? refund.error ?? unblock.error;
  const busy = confirm.isPending || cancel.isPending || refund.isPending || unblock.isPending;

  function handleConfirm(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    confirm.mutate();
  }

  if (booking.fieldType === "block") {
    return (
      <div className="actions">
        {error && <Notice kind="error">{describeError(error)}</Notice>}
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => window.confirm("Gỡ lịch khóa này?") && unblock.mutate()}
        >
          Gỡ khóa
        </button>
      </div>
    );
  }

  const awaiting = booking.status === "pending" && !isHoldExpired(booking);
  const canCancel = booking.status === "confirmed" || awaiting;

  return (
    <div className="owner-actions">
      {error && <Notice kind="error">{describeError(error)}</Notice>}
      {message && <Notice kind="info">{message}</Notice>}

      {awaiting && !showConfirm && (
        <div className="actions">
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setShowConfirm(true)}>
            Xác nhận đã nhận cọc
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => window.confirm("Hủy booking này?") && cancel.mutate()}
          >
            Hủy
          </button>
        </div>
      )}

      {awaiting && showConfirm && (
        <form className="confirm-form" onSubmit={handleConfirm}>
          <label className="field">
            <span>Số tiền đã nhận (tối thiểu {formatVnd(booking.deposit)})</span>
            <input
              type="number"
              inputMode="numeric"
              min={booking.deposit}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Hình thức</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as "bank_transfer" | "cash")}>
              <option value="bank_transfer">Chuyển khoản</option>
              <option value="cash">Tiền mặt</option>
            </select>
          </label>
          <label className="field">
            <span>Mã giao dịch (không bắt buộc)</span>
            <input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} maxLength={100} />
          </label>
          <div className="actions">
            <button className="btn btn-primary btn-sm" disabled={busy}>
              Lưu và xác nhận
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowConfirm(false)}>
              Đóng
            </button>
          </div>
        </form>
      )}

      {booking.status === "confirmed" && (
        <div className="actions">
          <span className="muted">Đã nhận cọc {formatVnd(depositReceived(booking))}</span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() =>
              window.confirm("Hủy booking đã xác nhận? Chủ sân hủy thì khách được hoàn đủ cọc.") && cancel.mutate()
            }
          >
            Hủy và hoàn cọc
          </button>
        </div>
      )}

      {needsRefund(booking) && (
        <div className="actions">
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => refund.mutate()}>
            Đã hoàn cọc {formatVnd(booking.refundAmount)}
          </button>
        </div>
      )}

      {!canCancel && !needsRefund(booking) && booking.status === "cancelled" && booking.refundAmount === 0 && (
        <span className="muted">Không có khoản cọc cần hoàn.</span>
      )}
    </div>
  );
}
