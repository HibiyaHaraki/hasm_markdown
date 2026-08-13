import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

const evaluations = [
  ["TC-MD-01", "scripts/check-seq-md-01.mjs"],
  ["TC-MD-01-GUARD", "scripts/check-seq-md-01-guard.mjs"],
  ["TC-MD-02", "scripts/check-seq-md-02.mjs"],
  ["TC-MD-03", "scripts/check-seq-md-03.mjs"],
  ["TC-MD-04", "scripts/check-seq-md-04.mjs"],
  ["TC-MD-05", "scripts/check-seq-md-05.mjs"],
  ["TC-MD-06", "scripts/check-seq-md-06.mjs"],
];

for (const [testId, script] of evaluations) {
  test(`${testId} evaluation`, () => {
    const result = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 180000,
    });
    expect(result.status, `${script}\n${result.stdout}\n${result.stderr}`).toBe(0);
  });
}
