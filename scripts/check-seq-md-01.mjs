import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createLogger } from "../src/hasm_logger/src/react/logger.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const root = resolve(process.cwd());
const binary = join(root, "src-tauri", "target", "debug", process.platform === "win32" ? "hasm_markdown.exe" : "hasm_markdown");
const fixtureRoot = mkdtempSync(join(tmpdir(), "hasm-seq-md-01-"));
const results = [];
const testLogger = createLogger("seq-md-01-test");

function trace(testId, step, data) {
  // Trace-level test detail is filtered by hasm_logger until VITE_LOG_LEVEL=trace.
  testLogger.trace(`[${testId}][${step}]`, data);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(value);
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, nameBuffer, data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBuffer.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBuffer);
    offset += header.length + nameBuffer.length + data.length;
  }
  const localBuffer = Buffer.concat(local);
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(localBuffer.length, 16);
  return Buffer.concat([localBuffer, centralBuffer, end]);
}

function run(args) {
  const input = { command: binary, args };
  trace("CLI", "INPUT", input);
  const result = spawnSync(binary, args, { cwd: root, encoding: "utf8" });
  trace("CLI", "OUTPUT", {
    status: result.status,
    stdout: String(result.stdout || "").slice(0, 1000),
    stderr: String(result.stderr || "").slice(0, 1000),
  });
  return result;
}

function record(id, name, check) {
  trace(id, "START", { name });
  try {
    check();
    trace(id, "ASSERT", { result: "PASS" });
    results.push({ id, name, pass: true, detail: "" });
  } catch (error) {
    trace(id, "ASSERT", { result: "FAIL", detail: error.stack || String(error) });
    results.push({ id, name, pass: false, detail: error.stack || String(error) });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const folder = join(fixtureRoot, "workspace");
mkdirSync(join(folder, "assets"), { recursive: true });
writeFileSync(join(folder, "main.md"), "# Preview\n\n![diagram](asset:diagram)\n");
writeFileSync(join(folder, "assets.json"), JSON.stringify({ version: "1", assets: { diagram: { uuid: "diagram.png", relativePath: "assets/diagram.png" } } }));
writeFileSync(join(folder, "assets", "diagram.png"), "fixture");

const validArchive = join(fixtureRoot, "valid.hasmmd");
writeFileSync(validArchive, zip([
  ["main.md", "# Archive\n\n![readme](asset:readme)\n"],
  ["assets.json", JSON.stringify({
    version: "1",
    assets: {
      readme: {
        uuid: "README.txt",
        relativePath: "assets/README.txt",
      },
    },
  })],
  ["assets/README.txt", "This asset is included in the valid HASM Markdown package.\n"],
]));
const corruptArchive = join(fixtureRoot, "corrupt.hasmmd");
writeFileSync(corruptArchive, zip([["assets.json", JSON.stringify({ version: "1", assets: {} })]]));

const build = spawnSync("cargo", ["build", "--manifest-path", "src-tauri/Cargo.toml"], { cwd: root, encoding: "utf8" });
if (build.status !== 0) {
  console.error(`${RED}BUILD FAIL${RESET}\n${build.stdout}\n${build.stderr}`);
  rmSync(fixtureRoot, { recursive: true, force: true });
  process.exit(1);
}

record("TC-MD-01-CLI-001", "Valid Package Verification", () => {
  const result = run(["verify", validArchive]);
  assert(result.status === 0, `expected exit 0, got ${result.status}\n${result.stderr}`);
  assert(result.stdout.includes("Package verification successful"), "success message missing");
});
record("TC-MD-01-CLI-002", "JSON Format Error Verification", () => {
  const result = run(["verify", corruptArchive, "--json"]);
  const payload = JSON.parse(result.stdout);
  assert(result.status === 1 && payload.status === "Invalid", `unexpected result: ${result.stdout}\n${result.stderr}`);
});
record("TC-MD-01-CLI-003", "Folder Absolute Path Preview Stream", () => {
  const result = run(["preview", folder]);
  assert(result.status === 0, result.stderr);
  const expectedPath = join(folder, "assets", "diagram.png").replaceAll("\\", "/");
  assert(result.stdout.replaceAll("\\", "/").includes(expectedPath), `absolute asset path missing; stdout=${JSON.stringify(result.stdout)}`);
  assert(!result.stdout.includes("asset:diagram"), "asset alias was not resolved");
});
record("TC-MD-01-CLI-008", "Valid Folder Package Verification", () => {
  const result = run(["verify", folder]);
  assert(result.status === 0, `expected exit 0, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert(result.stdout.includes("Package verification successful"), "folder verification success message missing");
});
record("TC-MD-01-CLI-004", "Preview Rejection on ZIP Archive", () => {
  const result = run(["preview", validArchive]);
  assert(result.status === 1 && result.stderr.includes("Folder Type"), `unexpected result: ${result.stdout}\n${result.stderr}`);
});
record("TC-MD-01-CLI-006", "Non-Existent Target Path", () => {
  const result = run(["verify", join(fixtureRoot, "missing.hasmmd")]);
  assert(result.status === 1 && result.stderr.includes("Target path does not exist or is inaccessible"), `explicit error missing: ${result.stderr}`);
});
record("TC-MD-01-CLI-007", "Non-Existent Folder Preview", () => {
  const result = run(["preview", join(fixtureRoot, "missing-folder")]);
  assert(result.status === 1 && result.stderr.includes("Target folder directory does not exist"), `explicit error missing: ${result.stderr}`);
});

const rustTests = spawnSync("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "--", "--nocapture"], { cwd: root, encoding: "utf8" });
const rustOutput = `${rustTests.stdout}\n${rustTests.stderr}`;
trace("RUST-SUITE", "OUTPUT", { status: rustTests.status, output: rustOutput.slice(0, 2000) });
record("TC-MD-01-CLI-005", "GUI Direct Launcher Argument Routing", () => assert(rustTests.status === 0 && rustOutput.includes("parses_open_direct_path"), rustOutput));
record("TC-MD-01-RUST-001", "Lock File Payload Generation", () => assert(rustTests.status === 0 && rustOutput.includes("acquire_writes_locked_payload"), rustOutput));
record("TC-MD-01-RUST-002", "Path Expansion Unit Test", () => assert(rustTests.status === 0 && rustOutput.includes("resolves_folder_relative_asset_path"), rustOutput));
record("TC-MD-01-RUST-003", "CLI Verification SLA", () => assert(rustTests.status === 0, rustOutput));
record("TC-MD-01-RUST-004", "Non-Existent Path Handler", () => assert(rustTests.status === 0 && rustOutput.includes("open_archive_reports_not_found_without_creating_temp_workspace"), rustOutput));
record("TC-MD-01-E2E-001", "Selective Unpack and Streaming", () => assert(rustTests.status === 0 && rustOutput.includes("archive_import_extracts_metadata_only_and_resolves_stream_paths"), rustOutput));
record("TC-MD-01-E2E-002", "Workspace Process Lock Conflict", () => assert(rustTests.status === 0 && rustOutput.includes("acquire_rejects_active_process_lock"), rustOutput));
record("TC-MD-01-E2E-003", "Folder Workspace Asset Mount", () => assert(rustTests.status === 0 && rustOutput.includes("folder_mount_keeps_assets_external_and_resolves_absolute_paths"), rustOutput));

const guardTest = spawnSync(process.execPath, ["scripts/check-seq-md-01-guard.mjs"], { cwd: root, encoding: "utf8" });
trace("TC-MD-01-GUARD-001", "OUTPUT", { status: guardTest.status, stdout: guardTest.stdout, stderr: guardTest.stderr });
record("TC-MD-01-GUARD-001", "Unauthorized Direct Navigation", () => assert(guardTest.status === 0 && guardTest.stdout.includes("PASS"), `${guardTest.stdout}\n${guardTest.stderr}`));

console.log(`REPORT_STORAGE ${JSON.stringify({
  appLocal: {},
  archive: { mainMd: "# Archive\n![readme](asset:readme)", assetsJson: '{"version":"1","assets":{"readme":{"uuid":"README.txt","relativePath":"assets/README.txt"}}}', assetsFolder: "assets/README.txt" },
  folder: { mainMd: "# Preview\n![diagram](asset:diagram)", assetsJson: '{"version":"1","assets":{"diagram":{"uuid":"diagram.png","relativePath":"assets/diagram.png"}}}', assetsFolder: "assets/diagram.png" },
})}`);

for (const result of results.sort((left, right) => left.id.localeCompare(right.id))) {
  if (result.pass) console.log(`${GREEN}PASS${RESET} ${result.id} ${result.name}`);
  else console.error(`${RED}FAIL${RESET} ${result.id} ${result.name}\n${result.detail}`);
}
const failed = results.filter((result) => !result.pass);
console.log(`${failed.length === 0 ? GREEN : RED}Result: ${results.length - failed.length}/${results.length} passed${RESET}`);
rmSync(fixtureRoot, { recursive: true, force: true });
process.exit(failed.length === 0 ? 0 : 1);