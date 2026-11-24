import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Notice } from "../components/Notice";
import { StatusBadge } from "../components/StatusBadge";
import { api, describeError } from "../lib/api";
import { isHoldExpired, splitForCustomer } from "../lib/bookings";
import { fieldTypeLabel, formatDate, formatRange, formatVnd } from "../lib/format";
import type { Booking } from "../lib/types";

function BookingCard({ booking, onCancel, cancelling }: {
  booking: Booking;
  onCancel?: (b: Booking) => void;
  cancelling?: boolean;
}) {
  const expired = isHoldExpired(booking);
  const awaitingPayment = booking.status === "pending" && !expired;
  const canCancel = (booking.status === "pending" || booking.status === "confirmed") && !expired;

  return (
    <article className="card booking-card">
      <div className="row-between">
        <strong>
          {fieldTypeLabel(booking.fieldType)} · {formatRange(booking.startsAt, booking.endsAt)}
        </strong>
        <StatusBadge status={booking.status} expired={expired} />
      </div>
      <div className="muted">
        {formatDate(booking.startsAt)} · {booking.bookingZones.map((z) => z.zone.name).join(", ")}
      </div>
      <div className="muted">
        Tổng {formatVnd(booking.totalAmount)} · Cọc {formatVnd(booking.deposit)}
        {booking.status === "cancelled" && booking.refundAmount > 0 && (
          <> · Hoàn cọc {formatVnd(booking.refundAmount)}</>
        )}
      </div>
      {(awaitingPayment || canCancel) && (
        <div className="actions">
          {awaitingPayment && (
            <Link className="btn btn-primary btn-sm" to={`/bookings/${booking.id}/pay`}>
              Thanh toán cọc
            </Link>
          )}
          {canCancel && onCancel && (
            <button className="btn btn-ghost btn-sm" disabled={cancelling} onClick={() => onCancel(booking)}>
              Hủy
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export function MyBookingsPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const bookings = useQuery({ queryKey: ["bookings", "mine"], queryFn: () => api.listBookings() });

  const cancel = useMutation({
    mutationFn: (b: Booking) => api.cancelBooking(b.id),
    onSuccess: (result) => {
      setMessage(`Đã hủy booking. ${result.refund.message}.`);
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  function handleCancel(b: Booking) {
    const warning =
      b.status === "confirmed"
        ? "Hủy booking đã xác nhận? Tiền cọc chỉ được hoàn nếu bạn hủy đủ sớm theo chính sách của sân."
        : "Hủy booking này?";
    if (!window.confirm(warning)) return;
    setMessage(null);
    cancel.mutate(b);
  }

  if (bookings.isLoading) return <p className="page muted">Đang tải...</p>;

  const { upcoming, history } = splitForCustomer(bookings.data ?? []);

  return (
    <div className="page">
      <h1>Lịch của tôi</h1>

      {bookings.isError && <Notice kind="error">{describeError(bookings.error)}</Notice>}
      {message && <Notice kind="info">{message}</Notice>}
      {cancel.isError && <Notice kind="error">{describeError(cancel.error)}</Notice>}

      <h2>Sắp tới</h2>
      {upcoming.length === 0 ? (
        <p className="muted">
          Bạn chưa có lịch nào. <Link to="/book">Đặt sân ngay</Link>
        </p>
      ) : (
        <div className="stack">
          {upcoming.map((b) => (
            <BookingCard key={b.id} booking={b} onCancel={handleCancel} cancelling={cancel.isPending} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2>Lịch sử</h2>
          <div className="stack">
            {history.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
