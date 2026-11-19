import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { vnDateString, vnToIso } from "../../lib/format";
import type { AppSettings } from "../../lib/types";
import { makeBooking, ZONES, zoneByName } from "../../test/fixtures";
import { renderWithProviders } from "../../test/utils";
import { CalendarPage } from "./CalendarPage";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    api: {
      getSettings: vi.fn(),
      getZones: vi.fn(),
      listBookings: vi.fn(),
      listBlocks: vi.fn(),
      confirmBooking: vi.fn(),
      cancelBooking: vi.fn(),
      markRefunded: vi.fn(),
      deleteBlock: vi.fn(),
      createBlock: vi.fn(),
    },
  };
});

const { api } = await import("../../lib/api");

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
  bank_bin: "",
  bank_account_no: "",
  bank_account_name: "",
};

const today = vnDateString();
const at = (time: string) => vnToIso(today, time);
const zonesOf = (names: string[]) =>
  names.map((n, i) => ({ id: `bz-${n}-${i}`, zoneId: `zone-${n}`, isActive: true, zone: zoneByName(n) }));

beforeEach(() => {
  vi.mocked(api.getSettings).mockResolvedValue(settings);
  vi.mocked(api.getZones).mockResolvedValue(ZONES);
  vi.mocked(api.listBlocks).mockResolvedValue([]);
});

describe("CalendarPage (lịch tổng)", () => {
  it("draws one column per zone and a seven-a-side booking across three columns", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([
      makeBooking({
        id: "seven1",
        fieldType: "seven",
        startsAt: at("18:00"),
        endsAt: at("19:00"),
        bookingZones: zonesOf(["A1", "A2", "A3"]),
      }),
      makeBooking({ id: "five1", startsAt: at("20:00"), endsAt: at("21:30"), bookingZones: zonesOf(["B2"]) }),
    ]);
    const { container } = renderWithProviders(<CalendarPage />);

    await screen.findAllByText("Nguyễn Văn A");

    expect(container.querySelectorAll(".cal-col")).toHaveLength(6);
    const colA2 = container.querySelector('[data-zone="A2"]') as HTMLElement;
    expect(within(colA2).getAllByRole("button")).toHaveLength(1);
    expect(container.querySelectorAll(".cal-event")).toHaveLength(4); // 3 vùng sân 7 + 1 vùng sân 5
    expect(within(container.querySelector('[data-zone="B2"]') as HTMLElement).getByRole("button")).toHaveTextContent("Sân 5");
  });

  it("summarises the day: counts, expected revenue and deposits received", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([
      makeBooking({
        id: "c1",
        totalAmount: 200000,
        startsAt: at("17:00"),
        endsAt: at("18:00"),
        payments: [{ id: "p1", amount: 60000, method: "bank_transfer", status: "completed", transactionId: null, createdAt: at("10:00") }],
      }),
      makeBooking({
        id: "p1",
        status: "pending",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        startsAt: at("19:00"),
        endsAt: at("20:00"),
        bookingZones: zonesOf(["A2"]),
      }),
      makeBooking({ id: "x", status: "cancelled", startsAt: at("21:00"), endsAt: at("22:00"), bookingZones: zonesOf(["A3"]) }),
    ]);
    const { container } = renderWithProviders(<CalendarPage />);

    await screen.findAllByText("Nguyễn Văn A");

    // Tìm trong khối thống kê (chú giải bên dưới cũng có chữ "Đã xác nhận")
    const stats = container.querySelector(".stats") as HTMLElement;
    const stat = (label: string) => within(stats).getByText(label).previousElementSibling as HTMLElement;
    expect(stat("Đã xác nhận")).toHaveTextContent("1");
    expect(stat("Chờ thanh toán")).toHaveTextContent("1");
    expect(stat("Doanh thu dự kiến")).toHaveTextContent("200.000đ");
    expect(stat("Cọc đã nhận")).toHaveTextContent("60.000đ");
  });

  it("hides cancelled and overdue bookings from the grid", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([
      makeBooking({ id: "x", status: "cancelled" }),
      makeBooking({ id: "o", status: "pending", expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    ]);
    const { container } = renderWithProviders(<CalendarPage />);

    await screen.findByText("Lịch tổng");
    await vi.waitFor(() => expect(api.listBookings).toHaveBeenCalled());
    expect(container.querySelectorAll(".cal-event")).toHaveLength(0);
  });

  it("opens the booking details with confirm actions when an event is clicked", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([
      makeBooking({
        id: "p1",
        status: "pending",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        startsAt: at("19:00"),
        endsAt: at("20:00"),
      }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<CalendarPage />);

    await user.click(await screen.findByRole("button", { name: /Nguyễn Văn A/ }));

    const detail = screen.getByRole("complementary", { name: "Chi tiết booking" });
    expect(within(detail).getByText(/SBABCD1234/)).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Xác nhận đã nhận cọc" })).toBeInTheDocument();
  });

  it("shows blocks on the grid and lets the owner lift them", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([]);
    vi.mocked(api.listBlocks).mockResolvedValue([
      makeBooking({ id: "blk", fieldType: "block", user: undefined, note: "Bảo trì cỏ", startsAt: at("08:00"), endsAt: at("10:00"), bookingZones: zonesOf(["B1"]) }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<CalendarPage />);

    // Khối trên lưới có title "Khóa sân · Bảo trì cỏ" (khác với nút "+ Khóa sân" tạo mới)
    await user.click(await screen.findByTitle("Khóa sân · Bảo trì cỏ"));

    const detail = screen.getByRole("complementary", { name: "Chi tiết booking" });
    expect(within(detail).getByText("Bảo trì cỏ")).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Gỡ khóa" })).toBeInTheDocument();
  });

  it("requests the bookings and blocks of the selected day only", async () => {
    vi.mocked(api.listBookings).mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<CalendarPage />);

    await vi.waitFor(() => expect(api.listBookings).toHaveBeenCalledWith(today));
    await user.click(screen.getByRole("button", { name: "Ngày sau" }));

    await vi.waitFor(() => expect(api.listBookings).toHaveBeenCalledTimes(2));
    const requested = vi.mocked(api.listBookings).mock.calls.map((c) => c[0]);
    expect(requested[1]).not.toBe(today);
    expect(vi.mocked(api.listBlocks).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
