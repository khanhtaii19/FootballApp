#!/usr/bin/env bash
# Khôi phục database từ file backup .sql.gz. GHI ĐÈ toàn bộ dữ liệu hiện tại.
#
#   ./deploy/restore.sh backups/sanbong-20261120-030000.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=${COMPOSE:-"docker compose -f docker-compose.prod.yml"}
file=${1:?Cách dùng: ./deploy/restore.sh <file.sql.gz>}

[ -f "$file" ] || { echo "❌ Không thấy file: $file" >&2; exit 1; }
gzip -t "$file" || { echo "❌ File nén bị hỏng: $file" >&2; exit 1; }

echo "⚠️  Thao tác này sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại bằng: $file"
if [ "${ASSUME_YES:-}" != "yes" ]; then
  read -r -p "Gõ 'yes' để tiếp tục: " answer
  [ "$answer" = "yes" ] || { echo "Đã hủy."; exit 1; }
fi

# Dừng server để không có ai ghi vào database trong lúc khôi phục
# shellcheck disable=SC2086
$COMPOSE stop server

# Một transaction: nếu lỗi giữa chừng thì database giữ nguyên như cũ
# shellcheck disable=SC2086
gzip -dc "$file" | $COMPOSE exec -T db psql -U sanbong -d sanbong -v ON_ERROR_STOP=1 --single-transaction --quiet

# shellcheck disable=SC2086
$COMPOSE start server
echo "✅ Đã khôi phục từ $file"
