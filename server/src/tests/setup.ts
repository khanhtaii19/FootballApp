// Chốt chặn an toàn: test xóa sạch users/bookings,
// nên chỉ được chạy trên database có tên chứa "test".
const url = process.env.DATABASE_URL;

if (url) {
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.toLowerCase().includes("test")) {
    throw new Error(
      `Từ chối chạy test trên database "${dbName}". ` +
        `Tạo DB riêng (ví dụ sanbong_test) và đặt DATABASE_URL trong server/.env.test`
    );
  }
}

// Nhiều test tạo hàng chục booking pending từ một khách; nới giới hạn mỗi
// người để không cản các test đó. Test giới hạn tự đặt lại giá trị riêng.
process.env.MAX_PENDING_BOOKINGS_PER_USER ??= "1000";
