import { useState, type SubmitEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Notice } from "../components/Notice";
import { describeError } from "../lib/api";
import { useAuth } from "../lib/useAuth";

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({ name, email, password, phone: phone.trim() || undefined });
      navigate("/book", { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Tạo tài khoản</h1>
        {error && <Notice kind="error">{error}</Notice>}

        <label className="field">
          <span>Họ tên</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Số điện thoại (không bắt buộc)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="0901234567"
          />
        </label>
        <label className="field">
          <span>Mật khẩu</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <small className="muted">Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số.</small>
        </label>

        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Đang tạo tài khoản..." : "Đăng ký"}
        </button>
        <p className="muted center">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </form>
    </div>
  );
}
