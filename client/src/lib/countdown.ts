import { useEffect, useState } from "react";

/** 605000ms -> "10:05"; từ 1 giờ trở lên -> "1:00:05". */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Đếm ngược tới `expiresAt` (ISO). Cập nhật mỗi giây.
 * Lưu ý: dùng đồng hồ của thiết bị; lệch giờ nhỏ không ảnh hưởng vì
 * server mới là bên quyết định booking có hết hạn hay không.
 */
export function useCountdown(expiresAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    // Cập nhật ngay (bất đồng bộ) rồi mỗi giây, để không hiển thị giá trị cũ
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [expiresAt]);

  if (!expiresAt) return { remainingMs: 0, expired: false };
  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - now);
  return { remainingMs, expired: remainingMs <= 0 };
}
