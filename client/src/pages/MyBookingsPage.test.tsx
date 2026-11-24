import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBooking } from "../test/fixtures";
import { loginAs, renderWithProviders } from "../test/utils";
import { MyBookingsPage } from "./MyBookingsPage";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { listBookings: vi.fn(), cancelBooking: vi.fn() } };
});

const { api } = await import("../lib/api");

const future = (days: number, time: string) => {
  const d = new Date(Date.now() + days * 86_400_000);
  const date = d.toISOString().slice(0, 10);
  return new Date(`${date}T${time}:00Z`).toISOString();
};

beforeEach(() => {
  loginAs();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("MyBookingsPage", () => {
  it("splits upcoming bookings from history and offers payment for a pending one", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([
      makeBooking({
        id: "pending1",
        status: "pending",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        startsAt: future(3, "11:00"),
        endsAt: future(3, "12:00"),
      }),
      makeBooking({ id: "old1", status: "cancelled", startsAt: future(-5, "11:00"), endsAt: future(-5, "12:00") }),
    ]);
    renderWithProviders(<MyBookingsPage />);

    expect(await screen.findByRole("link", { name: "Thanh toán cọc" })).toHaveAttribute("href", "/bookings/pending1/pay");
    expect(screen.getByRole("heading", { name: "Lịch sử" })).toBeInTheDocument();
    expect(screen.getByText("Đã hủy")).toBeInTheDocument();
  });

  it("invites the customer to book when there is nothing upcoming", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([]);
    renderWithProviders(<MyBookingsPage />);

    expect(await screen.findByRole("link", { name: "Đặt sân ngay" })).toBeInTheDocument();
  });

  it("cancels after confirmation and explains the refund", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([
      makeBooking({ id: "c1", status: "confirmed", startsAt: future(5, "11:00"), endsAt: future(5, "12:00") }),
    ]);
    vi.mocked(api.cancelBooking).mockResolvedValue({
      booking: makeBooking({ status: "cancelled" }),
      refund: { eligible: true, amount: 60000, reason: "in_time", message: "Hủy đúng hạn nên được hoàn đủ tiền cọc" },
    });
    const user = userEvent.setup();
    renderWithProviders(<MyBookingsPage />);

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(await screen.findByRole("button", { name: "Hủy" }));
    expect(api.cancelBooking).not.toHaveBeenCalled(); // khách đổi ý

    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(api.cancelBooking).toHaveBeenCalledWith("c1");
    const notice = await screen.findByRole("status");
    expect(within(notice).getByText(/hoàn đủ tiền cọc/)).toBeInTheDocument();
  });

  it("does not offer actions on an overdue pending booking", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([
      makeBooking({
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        startsAt: future(3, "11:00"),
        endsAt: future(3, "12:00"),
      }),
    ]);
    renderWithProviders(<MyBookingsPage />);

    await screen.findByText("Lịch của tôi");
    await vi.waitFor(() => expect(api.listBookings).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Thanh toán cọc" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy" })).not.toBeInTheDocument();
  });
});
