import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import { chromium } from "playwright";
import { COLOR_PATTERN_OPTIONS, getMarkdownThemeVariables, getPatternById, getThemeVariables } from "../src/hasm_color_pattern/src/index.js";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const url = "http://127.0.0.1:4178";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const results = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
const reportRoot = ".eval-reports";
const reportPath = `${reportRoot}/md-06-evaluation-report.html`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createHtmlReport() {
  mkdirSync(reportRoot, { recursive: true });
  const passed = results.filter((result) => result.pass).length;
  const rows = results
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((result) => {
      const status = result.pass ? "PASS" : "FAIL";
      const detail = result.pass ? "Completed successfully." : result.detail;
      return `<article class="case ${status.toLowerCase()}">
<h2>${escapeHtml(result.id)}: ${escapeHtml(result.name)}</h2>
<dl><dt>Test Step</dt><dd>${escapeHtml(result.name)}</dd><dt>Expected Behavior</dt><dd>Complete the documented SEQ-MD-06 evaluation case successfully.</dd><dt>Actual Behavior</dt><dd>${escapeHtml(detail)}</dd><dt>Test Step Result</dt><dd><strong>${status}</strong></dd></dl>
</article>`;
    })
    .join("\n");
  const report = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MD-06 Evaluation Report</title><style>body{font-family:system-ui,sans-serif;max-width:1200px;margin:auto;padding:24px;color:#1f2937;background:#f8fafc}.summary{padding:16px;background:#fff;border:1px solid #cbd5e1}.case{background:#fff;border:1px solid #cbd5e1;border-left:6px solid #16a34a;padding:16px;margin:16px 0}.case.fail{border-left-color:#dc2626}dl{display:grid;grid-template-columns:180px 1fr;gap:6px 12px}dt{font-weight:700}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:800px){dl{display:block}dt{margin-top:8px}}</style></head><body><h1>MD-06: Global Menu, Save State, and Theme Evaluation Report</h1><section class="summary"><p>Generated ${escapeHtml(new Date().toISOString())}.</p><p>Result: <strong>${passed}/${results.length} passed</strong>.</p></section>${rows}</body></html>`;
  writeFileSync(reportPath, report, "utf8");
  console.log(`REPORT_FILE ${reportPath}`);
}

async function record(id, name, check) {
  try {
    await check();
    results.push({ id, name, pass: true });
  } catch (error) {
    results.push({ id, name, pass: false, detail: error.stack || String(error) });
  }
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

async function openWorkspaceMenu(page) {
  await page.getByRole("button", { name: /open workspace menu/i }).click();
  await page.getByRole("heading", { name: "Workspace menu" }).waitFor();
}

async function openAppearanceMenu(page) {
  await page.getByRole("button", { name: /appearance/i }).click();
  await page.locator("#global-menu-appearance").waitFor();
}

async function openDiagnosticsMenu(page) {
  await page.locator(".Menu_DiagnosticsTrigger").hover();
  await page.locator("#header-diagnostics").waitFor();
}

const vite = spawn(process.platform === "win32" ? "cmd.exe" : npmCommand,
  process.platform === "win32"
    ? ["/d", "/s", "/c", "npm run dev -- --host 127.0.0.1 --port 4178 --strictPort"]
    : ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4178", "--strictPort"],
  { cwd: root, stdio: "ignore" });

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const bootPage = await browser.newPage();
  const bootErrors = [];
  bootPage.on("pageerror", (error) => bootErrors.push(error.message));
  await bootPage.goto(`${url}/editor`, { waitUntil: "networkidle" });

  await record("TC-MD-06-E2E-001", "Global Menu Available During Boot", async () => {
    assert(await bootPage.locator(".Menu").count() === 1, "global menu shell was not rendered on boot page");
    assert(await bootPage.locator(".BootScreen").count() === 1, "boot screen was not rendered");
    assert(await bootPage.getByRole("button", { name: /open workspace menu/i }).count() === 1, "workspace menu trigger was not available on boot page");
    await openWorkspaceMenu(bootPage);
    assert(await bootPage.locator("#global-menu-file").count() === 0 && await bootPage.locator("#global-menu-appearance").count() === 0, "File and Appearance should be collapsed by default");
    await bootPage.getByRole("button", { name: /appearance/i }).click();
    assert(await bootPage.locator(".Menu_AssetsButton").isDisabled(), "workspace asset action was not disabled during boot");
    await bootPage.getByRole("button", { name: /close menu/i }).click();
    assert(bootErrors.length === 0, `boot page errors detected: ${bootErrors.join("; ")}`);
  });

  const themeCalls = [];
  await bootPage.addInitScript(() => {
    window.__md06Calls = [];
      window.__TAURI_INTERNALS__ = {
        transformCallback: (callback) => { window.__md06Callback = callback; return 1; },
        unregisterCallback: () => {},
      invoke: async (command, args) => {
        window.__md06Calls.push({ command, args });
        if (command === "get_launch_target") return null;
        if (command === "get_app_theme_config") return localStorage.getItem("hasm_theme_preference") || "Dark";
        if (command === "update_app_theme_config") return null;
        throw new Error(`unexpected command: ${command}`);
      },
    };
  });
  await bootPage.reload({ waitUntil: "networkidle" });

  await record("TC-MD-06-REACT-001", "Submodule Theme Mapping", async () => {
    await openWorkspaceMenu(bootPage);
    await openAppearanceMenu(bootPage);
    const colorPatternSelect = bootPage.locator(".GlobalMenu select");
    for (const pattern of COLOR_PATTERN_OPTIONS) {
      const patternId = pattern.id;
      await colorPatternSelect.selectOption(patternId);
      const color = await bootPage.locator(".Main").evaluate((element) => getComputedStyle(element).getPropertyValue("--main-color").trim());
      assert(color.toLowerCase() === getPatternById(patternId).colors.mainColor.toLowerCase(), `${patternId} did not use the submodule pattern`);
    }
    await colorPatternSelect.selectOption("high-contrast");
    assert(await bootPage.evaluate(() => localStorage.getItem("hasm_theme_preference")) === "high-contrast", "theme preference was not stored locally");
    const calls = await bootPage.evaluate(() => window.__md06Calls.filter(({ command }) => command === "update_app_theme_config"));
    themeCalls.push(...calls);
    assert(calls.at(-1)?.args.theme === "High-Contrast", "theme preference was not sent to backend");
  });

  await record("TC-MD-06-REACT-002", "High Contrast Warning Variables", async () => {
    const variables = await bootPage.locator(".Main").evaluate((element) => ({
      danger: getComputedStyle(element).getPropertyValue("--theme-danger").trim(),
      warningBackground: getComputedStyle(element).getPropertyValue("--theme-warning-background").trim(),
    }));
    assert(variables.danger === "#ff0000" && variables.warningBackground === "#ffffff", `high contrast warning variables were incorrect: ${JSON.stringify(variables)}`);
  });

  await record("TC-MD-06-E2E-004", "Theme Preference Restored on Boot", async () => {
    await bootPage.reload({ waitUntil: "networkidle" });
    assert(await bootPage.locator("html").getAttribute("data-theme") === "high-contrast", "high-contrast theme was not restored on boot");
    assert(await bootPage.evaluate(() => localStorage.getItem("hasm_theme_preference")) === "high-contrast", "boot restore changed the saved preference");
  });

  await record("TC-MD-06-REACT-004", "Zero Diagnostic State", async () => {
    await openDiagnosticsMenu(bootPage);
    assert((await bootPage.locator("#header-errors-title").textContent()).includes("0"), "boot error count was not zero");
    assert((await bootPage.locator("#header-warnings-title").textContent()).includes("0"), "boot warning count was not zero");
    assert(await bootPage.locator("#header-diagnostics").count() === 1, "header diagnostics panel was not rendered");
  });

  const editorPage = await browser.newPage();
  await editorPage.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => { window.__md06Callback = callback; return 1; },
      unregisterCallback: () => {},
      invoke: async (command) => command === "get_app_theme_config" ? "Dark" : command === "get_launch_target" ? null : null,
    };
  });
  await editorPage.goto(`${url}/?eval=md02`, { waitUntil: "networkidle" });

  await record("TC-MD-06-REACT-005", "Workspace Target Path Tooltip", async () => {
    await editorPage.locator(".Menu_Status").hover();
    assert(await editorPage.getByRole("tooltip").textContent() === "C:/eval/workspace", "status tooltip did not show the active workspace target path");
  });

  await record("TC-MD-06-REACT-009", "Workspace Path and Sync Summary", async () => {
    await openWorkspaceMenu(editorPage);
    assert(await editorPage.locator(".GlobalMenu_WorkspaceSummary").getByText("C:/eval/temporal/eval-md-02", { exact: true }).count() === 1, "temporal local path was not shown");
    assert(await editorPage.locator(".GlobalMenu_WorkspaceSummary").getByText("C:/eval/workspace", { exact: true }).count() === 1, "local folder or archive path was not shown");
    assert(await editorPage.locator(".GlobalMenu_SyncItem").count() === 2, "both synchronization marks were not rendered");
    assert(await editorPage.locator(".GlobalMenu_SyncItem.is-current").count() === 2, "clean Ready workspace did not mark both targets current");
    await editorPage.getByRole("button", { name: /close menu/i }).click();
  });

  await record("TC-MD-06-REACT-006", "Independent Syntax Editor Appearance", async () => {
    await openWorkspaceMenu(editorPage);
    await openAppearanceMenu(editorPage);
    await editorPage.getByRole("button", { name: "Editor dark" }).click();
    const editor = editorPage.locator(".HASM_Markdown_Editor");
    assert(await editor.evaluate((element) => element.classList.contains("EditorColor_dark")), "dark editor appearance was not applied");
    assert(await editor.locator(".MarkdownSyntax_Link").count() >= 1, "Markdown syntax layer did not color an asset link");
    await editorPage.getByRole("button", { name: "Editor light" }).click();
    assert(await editor.evaluate((element) => element.classList.contains("EditorColor_light")), "light editor appearance was not restored");
    await editorPage.getByRole("button", { name: /close menu/i }).click();
  });

  await record("TC-MD-06-REACT-007", "Editor Line Metric Alignment", async () => {
    const metrics = await editorPage.evaluate(() => {
      const readMetrics = (selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return { lineHeight: style.lineHeight, paddingTop: style.paddingTop };
      };
      return {
        input: readMetrics(".MarkdownSyntax_Input"),
        gutter: readMetrics(".HASM_Markdown_Editor_EditorCol_Editor_LineNum"),
      };
    });
    assert(metrics.input.lineHeight === metrics.gutter.lineHeight, `editor line heights diverged: ${JSON.stringify(metrics)}`);
    assert(metrics.input.paddingTop === metrics.gutter.paddingTop, `editor top padding diverged: ${JSON.stringify(metrics)}`);
  });

  await record("TC-MD-06-E2E-002", "Missing Asset Diagnostic Navigation", async () => {
    await openDiagnosticsMenu(editorPage);
    assert(await editorPage.locator("#header-errors-title").textContent().then((text) => text.includes("Errors")), "error list was not rendered");
    assert(await editorPage.getByText("unknown", { exact: true }).count() === 1, "missing asset was not listed");
    const gutterColors = await editorPage.evaluate(() => {
      const gutter = document.querySelector(".HASM_Markdown_Editor_EditorCol_Editor_LineNum");
      const normalLine = gutter.querySelector("span:not(.editor-error-line):not(.editor-warning-line)");
      const errorLine = gutter.querySelector(".editor-error-line");
      return {
        gutterBackground: getComputedStyle(gutter).backgroundColor,
        normalBackground: getComputedStyle(normalLine).backgroundColor,
        errorBackground: getComputedStyle(errorLine).backgroundColor,
        errorColor: getComputedStyle(errorLine).color,
      };
    });
    assert(await editorPage.locator(".HASM_Markdown_Editor_EditorCol_Editor_LineNum .editor-error-line").textContent() === "2", "missing asset line number was not marked as an error");
    assert(gutterColors.normalBackground === gutterColors.gutterBackground, `normal line number did not use main gutter color: ${JSON.stringify(gutterColors)}`);
    assert(gutterColors.errorBackground !== gutterColors.gutterBackground && gutterColors.errorColor !== "", `error line number colors did not override the normal state: ${JSON.stringify(gutterColors)}`);
    await editorPage.getByRole("button", { name: /unknown Missing file/ }).click();
    assert(await editorPage.locator(".GlobalMenu").count() === 0, "diagnostics drawer did not close after selection");
    assert(await editorPage.evaluate(() => window.getSelection()?.toString().length > 0), "editor did not select the missing asset line");
  });

  await record("TC-MD-06-REACT-008", "Editor Enter Inserts One Newline", async () => {
    const editor = editorPage.getByRole("textbox", { name: "Markdown editor" });
    await editor.click();
    await editor.press("Control+A");
    await editor.type("first");
    await editor.press("End");
    await editor.press("Enter");
    await editor.type("second");
    assert(await editor.textContent() === "first\nsecond", `Enter produced unexpected editor content: ${JSON.stringify(await editor.textContent())}`);
  });

  await record("TC-MD-06-REACT-003", "Theme Variable API Contract", () => {
    const variables = getThemeVariables("high-contrast");
    assert(variables["--theme-primary"] === getPatternById("high-contrast").colors.mainColor, "submodule theme variable contract changed");
    assert(getMarkdownThemeVariables("high-contrast")["--main-color"] === getPatternById("high-contrast").colors.mainColor, "submodule markdown theme variable contract changed");
  });

  const autosavePage = await browser.newPage();
  await autosavePage.addInitScript(() => {
    window.__md06AutosaveCalls = [];
    window.__TAURI_INTERNALS__ = {
      transformCallback: (callback) => { window.__md06Callback = callback; return 1; },
      unregisterCallback: () => {},
      invoke: async (command, args) => {
        window.__md06AutosaveCalls.push({ command, args });
        if (command === "get_launch_target") return null;
        if (command === "get_app_theme_config") return "Dark";
        if (command === "save_local_markdown_buffer") return {
          uuid: "eval-md-02",
          targetType: "Folder",
          rawContent: args.content,
          lastSavedContent: args.content,
          isDirty: false,
          manifest: { version: "1", assets: {} },
          missingAssets: [],
          warnings: [],
        };
        throw new Error(`unexpected command: ${command}`);
      },
    };
  });
  await autosavePage.goto(`${url}/?eval=md02&autosave=1`, { waitUntil: "networkidle" });

  await record("TC-MD-06-E2E-003", "Dirty to Autosaved State Transition", async () => {
    const editor = autosavePage.getByRole("textbox", { name: "Markdown editor" });
    await editor.fill("changed for seq-md-06");
    assert((await autosavePage.locator(".Menu_Status").textContent()).includes("Unsaved Changes (*)"), "dirty state was not displayed");
    await autosavePage.locator(".Menu_Status").filter({ hasText: "Autosaved Locally at" }).waitFor();
    const calls = await autosavePage.evaluate(() => window.__md06AutosaveCalls.filter(({ command }) => command === "save_local_markdown_buffer"));
    assert(calls.length === 1, "autosave IPC was not invoked exactly once");
    assert((await autosavePage.locator(".Menu_Status").textContent()).includes("Autosaved Locally at"), "autosaved timestamp was not displayed");
  });

  await autosavePage.close();

  await editorPage.close();
  await bootPage.close();
  await browser.close();
} finally {
  await stop(vite);
}

const rust = await import("node:child_process").then(({ spawnSync }) => spawnSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "commands::tests::", "--", "--nocapture"], { cwd: root, encoding: "utf8" }));
const rustOutput = `${rust.stdout}\n${rust.stderr}`;
await record("TC-MD-06-RUST-001", "Standard Theme Modes Accepted", () => assert(rust.status === 0 && rustOutput.includes("theme_config_accepts_all_standard_modes"), rustOutput));
await record("TC-MD-06-RUST-002", "Unknown Theme Mode Rejected", () => assert(rust.status === 0 && rustOutput.includes("theme_config_rejects_unknown_modes"), rustOutput));
await record("TC-MD-06-RUST-003", "High Contrast AppConfig Serialization", () => assert(rust.status === 0 && rustOutput.includes("high_contrast_config_serializes_accessibility_colors"), rustOutput));

for (const result of results.sort((left, right) => left.id.localeCompare(right.id))) {
  if (result.pass) console.log(`${GREEN}PASS${RESET} ${result.id} ${result.name}`);
  else console.error(`${RED}FAIL${RESET} ${result.id} ${result.name}\n${result.detail}`);
}
const failed = results.filter((result) => !result.pass);
createHtmlReport();
console.log(`${failed.length ? RED : GREEN}Result: ${results.length - failed.length}/${results.length} passed${RESET}`);
process.exit(failed.length ? 1 : 0);
