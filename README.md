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

### API Phần 3 (tóm tắt)

| Method | Path | Quyền | Mô tả |
|--------|------|-------|--------|
| GET | `/api/settings` | Công khai | Đọc cấu hình |
| PUT | `/api/settings` | Owner | Cập nhật cấu hình |
| GET | `/api/zones` | Công khai | 6 vùng A1–B3 |
| GET/POST/DELETE | `/api/blocks` | Owner | Khóa vùng (bảo trì) |

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
- [ ] Phần 4: Lõi đặt sân và chống trùng ⭐
- [ ] Phần 5: Giữ chỗ tạm, đặt cọc, hủy
- [ ] Phần 6: Giao diện React
- [ ] Phần 7: Đặt cố định hàng tuần
- [ ] Phần 8: Deploy & production
