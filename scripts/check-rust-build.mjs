import { execSync } from "node:child_process";

const cargoCommand = process.platform === "win32" ? "cargo" : "cargo";

try {
  execSync(`cd src-tauri && ${cargoCommand} check`, { stdio: "inherit" });
  console.log("✅ Rust compile completed successfully.");
} catch (error) {
  console.error("❌ Rust compile failed.");
  process.exit(error.status ?? 1);
}
