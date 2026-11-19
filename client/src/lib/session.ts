import type { User } from "./types";

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const KEY = "sanbong_session";

// Lưu ở localStorage cho đơn giản. Nhược điểm: JS trên trang đọc được token (rủi ro XSS).
// Hướng nâng cấp: refresh token qua cookie httpOnly do server đặt.
let cached: Session | null | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getSession(): Session | null {
  if (cached === undefined) {
    try {
      const raw = localStorage.getItem(KEY);
      cached = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function saveSession(session: Session) {
  cached = session;
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage: phiên chỉ tồn tại trong bộ nhớ
  }
  emit();
}

export function clearSession() {
  cached = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Bỏ qua
  }
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Đồng bộ đăng nhập/đăng xuất giữa các tab
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) {
      cached = undefined;
      emit();
    }
  });
}
