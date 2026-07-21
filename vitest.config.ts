import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup-env.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.{ts,tsx}", "src/app/api/**/route.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/types/database.ts",
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [
            "src/**/*.integration.test.{ts,tsx}",
            "src/**/*.api.test.{ts,tsx}",
            "src/**/*.component.test.{ts,tsx}",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "api",
          include: ["src/**/*.api.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["src/**/*.component.test.{ts,tsx}"],
          setupFiles: [
            "./src/test/setup-env.ts",
            "./src/test/setup-dom.ts",
          ],
        },
      },
    ],
  },
});
