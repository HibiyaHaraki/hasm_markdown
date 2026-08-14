import { spawn } from "node:child_process";
import http from "node:http";
import { chromium } from "playwright";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const targetUrl = "http://127.0.0.1:4173";

/**
 * # Test Function : waitForServer
 * ## Test Procedure
 * * Step 1 : Send HTTP request to the target URL.
 * * Step 2 : If request fails, retry every second until timeout.
 * * Step 3 : Resolve when the server responds.
 * ## Expected behavior
 * * Step 1 : Server availability is actively probed.
 * * Step 2 : Temporary startup delays are tolerated.
 * * Step 3 : Function fails only when timeout threshold is exceeded.
 */
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

/**
 * # Test Function : stopProcess
 * ## Test Procedure
 * * Step 1 : Check if the child process is valid and still running.
 * * Step 2 : Send termination signal (taskkill on Windows, SIGTERM otherwise).
 * * Step 3 : Wait for normal exit or force-kill after timeout.
 * ## Expected behavior
 * * Step 1 : Already-stopped processes are handled safely.
 * * Step 2 : Process shutdown is initiated on all platforms.
 * * Step 3 : No orphaned dev server remains after test completion.
 */
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

/**
 * # Test Function : checkReactRendering
 * ## Test Procedure
 * * Step 1 : Start Vite dev server on fixed host/port.
 * * Step 2 : Wait until the server becomes reachable.
 * * Step 3 : Open page in Playwright Chromium and capture runtime errors.
 * * Step 4 : Validate editor and preview UI elements are rendered.
 * * Step 5 : Report PASS on success, otherwise throw with diagnostics.
 * * Step 6 : Stop the dev server in finally block.
 * ## Expected behavior
 * * Step 1 : Test target app is launched in predictable environment.
 * * Step 2 : Browser navigation starts only after server is ready.
 * * Step 3 : JS runtime/page errors are collected for failure reporting.
 * * Step 4 : Core UI contract is verified (editor + preview present).
 * * Step 5 : PASS line is printed only when no runtime/UI issue exists.
 * * Step 6 : Cleanup always runs even when test fails.
 */
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
    await page.getByRole("textbox", { name: "Markdown editor" }).waitFor({ timeout: 20000 });

    const hasEditor = await page.getByRole("textbox", { name: "Markdown editor" }).count();
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

/**
 * # Test Function : reactRenderingScriptMain
 * ## Test Procedure
 * * Step 1 : Execute checkReactRendering via main().
 * * Step 2 : Print FAIL summary and error detail if rejected.
 * * Step 3 : Exit with non-zero code on failure.
 * ## Expected behavior
 * * Step 1 : Full browser smoke test flow is executed.
 * * Step 2 : Failure cause is visible in output.
 * * Step 3 : CI/local automation detects test failure correctly.
 */
main().catch((error) => {
  console.error("✗ FAIL: React rendering smoke test failed (checkReactRendering)");
  console.error(error.message);
  process.exit(1);
});
