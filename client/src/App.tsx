import { FormEvent, useEffect, useState } from "react";
import {
  getSettings,
  login,
  updateSettings,
  type AppSettings,
} from "./lib/api";
import "./App.css";

const TOKEN_KEY = "sanbong_access_token";

function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY)
  );
  const [email, setEmail] = useState("owner@sanbong.vn");
  const [password, setPassword] = useState("OwnerPass123");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((err: Error) => setError(err.message));
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.user.role !== "owner") {
        throw new Error("Chỉ tài khoản chủ sân mới vào được trang cấu hình");
      }
      localStorage.setItem(TOKEN_KEY, result.accessToken);
      setToken(result.accessToken);
      setMessage(`Xin chào ${result.user.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMessage(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !settings) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const result = await updateSettings(token, settings);
      setSettings(result.settings);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setLoading(false);
    }
  }

  function updateField<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="app-shell">
      <header>
        <h1>⚽ Đặt sân bóng — Cấu hình chủ sân</h1>
        <p className="subtitle">Phần 3: giá, giờ mở cửa, chính sách (không sửa code)</p>
      </header>

      {error && <p className="banner error">{error}</p>}
      {message && <p className="banner success">{message}</p>}

      {!token ? (
        <section className="card">
          <h2>Đăng nhập chủ sân</h2>
          <form onSubmit={handleLogin} className="form-grid">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Mật khẩu
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="toolbar">
            <button type="button" className="ghost" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
          {settings && (
            <section className="card">
              <h2>Cấu hình sân</h2>
              <form onSubmit={handleSave} className="form-grid">
                <label>
                  Giờ mở cửa
                  <input
                    type="time"
                    value={settings.opening_hour}
                    onChange={(e) => updateField("opening_hour", e.target.value)}
                    required
                  />
                </label>
                <label>
                  Giờ đóng cửa
                  <input
                    type="time"
                    value={settings.closing_hour}
                    onChange={(e) => updateField("closing_hour", e.target.value)}
                    required
                  />
                </label>
                <label>
                  Bước thời gian (phút)
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={settings.time_step_minutes}
                    onChange={(e) =>
                      updateField("time_step_minutes", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  Giá sân 5 (VND/giờ)
                  <input
                    type="number"
                    min={1}
                    value={settings.price_5}
                    onChange={(e) =>
                      updateField("price_5", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  Giá sân 7 (VND/giờ)
                  <input
                    type="number"
                    min={1}
                    value={settings.price_7}
                    onChange={(e) =>
                      updateField("price_7", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  Hạn giữ chỗ (phút)
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={settings.hold_timeout_minutes}
                    onChange={(e) =>
                      updateField(
                        "hold_timeout_minutes",
                        Number(e.target.value)
                      )
                    }
                  />
                </label>
                <label>
                  Hủy trước (giờ) để hoàn cọc
                  <input
                    type="number"
                    min={0}
                    value={settings.cancel_before_hours}
                    onChange={(e) =>
                      updateField("cancel_before_hours", Number(e.target.value))
                    }
                  />
                </label>
                <fieldset className="durations">
                  <legend>Thời lượng cho phép</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.allowed_durations.includes(60)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...new Set([...settings.allowed_durations, 60])]
                          : settings.allowed_durations.filter((d) => d !== 60);
                        updateField(
                          "allowed_durations",
                          next.length ? next.sort() : [60]
                        );
                      }}
                    />
                    60 phút
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.allowed_durations.includes(90)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...new Set([...settings.allowed_durations, 90])]
                          : settings.allowed_durations.filter((d) => d !== 90);
                        updateField(
                          "allowed_durations",
                          next.length ? next.sort() : [90]
                        );
                      }}
                    />
                    90 phút
                  </label>
                </fieldset>
                <button type="submit" disabled={loading}>
                  {loading ? "Đang lưu…" : "Lưu cấu hình"}
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default App;
