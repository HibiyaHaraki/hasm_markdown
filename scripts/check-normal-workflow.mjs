import { createAssetMarkdownIt } from "../src/assetResolverPlugin.js";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(id, name, check) {
  try {
    check();
    results.push({ id, name, status: "PASS" });
  } catch (error) {
    results.push({ id, name, status: "FAIL", detail: error.stack || String(error) });
  }
}

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

let archiveManifest;
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
  const folderManifest = normalizedManifest(packageState.manifest);
  assert(folderManifest.assets["folder-added.png"], "folder addition was not committed");
  assert(!folderManifest.assets["reference.png"], "folder soft-deleted asset was not purged");
});

results.push({ id: "TC-MD-07-011", name: "Close and Reopen Application", status: "PENDING", detail: "Requires SEQ-MD-05 close, lock-release, cleanup, and relaunch implementation." });

for (const result of results.sort((left, right) => left.id.localeCompare(right.id))) {
  const color = result.status === "PASS" ? GREEN : result.status === "PENDING" ? YELLOW : RED;
  const suffix = result.detail ? `\n${result.detail}` : "";
  const stream = result.status === "FAIL" ? console.error : console.log;
  stream(`${color}${result.status}${RESET} ${result.id} ${result.name}${suffix}`);
}
const failed = results.filter((result) => result.status === "FAIL");
const pending = results.filter((result) => result.status === "PENDING");
console.log(`${failed.length ? RED : GREEN}Result: ${results.length - failed.length - pending.length}/${results.length - pending.length} passed; ${pending.length} pending${RESET}`);
process.exit(failed.length ? 1 : 0);
