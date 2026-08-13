import { spawn } from "node:child_process";
import http from "node:http";
import { chromium } from "playwright";
import { createLogger } from "../src/hasm_logger/src/react/logger.js";

const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";
const root = process.cwd();
const port = 4174;
const url = `http://127.0.0.1:${port}`;
const testLogger = createLogger("seq-md-01-guard-test");

function trace(step, data) {
  // Trace-level guard diagnostics are controlled by hasm_logger configuration.
  testLogger.trace(`[TC-MD-01-GUARD-001][${step}]`, data);
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      http.get(url, (response) => {
        response.resume();
        resolve();
      }).on("error", () => {
        if (Date.now() - started > 30000) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(poll, 100);
      });
    };
    poll();
  });
}

const server = spawn(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32"
  ? ["/d", "/s", "/c", `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`]
  : ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  trace("INPUT", { url: `${url}/editor`, isLoaded: false });
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}/editor`, { waitUntil: "networkidle" });
  const output = { finalUrl: page.url(), bootScreenCount: await page.locator(".BootScreen").count(), errors };
  trace("OUTPUT", output);
  if (!output.finalUrl.endsWith("/select") || output.bootScreenCount !== 1 || output.errors.length > 0) {
    throw new Error(`Guard failed: ${JSON.stringify(output)}`);
  }
  await browser.close();
  console.log(`${GREEN}PASS${RESET} TC-MD-01-GUARD-001 Unauthorized Direct Navigation`);
} finally {
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}
