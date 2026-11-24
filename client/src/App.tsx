import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomeRedirect, RequireAuth } from "./components/RequireAuth";
import { BookPage } from "./pages/BookPage";
import { LoginPage } from "./pages/LoginPage";
import { MyBookingsPage } from "./pages/MyBookingsPage";
import { PaymentPage } from "./pages/PaymentPage";
import { RegisterPage } from "./pages/RegisterPage";
import { BookingsPage } from "./pages/owner/BookingsPage";
import { CalendarPage } from "./pages/owner/CalendarPage";
import { SettingsPage } from "./pages/owner/SettingsPage";

function NotFound() {
  return (
    <div className="page narrow center">
      <h1>Không tìm thấy trang</h1>
      <Link to="/">Về trang chủ</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="book" element={<BookPage />} />

        <Route
          path="my-bookings"
          element={
            <RequireAuth>
              <MyBookingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="bookings/:id/pay"
          element={
            <RequireAuth>
              <PaymentPage />
            </RequireAuth>
          }
        />

        <Route
          path="owner"
          element={
            <RequireAuth role="owner">
              <CalendarPage />
            </RequireAuth>
          }
        />
        <Route
          path="owner/bookings"
          element={
            <RequireAuth role="owner">
              <BookingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="owner/settings"
          element={
            <RequireAuth role="owner">
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
