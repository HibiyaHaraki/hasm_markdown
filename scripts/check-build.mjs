import { execSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  execSync(`${npmCommand} run build`, { stdio: "inherit" });
  console.log("✅ React compile completed successfully.");
} catch (error) {
  console.error("❌ React compile failed.");
  process.exit(error.status ?? 1);
}
