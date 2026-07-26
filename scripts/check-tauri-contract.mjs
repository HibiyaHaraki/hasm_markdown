import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const frontendFiles = ["src/HASM_Markdown_Editor.jsx", "src/Menu.jsx"];
const rustFile = "src-tauri/src/lib.rs";

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function extractRustHandlers(source) {
  const handlers = new Map();
  const pattern = /#\[tauri::command\]\s*fn\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*->\s*([^\{]+)\s*\{/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const [, name, paramsText, returnType] = match;
    const params = paramsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const paramMatch = item.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)/);
        return paramMatch ? { name: paramMatch[1], type: paramMatch[2] } : null;
      })
      .filter(Boolean);

    const exposedParams = params.filter((param) => !param.type.includes("State"));
    handlers.set(name, {
      name,
      params: exposedParams,
      returnType: returnType.trim(),
    });
  }

  return handlers;
}

function normalizeName(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function extractReactInvokeCalls(source) {
  const calls = [];
  const pattern = /invoke\(\s*["']([^"']+)["']\s*,\s*\{([^}]*)\}\s*\)/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const [, command, argsText] = match;
    const args = argsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const propMatch = item.match(/^([a-zA-Z0-9_]+)(?:\s*:\s*([a-zA-Z0-9_]+))?$/);
        return propMatch ? propMatch[1] : item;
      });

    calls.push({ command, args });
  }

  return calls;
}

function main() {
  const rustSource = read(rustFile);
  const handlers = extractRustHandlers(rustSource);

  const errors = [];

  for (const frontendFile of frontendFiles) {
    const source = read(frontendFile);
    const calls = extractReactInvokeCalls(source);

    for (const call of calls) {
      const handler = handlers.get(call.command);

      if (!handler) {
        errors.push(`${frontendFile}: invoke(${call.command}) has no matching Rust command.`);
        continue;
      }

      const normalizedArgs = call.args.map((arg) => normalizeName(arg));
      const missingArgs = normalizedArgs.filter((arg) => !handler.params.some((param) => normalizeName(param.name) === arg));
      if (missingArgs.length > 0) {
        errors.push(`${frontendFile}: ${call.command} is missing Rust parameters ${missingArgs.join(", ")}.`);
      }

      if (!handler.returnType.includes("Result")) {
        errors.push(`${frontendFile}: ${call.command} does not declare a Result return type in Rust.`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("❌ Tauri command contract check failed.");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("✅ Tauri command contract check passed.");
  console.log("- React invoke arguments match the Rust command parameters.");
  console.log("- Rust handlers return a Result type for the frontend contract.");
}

main();
