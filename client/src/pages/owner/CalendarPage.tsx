import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type SubmitEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Notice } from "../../components/Notice";
import { OwnerActions } from "../../components/OwnerActions";
import { StatusBadge } from "../../components/StatusBadge";
import { api, describeError } from "../../lib/api";
import { depositReceived, isHoldExpired, isLive } from "../../lib/bookings";
import {
  addDays,
  fieldTypeLabel,
  formatDayLabel,
  formatRange,
  formatVnd,
  timeToMinutes,
  vnDateString,
  vnToIso,
} from "../../lib/format";
import { buildGridEvents, hourMarks } from "../../lib/schedule";
import { useNow } from "../../lib/useNow";

const DEFAULT_ZONES = ["A1", "A2", "A3", "B1", "B2", "B3"];
const HOUR_PX = 56;

export function CalendarPage() {
  const queryClient = useQueryClient();
  const now = useNow();
  const today = vnDateString(now);
  const [date, setDate] = useState(today);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const zonesQuery = useQuery({ queryKey: ["zones"], queryFn: api.getZones });

  const dayStart = vnToIso(date, "00:00");
  const dayEnd = vnToIso(addDays(date, 1), "00:00");

  const bookings = useQuery({
    queryKey: ["bookings", "day", date],
    queryFn: () => api.listBookings(date),
    refetchInterval: 30_000,
  });
  const blocks = useQuery({
    queryKey: ["blocks", date],
    queryFn: () => api.listBlocks(dayStart, dayEnd),
    refetchInterval: 30_000,
  });

  const openMin = settings.data ? timeToMinutes(settings.data.opening_hour) : 5 * 60;
  const closeMin = settings.data ? timeToMinutes(settings.data.closing_hour) : 23 * 60;
  const zoneNames = zonesQuery.data?.map((z) => z.name) ?? DEFAULT_ZONES;

  // Chỉ lấy booking thật chạm ngày đang xem (server cũ có thể trả tất cả)
  const dayBookings = useMemo(
    () =>
      (bookings.data ?? []).filter(
        (b) => b.startsAt < dayEnd && b.endsAt > dayStart && b.fieldType !== "block"
      ),
    [bookings.data, dayStart, dayEnd]
  );

  const events = useMemo(
    () => buildGridEvents({ date, bookings: dayBookings, blocks: blocks.data ?? [], openMin, closeMin, now }),
    [date, dayBookings, blocks.data, openMin, closeMin, now]
  );

  const selected = [...dayBookings, ...(blocks.data ?? [])].find((b) => b.id === selectedId) ?? null;

  const live = dayBookings.filter((b) => isLive(b, now));
  const confirmedCount = live.filter((b) => b.status === "confirmed").length;
  const pendingCount = live.filter((b) => b.status === "pending").length;
  const expectedRevenue = live.filter((b) => b.status === "confirmed").reduce((s, b) => s + b.totalAmount, 0);
  const received = live.reduce((s, b) => s + depositReceived(b), 0);

  const span = closeMin - openMin;
  const marks = hourMarks(openMin, closeMin);

  const nowPct =
    date === today
      ? ((now.getTime() - Date.parse(vnToIso(date, "00:00"))) / 60000 - openMin) / span
      : -1;

  return (
    <div className="page wide">
      <div className="row-between wrap">
        <h1>Lịch tổng</h1>
        <div className="date-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(addDays(date, -1))} aria-label="Ngày trước">
            ←
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Chọn ngày"
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(addDays(date, 1))} aria-label="Ngày sau">
            →
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(today)} disabled={date === today}>
            Hôm nay
          </button>
        </div>
      </div>
      <p className="muted">{formatDayLabel(date)}</p>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{confirmedCount}</span>
          <span className="stat-label">Đã xác nhận</span>
        </div>
        <div className="stat">
          <span className="stat-value">{pendingCount}</span>
          <span className="stat-label">Chờ thanh toán</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatVnd(expectedRevenue)}</span>
          <span className="stat-label">Doanh thu dự kiến</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatVnd(received)}</span>
          <span className="stat-label">Cọc đã nhận</span>
        </div>
      </div>

      {(bookings.isError || blocks.isError) && (
        <Notice kind="error">{describeError(bookings.error ?? blocks.error)}</Notice>
      )}

      <div className="legend">
        <span className="legend-item"><i className="dot dot-confirmed" /> Đã xác nhận</span>
        <span className="legend-item"><i className="dot dot-pending" /> Chờ thanh toán</span>
        <span className="legend-item"><i className="dot dot-block" /> Khóa sân</span>
      </div>

      <div className="calendar-scroll">
        <div className="calendar" style={{ ["--cols" as string]: zoneNames.length }}>
          <div className="cal-corner" />
          {zoneNames.map((name) => (
            <div className="cal-head" key={name}>
              {name}
              <small>Mặt cỏ {name.charAt(0)}</small>
            </div>
          ))}

          <div className="cal-axis" style={{ height: (span / 60) * HOUR_PX }}>
            {marks.map((h) => (
              <span key={h} className="cal-hour" style={{ top: `${(((h * 60 - openMin) / span) * 100).toFixed(3)}%` }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {zoneNames.map((name) => (
            <div className="cal-col" key={name} style={{ height: (span / 60) * HOUR_PX }} data-zone={name}>
              {marks.map((h) => (
                <i
                  key={h}
                  className="cal-line"
                  style={{ top: `${(((h * 60 - openMin) / span) * 100).toFixed(3)}%` }}
                />
              ))}
              {nowPct >= 0 && nowPct <= 1 && <i className="cal-now" style={{ top: `${(nowPct * 100).toFixed(3)}%` }} />}
              {events
                .filter((ev) => ev.zoneName === name)
                .map((ev) => (
                  <button
                    key={ev.key}
                    type="button"
                    className={`cal-event cal-${ev.kind}${ev.bookingId === selectedId ? " selected" : ""}`}
                    style={{ top: `${ev.topPct}%`, height: `${ev.heightPct}%` }}
                    onClick={() => setSelectedId(ev.bookingId)}
                    title={`${ev.title} · ${ev.subtitle}`}
                  >
                    <strong>{ev.title}</strong>
                    <span>{ev.subtitle}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <aside className="card detail" aria-label="Chi tiết booking">
          <div className="row-between">
            <strong>
              {fieldTypeLabel(selected.fieldType)} · {formatRange(selected.startsAt, selected.endsAt)}
            </strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)} aria-label="Đóng chi tiết">
              ✕
            </button>
          </div>
          <div className="muted">Vùng: {selected.bookingZones.map((z) => z.zone.name).join(", ")}</div>
          {selected.fieldType === "block" ? (
            <div className="muted">{selected.note || "Lịch khóa sân"}</div>
          ) : (
            <>
              <div>
                {selected.user?.name} {selected.user?.phone ? `· ${selected.user.phone}` : ""}
              </div>
              <div className="muted">
                Tổng {formatVnd(selected.totalAmount)} · Cọc {formatVnd(selected.deposit)} · Mã {selected.paymentCode}
              </div>
              <StatusBadge status={selected.status} expired={isHoldExpired(selected, now)} />
            </>
          )}
          <OwnerActions booking={selected} />
        </aside>
      )}

      <BlockForm
        date={date}
        zones={zoneNames}
        onCreated={() => void queryClient.invalidateQueries()}
      />
    </div>
  );
}

function BlockForm({ date, zones, onCreated }: { date: string; zones: string[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [zone, setZone] = useState(zones[0] ?? "A1");
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("10:00");
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createBlock({
        zoneName: zone,
        startsAt: vnToIso(date, from),
        endsAt: vnToIso(date, to),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setNote("");
      onCreated();
    },
  });

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate();
  }

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        + Khóa sân (bảo trì, mưa...)
      </button>
    );
  }

  return (
    <form className="card block-form" onSubmit={handleSubmit}>
      <h2>Khóa sân ngày {formatDayLabel(date)}</h2>
      {create.isError && <Notice kind="error">{describeError(create.error)}</Notice>}
      <div className="form-row">
        <label className="field">
          <span>Vùng</span>
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Từ</span>
          <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label className="field">
          <span>Đến</span>
          <input type="time" value={to} onChange={(e) => setTo(e.target.value)} required />
        </label>
      </div>
      <label className="field">
        <span>Ghi chú</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </label>
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={create.isPending}>
          Khóa vùng
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Đóng
        </button>
      </div>
    </form>
  );
}
