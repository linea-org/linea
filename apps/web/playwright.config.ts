import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.browser.ts",
  outputDir: "../../.context/agent-ui-browser",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.AGENT_UI_BASE_URL ?? "http://localhost:3001",
    viewport: { width: 1440, height: 1100 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
})
