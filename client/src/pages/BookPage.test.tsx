import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import type { AppSettings, Slot } from "../lib/types";
import { loginAs, renderWithProviders } from "../test/utils";
import { BookPage } from "./BookPage";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { getSettings: vi.fn(), getSlots: vi.fn(), createBooking: vi.fn() } };
});

const { api } = await import("../lib/api");

const settings: AppSettings = {
  opening_hour: "05:00",
  closing_hour: "23:00",
  time_step_minutes: 15,
  allowed_durations: [60, 90],
  price_5: 200000,
  price_7: 500000,
  hold_timeout_minutes: 15,
  cancel_before_hours: 24,
  deposit_percent: 30,
  bank_bin: "970436",
  bank_account_no: "0123456789",
  bank_account_name: "NGUYEN VAN A",
};

const slots: Slot[] = [
  { startTime: "18:00", endTime: "19:00", startsAt: "2030-01-01T11:00:00.000Z", endsAt: "2030-01-01T12:00:00.000Z", availableCount: 3 },
  { startTime: "19:00", endTime: "20:00", startsAt: "2030-01-01T12:00:00.000Z", endsAt: "2030-01-01T13:00:00.000Z", availableCount: 1 },
];

function Destination() {
  const location = useLocation();
  return <div>ĐÃ CHUYỂN TỚI {location.pathname}</div>;
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/book" element={<BookPage />} />
      <Route path="/bookings/:id/pay" element={<Destination />} />
      <Route path="/login" element={<Destination />} />
    </Routes>,
    { route: "/book" }
  );
}

beforeEach(() => {
  vi.mocked(api.getSettings).mockResolvedValue(settings);
  vi.mocked(api.getSlots).mockResolvedValue({ date: "2030-01-01", fieldType: "five", duration: 60, slots });
});

describe("BookPage", () => {
  it("loads free slots for the default selection and shows nothing priced until one is chosen", async () => {
    loginAs();
    renderPage();

    expect(await screen.findByRole("button", { name: /18:00/ })).toBeInTheDocument();
    expect(api.getSlots).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "five", 60);
    expect(screen.getByRole("button", { name: /Đặt sân và thanh toán cọc/ })).toBeDisabled();
  });

  it("shows the total and the deposit for the chosen slot, then books and goes to payment", async () => {
    loginAs();
    vi.mocked(api.createBooking).mockResolvedValue({ id: "new-booking" } as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /18:00/ }));

    expect(screen.getByText("200.000đ")).toBeInTheDocument(); // tổng
    expect(screen.getByText("60.000đ")).toBeInTheDocument(); // cọc 30%
    expect(screen.getByText(/giữ 15 phút/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Đặt sân và thanh toán cọc/ }));

    expect(api.createBooking).toHaveBeenCalledWith({
      fieldType: "five",
      startsAt: "2030-01-01T11:00:00.000Z",
      duration: 60,
    });
    expect(await screen.findByText("ĐÃ CHUYỂN TỚI /bookings/new-booking/pay")).toBeInTheDocument();
  });

  it("recalculates the price for a seven-a-side pitch and a 90-minute match", async () => {
    loginAs();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Sân 7 người 500.000đ/giờ" }));
    await waitFor(() => expect(api.getSlots).toHaveBeenLastCalledWith(expect.any(String), "seven", 60));
    await user.click(await screen.findByRole("button", { name: /18:00/ }));
    expect(screen.getByText("500.000đ")).toBeInTheDocument();
    expect(screen.getByText("150.000đ")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "90 phút" }));
    await waitFor(() => expect(api.getSlots).toHaveBeenLastCalledWith(expect.any(String), "seven", 90));
    await user.click(await screen.findByRole("button", { name: /18:00/ }));
    expect(screen.getByText("750.000đ")).toBeInTheDocument(); // 500.000 x 1,5
    expect(screen.getByText("225.000đ")).toBeInTheDocument(); // 30%
  });

  it("shows the server message and refreshes the slots when someone else booked first", async () => {
    loginAs();
    vi.mocked(api.createBooking).mockRejectedValue(new ApiError("Vừa có người đặt trước, mời chọn giờ khác", 409));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /18:00/ }));
    const callsBefore = vi.mocked(api.getSlots).mock.calls.length;
    await user.click(screen.getByRole("button", { name: /Đặt sân và thanh toán cọc/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Vừa có người đặt trước");
    await waitFor(() => expect(vi.mocked(api.getSlots).mock.calls.length).toBeGreaterThan(callsBefore));
    // Giờ đã chọn bị bỏ để khách chọn lại
    expect(screen.getByRole("button", { name: /Đặt sân và thanh toán cọc/ })).toBeDisabled();
  });

  it("sends guests to the login page instead of booking", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /18:00/ }));
    await user.click(screen.getByRole("button", { name: "Đăng nhập để đặt sân" }));

    expect(api.createBooking).not.toHaveBeenCalled();
    expect(await screen.findByText("ĐÃ CHUYỂN TỚI /login")).toBeInTheDocument();
  });

  it("tells the customer when no slot is free", async () => {
    loginAs();
    vi.mocked(api.getSlots).mockResolvedValue({ date: "2030-01-01", fieldType: "five", duration: 60, slots: [] });
    renderPage();

    expect(await screen.findByText(/Không còn giờ trống/)).toBeInTheDocument();
  });
});
