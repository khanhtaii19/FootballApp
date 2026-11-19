import { screen } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { loginAs, renderWithProviders } from "../test/utils";
import { HomeRedirect, RequireAuth } from "./RequireAuth";

function LoginProbe() {
  const location = useLocation();
  return <div>LOGIN from={(location.state as { from?: string } | null)?.from}</div>;
}

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route index element={<HomeRedirect />} />
      <Route path="/login" element={<LoginProbe />} />
      <Route path="/book" element={<div>BOOK PAGE</div>} />
      <Route path="/owner" element={<RequireAuth role="owner"><div>OWNER AREA</div></RequireAuth>} />
      <Route path="/my" element={<RequireAuth><div>MY AREA</div></RequireAuth>} />
    </Routes>,
    { route }
  );
}

describe("RequireAuth", () => {
  it("sends guests to the login page and remembers where they wanted to go", () => {
    renderAt("/my");
    expect(screen.getByText("LOGIN from=/my")).toBeInTheDocument();
  });

  it("lets a logged-in customer through", () => {
    loginAs("customer");
    renderAt("/my");
    expect(screen.getByText("MY AREA")).toBeInTheDocument();
  });

  it("keeps customers out of the owner area", () => {
    loginAs("customer");
    renderAt("/owner");
    expect(screen.queryByText("OWNER AREA")).not.toBeInTheDocument();
    expect(screen.getByText("BOOK PAGE")).toBeInTheDocument(); // chuyển về trang chủ -> đặt sân
  });

  it("lets the owner into the owner area", () => {
    loginAs("owner");
    renderAt("/owner");
    expect(screen.getByText("OWNER AREA")).toBeInTheDocument();
  });
});
