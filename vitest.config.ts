import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside the React server condition; neutralise it in unit tests.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3000",
      SUPABASE_URL: "https://zrqdnqbotbvoxemkpbyn.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "dummy-service-role-key-for-test-suites-minimum-20-chars",
      JWT_SECRET: "dummy-jwt-secret-minimum-32-characters-long-for-testing",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    },
  },
});
