# 10-EVL-MD-01: App Launch, CLI Interface, Selective Import, Workspace Locking, and Path Resolution Evaluation Specification

This document defines the complete test matrix, acceptance criteria, and traceability mapping for validating application startup, headless CLI subcommands (`verify`, `preview`, `open`), non-existent path exception handling, single-instance process locking (`.lock`), selective import, virtual asset streaming protocol (`asset-stream://`), dynamic path resolution (`resolvedPath`), and React Routing Guard protection (Barrier 2).

---

## Preconditions and Verification

Preconditions are observable setup contracts; they are not fixed delays. The evaluation must not start a browser assertion until its fixture and route state are available.

| Precondition | Verification | Current automation status |
| --- | --- | --- |
| Node dependencies, the Rust toolchain, and Playwright Chromium are installed. | `npm ci`, `cargo`, and `npx playwright install chromium` complete before the command runs. | Satisfied by CI setup. |
| The CLI binary is built before CLI fixtures execute. | `scripts/check-seq-md-01.mjs` runs `cargo build` and stops on a non-zero result. | Satisfied. |
| Each CLI case has an isolated temporary package fixture with the required files and manifest shape. | The script creates `main.md`, `assets.json`, assets, and invalid variants under `mkdtempSync(...)`. | Satisfied. |
| Direct-launch browser cases have a reachable Vite server and registered Tauri IPC mocks before navigation. | The script waits for its Vite URL, installs `window.__TAURI_INTERNALS__`, then loads the route. | Satisfied for the automated direct-launch cases. |
| The route-guard case begins without an active workspace. | `check-seq-md-01-guard.mjs` loads `/editor` with the unloaded workspace state. | Satisfied by the dedicated guard fixture. |
| Native window creation, real 1 GB archive streaming, and cross-process OS locking are available when executing the desktop scenarios manually. | Run the listed desktop cases in a built Tauri application with real files and two processes. | Not established by the mocked browser/CLI harness. |

## 1. CLI Interface & Headless Engine Tests

| Test ID | Trace Requirement ID | Test Type | Precondition | Execution Command / Input | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-CLI-001`** | `"REQ-MD-01-001"<br/>"REQ-MD-01-002"` | Positive (Valid Package Verification) | A built binary and a valid archive containing `main.md`, `assets.json`, and registered assets exist. | `hasm_markdown verify /path/to/valid_pkg.hasmmd` | 1. Run command on a valid `.hasmmd` archive.2. Inspect stdout and exit code. | 1. Output prints success message.2. Process terminates immediately without launching GUI.3. Exit code is `0`. |
| **`TC-MD-01-CLI-002`** | `"REQ-MD-01-002"` | Positive (JSON Format Error Verification) | A readable archive fixture exists but omits `main.md`. | `hasm_markdown verify /path/to/corrupted.hasmmd --json` | 1. Run command on archive missing `main.md`.2. Parse stdout JSON payload. | 1. Output prints valid JSON containing `"status": "Invalid"` and error details.2. Exit code is `1`. |
| **`TC-MD-01-CLI-003`** | `"REQ-MD-01-003"` | Positive (Folder Absolute Path Preview Stream) | A writable folder workspace contains `main.md`, `assets.json`, and the referenced asset file. | `hasm_markdown preview /path/to/folder_workspace` | 1. Run command on a valid Folder Type workspace (Mode B).2. Inspect stdout stream. | 1. `main.md` content is output to stdout.2. Asset tags `![alt](asset:alias)` are converted to OS absolute file paths.3. Exit code is `0`. |
| **`TC-MD-01-CLI-004`** | `"REQ-MD-01-003"` | Negative (Preview Rejection on ZIP Archive) | A valid `.hasmmd` archive fixture exists. | `hasm_markdown preview /path/to/archive.hasmmd` | 1. Run command against a `.hasmmd` ZIP archive.2. Inspect stderr and exit code. | 1. Error message indicates `preview` subcommand is restricted to Folder Type workspaces only.2. Exit code is `1`. |
| **`TC-MD-01-CLI-005`** | `"REQ-MD-01-004"` | Positive (GUI Direct Launcher) | A built desktop application and a valid target package are available. | `hasm_markdown open /path/to/valid_pkg.hasmmd` | 1. Execute launch command with target path.2. Monitor process and window creation. | 1. Launches application window.2. Skips `/select` page and mounts `/editor` directly. |
| **`TC-MD-01-CLI-006`** | `"REQ-MD-01-001"<br/>"REQ-MD-01-002"` | Negative (Non-Existent Target Path) | The supplied target path does not exist. | `hasm_markdown verify /non/existent/path/package.hasmmd` | 1. Execute `verify` with a path that does not exist on disk.2. Inspect stderr and exit code. | 1. Outputs explicit error ("Target path does not exist or is inaccessible").2. Terminates process immediately with exit code `1`. |
| **`TC-MD-01-CLI-007`** | `"REQ-MD-01-003"` | Negative (Non-Existent Folder Preview) | The supplied folder path does not exist. | `hasm_markdown preview /invalid/dummy_folder` | 1. Execute `preview` with an invalid directory path.2. Inspect stderr and exit code. | 1. Outputs explicit error ("Target folder directory does not exist").2. Terminates process immediately with exit code `1`. |
| **`TC-MD-01-CLI-008`** | `"REQ-MD-01-002"` | Positive (Valid Folder Package Verification) | A folder contains `main.md`, `assets.json`, and a manifest-registered `assets/readme.txt`. | `hasm_markdown verify /path/to/folder_workspace` | 1. Create a folder workspace containing `main.md`, `assets.json`, and `assets/readme.txt`.2. Run `verify` on the folder.3. Inspect stdout and exit code. | 1. The registered folder asset is found.2. Output prints success message.3. Exit code is `0`. |
| **`TC-MD-01-E2E-004`** | `"REQ-MD-01-004"` | Positive (Direct Archive Path Forwarding) | Vite is reachable and archive-open IPC is mocked before navigation. | React `/select` launch with `.hasmmd` path | 1. Provide `/select?path=C:/fixtures/direct.hasmmd`. 2. Mock `get_launch_target` with the same path. 3. Capture Tauri IPC calls. | 1. `open_archive_workspace` receives `{ archive_path: "C:/fixtures/direct.hasmmd" }`. 2. No second native file dialog is opened. 3. The editor mounts successfully. |
| **`TC-MD-01-E2E-005`** | `"REQ-MD-01-004"` | Positive (Direct Folder Path Forwarding) | Vite is reachable and folder-open IPC is mocked before navigation. | React `/select` launch with folder path | 1. Provide `/select?path=C:/fixtures/direct-folder`. 2. Mock `get_launch_target` with the same path. 3. Capture Tauri IPC calls. | 1. `open_folder_workspace` receives `{ folder_path: "C:/fixtures/direct-folder" }`. 2. No second native folder dialog is opened. 3. The editor mounts successfully. |

---

## 2. Desktop App & Route Protection Tests (E2E / Frontend Guard)

| Test ID | Trace Requirement ID | Test Type | Precondition | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-E2E-001`** | `"REQ-MD-01-010"<br/>"REQ-MD-01-030"` | Positive (Selective Unpack & Streaming) | A valid 1 GB archive contains metadata and a referenced image. | Mode A ZIP Workspace Load | 1. Select a 1GB `.hasmmd` archive from `/select`.2. Inspect `<AppLocalDataDir>/<UUID>/`. | 1. `main.md` and `assets.json` are extracted into App Local.2. Heavy image binaries remain in ZIP.3. Editor renders image preview via `asset-stream://` protocol. |
| **`TC-MD-01-E2E-002`** | `"REQ-MD-01-020"` | Negative (Workspace Process Lock Conflict) | Instance A holds a valid lock for the target workspace. | Single-Instance Lock Check | 1. Launch Instance A with `workspace.hasmmd`.2. Attempt to open `workspace.hasmmd` in Instance B. | 1. Instance B detects active PID in `.lock` file.2. Opening is rejected.3. Displays Lock Conflict Modal ("Workspace already open in another window"). |
| **`TC-MD-01-E2E-003`** | `"REQ-MD-01-011"<br/>"REQ-MD-01-030"` | Positive (Folder Workspace Asset Mount) | A folder workspace has a manifest entry for existing `assets/note.txt`. | Mode B Folder Workspace Load | 1. Mount a folder containing `assets/note.txt` and its manifest entry.2. Inspect the returned `PackageStatePayload`. | 1. The asset remains in the external folder and is not copied into App Local `assets/`.2. `resolvedPath` is an absolute OS path ending in `assets/note.txt`.3. The workspace reaches the loaded state. |
| **`TC-MD-01-GUARD-001`** | `"REQ-MD-01-040"` | Negative (Unauthorized Direct Navigation) | The app has no active workspace when `/editor` is requested. | `WorkspaceGuard.jsx` (Barrier 2) | 1. Launch app without selecting a workspace (`isLoaded === false`).2. Directly navigate to URL `/editor`. | 1. `WorkspaceGuard` intercepts navigation.2. Displays Toast ("No active workspace loaded").3. Redirects immediately to `/select`. |

---

## 3. Rust Backend Level Tests (Engine & Lock Validation)

| Test ID | Trace Requirement ID | Test Type | Precondition | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-RUST-001`** | `"REQ-MD-01-020"` | Positive (Lock File Payload Generation) | An isolated writable workspace directory and UUID are available. | `domain::lock::acquire` | 1. Invoke `acquire_workspace_lock(uuid)`.2. Read `<UUID>/.lock` file on disk. | 1. File exists and contains valid JSON payload (`"pid": current_pid`, `"status": "Locked"`). |
| **`TC-MD-01-RUST-002`** | `"REQ-MD-01-030"` | Positive (Path Expansion Unit Test) | A Mode B root path and relative `assets/test.png` entry are supplied. | `repository::path_resolver` | 1. Pass relative manifest entry `assets/test.png` to path resolver in Mode B. | 1. Joins target workspace root directory and returns exact OS absolute path string. |
| **`TC-MD-01-RUST-003`** | `"REQ-MD-01-100"` | Positive (CLI Verification SLA) | A valid package fixture has exactly 1,000 asset mappings. | `cli::verify::exec` | 1. Execute `verify` on a package with 1,000 asset mappings.2. Measure execution duration. | 1. Verification completes and exits process within 50ms. |
| **`TC-MD-01-RUST-004`** | `"REQ-MD-01-001"` | Negative (Non-Existent Path Handler) | The supplied archive `PathBuf` does not exist. | `domain::package::open_archive` | 1. Pass non-existent `PathBuf` to `open_archive`. | 1. Returns `Err(PackageError::IoError { message: "NotFound" })` without panicking or creating orphaned temporary folders. |

---

## 4. Test Execution and Trace Logging

The executable evaluation entry point is `npm run check:seq-md-01`, implemented by `scripts/check-seq-md-01.mjs`. It runs the CLI fixtures, Rust unit tests, and frontend guard test, then prints results sorted by test ID.

Each test records trace-level `START`, `INPUT`, `OUTPUT`, and `ASSERT` events through the shared `hasm_logger` React logger. Trace records are hidden at the normal logger level and become visible only when the logger level is changed to `trace`:

```powershell
$env:VITE_LOG_LEVEL = "trace"
npm run check:seq-md-01
```

Expected summary for the current matrix:

```text
Result: 18/18 passed
```

Failure output includes the test ID, test name, assertion detail, command exit status, stdout, and stderr. This keeps the acceptance result concise while retaining the input/output evidence required to compare execution with `SEQ-MD-01`.