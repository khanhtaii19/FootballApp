import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/useAuth";
import type { Role } from "../lib/types";

export function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** Trang gốc: chủ sân vào lịch tổng, còn lại vào trang đặt sân. */
export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "owner" ? "/owner" : "/book"} replace />;
}
