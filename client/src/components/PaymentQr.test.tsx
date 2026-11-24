import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePaymentInfo } from "../test/fixtures";
import { PaymentQr } from "./PaymentQr";

const NOW = new Date("2030-01-01T00:00:00Z");

describe("PaymentQr", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("shows the QR code, the deposit and the transfer details", () => {
    render(<PaymentQr info={makePaymentInfo({ expiresAt: "2030-01-01T00:15:00Z" })} />);

    expect(screen.getByRole("img", { name: "Mã QR chuyển khoản" })).toBeInTheDocument();
    expect(screen.getByText("60.000đ")).toBeInTheDocument();
    expect(screen.getByText(/Còn lại 140\.000đ/)).toBeInTheDocument();
    expect(screen.getByText("SBABCD1234")).toBeInTheDocument();
    expect(screen.getByText("0123456789")).toBeInTheDocument();
    expect(screen.getByText("Vietcombank (970436)")).toBeInTheDocument();
  });

  it("counts down and marks the last two minutes as urgent", () => {
    render(<PaymentQr info={makePaymentInfo({ expiresAt: "2030-01-01T00:03:00Z" })} />);
    expect(screen.getByRole("timer")).toHaveTextContent("03:00");
    expect(document.querySelector(".countdown-urgent")).toBeNull();

    act(() => vi.advanceTimersByTime(61_000));
    expect(screen.getByRole("timer")).toHaveTextContent("01:59");
    expect(document.querySelector(".countdown-urgent")).not.toBeNull();
  });

  it("replaces the QR with an expiry message and notifies once when time runs out", () => {
    const onExpired = vi.fn();
    render(<PaymentQr info={makePaymentInfo({ expiresAt: "2030-01-01T00:00:05Z" })} onExpired={onExpired} />);
    expect(onExpired).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(6_000));

    expect(screen.getByText("Đã hết hạn giữ chỗ")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Mã QR chuyển khoản" })).not.toBeInTheDocument();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("explains when the venue has no bank account configured", () => {
    render(
      <PaymentQr
        info={makePaymentInfo({ bankConfigured: false, bank: null, qrPayload: null, expiresAt: "2030-01-01T00:15:00Z" })}
      />
    );

    expect(screen.getByText(/chưa cấu hình tài khoản nhận cọc/i)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Mã QR chuyển khoản" })).not.toBeInTheDocument();
    // Khách vẫn thấy số tiền và nội dung chuyển khoản
    expect(screen.getByText("60.000đ")).toBeInTheDocument();
    expect(screen.getByText("SBABCD1234")).toBeInTheDocument();
  });

  it("copies the transfer content to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<PaymentQr info={makePaymentInfo({ expiresAt: "2030-01-01T00:15:00Z" })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sao chép nội dung" }));
    });

    expect(writeText).toHaveBeenCalledWith("SBABCD1234");
    expect(screen.getByText("Đã chép ✓")).toBeInTheDocument();
  });
});
