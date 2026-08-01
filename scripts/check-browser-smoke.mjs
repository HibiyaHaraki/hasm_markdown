import { spawn } from "node:child_process";
import http from "node:http";
import { chromium } from "playwright";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const targetUrl = "http://127.0.0.1:4173";

function waitForServer(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(attempt, 1000);
        }
      });
    };
    attempt();
  });
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }

    const onExit = () => resolve();
    child.once("exit", onExit);

    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }

    setTimeout(() => {
      child.removeListener("exit", onExit);
      if (!child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 5000);
  });
}

async function main() {
  const isWindows = process.platform === "win32";
  const viteCommand = isWindows ? "cmd.exe" : npmCommand;
  const viteArgs = isWindows
    ? ["/d", "/s", "/c", "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort"]
    : ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4173", "--strictPort"];

  const vite = spawn(viteCommand, viteArgs, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  vite.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  vite.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(targetUrl);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];

    page.on("pageerror", (error) => {
      errors.push(`pageerror: ${error.message}`);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(`console: ${msg.text()}`);
      }
    });

    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector("textarea, .HASM_Markdown_Editor", { timeout: 20000 });

    const hasEditor = await page.locator("textarea").count();
    const hasPreview = await page.locator(".HASM_Markdown_Editor_ViewerCol").count();

    if (errors.length > 0) {
      throw new Error(`Runtime errors detected:\n- ${errors.join("\n- ")}`);
    }

    if (hasEditor === 0 || hasPreview === 0) {
      throw new Error("The application did not render the expected editor and preview UI.");
    }

    console.log("✓ PASS: React rendering smoke test has no runtime errors (checkReactRendering)");
    await browser.close();
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    await stopProcess(vite);
  }
}

main().catch((error) => {
  console.error("✗ FAIL: React rendering smoke test failed (checkReactRendering)");
  console.error(error.message);
  process.exit(1);
});
