import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { clearSession } from "../lib/session";

afterEach(() => {
  cleanup();
  clearSession(); // xóa cả bản sao trong bộ nhớ, không chỉ localStorage
});
