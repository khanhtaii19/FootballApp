import { useEffect, useState } from "react";

/** Thời điểm hiện tại, tự cập nhật theo chu kỳ (mặc định 30 giây) để giao diện không bị cũ. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
