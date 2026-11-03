import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2e/db-url";

// End-to-end checks against the production build (`npm run test:e2e` builds first) and a TEST
// database. See README, «Desarrollo: interfaz y pruebas e2e».

// E2E_PORT lets two runs (two checkouts) share a machine.
const PORT = Number(process.env.E2E_PORT ?? 3200);
const databaseUrl = e2eDatabaseUrl();
// The fixtures read the app ids from here (workers load this file too).
process.env.E2E_RESOLVED_DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // Few at a time: the pages hit Neon and Google Play, and a burst drops connections.
  workers: Number(process.env.E2E_WORKERS ?? 2),
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-report.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/dev/ui`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      ENABLE_DEV_UI: "1",
      // No basic auth, and no paid APIs or emails during the run (empty values win over .env.local).
      APP_PASSWORD: "",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "",
      RESEND_API_KEY: "",
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "",
      ASC_ISSUER_ID: "",
      ASC_KEY_ID: "",
      ASC_PRIVATE_KEY: "",
      CRON_SECRET: "",
    },
  },
});
