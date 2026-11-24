#!/bin/sh
# Khởi động container production: migration -> dữ liệu nền -> server.
# Script dừng ngay khi một bước lỗi, nên cấu hình sai sẽ hiện rõ thay vì chạy dở.
set -e

echo "▶ Chạy migration..."
npx prisma migrate deploy

echo "▶ Nạp dữ liệu nền (an toàn khi chạy lặp lại)..."
node dist/scripts/seed.js

echo "▶ Khởi động server..."
exec node dist/index.js
