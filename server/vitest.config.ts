import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
<<<<<<< HEAD
=======
    setupFiles: ["./src/tests/setup.ts"],
    // Các file integration dùng chung một DB và tự xóa dữ liệu,
    // chạy song song sẽ xóa dữ liệu của nhau.
    fileParallelism: false,
    // Runner CI chậm và test đồng thời cần dư thời gian
    testTimeout: 30_000,
    hookTimeout: 30_000,
>>>>>>> fix(booking): serialize booking creation with an advisory lock and relax test timeouts
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
