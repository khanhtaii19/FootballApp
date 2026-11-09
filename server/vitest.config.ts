import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// Ưu tiên .env.test (nếu có) để test không bao giờ chạm DB dev
dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/tests/setup.ts"],
    // Các file integration dùng chung một DB và tự xóa dữ liệu,
    // chạy song song sẽ xóa dữ liệu của nhau.
    fileParallelism: false,
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
