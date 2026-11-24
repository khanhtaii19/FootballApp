import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Notice } from "../../components/Notice";
import { OwnerActions } from "../../components/OwnerActions";
import { StatusBadge } from "../../components/StatusBadge";
import { api, describeError } from "../../lib/api";
import { useNow } from "../../lib/useNow";
import { isHoldExpired, isLive, matchesSearch, needsRefund } from "../../lib/bookings";
import { fieldTypeLabel, formatDate, formatRange, formatVnd } from "../../lib/format";
import type { Booking } from "../../lib/types";

type Tab = "pending" | "refund" | "upcoming" | "all";

const TABS: { id: Tab; label: string }[] = [
  { id: "pending", label: "Chờ xác nhận" },
  { id: "refund", label: "Cần hoàn cọc" },
  { id: "upcoming", label: "Sắp tới" },
  { id: "all", label: "Tất cả" },
];

function filterByTab(bookings: Booking[], tab: Tab, now: Date): Booking[] {
  switch (tab) {
    case "pending":
      return bookings.filter((b) => b.status === "pending" && !isHoldExpired(b, now));
    case "refund":
      return bookings.filter(needsRefund);
    case "upcoming":
      return bookings.filter((b) => b.status === "confirmed" && new Date(b.endsAt) > now);
    case "all":
      return bookings;
  }
}

export function BookingsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");

  const bookings = useQuery({
    queryKey: ["bookings", "all"],
    queryFn: () => api.listBookings(),
    refetchInterval: 15_000, // thấy booking mới và khách vừa chuyển khoản
  });

  const now = useNow(15_000);
  const all = bookings.data ?? [];
  const visible = filterByTab(all, tab, now)
    .filter((b) => matchesSearch(b, query))
    .sort((a, b) => (tab === "all" ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)));

  const counts: Record<Tab, number> = {
    pending: filterByTab(all, "pending", now).length,
    refund: filterByTab(all, "refund", now).length,
    upcoming: filterByTab(all, "upcoming", now).length,
    all: all.length,
  };

  return (
    <div className="page">
      <h1>Xử lý booking</h1>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {counts[t.id] > 0 && t.id !== "all" && <span className="tab-count">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      <label className="field search">
        <span className="sr-only">Tìm booking</span>
        <input
          type="search"
          placeholder="Tìm theo mã chuyển khoản, tên, email hoặc số điện thoại"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {bookings.isError && <Notice kind="error">{describeError(bookings.error)}</Notice>}
      {bookings.isLoading && <p className="muted">Đang tải...</p>}
      {bookings.isSuccess && visible.length === 0 && <p className="muted">Không có booking nào.</p>}

      <div className="stack">
        {visible.map((b) => (
          <article className="card booking-card" key={b.id}>
            <div className="row-between">
              <strong>
                {fieldTypeLabel(b.fieldType)} · {formatRange(b.startsAt, b.endsAt)} · {formatDate(b.startsAt)}
              </strong>
              <StatusBadge status={b.status} expired={isHoldExpired(b, now)} />
            </div>
            <div>
              {b.user?.name}
              {b.user?.phone ? ` · ${b.user.phone}` : ""}
              <span className="muted"> · {b.bookingZones.map((z) => z.zone.name).join(", ")}</span>
            </div>
            <div className="muted">
              Tổng {formatVnd(b.totalAmount)} · Cọc {formatVnd(b.deposit)} ·{" "}
              <span className="code">{b.paymentCode}</span>
              {isLive(b, now) && b.status === "pending" && b.expiresAt && (
                <> · hết hạn lúc {new Date(b.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}</>
              )}
            </div>
            <OwnerActions booking={b} />
          </article>
        ))}
      </div>
    </div>
  );
}
