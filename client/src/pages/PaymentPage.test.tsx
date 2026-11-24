import { act, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBooking, makePaymentInfo } from "../test/fixtures";
import { loginAs, renderWithProviders } from "../test/utils";
import { PaymentPage } from "./PaymentPage";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { getBooking: vi.fn(), getPaymentInfo: vi.fn(), cancelBooking: vi.fn() } };
});

const { api } = await import("../lib/api");

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/bookings/:id/pay" element={<PaymentPage />} />
    </Routes>,
    { route: "/bookings/bk1/pay" }
  );
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
// React Query gom thông báo bằng setTimeout, cần chờ thêm một nhịp ngắn để màn hình cập nhật
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(100); });

describe("PaymentPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2030-01-01T00:00:00Z"), toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    loginAs();
    vi.mocked(api.getBooking).mockResolvedValue(makeBooking({ status: "pending" }));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the QR with a countdown while waiting for the deposit", async () => {
    vi.mocked(api.getPaymentInfo).mockResolvedValue(makePaymentInfo({ expiresAt: "2030-01-01T00:10:00Z" }));
    renderPage();
    await flush();

    expect(screen.getByRole("img", { name: "Mã QR chuyển khoản" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("10:00");
    expect(screen.getByRole("button", { name: "Hủy giữ chỗ" })).toBeInTheDocument();
    expect(screen.getByText("Chờ thanh toán")).toBeInTheDocument();
  });

  it("updates by itself once the owner confirms the deposit", async () => {
    vi.mocked(api.getPaymentInfo)
      .mockResolvedValueOnce(makePaymentInfo({ expiresAt: "2030-01-01T00:10:00Z" }))
      .mockResolvedValue(makePaymentInfo({ status: "confirmed", awaitingPayment: false, qrPayload: null, expiresAt: null }));
    renderPage();
    await flush();
    expect(screen.getByRole("img", { name: "Mã QR chuyển khoản" })).toBeInTheDocument();

    // Sau 5 giây trang tự hỏi lại server, rồi React vẽ lại kết quả
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    await settle();

    expect(screen.getByText(/Chủ sân đã nhận cọc/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Mã QR chuyển khoản" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy giữ chỗ" })).not.toBeInTheDocument();
  });

  it("reloads from the server when the countdown reaches zero", async () => {
    vi.mocked(api.getPaymentInfo)
      .mockResolvedValueOnce(makePaymentInfo({ expiresAt: "2030-01-01T00:00:03Z" }))
      .mockResolvedValue(makePaymentInfo({ status: "expired", awaitingPayment: false, qrPayload: null, expiresAt: null }));
    renderPage();
    await flush();

    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    await flush();

    expect(screen.getByText(/Booking đã hết hạn giữ chỗ/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đặt sân mới" })).toBeInTheDocument();
    expect(vi.mocked(api.getPaymentInfo).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("shows a clear message when the payment info cannot be loaded", async () => {
    vi.mocked(api.getPaymentInfo).mockRejectedValue(new Error("Bạn không có quyền xem booking này"));
    renderPage();
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("Bạn không có quyền xem booking này");
  });
});
