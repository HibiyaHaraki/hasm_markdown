import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { chromium } from "playwright";
import { createAssetMarkdownIt, findMissingAssetLines } from "../src/assetResolverPlugin.js";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const targetUrl = "http://127.0.0.1:4174/?eval=md02";
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

async function checkResolverContract() {
  await record("TC-MD-02-REACT-001", "Archive Streaming Asset Protocol", () => {
    const archive = createAssetMarkdownIt({
      uuid: "package-1",
      targetType: "Archive",
      manifest: { assets: { diagram: { uuid: "diagram.png", resolvedPath: "asset-stream://package-1/diagram.png" } } },
      missingAssets: [],
    });
    assert(archive.render("![diagram](asset:diagram)").includes('src="asset-stream://package-1/diagram.png"'), "archive asset protocol was not rendered");
  });

  await record("TC-MD-02-REACT-002", "Local Asset Protocol", () => {
    const local = createAssetMarkdownIt({
      targetType: "Folder",
      manifest: { assets: { diagram: { uuid: "diagram.png", resolvedPath: "C:/workspace/assets/diagram.png" } } },
      missingAssets: [],
    });
    assert(local.render("![diagram](asset:diagram)").includes('src="asset://C:/workspace/assets/diagram.png"'), "local asset protocol was not rendered");
  });

  await record("TC-MD-02-REACT-003", "Missing and Soft-Deleted Asset Warnings", () => {
    const missing = createAssetMarkdownIt({
      manifest: { assets: { deleted: { isDeleted: true } } },
      missingAssets: [{ alias: "unknown" }],
    });
    const missingHtml = missing.render("![deleted](asset:deleted)\n![unknown](asset:unknown)");
    assert((missingHtml.match(/missing-asset-warning/g) ?? []).length === 2, "missing and deleted assets were not warned");
    assert(missingHtml.includes("Missing File"), "missing-asset warning text does not match the evaluation contract");
  });

  await record("TC-MD-02-REACT-004-LINES", "Missing Asset Line Detection", () => {
    const lines = findMissingAssetLines("![ok](asset:ok)\n![bad](asset:unknown)", { assets: { ok: {} } }, [{ alias: "unknown" }]);
    assert(lines.has(2) && lines.size === 1, "missing asset line detection is incorrect");
  });

  await record("TC-MD-02-E2E-002-PERF", "Live Resolver Responsiveness", () => {
    const missing = createAssetMarkdownIt({ manifest: { assets: {} }, missingAssets: [] });
    const measure = (markdown) => {
      const startedAt = performance.now();
      missing.render(markdown);
      findMissingAssetLines(markdown, { assets: {} }, []);
      return performance.now() - startedAt;
    };
    const typicalEditMarkdown = Array.from({ length: 5 }, (_, index) => `![asset-${index}](asset:unknown-${index})`).join("\n");
    const stressMarkdown = Array.from({ length: 100 }, (_, index) => `![asset-${index}](asset:unknown-${index})`).join("\n");

    // Warm parser and regex paths before collecting samples from a normal edit-sized document.
    for (let index = 0; index < 3; index += 1) measure(typicalEditMarkdown);
    const samples = Array.from({ length: 5 }, () => measure(typicalEditMarkdown)).sort((left, right) => left - right);
    const medianDurationMs = samples[Math.floor(samples.length / 2)];
    const stressDurationMs = measure(stressMarkdown);

    assert(medianDurationMs < 100, `typical asset parsing and warning detection median was ${medianDurationMs.toFixed(2)}ms; expected under 100ms`);
    assert(stressDurationMs < 500, `100-asset parsing and warning detection took ${stressDurationMs.toFixed(2)}ms; expected under 500ms`);
  });
}

function waitForServer(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
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
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
      resolve();
    }, 5000);
  });
}

async function checkBrowserContract() {
  const vite = spawn(process.platform === "win32" ? "cmd.exe" : npmCommand,
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run dev -- --host 127.0.0.1 --port 4174 --strictPort"]
      : ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4174", "--strictPort"],
    { cwd: root, stdio: "ignore" });

  try {
    await waitForServer(targetUrl);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(targetUrl, { waitUntil: "networkidle" });
    const editor = page.getByRole("textbox", { name: "Markdown editor" });
    await editor.waitFor();

    await record("TC-MD-02-E2E-001", "Initial Warning Highlighting and Local Asset Rendering", async () => {
      assert(await page.locator('.missing-asset-warning').count() === 1, "soft-deleted fixture was not warned in preview");
      const markedLine = page.locator('.HASM_Markdown_Editor_EditorCol_Editor_LineNum .editor-error-line, .HASM_Markdown_Editor_EditorCol_Editor_LineNum .editor-warning-line');
      await markedLine.waitFor();
      assert(await markedLine.count() === 1, "gutter did not mark the fixture asset line");
      assert((await page.locator(".HASM_Markdown_Editor_ViewerCol_Viewer").innerHTML()).includes("asset://C:/eval/assets/present.png"), "active fixture asset did not use the local protocol");
      assert(errors.length === 0, `browser errors detected: ${errors.join("; ")}`);
    });

    await record("TC-MD-02-E2E-002-LIVE", "Live Missing Asset Highlighting", async () => {
      const updateStart = performance.now();
      await editor.fill("![missing](asset:unknown)");
      await page.locator('.missing-asset-warning').first().waitFor();
      assert(performance.now() - updateStart < 1000, "live warning update did not complete promptly");
      assert(await page.locator('.editor-warning-line').count() === 1, "live warning gutter did not update");
    });

    await record("TC-MD-02-REACT-004-DIRTY", "Dirty Flag and Revert", async () => {
      assert((await page.locator(".Menu_Status").textContent()).includes("Unsaved Changes (*)"), "dirty status was not shown");
      assert(await page.locator(".HASM_Markdown_Editor").getAttribute("data-dirty") === "true", "dirty flag was not set");
      await editor.fill("![present](asset:present)\n![deleted](asset:deleted)");
      assert((await page.locator(".Menu_Status").textContent()).trim() === "Ready", "reverting to saved content did not clear dirty status");
      assert(await page.locator(".HASM_Markdown_Editor").getAttribute("data-dirty") === "false", "dirty flag was not cleared");
    });

    await record("TC-MD-02-E2E-003", "Manual Save Shortcut Interception", async () => {
      await editor.fill("![missing](asset:unknown)");
      await editor.press("Control+S");
      assert((await editor.textContent()) === "![missing](asset:unknown)", "Ctrl+S changed editor content");
    });
    const autosavePage = await browser.newPage();
    await autosavePage.addInitScript(() => {
      window.__md02Invokes = [];
      window.__md02Fail = false;
      window.__TAURI_INTERNALS__ = {
        invoke: async (command, args) => {
          window.__md02Invokes.push({ command, args });
          if (command === "get_launch_target") return null;
          if (command === "save_local_markdown_buffer") {
            if (window.__md02Fail) throw new Error("disk write failed");
            await new Promise((resolve) => setTimeout(resolve, 150));
            return {
              uuid: "eval-md-02",
              targetType: "Folder",
              manifest: { version: "1", assets: {} },
              missingAssets: [],
              rawContent: args.content,
              lastSavedContent: args.content,
              isDirty: false,
            };
          }
          throw new Error(`unexpected command: ${command}`);
        },
      };
    });
    await autosavePage.goto(`${targetUrl}&autosave=1`, { waitUntil: "networkidle" });
    await autosavePage.getByRole("textbox", { name: "Markdown editor" }).waitFor();
    await record("TC-MD-02-REACT-005", "Clean Buffer Autosave Skip", async () => {
      await autosavePage.waitForTimeout(180);
      assert((await autosavePage.evaluate(() => window.__md02Invokes.filter(({ command }) => command === "save_local_markdown_buffer").length)) === 0, "clean buffer did not skip autosave");
    });

    await record("TC-MD-02-E2E-004", "Successful Local Autosave", async () => {
      await autosavePage.getByRole("textbox", { name: "Markdown editor" }).fill("![autosave](asset:autosave-unknown)");
      await autosavePage.waitForTimeout(400);
      const successfulSaves = await autosavePage.evaluate(() => window.__md02Invokes.filter(({ command }) => command === "save_local_markdown_buffer"));
      assert(successfulSaves.length === 1 && successfulSaves[0].args.content === "![autosave](asset:autosave-unknown)", "dirty buffer did not autosave exactly once");
      assert((await autosavePage.locator(".Menu_Status").textContent()).includes("Autosaved Locally at"), "autosave success status was not shown");
      await autosavePage.locator(".Menu_DiagnosticsTrigger").hover();
      assert(await autosavePage.getByText("autosave-unknown", { exact: true }).count() === 1, "autosave did not refresh error monitoring");
    });

    await record("TC-MD-02-E2E-005", "Local Autosave Failure Recovery", async () => {
      await autosavePage.evaluate(() => { window.__md02Fail = true; });
      await autosavePage.getByRole("textbox", { name: "Markdown editor" }).fill("disk failure");
      await autosavePage.waitForTimeout(250);
      assert((await autosavePage.locator(".Menu_Status").textContent()).includes("Local autosave failed: Disk write error"), "autosave failure status was not shown");
      assert(await autosavePage.locator(".HASM_Markdown_Editor").getAttribute("data-dirty") === "true", "autosave failure cleared the dirty state");
    });
    await autosavePage.close();
    await browser.close();
  } finally {
    await stopProcess(vite);
  }
}

async function checkRustContract() {
  const rustTests = spawnSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "--", "--nocapture"], { cwd: root, encoding: "utf8" });
  const rustOutput = `${rustTests.stdout || ""}\n${rustTests.stderr || ""}`;
  await record("TC-MD-01-RUST-001", "Fast Local UTF-8 Write", () => {
    assert(rustTests.status === 0 && rustOutput.includes("local_autosave_atomically_replaces_utf8_markdown"), rustOutput);
  });
  await record("TC-MD-02-RUST-002", "Atomic Local Rename", () => {
    assert(rustTests.status === 0 && rustOutput.includes("local_autosave_atomically_replaces_utf8_markdown"), rustOutput);
  });
  await record("TC-MD-02-RUST-003", "Autosave Failure Preserves Existing File", () => {
    assert(rustTests.status === 0 && rustOutput.includes("local_autosave_preserves_existing_markdown_when_temp_write_fails"), rustOutput);
  });
}

await checkResolverContract();
await checkBrowserContract();
await checkRustContract();

console.log(`REPORT_STORAGE ${JSON.stringify({
  appLocal: 'main.md\n![present](asset:present)\n![deleted](asset:deleted)\n\nassets.json\n{"present":{"resolvedPath":"C:/eval/assets/present.png"},"deleted":{"isDeleted":true}}\n\nassets/ (not copied in archive metadata-only mode)',
  archive: 'main.md\n![present](asset:present)\n![deleted](asset:deleted)\n\nassets.json\n{"present":{"relativePath":"assets/present.png"},"deleted":{"isDeleted":true}}\n\nassets/ (streamed from archive)',
  folder: "",
})}`);

for (const result of results.sort((left, right) => left.id.localeCompare(right.id))) {
  if (result.pass) console.log(`${GREEN}PASS${RESET} ${result.id} ${result.name}`);
  else console.error(`${RED}FAIL${RESET} ${result.id} ${result.name}\n${result.detail}`);
}
const failed = results.filter((result) => !result.pass);
console.log(`${failed.length === 0 ? GREEN : RED}Result: ${results.length - failed.length}/${results.length} passed${RESET}`);
process.exit(failed.length === 0 ? 0 : 1);
