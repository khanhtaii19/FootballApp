#!/usr/bin/env bash
# Sao lưu database PostgreSQL thành file .sql.gz, giữ lại N bản gần nhất.
#
#   ./deploy/backup.sh                 # sao lưu vào ./backups, giữ 14 bản
#   KEEP=30 BACKUP_DIR=/mnt/disk ./deploy/backup.sh
#
# Chạy mỗi đêm bằng cron (xem docs/DEPLOY.md). Nhớ chép file ra NƠI KHÁC (máy khác,
# cloud storage): backup nằm cùng máy chủ sẽ mất cùng máy chủ.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=${COMPOSE:-"docker compose -f docker-compose.prod.yml"}
BACKUP_DIR=${BACKUP_DIR:-./backups}
KEEP=${KEEP:-14}

mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/sanbong-$(date +%Y%m%d-%H%M%S).sql.gz"
tmp="$file.tmp"
trap 'rm -f "$tmp"' EXIT

# pipefail: nếu pg_dump lỗi thì cả lệnh lỗi, không để lại file rỗng trông như backup thật
# shellcheck disable=SC2086
$COMPOSE exec -T db pg_dump -U sanbong --no-owner --clean --if-exists sanbong | gzip > "$tmp"

# Kiểm tra file nén nguyên vẹn và pg_dump đã chạy đến cuối
gzip -t "$tmp"
if ! gzip -dc "$tmp" | tail -n 5 | grep -q "PostgreSQL database dump complete"; then
  echo "❌ File backup không đầy đủ, đã hủy" >&2
  exit 1
fi

mv "$tmp" "$file"

# Xóa các bản cũ, chỉ giữ KEEP bản mới nhất
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/sanbong-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --

echo "✅ Đã sao lưu: $file ($(du -h "$file" | cut -f1))"
