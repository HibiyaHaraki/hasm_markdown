# HASM Markdown CLI Interface Specification

This document defines the complete functional and technical specifications for the HASM Markdown Command Line Interface (`hasm_markdown`). The CLI provides headless package verification, OS-absolute asset path resolution streaming, and interactive GUI launching.

---

## 1. CLI Execution Modes & Subcommand Architecture

The CLI is powered by the Rust backend using `clap` for zero-overhead argument parsing. It dispatches execution into three distinct modes:

| Subcommand | Target Format | Execution Mode | Primary Purpose |
| --- | --- | --- | --- |
| **`verify <PATH> [--json]`** | `.hasmmd` Archive / Folder | Headless (Non-GUI) | CI/CD pipeline validation, missing asset detection, structural verification |
| **`preview <FOLDER_PATH>`** | Folder Workspace Only | Headless (Stdout Stream) | Converting relative `asset:alias` links to OS absolute paths for external renderers |
| **`open <PATH>`** | `.hasmmd` Archive / Folder / Unbound | Interactive GUI | Mounting workspace, checking PID `.lock`, and launching Desktop Editor |

---

## 2. Subcommand Technical Specifications

### 2.1 `verify`: Structural & Asset Verification (`hasm_markdown verify`)

Headless execution mode for inspecting package integrity without spawning a GUI window or modifying workspace state.

#### Command Syntax

```bash
hasm_markdown verify <TARGET_PATH> [--json]

```

#### Execution Logic

1. Inspects `TARGET_PATH` existence. Returns exit code `1` if inaccessible.
2. Reads core metadata (`main.md` and `assets.json`). Checks for structural completeness.
3. Cross-checks all `assets.json` aliases against references in `main.md` and physical binaries in `assets/` (or ZIP Central Directory).
4. Categorizes diagnostics into `missingAssets` (referenced in text but missing physically) and `warnings` (unregistered orphan files).

#### Process Exit Codes

* **`0` (Success):** Package is fully compliant (zero missing asset errors).
* **`1` (Validation Error):** Target path missing, `main.md`/`assets.json` missing, or `missingAssets` detected.

#### Standard Output (Default Human-Readable)

```text
[FAIL] Workspace Verification Failed for: /path/to/my_package.hasmmd
  - Error: Missing asset reference 'architecture_diagram.png' on line(s): 12, 45
    Expected physical file: assets/3f8b9a20-1c2d-4e5f.png
  - Warning: Orphan asset file found in package: assets/9e8d7c6b-5a4f-3e2d.png

```

#### JSON Output Specification (`--json`)

```json
{
  "status": "Invalid",
  "targetPath": "/path/to/my_package.hasmmd",
  "missingAssets": [
    {
      "alias": "architecture_diagram.png",
      "expectedRelativePath": "assets/3f8b9a20-1c2d-4e5f.png",
      "referencedLines": [12, 45]
    }
  ],
  "warnings": [
    {
      "code": "OrphanAssetFound",
      "filename": "assets/9e8d7c6b-5a4f-3e2d.png"
    }
  ]
}

```

---

### 2.2 `preview`: Absolute Path Stream (`hasm_markdown preview`)

Converts Markdown asset tags to OS absolute file paths and streams the transformed text directly to `stdout`.

#### Command Syntax

```bash
hasm_markdown preview <FOLDER_PATH>

```

#### Target Constraint

* **Folder Type Workspaces Only (Mode B):** If executed against a `.hasmmd` ZIP archive, the CLI immediately outputs an error and exits with code `1`.

#### Execution Logic

1. Validates that `FOLDER_PATH` is a valid directory.
2. Reads `main.md` and `assets.json` from the target directory.
3. Parses image link tokens matching `![alt](asset:alias)`.
4. Resolves `alias` keys to their mapped physical UUID filenames in `assets/` and joins them with the absolute base path of `FOLDER_PATH`.
5. Outputs the converted Markdown stream to `stdout`.

#### Usage Examples

```bash
# Output converted Markdown with absolute OS image paths to terminal
hasm_markdown preview /path/to/my_folder_workspace

# Pipe converted stream to an external file or tool
hasm_markdown preview /path/to/my_folder_workspace > /tmp/resolved_preview.md

```

---

### 2.3 `open`: Interactive GUI Launcher (`hasm_markdown open`)

Launches the desktop GUI application and directly mounts the target workspace.

#### Command Syntax

```bash
# Explicit subcommand syntax
hasm_markdown open <TARGET_PATH>

# Direct path shortcut syntax
hasm_markdown <TARGET_PATH>

```

#### Execution Logic

1. Checks `<AppLocalDataDir>/<UUID>/.lock` status.
2. If locked by another active PID, displays the Lock Conflict Modal in GUI.
3. If free, writes active PID to `.lock`, executes lightweight selective import (`main.md` and `assets.json` only), resolves `resolvedPath` URIs, and routes directly to `/editor`.

---

## 3. CI/CD Integration & Pipeline Guidance

The `verify` subcommand is designed to run in automated CI/CD runners (e.g., GitHub Actions, GitLab CI).

### GitHub Actions Workflow Snippet

```yaml
name: HASM Package Quality Gate
on: [push, pull_request]

jobs:
  verify-markdown:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install HASM CLI
        run: cargo install --path ./src-tauri
      - name: Verify Package Structure
        run: |
          hasm_markdown verify ./docs/workspace_folder --json > verification_result.json
          cat verification_result.json

```