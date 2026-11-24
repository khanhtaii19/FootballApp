import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import { makeBooking } from "../test/fixtures";
import { renderWithProviders } from "../test/utils";
import { OwnerActions } from "./OwnerActions";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: { confirmBooking: vi.fn(), cancelBooking: vi.fn(), markRefunded: vi.fn(), deleteBlock: vi.fn() },
  };
});

const { api } = await import("../lib/api");

const pending = () =>
  makeBooking({ status: "pending", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("OwnerActions", () => {
  it("confirms a pending booking with the required deposit by default", async () => {
    vi.mocked(api.confirmBooking).mockResolvedValue(makeBooking());
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions booking={pending()} />);

    await user.click(screen.getByRole("button", { name: "Xác nhận đã nhận cọc" }));
    expect(screen.getByLabelText(/Số tiền đã nhận/)).toHaveValue(60000);
    await user.click(screen.getByRole("button", { name: "Lưu và xác nhận" }));

    expect(api.confirmBooking).toHaveBeenCalledWith("bk1", {
      amount: 60000,
      method: "bank_transfer",
      transactionId: undefined,
    });
  });

  it("sends the actual amount, method and bank transaction id", async () => {
    vi.mocked(api.confirmBooking).mockResolvedValue(makeBooking());
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions booking={pending()} />);

    await user.click(screen.getByRole("button", { name: "Xác nhận đã nhận cọc" }));
    await user.clear(screen.getByLabelText(/Số tiền đã nhận/));
    await user.type(screen.getByLabelText(/Số tiền đã nhận/), "80000");
    await user.selectOptions(screen.getByLabelText("Hình thức"), "cash");
    await user.type(screen.getByLabelText(/Mã giao dịch/), "FT123");
    await user.click(screen.getByRole("button", { name: "Lưu và xác nhận" }));

    expect(api.confirmBooking).toHaveBeenCalledWith("bk1", { amount: 80000, method: "cash", transactionId: "FT123" });
  });

  it("shows the server error when the deposit is not enough", async () => {
    vi.mocked(api.confirmBooking).mockRejectedValue(new ApiError("Số tiền nhận được chưa đủ tiền cọc yêu cầu", 400));
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions booking={pending()} />);

    await user.click(screen.getByRole("button", { name: "Xác nhận đã nhận cọc" }));
    await user.click(screen.getByRole("button", { name: "Lưu và xác nhận" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("chưa đủ tiền cọc");
  });

  it("does not offer to confirm an overdue pending booking", () => {
    const overdue = makeBooking({ status: "pending", expiresAt: new Date(Date.now() - 60_000).toISOString() });
    renderWithProviders(<OwnerActions booking={overdue} />);
    expect(screen.queryByRole("button", { name: "Xác nhận đã nhận cọc" })).not.toBeInTheDocument();
  });

  it("cancels a confirmed booking only after the owner agrees, and reports the refund", async () => {
    vi.mocked(api.cancelBooking).mockResolvedValue({
      booking: makeBooking({ status: "cancelled" }),
      refund: { eligible: true, amount: 60000, reason: "owner_cancelled", message: "Chủ sân hủy nên khách được hoàn đủ tiền cọc" },
    });
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions booking={makeBooking({ status: "confirmed" })} />);

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Hủy và hoàn cọc" }));
    expect(api.cancelBooking).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Hủy và hoàn cọc" }));
    await waitFor(() => expect(api.cancelBooking).toHaveBeenCalledWith("bk1"));
    expect(await screen.findByText(/hoàn đủ tiền cọc: 60\.000đ/)).toBeInTheDocument();
  });

  it("lets the owner mark a deposit as refunded", async () => {
    vi.mocked(api.markRefunded).mockResolvedValue(makeBooking());
    const user = userEvent.setup();
    const cancelled = makeBooking({
      status: "cancelled",
      refundAmount: 60000,
      payments: [{ id: "p1", amount: 60000, method: "bank_transfer", status: "completed", transactionId: null, createdAt: "2030-01-01T00:00:00Z" }],
    });
    renderWithProviders(<OwnerActions booking={cancelled} />);

    await user.click(screen.getByRole("button", { name: "Đã hoàn cọc 60.000đ" }));
    expect(api.markRefunded).toHaveBeenCalledWith("bk1");
  });

  it("removes a block instead of showing booking actions", async () => {
    vi.mocked(api.deleteBlock).mockResolvedValue({ block: makeBooking() });
    const user = userEvent.setup();
    renderWithProviders(<OwnerActions booking={makeBooking({ fieldType: "block", user: undefined })} />);

    expect(screen.queryByRole("button", { name: "Xác nhận đã nhận cọc" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gỡ khóa" }));
    expect(api.deleteBlock).toHaveBeenCalledWith("bk1");
  });
});
