import { execSync } from "node:child_process";

const cargoCommand = "cargo";

function checkTauriBuild() {
  execSync(`${cargoCommand} check`, {
    cwd: "src-tauri",
    stdio: "pipe",
    encoding: "utf8",
  });
}

try {
  checkTauriBuild();
  console.log("✓ PASS: Tauri backend build check has no errors (checkTauriBuild)");
} catch (error) {
  if (error.stdout) {
    process.stderr.write(error.stdout);
  }
  if (error.stderr) {
    process.stderr.write(error.stderr);
  }
  console.error("✗ FAIL: Tauri backend build check failed (checkTauriBuild)");
  process.exit(error.status ?? 1);
}
