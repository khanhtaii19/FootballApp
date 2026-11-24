import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { saveSession } from "../lib/session";
import type { Role } from "../lib/types";

export function loginAs(role: Role = "customer") {
  saveSession({
    accessToken: "access",
    refreshToken: "refresh",
    user: { id: role === "owner" ? "owner1" : "u1", email: `${role}@example.com`, name: role === "owner" ? "Chủ sân" : "Khách", role },
  });
}

export function renderWithProviders(ui: ReactElement, options: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route ?? "/"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}
