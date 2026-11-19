import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Notice } from "../components/Notice";
import { api, describeError } from "../lib/api";
import { addDays, calculateDeposit, formatDayLabel, formatVnd, vnDateString } from "../lib/format";
import type { FieldType } from "../lib/types";
import { useAuth } from "../lib/useAuth";

const DAYS_AHEAD = 14;

export function BookPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const today = vnDateString();
  const [date, setDate] = useState(today);
  const [fieldType, setFieldType] = useState<FieldType>("five");
  const [duration, setDuration] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null); // startsAt của giờ đã chọn
  const [error, setError] = useState<string | null>(null);

  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const durations = settings.data?.allowed_durations ?? [];
  const activeDuration = duration ?? durations[0];

  const slotsQuery = useQuery({
    queryKey: ["slots", date, fieldType, activeDuration],
    queryFn: () => api.getSlots(date, fieldType, activeDuration),
    enabled: Boolean(settings.data) && activeDuration !== undefined,
  });

  const slots = slotsQuery.data?.slots ?? [];
  const slot = slots.find((s) => s.startsAt === selected);

  const pricePerHour = settings.data ? (fieldType === "five" ? settings.data.price_5 : settings.data.price_7) : 0;
  const total = Math.round((pricePerHour * (activeDuration ?? 0)) / 60);
  const deposit = settings.data ? calculateDeposit(total, settings.data.deposit_percent) : 0;

  const book = useMutation({
    mutationFn: () => {
      if (!slot) throw new Error("Vui lòng chọn giờ đá");
      return api.createBooking({ fieldType, startsAt: slot.startsAt, duration: activeDuration });
    },
    onSuccess: (booking) => navigate(`/bookings/${booking.id}/pay`),
    onError: (err) => {
      setError(describeError(err));
      setSelected(null);
      // Có thể vừa có người đặt trước: tải lại danh sách giờ trống
      void queryClient.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  function change(update: () => void) {
    update();
    setSelected(null);
    setError(null);
  }

  function handleBook() {
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    setError(null);
    book.mutate();
  }

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));

  return (
    <div className="page">
      <h1>Đặt sân</h1>

      <section className="card step">
        <h2>1. Chọn ngày</h2>
        <div className="chips scroll-x" role="group" aria-label="Chọn ngày">
          {days.map((d, i) => (
            <button
              key={d}
              type="button"
              className={d === date ? "chip active" : "chip"}
              aria-pressed={d === date}
              onClick={() => change(() => setDate(d))}
            >
              <span className="chip-title">{i === 0 ? "Hôm nay" : formatDayLabel(d).split(",")[0]}</span>{" "}
              <span className="chip-sub">{d.slice(8, 10)}/{d.slice(5, 7)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card step">
        <h2>2. Chọn loại sân và thời lượng</h2>
        <div className="chips" role="group" aria-label="Loại sân">
          {(["five", "seven"] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={type === fieldType ? "chip active" : "chip"}
              aria-pressed={type === fieldType}
              onClick={() => change(() => setFieldType(type))}
            >
              <span className="chip-title">{type === "five" ? "Sân 5 người" : "Sân 7 người"}</span>{" "}
              {settings.data && (
                <span className="chip-sub">
                  {formatVnd(type === "five" ? settings.data.price_5 : settings.data.price_7)}/giờ
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Thời lượng">
          {durations.map((d) => (
            <button
              key={d}
              type="button"
              className={d === activeDuration ? "chip active" : "chip"}
              aria-pressed={d === activeDuration}
              onClick={() => change(() => setDuration(d))}
            >
              <span className="chip-title">{d} phút</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card step">
        <h2>3. Chọn giờ đá</h2>
        {settings.isError && <Notice kind="error">{describeError(settings.error)}</Notice>}
        {slotsQuery.isError && <Notice kind="error">{describeError(slotsQuery.error)}</Notice>}
        {slotsQuery.isLoading && <p className="muted">Đang tải giờ trống...</p>}
        {slotsQuery.isSuccess && slots.length === 0 && (
          <p className="muted">Không còn giờ trống cho lựa chọn này. Hãy thử ngày hoặc thời lượng khác.</p>
        )}
        <div className="slot-grid" role="group" aria-label="Giờ trống">
          {slots.map((s) => (
            <button
              key={s.startsAt}
              type="button"
              className={s.startsAt === selected ? "slot active" : "slot"}
              aria-pressed={s.startsAt === selected}
              onClick={() => {
                setSelected(s.startsAt);
                setError(null);
              }}
            >
              <span className="slot-time">{s.startTime}</span>{" "}
              <span className="slot-sub">đến {s.endTime}</span>
            </button>
          ))}
        </div>
      </section>

      {error && <Notice kind="error">{error}</Notice>}

      <section className="card summary" aria-live="polite">
        {slot ? (
          <>
            <div>
              <strong>
                {fieldType === "five" ? "Sân 5" : "Sân 7"} · {slot.startTime} - {slot.endTime}
              </strong>
              <div className="muted">{formatDayLabel(date)}</div>
            </div>
            <dl className="summary-list">
              <div>
                <dt>Tổng tiền</dt>
                <dd>{formatVnd(total)}</dd>
              </div>
              <div>
                <dt>Tiền cọc ({settings.data?.deposit_percent}%)</dt>
                <dd>{formatVnd(deposit)}</dd>
              </div>
            </dl>
            <p className="muted">
              Chỗ được giữ {settings.data?.hold_timeout_minutes} phút để bạn chuyển khoản cọc.
            </p>
          </>
        ) : (
          <p className="muted">Chọn một khung giờ để xem giá và đặt sân.</p>
        )}
        <button className="btn btn-primary btn-block" disabled={!slot || book.isPending} onClick={handleBook}>
          {book.isPending ? "Đang đặt sân..." : user ? "Đặt sân và thanh toán cọc" : "Đăng nhập để đặt sân"}
        </button>
      </section>
    </div>
  );
}
