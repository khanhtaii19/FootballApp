import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/useAuth";

export function Layout() {
  const { user, isOwner, logout } = useAuth();
  const navigate = useNavigate();

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? "nav-link active" : "nav-link");

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            ⚽ Sân Bóng
          </Link>

          <nav className="nav" aria-label="Điều hướng chính">
            {isOwner ? (
              <>
                <NavLink to="/owner" end className={link}>
                  Lịch tổng
                </NavLink>
                <NavLink to="/owner/bookings" className={link}>
                  Xử lý
                </NavLink>
                <NavLink to="/owner/settings" className={link}>
                  Cấu hình
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/book" className={link}>
                  Đặt sân
                </NavLink>
                {user && (
                  <NavLink to="/my-bookings" className={link}>
                    Lịch của tôi
                  </NavLink>
                )}
              </>
            )}
          </nav>

          <div className="topbar-user">
            {user ? (
              <>
                <span className="user-name">{user.name}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <Link className="btn btn-primary btn-sm" to="/login">
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
