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
  await page.locator(".BootScreen").waitFor();
  const output = { finalUrl: page.url(), bootScreenCount: await page.locator(".BootScreen").count(), errors };
  trace("OUTPUT", output);
  if (!output.finalUrl.endsWith("/select") || output.bootScreenCount !== 1 || output.errors.length > 0) {
    throw new Error(`Guard failed: ${JSON.stringify(output)}`);
  }
  console.log(`${GREEN}PASS${RESET} TC-MD-01-GUARD-001 Unauthorized Direct Navigation`);
  for (const [width, height, theme] of [[1280, 800, "classic"], [360, 500, "classic"], [1280, 800, "sand"], [360, 500, "sand"]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((pattern) => localStorage.setItem("hasm_theme_preference", pattern), theme);
    await page.goto(`${url}/editor`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Open a workspace", exact: true }).waitFor();
    const layout = await page.locator(".BootScreen").evaluate((screen) => {
      const panel = screen.querySelector(".BootScreen_Panel");
      const buttons = [...screen.querySelectorAll(".BootScreen_Actions > button")];
      return {
        panelWidth: panel.getBoundingClientRect().width,
        overflow: screen.scrollWidth > screen.clientWidth,
        stacked: buttons.every((button) => Math.abs(button.getBoundingClientRect().width - buttons[0].getBoundingClientRect().width) < 1),
        menuInside: document.querySelector(".Menu_Toggle").getBoundingClientRect().right <= innerWidth,
      };
    });
    if (layout.panelWidth > 620 || layout.overflow || !layout.stacked || !layout.menuInside) {
      throw new Error(`Selection layout failed at ${width}x${height} (${theme}): ${JSON.stringify(layout)}`);
    }
    await page.getByRole("button", { name: "Open Demo Workspace", exact: true }).scrollIntoViewIfNeeded();
    if (!await page.getByRole("button", { name: "Open Demo Workspace", exact: true }).isVisible()) {
      throw new Error(`Selection actions are inaccessible at ${width}x${height}`);
    }
  }
  console.log(`${GREEN}PASS${RESET} TC-MD-01-DESIGN-001 Responsive HASM workspace selection`);

  for (const scenario of [
    { button: "Open .hasmmd archive", path: "C:\\fixtures\\sample.hasmmd", command: "open_archive_workspace", argument: "archive_path", targetType: "Archive" },
    { button: "Open workspace folder", path: "C:\\fixtures\\folder", command: "open_folder_workspace", argument: "folder_path", targetType: "Folder" },
    { button: "Create new workspace", command: "create_new_package", targetType: "Unbound", delay: true },
    { button: "Open workspace folder", path: null, cancel: true },
    { button: "Open .hasmmd archive", path: "C:\\fixtures\\bad.hasmmd", command: "open_archive_workspace", fail: true },
  ]) {
    const ipcPage = await browser.newPage({ viewport: { width: 360, height: 500 } });
    await ipcPage.addInitScript((fixture) => {
      window.__workspaceCalls = [];
      window.__TAURI_INTERNALS__ = {
        transformCallback: () => 1,
        invoke: async (name, args) => {
          window.__workspaceCalls.push({ name, args });
          if (name === "plugin:dialog|open") return fixture.path;
          if (name === fixture.command) {
            if (fixture.fail) throw new Error("Workspace fixture failed");
            if (fixture.delay) await new Promise((resolve) => { window.__releaseWorkspace = resolve; });
            return {
              uuid: "selection-fixture",
              targetType: fixture.targetType,
              targetPath: fixture.path ?? null,
              rawContent: "# Selection fixture",
              manifest: { version: "1", assets: {} },
              missingAssets: [],
              warnings: [],
            };
          }
          if (name === "get_app_theme_config") return "Dark";
          return null;
        },
      };
    }, scenario);
    await ipcPage.goto(`${url}/select`, { waitUntil: "networkidle" });
    await ipcPage.getByRole("button", { name: scenario.button, exact: true }).click();
    if (scenario.delay) {
      await ipcPage.getByRole("heading", { name: "Opening workspace", exact: true }).waitFor();
      await ipcPage.evaluate(() => window.__releaseWorkspace());
    }
    if (scenario.cancel) {
      await ipcPage.getByRole("heading", { name: "Open a workspace", exact: true }).waitFor();
    } else if (scenario.fail) {
      await ipcPage.getByRole("heading", { name: "Workspace could not be opened", exact: true }).waitFor();
      await ipcPage.getByText("Error: Workspace fixture failed").waitFor();
    } else {
      await ipcPage.getByRole("textbox", { name: "Markdown editor" }).waitFor();
    }
    const calls = await ipcPage.evaluate(() => window.__workspaceCalls);
    const dialog = calls.find(({ name }) => name === "plugin:dialog|open");
    const opened = calls.find(({ name }) => name === scenario.command);
    if (scenario.path !== undefined && (!dialog || dialog.args.options.directory !== (scenario.button === "Open workspace folder"))) {
      throw new Error(`Incorrect selection dialog: ${JSON.stringify({ scenario, calls })}`);
    }
    if (scenario.cancel ? calls.some(({ name }) => name === "open_folder_workspace") :
      (!opened || (scenario.argument && opened.args[scenario.argument] !== scenario.path))) {
      throw new Error(`Incorrect workspace IPC: ${JSON.stringify({ scenario, calls })}`);
    }
    await ipcPage.close();
  }
  console.log(`${GREEN}PASS${RESET} TC-MD-01-DESIGN-002 Workspace selection IPC, cancellation and failure`);
  await page.getByRole("button", { name: "Open Tutorial", exact: true }).click();
  await page.getByRole("heading", { name: "Workspace tutorial", exact: true }).waitFor();
  if (!page.url().endsWith("/tutorial")) {
    throw new Error(`Tutorial navigation failed: ${page.url()}`);
  }
  const tutorialDialog = page.getByRole("dialog", { name: "HASM Markdown tutorial" });
  await tutorialDialog.waitFor();
  await tutorialDialog.locator(".modal-title").filter({ hasText: "Start with a heading" }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await tutorialDialog.locator(".modal-title").filter({ hasText: "Add supporting text" }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await tutorialDialog.locator(".modal-title").filter({ hasText: "Link an asset" }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await tutorialDialog.locator(".modal-title").filter({ hasText: "Review and save" }).waitFor();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  if (!page.url().endsWith("/select")) {
    throw new Error(`Tutorial return navigation failed: ${page.url()}`);
  }
  console.log(`${GREEN}PASS${RESET} TC-MD-01-TUTORIAL-001 Step-by-step Markdown tutorial`);
  await page.evaluate(() => {
    localStorage.setItem("hasm_view_mode", "editor");
    localStorage.setItem("hasm_theme_preference", "classic");
  });
  await page.setViewportSize({ width: 360, height: 500 });
  await page.goto(`${url}/editor`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Demo Workspace", exact: true }).click();
  await page.locator(".HASM_Markdown_Editor").waitFor();
  if (!page.url().endsWith("/editor")) {
    throw new Error(`Demo workspace navigation failed: ${page.url()}`);
  }
  await page.getByText("HASM Markdown", { exact: true }).first().waitFor();
  const demoDialog = (name) => page.getByRole("dialog", { name, exact: true });
  await demoDialog("Write Markdown").waitFor();
  const contrast = await demoDialog("Write Markdown").evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color) => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map((value) => Number(value) / 255);
      const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  if (contrast < 4.5) throw new Error(`Demo tour text contrast is below 4.5: ${contrast}`);
  if (!await page.locator(".HASM_Markdown_Editor_split").isVisible()) throw new Error("Demo tour did not temporarily show split view");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await demoDialog("Review the preview").waitFor();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await demoDialog("Write Markdown").waitFor();
  for (const title of ["Review the preview", "Insert assets", "Workspace menu"]) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const dialog = demoDialog(title);
    await dialog.waitFor();
    const bounds = await dialog.boundingBox();
    if (!bounds || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > 360 || bounds.y + bounds.height > 500) {
      throw new Error(`Tour "${title}" overflows the narrow viewport: ${JSON.stringify(bounds)}`);
    }
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await demoDialog("Workspace menu").waitFor({ state: "hidden" });
  if (!await page.locator(".HASM_Markdown_Editor_editor").isVisible()) throw new Error("Tour changed the saved view mode");
  await page.getByRole("button", { name: "Open workspace menu" }).click();
  await page.getByRole("button", { name: "Replay tour", exact: true }).click();
  await demoDialog("Write Markdown").waitFor();
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await demoDialog("Write Markdown").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Open workspace menu" }).click();
  await page.getByRole("button", { name: "Replay tour", exact: true }).click();
  await demoDialog("Write Markdown").waitFor();
  await page.keyboard.press("Escape");
  await demoDialog("Write Markdown").waitFor({ state: "hidden" });
  if (await page.evaluate(() => localStorage.getItem("hasm_view_mode")) !== "editor") throw new Error("Tour persisted a different view mode");
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  console.log(`${GREEN}PASS${RESET} TC-MD-01-TOUR-001 Demo tour navigation, replay and narrow dark theme`);
  await page.evaluate(() => localStorage.setItem("hasm_view_mode", "split"));
  await page.goto(`${url}/?eval=md02`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Markdown editor" }).waitFor();
  await page.getByRole("button", { name: "Open workspace menu" }).click();
  if (await page.getByRole("button", { name: "Replay tour" }).count() || await page.locator(".DemoTour").count()) {
    throw new Error("Demo tour appeared for a non-demo workspace");
  }
  console.log(`${GREEN}PASS${RESET} TC-MD-01-TOUR-002 Non-demo workspace does not show tour`);
  await browser.close();
} finally {
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
  else server.kill("SIGTERM");
}
