import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Notice } from "../components/Notice";
import { PaymentQr } from "../components/PaymentQr";
import { StatusBadge } from "../components/StatusBadge";
import { api, describeError } from "../lib/api";
import { fieldTypeLabel, formatDate, formatRange, formatVnd } from "../lib/format";

const POLL_MS = 5000;

export function PaymentPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();

  const booking = useQuery({ queryKey: ["booking", id], queryFn: () => api.getBooking(id) });

  // Hỏi lại server mỗi 5 giây khi còn chờ thanh toán: chủ sân xác nhận là trang tự cập nhật
  const payment = useQuery({
    queryKey: ["payment", id],
    queryFn: () => api.getPaymentInfo(id),
    refetchInterval: (query) => (query.state.data?.awaitingPayment ? POLL_MS : false),
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["payment", id] });
    void queryClient.invalidateQueries({ queryKey: ["booking", id] });
  }, [queryClient, id]);

  const cancel = useMutation({
    mutationFn: () => api.cancelBooking(id),
    onSuccess: refresh,
  });

  if (payment.isLoading || booking.isLoading) return <p className="page muted">Đang tải...</p>;
  if (payment.isError || !payment.data) {
    return (
      <div className="page">
        <Notice kind="error">{describeError(payment.error)}</Notice>
        <Link to="/my-bookings">← Về lịch của tôi</Link>
      </div>
    );
  }

  const info = payment.data;
  const b = booking.data;

  return (
    <div className="page narrow">
      <h1>Thanh toán đặt cọc</h1>

      {b && (
        <div className="card booking-brief">
          <div className="row-between">
            <strong>
              {fieldTypeLabel(b.fieldType)} · {formatRange(b.startsAt, b.endsAt)}
            </strong>
            <StatusBadge status={info.status} />
          </div>
          <div className="muted">
            {formatDate(b.startsAt)} · {b.bookingZones.map((z) => z.zone.name).join(", ")} · Tổng{" "}
            {formatVnd(b.totalAmount)}
          </div>
        </div>
      )}

      {info.status === "confirmed" && (
        <Notice kind="success">
          Chủ sân đã nhận cọc. Đặt sân của bạn đã được xác nhận. Hẹn gặp bạn ở sân!
        </Notice>
      )}
      {info.status === "cancelled" && <Notice kind="info">Booking này đã được hủy.</Notice>}
      {info.status === "expired" && (
        <Notice kind="warning">Booking đã hết hạn giữ chỗ vì chưa thanh toán. Vui lòng đặt lại.</Notice>
      )}

      {info.awaitingPayment && (
        <>
          <PaymentQr info={info} onExpired={refresh} />
          {cancel.isError && <Notice kind="error">{describeError(cancel.error)}</Notice>}
          <button
            className="btn btn-ghost btn-block"
            disabled={cancel.isPending}
            onClick={() => {
              if (window.confirm("Hủy giữ chỗ này?")) cancel.mutate();
            }}
          >
            Hủy giữ chỗ
          </button>
        </>
      )}

      <div className="actions">
        {(info.status === "expired" || info.status === "cancelled") && (
          <Link className="btn btn-primary" to="/book">
            Đặt sân mới
          </Link>
        )}
        <Link className="btn btn-ghost" to="/my-bookings">
          Lịch của tôi
        </Link>
      </div>
    </div>
  );
}
