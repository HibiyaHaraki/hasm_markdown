// ###################################################
// File Name : sync-logo.mjs
// Purpose : Sync generated hasm_logo submodule assets into the app.
// Description : Copies the hasm_markdown logo variants into src/assets and
//               public/, then regenerates the Tauri desktop icon set from the
//               new favicon artwork. Run after regenerating hasm_logo outputs.
// ###################################################

import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const LOGO_SOURCE_DIR = path.join(REPO_ROOT, "hasm_logo", "logo", "hasm_markdown");
const LOGO_ASSETS_DIR = path.join(REPO_ROOT, "src", "assets", "logo");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");
const TAURI_ICONS_DIR = path.join(REPO_ROOT, "src-tauri", "icons");

const FAVICON_SOURCE = path.join(LOGO_SOURCE_DIR, "hasm_markdown_favicon.png");
const FAVICON_TARGET = path.join(PUBLIC_DIR, "favicon.png");
// Marks which favicon content the current src-tauri/icons/* set was generated from.
const ICON_SOURCE_HASH_FILE = path.join(TAURI_ICONS_DIR, ".favicon-source-hash");

const LOGO_VARIANTS = [
  "hasm_markdown_logo_transparent.png",
  "hasm_markdown_logo_dark_bg.png",
  "hasm_markdown_logo_light_bg.png",
  "hasm_markdown_favicon.png",
];

// Icon variants that "tauri icon" also emits for mobile targets, unused by this desktop-only app.
const UNUSED_ICON_ARTIFACTS = ["android", "ios", "64x64.png"];

function hashFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function copyLogoAssets() {
  mkdirSync(LOGO_ASSETS_DIR, { recursive: true });
  for (const fileName of LOGO_VARIANTS) {
    copyFileSync(path.join(LOGO_SOURCE_DIR, fileName), path.join(LOGO_ASSETS_DIR, fileName));
  }
  copyFileSync(FAVICON_SOURCE, FAVICON_TARGET);
}

function regenerateTauriIcons() {
  const sourceHash = hashFile(FAVICON_SOURCE);
  const previousHash = existsSync(ICON_SOURCE_HASH_FILE)
    ? readFileSync(ICON_SOURCE_HASH_FILE, "utf8").trim()
    : null;

  if (sourceHash === previousHash) {
    console.log("src-tauri/icons already up to date with hasm_markdown favicon; skipping regeneration.");
    return;
  }

  // Fixed, repo-controlled paths only; quoting is safe since no external input reaches this command.
  const command = `npx tauri icon "${FAVICON_SOURCE}" -o "${TAURI_ICONS_DIR}"`;
  execSync(command, { cwd: REPO_ROOT, stdio: "inherit" });
  for (const artifact of UNUSED_ICON_ARTIFACTS) {
    const artifactPath = path.join(TAURI_ICONS_DIR, artifact);
    if (existsSync(artifactPath)) {
      rmSync(artifactPath, { recursive: true, force: true });
    }
  }
  writeFileSync(ICON_SOURCE_HASH_FILE, sourceHash);
}

if (!existsSync(LOGO_SOURCE_DIR)) {
  console.error(`hasm_logo submodule outputs not found at ${LOGO_SOURCE_DIR}.`);
  console.error("Generate them first: python hasm_logo/scripts/generate_hasm_markdown_logo.py");
  process.exit(1);
}

copyLogoAssets();
regenerateTauriIcons();
console.log("Synced hasm_markdown logo assets into src/assets, public/, and src-tauri/icons.");
