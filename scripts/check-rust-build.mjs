import { spawnSync } from "node:child_process";

const cargoCommand = "cargo";

/**
 * # Test Function : checkTauriBuild
 * ## Test Procedure
 * * Step 1 : Execute cargo test with nocapture in src-tauri.
 * * Step 2 : Collect stdout and stderr from the test process.
 * * Step 3 : Filter output to show test-step logs and test result lines only.
 * * Step 4 : Print filtered lines for readable CI/local output.
 * * Step 5 : Fail the script when cargo test returns non-zero status.
 * ## Expected behavior
 * * Step 1 : Rust unit tests start successfully.
 * * Step 2 : All test output is captured for post-processing.
 * * Step 3 : Build noise is removed while important test lines are kept.
 * * Step 4 : Developer sees focused test execution output.
 * * Step 5 : Script exits with failure when any Rust test fails.
 */
function checkTauriBuild() {
  const result = spawnSync(cargoCommand, ["test", "--", "--nocapture"], {
    cwd: "src-tauri",
    encoding: "utf8",
  });

  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  const lines = combined
    .split(/\r?\n/)
    .filter((line) => {
      const text = line.trim();
      return (
        /\[TEST\]/.test(text) ||
        /\[STEP\]/.test(text) ||
        /\[ERROR\]/.test(text) ||
        /^running\s+\d+\s+tests$/.test(text) ||
        /^test\s+.+\s+\.\.\.\s+(ok|FAILED)$/.test(text) ||
        /^test result:\s+/.test(text) ||
        /^failures:?$/.test(text) ||
        /^----\s+.+\s+----$/.test(text)
      );
    });

  if (lines.length > 0) {
    console.log(lines.join("\n"));
  }

  if (result.status !== 0) {
    throw new Error(`cargo test failed with exit code ${result.status ?? 1}`);
  }
}

/**
 * # Test Function : tauriBuildScriptMain
 * ## Test Procedure
 * * Step 1 : Call checkTauriBuild.
 * * Step 2 : Print PASS summary if no exception occurs.
 * * Step 3 : Print FAIL summary and exit 1 if an exception occurs.
 * ## Expected behavior
 * * Step 1 : Tauri test pipeline is executed.
 * * Step 2 : PASS summary is printed only when tests succeed.
 * * Step 3 : FAIL summary is printed and process exits non-zero on failure.
 */
try {
  checkTauriBuild();
  console.log("✓ PASS: Tauri backend build check has no errors (checkTauriBuild)");
} catch (error) {
  console.error("✗ FAIL: Tauri backend build check failed (checkTauriBuild)");
  process.exit(1);
}
