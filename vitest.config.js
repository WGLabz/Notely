import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/tests/**/*.{test,spec}.{js,jsx}"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
