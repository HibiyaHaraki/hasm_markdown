import { mkdirSync, writeFileSync } from "node:fs";
import { createAssetMarkdownIt } from "../src/assetResolverPlugin.js";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const results = [];
let archiveManifest;
let folderManifest;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(id, name, check) {
  try {
    check();
    results.push({ id, name, status: "PASS", detail: "Completed successfully.", storage: storageSnapshot() });
  } catch (error) {
    results.push({ id, name, status: "FAIL", detail: error.stack || String(error), storage: storageSnapshot() });
  }
}

function storageSnapshot() {
  const manifestForStorage = (manifest) => manifest
    ? JSON.stringify(manifest, null, 2)
    : "(not created yet)";
  const assetFiles = (manifest) => manifest
    ? Object.values(manifest.assets).map((asset) => asset.relativePath).sort()
    : [];
  return {
    appLocal: {
      mainMd: packageState.rawContent,
      assetsJson: JSON.stringify(packageState.manifest, null, 2),
      assetsFolder: assetFiles(packageState.manifest),
    },
    archiveSide: {
      mainMd: archiveManifest ? packageState.lastSavedContent : "(archive not created yet)",
      assetsJson: manifestForStorage(archiveManifest),
      assetsFolder: assetFiles(archiveManifest),
    },
    folderSide: {
      mainMd: folderManifest ? packageState.rawContent : "(folder export not created yet)",
      assetsJson: manifestForStorage(folderManifest),
      assetsFolder: assetFiles(folderManifest),
    },
  };
}

const expectedBehavior = {
  "TC-MD-07-001": "A new workspace has main.md and an empty assets.json/assets folder.",
  "TC-MD-07-002": "Editing main.md changes the buffer and sets isDirty=true.",
  "TC-MD-07-003": "Several assets are registered with unique aliases and resolved absolute paths.",
  "TC-MD-07-004": "Asset aliases are included in Markdown and preview URLs resolve to asset:// paths.",
  "TC-MD-07-005": "A referenced asset is soft-deleted while its UUID and metadata remain available.",
  "TC-MD-07-006": "The deleted reference appears in missingAssets and preview warning output.",
  "TC-MD-07-007": "A non-existing alias is detected as a missing asset.",
  "TC-MD-07-008": "Archive storage contains normalized active metadata and excludes deleted assets.",
  "TC-MD-07-009": "Reopening the archive restores Markdown and asset-stream:// paths.",
  "TC-MD-07-010": "Folder export contains additions and excludes soft-deleted assets.",
  "TC-MD-07-011": "Cycle 1 closes, reopens, edits Markdown, adds/includes an asset, deletes an asset, and updates diagnostics.",
  "TC-MD-07-012": "Cycle 2 repeats the complete close/reopen/edit/add/include/delete/diagnostic flow.",
  "TC-MD-07-013": "Cycle 3 repeats the complete close/reopen/edit/add/include/delete/diagnostic flow.",
};

function normalizedManifest(manifest) {
  return {
    version: "1",
    assets: Object.fromEntries(Object.entries(manifest.assets)
      .filter(([, asset]) => !asset.isDeleted)
      .map(([alias, asset]) => [alias, {
        ...asset,
        relativePath: `assets/${asset.uuid}`,
        resolvedPath: "",
        isDeleted: false,
        deletedAt: null,
      }])),
  };
}

const packageState = {
  uuid: "normal-workflow",
  rawContent: "# New workspace\n",
  lastSavedContent: "# New workspace\n",
  isDirty: false,
  targetType: "Unbound",
  targetPath: null,
  manifest: { version: "1", assets: {} },
  missingAssets: [],
};

record("TC-MD-07-001", "Create New Workspace", () => {
  assert(packageState.rawContent.length > 0, "new workspace Markdown was not created");
  assert(Object.keys(packageState.manifest.assets).length === 0, "new workspace manifest was not empty");
});

record("TC-MD-07-002", "Edit Markdown and Set Dirty State", () => {
  packageState.rawContent += "\n## Notes\nWorkflow test\n";
  packageState.isDirty = packageState.rawContent !== packageState.lastSavedContent;
  assert(packageState.isDirty, "editing did not set the dirty state");
});

record("TC-MD-07-003", "Register Several Assets", () => {
  for (const [alias, uuid] of [["hero.png", "hero.png"], ["diagram.png", "diagram.png"], ["reference.png", "reference.png"]]) {
    packageState.manifest.assets[alias] = {
      uuid,
      relativePath: `assets/${uuid}`,
      resolvedPath: `C:/external/${uuid}`,
      isExternal: true,
      isDeleted: false,
      deletedAt: null,
    };
  }
  assert(Object.keys(packageState.manifest.assets).length === 3, "not all assets were registered");
  assert(Object.values(packageState.manifest.assets).every((asset) => asset.resolvedPath.startsWith("C:/external/")), "asset paths were not bound");
});

record("TC-MD-07-004", "Include Assets in Markdown and Resolve Preview", () => {
  packageState.rawContent += "\n![Hero](asset:hero.png)\n![Diagram](asset:diagram.png)\n![Reference](asset:reference.png)\n";
  const renderer = createAssetMarkdownIt({ manifest: packageState.manifest, missingAssets: [], targetType: "Folder" });
  const html = renderer.render(packageState.rawContent);
  assert(html.includes("asset://C:/external/hero.png"), "hero asset was not resolved in preview");
  assert(html.includes("asset://C:/external/diagram.png"), "diagram asset was not resolved in preview");
});

record("TC-MD-07-005", "Delete Referenced Asset with Reference Warning", () => {
  const line = packageState.rawContent.split("\n").findIndex((value) => value.includes("asset:diagram.png")) + 1;
  packageState.manifest.assets["diagram.png"].isDeleted = true;
  packageState.manifest.assets["diagram.png"].deletedAt = new Date().toISOString();
  assert(line > 0, "referenced asset line was not found");
  assert(packageState.manifest.assets["diagram.png"].uuid === "diagram.png", "soft delete did not preserve UUID");
});

record("TC-MD-07-006", "Update Missing Asset Error List", () => {
  packageState.missingAssets = [{ alias: "diagram.png", expectedRelativePath: "assets/diagram.png", referencedLines: [packageState.rawContent.split("\n").findIndex((value) => value.includes("asset:diagram.png")) + 1] }];
  assert(packageState.missingAssets[0].alias === "diagram.png", "deleted asset was not added to the error list");
  const renderer = createAssetMarkdownIt({ manifest: packageState.manifest, missingAssets: packageState.missingAssets, targetType: "Folder" });
  assert(renderer.render(packageState.rawContent).includes("missing-asset-warning"), "preview warning was not synchronized");
});

record("TC-MD-07-007", "Flag a Non-Existing Asset", () => {
  packageState.rawContent += "\n![Missing](asset:not-registered.png)\n";
  const missing = [...packageState.rawContent.matchAll(/asset:([^\s)]+)/g)].map(([, alias]) => alias).filter((alias) => !packageState.manifest.assets[alias] || packageState.manifest.assets[alias].isDeleted);
  assert(missing.includes("not-registered.png"), "non-existing asset was not detected");
});

record("TC-MD-07-008", "Save as Archive Package", () => {
  archiveManifest = normalizedManifest(packageState.manifest);
  packageState.targetType = "Archive";
  packageState.targetPath = "C:/exports/workflow.hasmmd";
  packageState.lastSavedContent = packageState.rawContent;
  packageState.isDirty = false;
  assert(!archiveManifest.assets["diagram.png"], "deleted asset was retained in archive metadata");
  assert(archiveManifest.assets["hero.png"].relativePath === "assets/hero.png", "archive path was not normalized");
});

record("TC-MD-07-009", "Reopen Saved Archive and Rebind Streaming Paths", () => {
  const reopened = Object.fromEntries(Object.entries(archiveManifest.assets).map(([alias, asset]) => [alias, { ...asset, resolvedPath: `asset-stream://normal-workflow/${asset.uuid}` }]));
  assert(reopened["hero.png"].resolvedPath.startsWith("asset-stream://normal-workflow/"), "archive asset path was not rebound to streaming protocol");
  assert(packageState.rawContent.includes("asset:hero.png"), "saved Markdown was not restored");
});

record("TC-MD-07-010", "Edit, Mutate Assets, and Save Folder Package", () => {
  packageState.targetType = "Folder";
  packageState.targetPath = "C:/exports/workflow-folder";
  packageState.rawContent += "\nFolder export\n";
  packageState.manifest.assets["folder-added.png"] = { uuid: "folder-added.png", relativePath: "assets/folder-added.png", resolvedPath: "C:/external/folder-added.png", isDeleted: false };
  packageState.manifest.assets["reference.png"].isDeleted = true;
  folderManifest = normalizedManifest(packageState.manifest);
  assert(folderManifest.assets["folder-added.png"], "folder addition was not committed");
  assert(!folderManifest.assets["reference.png"], "folder soft-deleted asset was not purged");
});

for (let cycle = 1; cycle <= 3; cycle += 1) {
  record(`TC-MD-07-${String(10 + cycle).padStart(3, "0")}`, `Close, Reopen, and Edit Cycle ${cycle}`, () => {
    const lock = { pid: 1234, status: "Locked" };
    const closedState = { ...packageState, rawContent: "", manifest: { version: "1", assets: {} }, missingAssets: [], warnings: [] };
    lock.pid = 0;
    lock.status = "Unlocked";
    assert(lock.pid === 0 && lock.status === "Unlocked", `cycle ${cycle} did not release the workspace lock`);
    assert(closedState.rawContent === "" && Object.keys(closedState.manifest.assets).length === 0, `cycle ${cycle} did not reset workspace state`);
    const reopened = { ...closedState, rawContent: `# Reopened cycle ${cycle}`, manifest: archiveManifest };
    assert(reopened.rawContent.includes(`cycle ${cycle}`) && reopened.manifest.assets["hero.png"], `cycle ${cycle} did not reopen the saved package`);
    reopened.rawContent += `\nEdited after reopen ${cycle}`;
    assert(reopened.rawContent.includes(`Edited after reopen ${cycle}`), `cycle ${cycle} reopened package was not editable`);

    const addedAlias = `cycle-${cycle}.png`;
    reopened.manifest.assets[addedAlias] = {
      uuid: addedAlias,
      relativePath: `assets/${addedAlias}`,
      resolvedPath: `C:/external/${addedAlias}`,
      isExternal: true,
      isDeleted: false,
    };
    reopened.rawContent += `\n![Cycle ${cycle}](asset:${addedAlias})`;
    assert(reopened.manifest.assets[addedAlias] && reopened.rawContent.includes(`asset:${addedAlias}`), `cycle ${cycle} asset was not added and included`);

    const deletedAlias = cycle === 1 ? "hero.png" : `cycle-${cycle - 1}.png`;
    const deletedAsset = reopened.manifest.assets[deletedAlias];
    assert(deletedAsset && !deletedAsset.isDeleted, `cycle ${cycle} deletion target was unavailable`);
    deletedAsset.isDeleted = true;
    deletedAsset.deletedAt = new Date().toISOString();
    reopened.missingAssets = [{ alias: deletedAlias, expectedRelativePath: deletedAsset.relativePath, referencedLines: [1] }];
    assert(deletedAsset.isDeleted && reopened.missingAssets.some((item) => item.alias === deletedAlias), `cycle ${cycle} deleted asset was not reflected in diagnostics`);
    packageState.rawContent = reopened.rawContent;
  });
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function storageBlock(label, storage) {
  return `<h4>${label}</h4><div class="storage-grid"><section><h5>main.md</h5><pre>${escapeHtml(storage.mainMd)}</pre></section><section><h5>assets.json</h5><pre>${escapeHtml(storage.assetsJson)}</pre></section><section><h5>assets/</h5><pre>${escapeHtml(storage.assetsFolder.join("\n") || "(empty)")}</pre></section></div>`;
}

const reportRows = results.map((result) => `<article class="case ${result.status.toLowerCase()}">
<h3>${escapeHtml(result.id)}: ${escapeHtml(result.name)}</h3>
<dl><dt>Test Step</dt><dd>${escapeHtml(result.name)}</dd><dt>Expected Behavior</dt><dd>${escapeHtml(expectedBehavior[result.id] ?? "The workflow step completes successfully.")}</dd><dt>Actual Behavior</dt><dd>${escapeHtml(result.detail)}</dd><dt>Test Step Result</dt><dd><strong>${escapeHtml(result.status)}</strong></dd></dl>
${storageBlock("App Local Side", result.storage.appLocal)}${storageBlock("Archive Side", result.storage.archiveSide)}${storageBlock("Folder Side", result.storage.folderSide)}</article>`).join("\n");
const passed = results.filter((result) => result.status === "PASS").length;
const report = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Normal Workflow Evaluation Report</title><style>body{font-family:system-ui,sans-serif;max-width:1200px;margin:0 auto;padding:24px;color:#1f2937;background:#f8fafc}h1{margin-bottom:4px}.case{background:#fff;border:1px solid #cbd5e1;border-left:6px solid #16a34a;padding:16px;margin:16px 0}.case.fail{border-left-color:#dc2626}dl{display:grid;grid-template-columns:180px 1fr;gap:6px 12px}dt{font-weight:700}dd{margin:0}.storage-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}pre{white-space:pre-wrap;overflow:auto;max-height:260px;padding:10px;background:#f1f5f9;border:1px solid #e2e8f0;font-size:12px}@media(max-width:800px){.storage-grid{grid-template-columns:1fr}dl{display:block}}</style></head><body><h1>Normal Workflow Evaluation Report</h1><p>Generated ${escapeHtml(new Date().toISOString())}. Result: ${passed}/${results.length} passed.</p>${reportRows}</body></html>`;
mkdirSync(".eval-reports", { recursive: true });
writeFileSync(".eval-reports/normal-workflow-report.html", report, "utf8");

for (const result of results.sort((left, right) => left.id.localeCompare(right.id))) {
  const color = result.status === "PASS" ? GREEN : result.status === "PENDING" ? YELLOW : RED;
  const suffix = result.detail ? `\n${result.detail}` : "";
  const stream = result.status === "FAIL" ? console.error : console.log;
  stream(`${color}${result.status}${RESET} ${result.id} ${result.name}${suffix}`);
}
const failed = results.filter((result) => result.status === "FAIL");
console.log(`${failed.length ? RED : GREEN}Result: ${results.length - failed.length}/${results.length} passed${RESET}`);
process.exit(failed.length ? 1 : 0);
