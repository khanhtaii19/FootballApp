#!/usr/bin/env bash
# Kiểm tra nhanh một hệ thống đang chạy (local, CI hoặc production sau khi deploy).
#
#   BASE_URL=https://sanbong.example.com \
#   OWNER_EMAIL=chusan@example.com OWNER_PASSWORD='...' ./deploy/smoke-test.sh
#
# Kiểm tra: giao diện, health, API công khai, đăng nhập chủ sân, không còn tài khoản demo
# công khai, và luồng chính: khách đăng ký -> đặt sân -> nhận thông tin QR thanh toán.
#
# An toàn khi chạy trên hệ thống THẬT: mặc định KHÔNG đổi cấu hình và KHÔNG xác nhận cọc.
# Script chỉ tạo một khách thử và một booking pending rồi hủy ngay.
#   SMOKE_SET_BANK=yes  : nếu chưa có tài khoản ngân hàng, đặt tài khoản thử (chỉ dùng cho CI)
#   SMOKE_CONFIRM=yes   : chủ sân xác nhận rồi hủy booking thử (để lại khoản hoàn cọc; chỉ dùng cho CI)
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost}
OWNER_EMAIL=${OWNER_EMAIL:?Cần OWNER_EMAIL}
OWNER_PASSWORD=${OWNER_PASSWORD:?Cần OWNER_PASSWORD}

pass=0
ok() { pass=$((pass + 1)); echo "  ✅ $1"; }
fail() { echo "  ❌ $1" >&2; exit 1; }

# Gọi API, in body ra stdout; lỗi HTTP thì dừng và in nội dung lỗi
api() {
  local method=$1 path=$2 token=${3:-} data=${4:-}
  local args=(-sS -X "$method" "$BASE_URL/api$path" -H "Content-Type: application/json" -w $'\n%{http_code}')
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$data" ] && args+=(-d "$data")
  local out status body
  out=$(curl "${args[@]}")
  status=${out##*$'\n'}
  body=${out%$'\n'*}
  echo "$body"
  [[ "$status" =~ ^2 ]] || { echo "HTTP $status $method $path: $body" >&2; return 1; }
}

status_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# Dừng nếu giá trị rỗng hoặc là "null" (jq in "null" khi không có trường)
require_value() {
  if [ -z "$1" ] || [ "$1" = null ]; then fail "$2"; fi
}

echo "▶ Smoke test: $BASE_URL"

# 1. Giao diện và đường dẫn SPA
curl -fsS "$BASE_URL/" | grep -q 'id="root"' || fail "Trang chủ không trả về giao diện"
ok "Giao diện tải được"
curl -fsS "$BASE_URL/book" | grep -q 'id="root"' || fail "Đường dẫn SPA /book không trả về index.html"
ok "Đường dẫn SPA hoạt động (/book)"

# 2. Header bảo mật do Caddy đặt (chỉ kiểm khi có Caddy phía trước)
if curl -sI "$BASE_URL/" | grep -qi '^x-content-type-options: nosniff'; then ok "Có header bảo mật"; else fail "Thiếu header bảo mật"; fi

# 3. Health và dữ liệu nền
api GET /health | jq -e '.database == "connected"' >/dev/null || fail "Health: database chưa kết nối"
ok "Health OK, database kết nối"
[ "$(api GET /zones | jq '.zones | length')" = "6" ] || fail "Không đủ 6 vùng sân"
ok "Có đủ 6 vùng sân"
api GET /settings | jq -e '.settings.price_5 > 0' >/dev/null || fail "Không đọc được cấu hình"
ok "Đọc được cấu hình công khai"

# 4. Tài khoản chủ sân; tài khoản demo công khai KHÔNG được tồn tại
owner_token=$(api POST /auth/login "" "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" | jq -r .accessToken)
require_value "$owner_token" "Chủ sân không đăng nhập được"
ok "Chủ sân đăng nhập được"
demo=$(status_of -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"owner@sanbong.vn","password":"OwnerPass123"}')
[ "$demo" = "401" ] || fail "Tài khoản demo công khai vẫn đăng nhập được (HTTP $demo)"
ok "Tài khoản demo công khai không tồn tại"
[ "$(status_of "$BASE_URL/api/bookings")" = "401" ] || fail "API booking không yêu cầu đăng nhập"
ok "API cần đăng nhập thì bị chặn khi không có token"

# 5. Tài khoản nhận cọc (QR chỉ có khi đã cấu hình). Không ghi đè cấu hình thật.
bank_bin=$(api GET /settings | jq -r '.settings.bank_bin')
if [ -z "$bank_bin" ] && [ "${SMOKE_SET_BANK:-}" = yes ]; then
  api PUT /settings "$owner_token" '{"bank_bin":"970436","bank_account_no":"0123456789","bank_account_name":"SMOKE TEST"}' >/dev/null
  bank_bin=970436
  ok "Đã đặt tài khoản ngân hàng thử (SMOKE_SET_BANK)"
fi

# 6. Luồng khách: đăng ký -> xem giờ trống -> đặt sân -> thông tin QR
email="smoke-$(date +%s)-$RANDOM@example.com"
customer_token=$(api POST /auth/register "" "{\"email\":\"$email\",\"password\":\"SmokeTest2026a\",\"name\":\"Smoke Test\"}" | jq -r .accessToken)
require_value "$customer_token" "Khách không đăng ký được"
ok "Khách đăng ký được"

day=$(date -u -d '+3 days' +%F 2>/dev/null || date -u -v+3d +%F)
slot=$(api GET "/bookings/available?date=$day&fieldType=five&duration=60" | jq -r '.slots[0].startsAt')
require_value "$slot" "Không có giờ trống để đặt thử ($day)"
ok "Có giờ trống: $slot"

booking=$(api POST /bookings "$customer_token" "{\"fieldType\":\"five\",\"startsAt\":\"$slot\",\"duration\":60}")
booking_id=$(echo "$booking" | jq -r .booking.id)
require_value "$booking_id" "Không đặt được sân"
ok "Đặt sân thành công (pending)"

payment=$(api GET "/bookings/$booking_id/payment" "$customer_token")
echo "$payment" | jq -e '.payment.deposit > 0' >/dev/null || fail "Booking không có tiền cọc"
ok "Booking có tiền cọc"
if [ -n "$bank_bin" ]; then
  echo "$payment" | jq -e '.payment.qrPayload | startswith("000201")' >/dev/null || fail "Không có mã QR thanh toán hợp lệ"
  ok "Có mã QR VietQR cho tiền cọc"
else
  echo "  ⚠️  Bỏ qua kiểm tra QR: chủ sân chưa cấu hình tài khoản ngân hàng"
fi

# 7. Dọn dẹp để không chiếm giờ của người thật
if [ "${SMOKE_CONFIRM:-}" = yes ]; then
  api PATCH "/bookings/$booking_id/confirm" "$owner_token" '{}' | jq -e '.booking.status == "confirmed"' >/dev/null || fail "Chủ sân không xác nhận được"
  ok "Chủ sân xác nhận đã nhận cọc (SMOKE_CONFIRM)"
  api PATCH "/bookings/$booking_id/cancel" "$owner_token" >/dev/null
else
  api PATCH "/bookings/$booking_id/cancel" "$customer_token" >/dev/null
fi
ok "Đã hủy booking thử"

echo "🎉 Đạt $pass kiểm tra"
