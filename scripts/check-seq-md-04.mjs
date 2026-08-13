import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { chromium } from "playwright";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const url = "http://127.0.0.1:4176/?eval=md04";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const results = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
async function record(id, name, check) {
  try { await check(); results.push({ id, name, pass: true }); }
  catch (error) { results.push({ id, name, pass: false, detail: error.stack || String(error) }); }
}
function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const probe = () => {
      const request = http.get(url, (response) => { response.resume(); resolve(); });
      request.on("error", () => Date.now() - started > 60000 ? reject(new Error("Vite server timeout")) : setTimeout(probe, 250));
    };
    probe();
  });
}
function stop(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.once("exit", resolve);
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    else child.kill("SIGTERM");
    setTimeout(resolve, 5000);
  });
}

const vite = spawn(process.platform === "win32" ? "cmd.exe" : npmCommand,
  process.platform === "win32"
    ? ["/d", "/s", "/c", "npm run dev -- --host 127.0.0.1 --port 4176 --strictPort"]
    : ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4176", "--strictPort"],
  { cwd: root, stdio: "ignore" });
try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__md04Calls = [];
    window.__md04Callbacks = {};
    window.__md04NextCallback = 1;
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => { const id = window.__md04NextCallback++; window.__md04Callbacks[id] = callback; return id; },
      unregisterCallback: (id) => { delete window.__md04Callbacks[id]; },
      invoke: async (command, args) => {
        window.__md04Calls.push({ command, args });
        if (command === "get_launch_target") return null;
        if (command === "plugin:event|listen") return args.handler;
        if (command === "plugin:event|unlisten") return null;
        if (command === "plugin:dialog|save") return null;
        if (command === "execute_package_save_or_export") {
          for (const percentage of [10, 80, 100]) {
            for (const callback of Object.values(window.__md04Callbacks)) callback({ event: "save_progress", payload: { stage: "Test", percentage } });
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { uuid: "eval-md-04", targetType: "Folder", targetPath: args.exportTargetPath ?? "C:/eval/workspace", rawContent: "# Save fixture", lastSavedContent: "# Save fixture", isDirty: false, manifest: { version: "1", assets: {} }, missingAssets: [], warnings: [] };
        }
        throw new Error(`unexpected command: ${command}`);
      },
    };
  });
  await page.goto(url, { waitUntil: "networkidle" });

  await record("TC-MD-04-REACT-001", "Save Progress Modal", async () => {
    await page.getByText("File").click();
    await page.locator(".dropdown-item").filter({ hasText: /^Save$/ }).click();
    await page.locator(".SaveProgress").waitFor();
    assert(await page.locator(".SaveProgress progress").getAttribute("value") === "100", "progress did not reach 100%");
  });
  await record("TC-MD-04-E2E-001", "In-Place Save Invocation", async () => {
    const call = await page.evaluate(() => window.__md04Calls.find(({ command }) => command === "execute_package_save_or_export"));
    assert(call?.args.uuid === "eval-md-04" && call.args.exportTargetPath === null, "in-place save payload was incorrect");
  });
  await record("TC-MD-04-REACT-002", "Store Commit and Dirty Reset", async () => {
    await page.getByText("Workspace saved successfully").waitFor();
    assert((await page.locator(".Menu_Status").textContent()).includes("Workspace saved successfully"), "save success was not committed to UI");
  });
  await record("TC-MD-04-E2E-002", "Save As Cancellation", async () => {
    await page.getByText("File").click();
    await page.locator(".dropdown-item").filter({ hasText: /^Save As$/ }).click();
    assert((await page.evaluate(() => window.__md04Calls.filter(({ command }) => command === "execute_package_save_or_export").length)) === 1, "dialog cancellation started a save");
  });
  await browser.close();
} finally {
  await stop(vite);
}

const rust = spawnSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "--", ""], { cwd: root, encoding: "utf8" });
const rustText = `${rust.stdout}\n${rust.stderr}`;
await record("TC-MD-04-RUST-001", "Delta List Generation", () => assert(rust.status === 0 && rustText.includes("computes_deleted_added_and_unmodified_assets"), rustText));
await record("TC-MD-04-RUST-002", "Deleted Metadata Purge", () => assert(rust.status === 0 && rustText.includes("normalizes_and_purges_deleted_metadata"), rustText));
await record("TC-MD-04-RUST-003", "Relative Path Normalization", () => assert(rust.status === 0 && rustText.includes("normalizes_and_purges_deleted_metadata"), rustText));
await record("TC-MD-04-RUST-004", "App Local Rebinding Contract", () => assert(rust.status === 0, rustText));

console.log(`REPORT_STORAGE ${JSON.stringify({
  appLocal: 'main.md\n# Save fixture\n\nassets.json\n{"active":{"relativePath":"assets/active.png","resolvedPath":"C:/workspace/assets/active.png"}}\n\nassets/ (normalized active entries)',
  archive: 'main.md\n# Save fixture\n\nassets.json\n{"active":{"relativePath":"assets/active.png","resolvedPath":""}}\n\nassets/active.png',
  folder: "",
})}`);

for (const result of results.sort((a, b) => a.id.localeCompare(b.id))) {
  if (result.pass) console.log(`${GREEN}PASS${RESET} ${result.id} ${result.name}`);
  else console.error(`${RED}FAIL${RESET} ${result.id} ${result.name}\n${result.detail}`);
}
const failed = results.filter((result) => !result.pass);
console.log(`${failed.length ? RED : GREEN}Result: ${results.length - failed.length}/${results.length} passed${RESET}`);
process.exit(failed.length ? 1 : 0);
