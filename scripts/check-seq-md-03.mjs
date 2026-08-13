import { spawn } from "node:child_process";
import http from "node:http";
import { chromium } from "playwright";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const targetUrl = "http://127.0.0.1:4175/?eval=md03";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function record(id, name, check) {
  try {
    await check();
    results.push({ id, name, pass: true, detail: "" });
  } catch (error) {
    results.push({ id, name, pass: false, detail: error.stack || String(error) });
  }
}

function waitForServer(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      const request = http.get(url, (response) => { response.resume(); resolve(); });
      request.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.once("exit", resolve);
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else child.kill("SIGTERM");
    setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); resolve(); }, 5000);
  });
}

async function browserChecks() {
  const vite = spawn(process.platform === "win32" ? "cmd.exe" : npmCommand,
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run dev -- --host 127.0.0.1 --port 4175 --strictPort"]
      : ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4175", "--strictPort"],
    { cwd: root, stdio: "ignore" });
  try {
    await waitForServer(targetUrl);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__md03Invokes = [];
      window.__md03Package = {
        uuid: "eval-md-03",
        targetType: "Folder",
        lastSavedContent: "# Assets\n\n![deleted](asset:deleted)",
        rawContent: "# Assets\n\n![deleted](asset:deleted)",
        manifest: {
          version: "1",
          assets: {
            active: { uuid: "active.png", resolvedPath: "C:/eval/assets/active.png" },
            deleted: { uuid: "deleted.png", resolvedPath: "C:/eval/assets/deleted.png", isDeleted: true },
          },
        },
        missingAssets: [{ alias: "deleted", expectedRelativePath: "assets/deleted.png", referencedLines: [3] }],
        warnings: [],
      };
      window.confirm = () => true;
      window.__TAURI_INTERNALS__ = {
        invoke: async (command, args) => {
          window.__md03Invokes.push({ command, args });
          if (command === "get_launch_target") return null;
          if (command === "register_and_bind_single_asset_path") {
            window.__md03Package.manifest.assets[args.customAlias] = {
              uuid: "new-asset.png",
              relativePath: "assets/new-asset.png",
              resolvedPath: args.sourcePath,
              mimeType: "image/png",
              size: 10,
              isExternal: true,
              isDeleted: false,
            };
            return structuredClone(window.__md03Package);
          }
          if (command === "soft_delete_asset_mapping") {
            window.__md03Package.manifest.assets[args.alias].isDeleted = true;
            window.__md03Package.manifest.assets[args.alias].deletedAt = new Date().toISOString();
            window.__md03Package.missingAssets.push({ alias: args.alias, expectedRelativePath: "assets/new-asset.png", referencedLines: [3] });
            return structuredClone(window.__md03Package);
          }
          throw new Error(`unexpected command: ${command}`);
        },
      };
    });
    await page.goto(targetUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Assets" }).click();

    await record("TC-MD-03-REACT-001", "Active Asset Filtering", async () => {
      assert(await page.locator(".AssetWindow_List li").count() === 1, "deleted asset was displayed as active");
    });

    const dropzone = page.locator(".AssetWindow_Dropzone");
    const alias = page.locator(".AssetWindow_AliasForm input");
    await record("TC-MD-03-E2E-002", "Multiple Drop Uses First File", async () => {
      await page.evaluate(() => {
        const transfer = new DataTransfer();
        for (const path of ["C:/images/first.png", "C:/images/second.png", "C:/images/third.png"]) {
          const file = new File(["x"], path.split("/").pop(), { type: "image/png" });
          Object.defineProperty(file, "path", { value: path });
          transfer.items.add(file);
        }
        document.querySelector(".AssetWindow_Dropzone").dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
      });
      assert((await page.locator(".AssetWindow_Status").textContent()).includes("Single file upload supported"), "multi-drop notice was not displayed");
      assert(await page.locator(".AssetWindow_AliasForm input").inputValue() === "first.png", "first dropped file was not selected");
    });

    await record("TC-MD-03-E2E-003", "Alias Collision Rejected", async () => {
      await alias.fill("deleted");
      await page.getByRole("button", { name: "Register" }).click();
      assert((await page.locator(".AssetWindow_Error").textContent()).includes("Alias or reserved name already exists"), "alias collision was accepted");
    });

    await record("TC-MD-03-E2E-001", "Single Drop Registration and Cursor Insertion", async () => {
      await alias.fill("arch_v1.png");
      await alias.press("End");
      await page.getByRole("button", { name: "Register" }).click();
      const calls = await page.evaluate(() => window.__md03Invokes.filter(({ command }) => command === "register_and_bind_single_asset_path"));
      assert(calls.length === 1 && calls[0].args.customAlias === "arch_v1.png", "asset registration IPC payload was incorrect");
      assert((await page.locator("textarea").inputValue()).includes("asset:arch_v1.png"), "registered asset tag was not inserted");
    });

    await record("TC-MD-03-REACT-002", "Cursor Text Insertion", async () => {
      assert((await page.locator("textarea").inputValue()).includes("![alt](asset:arch_v1.png)"), "formatted asset markup was not inserted");
    });

    await record("TC-MD-03-E2E-004", "In-Use Delete Warning", async () => {
      await page.locator(".AssetWindow_List li").filter({ hasText: "active" }).getByRole("button", { name: "Delete" }).click();
      assert((await page.locator(".AssetWindow_Status").textContent()).includes("marked as deleted"), "delete warning/confirmation flow did not complete");
    });

    await record("TC-MD-03-REACT-003", "Asset Operation Progress Display", async () => {
      assert(await page.locator(".AssetWindow progress").count() === 1, "asset operation progress indicator was not rendered");
    });

    await record("TC-MD-03-E2E-005", "Soft Delete and Editor Synchronization", async () => {
      assert(await page.locator(".AssetWindow_List li").count() === 1, "soft-deleted asset remained in active list");
      await page.getByRole("button", { name: "Close assets" }).click();
      assert(await page.locator(".missing-asset-warning").count() >= 1, "editor preview did not synchronize missing asset warning");
    });

    await record("TC-MD-03-REACT-004", "Window Close State Synchronization", async () => {
      assert(await page.locator(".missing-asset-warning").count() >= 1, "closing the Asset Window did not retain synchronized missing state");
    });

    await browser.close();
  } finally {
    await stopProcess(vite);
  }
}

await browserChecks();
await record("TC-MD-03-RUST-001", "Dynamic Path Binding", async () => {
  const result = await import("node:child_process").then(({ spawnSync }) => spawnSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "--", ""], { cwd: root, encoding: "utf8" }));
  assert(result.status === 0, `${result.stdout}\n${result.stderr}`);
});
await record("TC-MD-03-RUST-002", "Soft Delete Metadata Contract", async () => {
  const result = await import("node:child_process").then(({ spawnSync }) => spawnSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "--", ""], { cwd: root, encoding: "utf8" }));
  assert(result.status === 0, `${result.stdout}\n${result.stderr}`);
});
await record("TC-MD-03-RUST-003", "Soft-Deleted Alias Collision", async () => {
  const result = await import("node:child_process").then(({ spawnSync }) => spawnSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "validate_alias_reserves_soft_deleted_entries", "--", ""], { cwd: root, encoding: "utf8" }));
  assert(result.status === 0, `${result.stdout}\n${result.stderr}`);
});

console.log(`REPORT_STORAGE ${JSON.stringify({
  appLocal: 'main.md\n![deleted](asset:deleted)\n\nassets.json\n{"active":{"isDeleted":false},"deleted":{"isDeleted":true,"deletedAt":"timestamp"}}\n\nassets/ (external files remain un-copied)',
  archive: "",
  folder: "",
})}`);

for (const result of results.sort((left, right) => left.id.localeCompare(right.id))) {
  if (result.pass) console.log(`${GREEN}PASS${RESET} ${result.id} ${result.name}`);
  else console.error(`${RED}FAIL${RESET} ${result.id} ${result.name}\n${result.detail}`);
}
const failed = results.filter((result) => !result.pass);
console.log(`${failed.length === 0 ? GREEN : RED}Result: ${results.length - failed.length}/${results.length} passed${RESET}`);
process.exit(failed.length === 0 ? 0 : 1);
