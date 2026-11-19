import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { bankName } from "../lib/banks";
import { formatRemaining, useCountdown } from "../lib/countdown";
import { formatVnd } from "../lib/format";
import type { PaymentInfo } from "../lib/types";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Trình duyệt chặn clipboard: người dùng vẫn có thể chép tay
    }
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy} aria-label={`Sao chép ${label}`}>
      {copied ? "Đã chép ✓" : "Sao chép"}
    </button>
  );
}

function InfoRow({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
      {copy && <CopyButton value={value} label={label.toLowerCase()} />}
    </div>
  );
}

interface Props {
  info: PaymentInfo;
  /** Gọi một lần khi đồng hồ đếm ngược về 0 (để trang tải lại trạng thái từ server). */
  onExpired?: () => void;
}

export function PaymentQr({ info, onExpired }: Props) {
  const { remainingMs, expired } = useCountdown(info.awaitingPayment ? info.expiresAt : null);

  useEffect(() => {
    if (expired) onExpired?.();
  }, [expired, onExpired]);

  if (expired) {
    return (
      <div className="card payment-expired">
        <h2>Đã hết hạn giữ chỗ</h2>
        <p>Bạn chưa thanh toán kịp nên chỗ đã được nhả. Vui lòng đặt lại.</p>
      </div>
    );
  }

  const urgent = remainingMs > 0 && remainingMs < 2 * 60 * 1000;
  const bank = info.bank;
  const name = bank ? bankName(bank.bin) : null;

  return (
    <div className="card payment-card">
      {info.expiresAt && (
        <div className={urgent ? "countdown countdown-urgent" : "countdown"}>
          <span className="countdown-label">Giữ chỗ còn</span>
          <span className="countdown-time" role="timer" aria-live="off">
            {formatRemaining(remainingMs)}
          </span>
        </div>
      )}

      <div className="amount">
        <span className="amount-label">Tiền cọc cần chuyển</span>
        <span className="amount-value">{formatVnd(info.deposit)}</span>
        <span className="amount-note">
          Còn lại {formatVnd(info.remainingAtVenue)} thanh toán tại sân
        </span>
      </div>

      {info.qrPayload ? (
        <div className="qr-box">
          <QRCodeSVG
            value={info.qrPayload}
            size={224}
            level="M"
            marginSize={2}
            title="Mã QR chuyển khoản"
            role="img"
            aria-label="Mã QR chuyển khoản"
          />
          <p className="muted">Mở app ngân hàng, chọn quét QR. Số tiền và nội dung đã được điền sẵn.</p>
        </div>
      ) : (
        <div className="notice notice-warning" role="status">
          {info.bankConfigured
            ? "Chưa có mã QR cho booking này."
            : "Chủ sân chưa cấu hình tài khoản nhận cọc. Vui lòng liên hệ sân để được hướng dẫn chuyển khoản."}
        </div>
      )}

      <div className="info-list">
        {bank && (
          <>
            <InfoRow label="Ngân hàng" value={name ? `${name} (${bank.bin})` : `BIN ${bank.bin}`} />
            <InfoRow label="Số tài khoản" value={bank.accountNo} copy />
            {bank.accountName && <InfoRow label="Chủ tài khoản" value={bank.accountName} />}
          </>
        )}
        <InfoRow label="Số tiền" value={String(info.deposit)} copy />
        <InfoRow label="Nội dung" value={info.transferContent} copy />
      </div>

      <p className="muted">
        Hãy giữ <strong>đúng nội dung chuyển khoản</strong> để chủ sân đối chiếu. Sau khi chủ sân xác nhận đã
        nhận cọc, trang này sẽ tự cập nhật.
      </p>
    </div>
  );
}
