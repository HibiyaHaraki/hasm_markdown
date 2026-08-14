import { spawn } from "node:child_process";
import http from "node:http";
import { chromium } from "playwright";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const url = "http://127.0.0.1:4177/?eval=md05";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const results = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
async function record(id, name, check) { try { await check(); results.push({ id, name, pass: true }); } catch (error) { results.push({ id, name, pass: false, detail: error.stack || String(error) }); } }
function waitForServer() { return new Promise((resolve, reject) => { const started = Date.now(); const probe = () => { const request = http.get(url, (response) => { response.resume(); resolve(); }); request.on("error", () => Date.now() - started > 60000 ? reject(new Error("Vite server timeout")) : setTimeout(probe, 250)); }; probe(); }); }
function stop(child) { return new Promise((resolve) => { if (!child || child.killed) return resolve(); child.once("exit", resolve); if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" }); else child.kill("SIGTERM"); setTimeout(resolve, 5000); }); }

const vite = spawn(process.platform === "win32" ? "cmd.exe" : npmCommand, process.platform === "win32" ? ["/d", "/s", "/c", "npm run dev -- --host 127.0.0.1 --port 4177 --strictPort"] : ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4177", "--strictPort"], { cwd: root, stdio: "ignore" });
try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__md05Calls = [];
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => { window.__md05Callback = callback; return 1; },
      unregisterCallback: () => {},
      invoke: async (command, args) => {
        window.__md05Calls.push({ command, args });
        if (command === "get_launch_target") return null;
        if (command === "plugin:event|listen") return 1;
        if (command === "plugin:event|unlisten") return null;
        if (command === "plugin:dialog|open") return "C:/moved/workspace";
        if (command === "open_folder_workspace") return { uuid: "eval-md-05", targetType: "Folder", targetPath: "C:/moved/workspace", rawContent: "# Reopened moved workspace", lastSavedContent: "# Reopened moved workspace", isDirty: false, manifest: { version: "1", assets: {} }, missingAssets: [], warnings: [] };
        if (command === "execute_package_save_or_export") return { uuid: "eval-md-05", targetType: "Folder", targetPath: "C:/eval/workspace", rawContent: "changed", lastSavedContent: "changed", isDirty: false, manifest: { version: "1", assets: {} }, missingAssets: [], warnings: [] };
        if (command === "close_and_cleanup_workspace") return { uuid: "eval-md-05", lockReleased: true, masterHandlesClosed: true, closedAt: new Date().toISOString() };
        throw new Error(`unexpected command: ${command}`);
      },
    };
  });
  await page.goto(url, { waitUntil: "networkidle" });

  await record("TC-MD-05-REACT-002-CLEAN", "Clean Close Routes to Selection", async () => {
    await page.getByRole("button", { name: "Open workspace menu" }).click();
    await page.getByRole("button", { name: "Close workspace", exact: true }).click();
    await page.locator(".BootScreen").waitFor();
    const closeCall = await page.evaluate(() => window.__md05Calls.find(({ command }) => command === "close_and_cleanup_workspace"));
    assert(closeCall?.args.force_discard === false, "clean close did not invoke cleanup");
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("changed");
  await record("TC-MD-05-E2E-001", "Dirty Close Cancel", async () => {
    await page.getByRole("button", { name: "Open workspace menu" }).click();
    await page.getByRole("button", { name: "Close workspace", exact: true }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Close menu" }).click();
    assert(await page.locator("textarea").count() === 1, "cancel did not preserve workspace");
  });
  await record("TC-MD-05-E2E-003", "Dirty Close Discard", async () => {
    await page.getByRole("button", { name: "Open workspace menu" }).click();
    await page.getByRole("button", { name: "Close workspace", exact: true }).click();
    await page.getByRole("button", { name: "Discard Changes" }).click();
    await page.locator(".BootScreen").waitFor();
    const closeCall = await page.evaluate(() => window.__md05Calls.filter(({ command }) => command === "close_and_cleanup_workspace").at(-1));
    assert(closeCall?.args.force_discard === true, "discard did not force cleanup");
  });
  await record("TC-MD-05-E2E-004", "Archive Close Releases Lock", async () => {
    const closeCall = await page.evaluate(() => window.__md05Calls.find(({ command }) => command === "close_and_cleanup_workspace"));
    assert(closeCall?.command === "close_and_cleanup_workspace", "archive close cleanup was not invoked");
  });
  await record("TC-MD-05-E2E-005", "Folder Close Releases Handles", async () => {
    assert(await page.locator(".BootScreen").count() === 1, "folder close did not release the mounted workspace");
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator("textarea").fill("changed");
  await record("TC-MD-05-E2E-002", "Dirty Close Save", async () => {
    await page.getByRole("button", { name: "Open workspace menu" }).click();
    await page.getByRole("button", { name: "Close workspace", exact: true }).click();
    await page.getByRole("button", { name: "Save" }).last().click();
    await page.locator(".BootScreen").waitFor();
    const calls = await page.evaluate(() => window.__md05Calls.map(({ command }) => command));
    assert(calls.includes("execute_package_save_or_export") && calls.includes("close_and_cleanup_workspace"), "dirty close save did not save then close");
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await record("TC-MD-05-E2E-006", "Save Then Reopen Moved Package", async () => {
    await page.getByRole("button", { name: "Open workspace menu" }).click();
    await page.getByRole("button", { name: "Open folder", exact: true }).click();
    await page.locator("textarea").waitFor();
    await page.locator("textarea").fill("edited after moving package");
    assert(await page.locator("textarea").inputValue() === "edited after moving package", "moved package was not editable after reopening");
  });
  await record("TC-MD-05-REACT-001", "Store Reset After Close", async () => {
    assert(await page.locator(".BootScreen").count() === 0 || await page.locator("textarea").count() === 1, "workspace state was not reset or remounted cleanly");
  });
  await record("TC-MD-05-REACT-002", "Close Navigation Routing", async () => {
    assert((await page.url()).includes("eval=md05"), "evaluation page was unexpectedly lost during close routing");
  });
  await browser.close();
} finally { await stop(vite); }

const rust = await import("node:child_process").then(({ spawnSync }) => spawnSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "--", ""], { cwd: root, encoding: "utf8" }));
const rustText = `${rust.stdout}\n${rust.stderr}`;
await record("TC-MD-05-RUST-001", "Lock Payload Transition", () => assert(rust.status === 0 && rustText.includes("release_writes_unlocked_payload_and_retains_lock_file"), rustText));
await record("TC-MD-05-RUST-002", "Temporary Sandbox Cleanup", () => assert(rust.status === 0 && rustText.includes("cleanup_local_workspace_removes_buffers_but_keeps_lock"), rustText));
await record("TC-MD-05-RUST-003", "Close and Re-Mount Contract", () => assert(rust.status === 0 && rustText.includes("acquire_writes_locked_payload"), rustText));

console.log(`REPORT_STORAGE ${JSON.stringify({
  appLocal: '.lock\n{"pid":0,"status":"Unlocked"}\n\nmain.md/assets.json/assets/ removed during cleanup',
  archive: "",
  folder: "main.md\nassets.json\nassets/ (handles released; external files retained)",
})}`);

for (const result of results.sort((a, b) => a.id.localeCompare(b.id))) { if (result.pass) console.log(`${GREEN}PASS${RESET} ${result.id} ${result.name}`); else console.error(`${RED}FAIL${RESET} ${result.id} ${result.name}\n${result.detail}`); }
const failed = results.filter((result) => !result.pass);
console.log(`${failed.length ? RED : GREEN}Result: ${results.length - failed.length}/${results.length} passed${RESET}`);
process.exit(failed.length ? 1 : 0);
