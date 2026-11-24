# Hướng dẫn triển khai (production)

Stack: **PostgreSQL + server (Node) + Caddy** chạy bằng Docker Compose trên một máy chủ.
Caddy tự xin và gia hạn chứng chỉ HTTPS (Let's Encrypt), phục vụ giao diện và chuyển `/api` tới server.
Chỉ cổng **80/443** mở ra Internet; database và server nằm trong mạng nội bộ của Docker.

## Cần chuẩn bị

- Một VPS Linux (Ubuntu 22.04/24.04), tối thiểu 1 vCPU và 2 GB RAM (build image cần bộ nhớ; chạy thường thì 1 GB đủ).
- Một **tên miền** bạn quản lý được DNS.
- Có thể SSH vào máy chủ.

## 1. Chuẩn bị máy chủ

```bash
# Cài Docker (có sẵn Docker Compose)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # đăng xuất rồi đăng nhập lại để có hiệu lực

# Tường lửa: chỉ mở SSH, HTTP, HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443
sudo ufw enable
```

> Đăng nhập SSH bằng khóa (không dùng mật khẩu) và không chạy ứng dụng bằng tài khoản root.

## 2. Trỏ tên miền

Tạo bản ghi **A** cho tên miền (ví dụ `sanbong.example.com`) trỏ về IP của máy chủ. Kiểm tra:

```bash
dig +short sanbong.example.com   # phải ra IP máy chủ
```

Phải trỏ xong trước khi chạy tiếp, nếu không Caddy không xin được chứng chỉ HTTPS.

## 3. Lấy mã nguồn và cấu hình

```bash
git clone https://github.com/khanhtaii19/FootballApp.git sanbong
cd sanbong
cp deploy/.env.production.example .env
chmod 600 .env
```

Sinh các giá trị bí mật rồi điền vào `.env`:

```bash
openssl rand -hex 24       # POSTGRES_PASSWORD
openssl rand -base64 48    # JWT_SECRET
openssl rand -base64 48    # JWT_REFRESH_SECRET (phải KHÁC JWT_SECRET)
```

Trong `.env`, sửa:

| Biến | Ý nghĩa |
|---|---|
| `DOMAIN` | Tên miền, **không** có `https://` |
| `POSTGRES_PASSWORD` | Mật khẩu database (dùng chuỗi hex) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Khóa ký token, mỗi cái ≥ 32 ký tự và khác nhau |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` | Tài khoản chủ sân tạo ở lần chạy đầu; mật khẩu ≥ 12 ký tự, có chữ hoa, chữ thường và số |

Server **từ chối khởi động** nếu thiếu hoặc yếu các giá trị này, và báo rõ lý do trong log.
Không có tài khoản demo nào được tạo ở production.

## 4. Khởi động

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f server   # Ctrl+C để thoát xem log
```

Lần đầu mất vài phút để build. Server tự chạy migration, nạp 6 vùng sân và cấu hình mặc định, tạo tài khoản chủ sân, rồi mới nhận request.

## 5. Kiểm tra sau khi deploy

```bash
BASE_URL=https://sanbong.example.com \
OWNER_EMAIL=chusan@example.com OWNER_PASSWORD='mật-khẩu-chủ-sân' \
./deploy/smoke-test.sh
```

Script kiểm tra giao diện, health, đăng nhập chủ sân, xác nhận tài khoản demo công khai **không** tồn tại, và luồng khách đặt sân. Mặc định nó **không** đổi cấu hình thật và hủy booking thử ngay; chỉ để lại một tài khoản khách `smoke-...@example.com` và một booking đã hủy trong lịch sử.

## 6. Thiết lập lần đầu trên giao diện

1. Mở `https://tên-miền`, đăng nhập bằng tài khoản chủ sân.
2. Vào **Cấu hình**: chọn ngân hàng nhận cọc, nhập số tài khoản và tên chủ tài khoản (cần để khách thấy mã QR), kiểm tra giá, giờ mở cửa, % cọc và chính sách hủy.
3. Sau khi xong, xóa dòng `SEED_OWNER_PASSWORD` khỏi `.env` và chạy lại `docker compose -f docker-compose.prod.yml up -d`. Từ đó không cần giữ mật khẩu chủ sân trong file cấu hình.

## Vận hành hằng ngày

### Cập nhật phiên bản mới

```bash
cd sanbong
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migration chạy tự động khi server khởi động. Nên **sao lưu trước** khi cập nhật (xem bên dưới).

### Xem log và trạng thái

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f server   # log request dạng JSON, mỗi dòng một request
docker compose -f docker-compose.prod.yml logs -f web      # Caddy (HTTPS, proxy)
```

Log request chỉ có phương thức, đường dẫn (không có query), mã trạng thái, thời gian và IP, không có token hay mật khẩu.

### Sao lưu và khôi phục

```bash
./deploy/backup.sh                      # tạo backups/sanbong-YYYYMMDD-HHMMSS.sql.gz, giữ 14 bản gần nhất
./deploy/restore.sh backups/<file>.sql.gz   # GHI ĐÈ dữ liệu hiện tại, có hỏi xác nhận
```

Sao lưu tự động mỗi đêm 3 giờ sáng (`crontab -e`):

```cron
0 3 * * * cd /home/USER/sanbong && ./deploy/backup.sh >> backups/backup.log 2>&1
```

**Quan trọng:** file backup nằm cùng máy chủ sẽ mất cùng máy chủ. Hãy chép ra nơi khác (máy khác, cloud storage), ví dụ bằng `rclone` hoặc `scp` định kỳ.
Hãy **thử khôi phục ít nhất một lần** trên máy khác để chắc chắn backup dùng được. Khôi phục chạy trong một transaction nên nếu lỗi giữa chừng thì dữ liệu hiện tại giữ nguyên.

### Quên mật khẩu chủ sân

```bash
docker compose -f docker-compose.prod.yml exec \
  -e NEW_OWNER_PASSWORD='MatKhauMoi123456' \
  server node dist/scripts/reset-owner-password.js chusan@example.com
```

### Giám sát

Dùng một dịch vụ kiểm tra từ bên ngoài (UptimeRobot, Better Stack...) gọi `https://tên-miền/api/health` mỗi 5 phút; endpoint này trả `503` khi mất kết nối database. Các container có `restart: unless-stopped` nên tự dậy lại sau khi máy chủ khởi động lại.

## Thử stack production trên máy của bạn

```bash
cp deploy/.env.production.example .env     # điền giá trị, đặt DOMAIN=localhost
docker compose -f docker-compose.prod.yml up -d --build
```

- `DOMAIN=localhost`: HTTPS với chứng chỉ tự ký (trình duyệt sẽ cảnh báo, chọn tiếp tục).
- `DOMAIN=http://localhost`: HTTP thường, không có HTTPS.

## Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Server dừng ngay với `EnvError` | Thiếu/yếu biến môi trường; đọc danh sách lỗi trong `logs server` rồi sửa `.env` |
| Server dừng với lỗi về `SEED_OWNER_PASSWORD` | Lần chạy đầu thiếu hoặc mật khẩu chủ sân quá yếu (cần ≥ 12 ký tự, chữ hoa, chữ thường, số) |
| Trình duyệt báo không an toàn / không có HTTPS | DNS chưa trỏ đúng IP, hoặc cổng 80/443 bị chặn; xem `logs web` |
| Đăng nhập báo "Quá nhiều lần thử" | Giới hạn 10 lần đăng nhập **sai** mỗi 15 phút cho mỗi IP; đợi hoặc khởi động lại `server` |
| Khách không thấy mã QR | Chủ sân chưa nhập tài khoản ngân hàng ở **Cấu hình** |
| Mất chứng chỉ sau khi xóa volume | Volume `caddy_data` chứa chứng chỉ; mất thì Caddy xin lại (có giới hạn tần suất của Let's Encrypt) |

## Giới hạn đã biết

- Chạy **một** instance server. Bộ giới hạn đăng nhập và job hết hạn dùng bộ nhớ/DB đơn giản, chưa thiết kế cho nhiều instance (cần Redis nếu mở rộng).
- Token đăng nhập lưu ở `localStorage` của trình duyệt; hướng nâng cấp là đưa refresh token vào cookie `httpOnly`.
- Xác nhận đã nhận cọc do chủ sân thao tác tay; thanh toán tự động (PayOS/webhook) và email thông báo chưa có.
