# ⚽ Hệ Thống Đặt Sân Bóng

Hệ thống đặt sân bóng đá mini online — fullstack project với mô hình "6 vùng" chống trùng lịch.

## 🏗 Kiến trúc

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Client    │ ───► │   Server     │ ───► │  PostgreSQL  │
│  React+Vite │      │ Express+TS   │      │   + Prisma   │
│  Port 5173  │      │   Port 3000  │      │   Port 5432  │
└─────────────┘      └──────────────┘      └──────────────┘
```

## 🎯 Mô hình "6 vùng"

Mỗi cụm sân có 2 mặt cỏ, mỗi mặt 3 vùng:

```
Sân 7 số 1:  [ A1 | A2 | A3 ]
Sân 7 số 2:  [ B1 | B2 | B3 ]
```

- **Sân 5** = chiếm **1 vùng**
- **Sân 7** = chiếm **cả 3 vùng** của một mặt cỏ
- **Xung đột** = chung vùng + thời gian chồng nhau
- **Chống race condition** = PostgreSQL exclusion constraint ở tầng database

## 🚀 Chạy nhanh

### Cách 1: Docker Compose (khuyến nghị)

```bash
docker compose up -d
```

Backend: http://localhost:3000  
Frontend: http://localhost:5173

### Cách 2: Chạy local

```bash
# Terminal 1 — Database
docker compose up db -d

# Terminal 2 — Server
cd server
cp .env.example .env
npm install
npx prisma migrate dev
npm run db:seed
npm run dev

# Terminal 3 — Client
cd client
npm install
npm run dev
```

## 📁 Cấu trúc dự án

```
lastproject/
├── client/              # React + TypeScript (Vite)
│   └── src/
│       ├── pages/       # Trang của khách; pages/owner/ là trang chủ sân
│       ├── components/  # Layout, PaymentQr (QR + đếm ngược), OwnerActions...
│       ├── lib/         # api (tự làm mới token), session, format, schedule...
│       └── test/        # Tiện ích test (Vitest + Testing Library)
├── server/              # Express + TypeScript
│   ├── prisma/          # Schema & migrations
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   └── src/
│       ├── index.ts     # Entry point
│       ├── app.ts       # Express app
│       ├── lib/         # Prisma client, utils
│       ├── routes/      # API routes
│       ├── middleware/   # Auth, validation
│       └── tests/       # Vitest tests
├── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md
```

## 🔐 Tài khoản demo (sau `npm run db:seed`)

| Vai trò | Email | Mật khẩu |
|---------|-------|----------|
| Chủ sân | `owner@sanbong.vn` | `OwnerPass123` |

Giao diện cấu hình (Phần 3): chạy client, đăng nhập chủ sân → chỉnh giá/giờ mở cửa → **Lưu cấu hình**.

### Giao diện (Phần 6)

Client gọi API qua `VITE_API_URL` (mặc định `http://localhost:3000/api`).

| Đường dẫn | Ai dùng | Chức năng |
|---|---|---|
| `/book` | Mọi người | Chọn ngày, loại sân, thời lượng, giờ trống; xem giá và tiền cọc; đặt sân |
| `/bookings/:id/pay` | Khách | QR chuyển khoản, đồng hồ đếm ngược giữ chỗ, tự cập nhật khi chủ sân xác nhận |
| `/my-bookings` | Khách | Lịch sắp tới và lịch sử, hủy booking (hiển thị kết quả hoàn cọc) |
| `/owner` | Chủ sân | **Lịch tổng** dạng lưới 6 vùng theo ngày, thống kê trong ngày, khóa sân |
| `/owner/bookings` | Chủ sân | Chờ xác nhận, cần hoàn cọc, tìm theo mã chuyển khoản/tên/SĐT |
| `/owner/settings` | Chủ sân | Giá, giờ hoạt động, tiền cọc, chính sách hủy, tài khoản ngân hàng nhận cọc |

Kiểm tra client: `cd client && npm run lint && npm run build && npm test`.

### API Phần 3 (tóm tắt)

| Method | Path | Quyền | Mô tả |
|--------|------|-------|--------|
| GET | `/api/settings` | Công khai | Đọc cấu hình |
| PUT | `/api/settings` | Owner | Cập nhật cấu hình |
| GET | `/api/zones` | Công khai | 6 vùng A1–B3 |
| GET/POST/DELETE | `/api/blocks` | Owner | Khóa vùng (bảo trì) |

### API Phần 5: thanh toán và đặt cọc (tóm tắt)

Luồng: khách đặt sân (giữ chỗ tạm) → xem QR chuyển khoản → chủ sân đối chiếu sao kê và xác nhận đã nhận cọc.

| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/bookings?date=YYYY-MM-DD` | Đăng nhập | Danh sách booking (chủ sân thấy tất cả, khách thấy của mình); lọc theo ngày giờ VN |
| GET | `/api/bookings/:id/payment` | Chủ booking / Owner | Tiền cọc, nội dung chuyển khoản, chuỗi QR VietQR (`qrPayload`), thông tin hoàn cọc |
| PATCH | `/api/bookings/:id/confirm` | Owner | Xác nhận đã nhận cọc. Body tùy chọn: `amount`, `method` (`bank_transfer`/`cash`), `transactionId` |
| PATCH | `/api/bookings/:id/cancel` | Chủ booking / Owner | Hủy; trả thêm `refund` (có hoàn cọc không, bao nhiêu, lý do) |
| PATCH | `/api/bookings/:id/refund` | Owner | Đánh dấu đã hoàn cọc cho khách |

- **Tiền cọc** = `deposit_percent`% tổng tiền (mặc định 30%), làm tròn lên 1.000đ, chụp vào booking lúc đặt.
- **Chính sách hoàn cọc:** khách hủy trước giờ đá ít nhất `cancel_before_hours` giờ thì được hoàn đủ cọc, hủy sát giờ thì mất cọc; chủ sân hủy thì luôn hoàn.
- **Cấu hình ngân hàng** (Owner, `PUT /api/settings`): `bank_bin` (6 số), `bank_account_no`, `bank_account_name`. Chưa cấu hình thì API không trả `qrPayload`.
- **Mã nội dung chuyển khoản** (`SB` + 8 ký tự, ví dụ `SBH3IJ4K5L`) có trong mọi booking để chủ sân đối chiếu sao kê.
- Client chỉ cần vẽ `qrPayload` thành ảnh QR (ví dụ bằng `qrcode.react`); khách quét bằng app ngân hàng bất kỳ, số tiền và nội dung được điền sẵn.

## 🧪 Testing

```bash
cd server
npm test           # Chạy test một lần
npm run test:watch # Chạy test liên tục
```

docker compose up -d db
cd server
npm run dev

## 📦 Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React, TypeScript, Vite             |
| Backend   | Express, TypeScript                 |
| Database  | PostgreSQL, Prisma ORM              |
| Auth      | JWT (access + refresh token), bcrypt|
| Validate  | Zod                                 |
| Test      | Vitest                              |
| CI/CD     | GitHub Actions                      |
| Container | Docker, Docker Compose              |

## 📋 Kế hoạch phát triển

- [x] Phần 1: Nền tảng (repo, Docker, Prisma, CI)
- [x] Phần 2: Tài khoản và phân quyền
- [x] Phần 3: Quản lý sân, giá, cấu hình
- [x] Phần 4: Lõi đặt sân và chống trùng ⭐
- [x] Phần 5: Giữ chỗ tạm, đặt cọc, hủy (tự hết hạn pending, giới hạn pending, QR VietQR + tiền cọc, hoàn cọc theo chính sách hủy; thanh toán tự động qua PayOS/webhook: chưa làm)
- [x] Phần 6: Giao diện React (đặt sân + thanh toán QR cho khách, lịch tổng + xử lý booking + cấu hình cho chủ sân)
- [ ] Phần 7: Đặt cố định hàng tuần
- [ ] Phần 8: Deploy & production
