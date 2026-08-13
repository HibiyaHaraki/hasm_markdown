import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/evaluations",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  reporter: [
    ["list"],
    ["html", { outputFolder: ".eval-reports/playwright-report", open: "never" }],
  ],
});
