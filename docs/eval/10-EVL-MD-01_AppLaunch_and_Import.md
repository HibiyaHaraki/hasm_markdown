# EVL-MD-01 (抜粋修正): Non-Existent Path Test Cases Added

## 1. CLI Interface & Headless Engine Tests (追加・改訂)

| Test ID | Trace Requirement ID | Test Type | Execution Command / Input | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-CLI-001`** | `REQ-MD-01-001` `REQ-MD-01-002` | Positive (Valid Package Verification) | `hasm_markdown verify /path/to/valid_pkg.hasmmd` | 1. Run command on a valid `.hasmmd` archive. 2. Inspect stdout and exit code. | 1. Output prints success message. 2. Process terminates immediately without launching GUI. 3. Exit code is `0`. |
| **`TC-MD-01-CLI-002`** | `REQ-MD-01-002` | Positive (JSON Format Error Verification) | `hasm_markdown verify /path/to/corrupted.hasmmd --json` | 1. Run command on archive missing `main.md`. 2. Parse stdout JSON payload. | 1. Output prints valid JSON containing `"status": "Invalid"` and error details. 2. Exit code is `1`. |
| **`TC-MD-01-CLI-003`** | `REQ-MD-01-003` | Positive (Folder Absolute Path Preview Stream) | `hasm_markdown preview /path/to/folder_workspace` | 1. Run command on a valid Folder Type workspace (Mode B). 2. Inspect stdout stream. | 1. `main.md` content is output to stdout. 2. Asset tags `![alt](asset:alias)` are converted to OS absolute file paths. 3. Exit code is `0`. |
| **`TC-MD-01-CLI-004`** | `REQ-MD-01-003` | Negative (Preview Rejection on ZIP Archive) | `hasm_markdown preview /path/to/archive.hasmmd` | 1. Run command against a `.hasmmd` ZIP archive. 2. Inspect stderr and exit code. | 1. Error message indicates `preview` subcommand is restricted to Folder Type workspaces only. 2. Exit code is `1`. |
| **`TC-MD-01-CLI-005`** | `REQ-MD-01-004` | Positive (GUI Direct Launcher) | `hasm_markdown open /path/to/valid_pkg.hasmmd` | 1. Execute launch command with target path. 2. Monitor process and window creation. | 1. Launches application window. 2. Skips `/select` page and mounts `/editor` directly. |
| **`TC-MD-01-CLI-006`** | `REQ-MD-01-001` `REQ-MD-01-002` | **Negative (Non-Existent Target Path)** | `hasm_markdown verify /non/existent/path/package.hasmmd` | 1. Execute `verify` with a path that does not exist on disk. 2. Inspect stderr and exit code. | 1. Outputs explicit error ("Target path does not exist or is inaccessible"). 2. Terminates process immediately with exit code `1`. |
| **`TC-MD-01-CLI-007`** | `REQ-MD-01-003` | **Negative (Non-Existent Folder Preview)** | `hasm_markdown preview /invalid/dummy_folder` | 1. Execute `preview` with an invalid directory path. 2. Inspect stderr and exit code. | 1. Outputs explicit error ("Target folder directory does not exist"). 2. Terminates process immediately with exit code `1`. |

---

## 3. Rust Backend Level Tests (Engine & Lock Validation) (追加・改訂)

| Test ID | Trace Requirement ID | Test Type | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-RUST-001`** | `REQ-MD-01-020` | Positive (Lock File Payload Generation) | `domain::lock::acquire` | 1. Invoke `acquire_workspace_lock(uuid)`. 2. Read `<UUID>/.lock` file on disk. | 1. File exists and contains valid JSON payload (`"pid": current_pid`, `"status": "Locked"`). |
| **`TC-MD-01-RUST-002`** | `REQ-MD-01-030` | Positive (Path Expansion Unit Test) | `services::path_resolver` | 1. Pass relative manifest entry `assets/test.png` to path resolver in Mode B. | 1. Joins target workspace root directory and returns exact OS absolute path string. |
| **`TC-MD-01-RUST-003`** | `REQ-MD-01-100` | Positive (CLI Verification SLA) | `cli::verify::exec` | 1. Execute `verify` on a package with 1,000 asset mappings. 2. Measure execution duration. | 1. Verification completes and exits process within 50ms. |
| **`TC-MD-01-RUST-004`** | `REQ-MD-01-001` | Negative (Non-Existent Path Handler) | `domain::package::open_archive` | 1. Pass non-existent `PathBuf` to `open_archive`. | 1. Returns `Err(PackageError::IoError { message: "NotFound" })` without panicking or creating orphaned temporary folders. |