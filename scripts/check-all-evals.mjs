import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const reportRoot = ".eval-reports";
const evaluations = [
  ["MD-01", "scripts/check-seq-md-01.mjs", "Workspace launch and import"],
  ["MD-02", "scripts/check-seq-md-02.mjs", "Editor, asset resolution, and autosave"],
  ["MD-03", "scripts/check-seq-md-03.mjs", "Asset management"],
  ["MD-04", "scripts/check-seq-md-04.mjs", "Save and export"],
  ["MD-05", "scripts/check-seq-md-05.mjs", "Close and cleanup"],
  ["MD-07", "scripts/check-normal-workflow.mjs", "Normal multi-feature workflow"],
];
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripAnsi(value) {
  return String(value ?? "").replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?e])*|\[(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><~])))/g, "");
}

function parseResults(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(?:\x1b\[[0-9;]*m)?(PASS|FAIL)(?:\x1b\[[0-9;]*m)?\s+(\S+)\s+(.*)$/);
    return match ? [{ status: match[1], id: match[2], name: match[3] }] : [];
  });
}

function parseStorage(output) {
  const marker = output.split(/\r?\n/).find((line) => line.startsWith("REPORT_STORAGE "));
  if (!marker) return { appLocal: {}, archive: {}, folder: {} };
  try {
    const parsed = JSON.parse(marker.slice("REPORT_STORAGE ".length));
    return Object.fromEntries(Object.entries(parsed).map(([side, value]) => [side, normalizeStorage(value)]));
  } catch { return { appLocal: {}, archive: {}, folder: {} }; }
}

function normalizeStorage(value) {
  if (value && typeof value === "object") return value;
  const text = String(value ?? "");
  if (!text) return {};
  const assetsJsonIndex = text.indexOf("\n\nassets.json\n");
  const assetsIndex = text.indexOf("\n\nassets/");
  if (assetsJsonIndex < 0) return { mainMd: text };
  return {
    mainMd: text.slice(0, assetsJsonIndex).replace(/^main\.md\n/, ""),
    assetsJson: text.slice(assetsJsonIndex + "\n\nassets.json\n".length, assetsIndex < 0 ? undefined : assetsIndex),
    assetsFolder: assetsIndex < 0 ? "" : text.slice(assetsIndex + "\n\nassets/".length),
  };
}

function reportHtml(id, title, results, output) {
  const passed = results.filter((result) => result.status === "PASS").length;
  const evidence = escapeHtml(stripAnsi(output).trim() || "No evaluator output was produced.");
  const storage = parseStorage(output);
  const storagePanel = (label, value) => `<h3>${label}</h3><div class="storage-grid"><section><h4>main.md</h4><pre>${escapeHtml(value.mainMd ?? "")}</pre></section><section><h4>assets.json</h4><pre>${escapeHtml(value.assetsJson ?? "")}</pre></section><section><h4>assets/</h4><pre>${escapeHtml(value.assetsFolder ?? "")}</pre></section></div>`;
  const rows = results.map((result) => `<article class="case ${result.status.toLowerCase()}">
<h2>${escapeHtml(result.id)}: ${escapeHtml(result.name)}</h2>
<dl><dt>Test Step</dt><dd>${escapeHtml(result.name)}</dd><dt>Expected Behavior</dt><dd>Complete the documented ${escapeHtml(title)} evaluation case successfully.</dd><dt>Actual Behavior</dt><dd>${escapeHtml(result.status === "PASS" ? "Completed successfully." : "The evaluation case failed. See captured output below.")}</dd><dt>Test Step Result</dt><dd><strong>${escapeHtml(result.status)}</strong></dd></dl>
${storagePanel("App Local Side", storage.appLocal)}${storagePanel("Archive Side", storage.archive)}${storagePanel("Folder Side", storage.folder)}</article>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(id)} Evaluation Report</title><style>body{font-family:system-ui,sans-serif;max-width:1200px;margin:auto;padding:24px;color:#1f2937;background:#f8fafc}.case{background:#fff;border:1px solid #cbd5e1;border-left:6px solid #16a34a;padding:16px;margin:16px 0}.case.fail{border-left-color:#dc2626}dl{display:grid;grid-template-columns:180px 1fr;gap:6px 12px}dt{font-weight:700}dd{margin:0}.storage-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}pre{white-space:pre-wrap;overflow:auto;padding:10px;background:#f1f5f9}@media(max-width:800px){.storage-grid{grid-template-columns:1fr}dl{display:block}}</style></head><body><h1>${escapeHtml(id)}: ${escapeHtml(title)}</h1><p>Generated ${escapeHtml(new Date().toISOString())}. Result: ${passed}/${results.length} passed.</p>${rows}<h2>Captured Evaluation Output</h2><pre>${escapeHtml(output)}</pre></body></html>`;
}

mkdirSync(reportRoot, { recursive: true });
let failedEvaluations = 0;
for (const [id, script, title] of evaluations) {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), encoding: "utf8", timeout: 240000 });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const parsed = parseResults(output);
  const results = parsed.length > 0 ? parsed : [{ status: result.status === 0 ? "PASS" : "FAIL", id: `${id}-RUNNER`, name: title }];
  if (id === "MD-07") {
    copyFileSync(`${reportRoot}/normal-workflow-report.html`, `${reportRoot}/${id.toLowerCase()}-evaluation-report.html`);
  } else {
    writeFileSync(`${reportRoot}/${id.toLowerCase()}-evaluation-report.html`, reportHtml(id, title, results, output), "utf8");
  }
  const failed = result.status !== 0 || results.some((item) => item.status === "FAIL");
  if (failed) failedEvaluations += 1;
  console.log(`${failed ? RED : GREEN}${failed ? "FAIL" : "PASS"}${RESET} ${id} report: ${results.filter((item) => item.status === "PASS").length}/${results.length} passed`);
}
console.log(`${failedEvaluations ? RED : GREEN}Result: ${evaluations.length - failedEvaluations}/${evaluations.length} evaluation reports passed${RESET}`);
process.exit(failedEvaluations ? 1 : 0);
