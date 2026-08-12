# REQ-MD-01: Application Startup, CLI Interface, Selective Import, Workspace Locking, and Path Resolution Requirements

## 1. Functional Requirements

### 1.1 CLI Interface Execution Modes

* **`REQ-MD-01-001` (CLI Subcommand Dispatcher):** The Rust backend CLI parser shall parse and route execution based on subcommands: `verify`, `preview`, and `open` (or direct path argument).
* **`REQ-MD-01-002` (Headless Structural Verification - `verify`):**
* Executing `hasm_markdown verify <PATH> [--json]` shall run headless verification without launching the GUI.
* It shall inspect `.hasmmd` archives or folder workspaces for core metadata existence (`main.md`, `assets.json`, `assets/`).
* It shall output diagnostic errors (`missingAssets`) and orphan warnings to `stdout` (or JSON when `--json` is supplied) and terminate with process exit code `0` (Valid) or `1` (Invalid).


* **`REQ-MD-01-003` (Absolute Path Preview Stream - `preview`):**
* Executing `hasm_markdown preview <FOLDER_PATH>` shall strictly enforce **Folder Type (Mode B)** execution. Execution on `.hasmmd` ZIP archives shall be rejected with exit code `1`.
* It shall read `main.md` and `assets.json` from the target directory and resolve all relative asset links (`![alt](asset:alias)`) to OS absolute file paths.
* It shall output the converted Markdown text directly to `stdout` for external editor/renderer compatibility.


* **`REQ-MD-01-004` (Interactive GUI Launcher - `open`):** Executing `hasm_markdown open <PATH>` or `hasm_markdown <PATH>` shall launch the interactive Desktop GUI window and proceed with workspace mounting.

---

### 1.2 Selective Lightweight Import & Mode Mounting

* **`REQ-MD-01-010` (Mode A ZIP Archive Selective Import):** In ZIP Archive Mode (`.hasmmd`), the backend shall extract **only** `main.md` and `assets.json` into `<AppLocalDataDir>/<UUID>/`. Asset media binaries shall remain in the ZIP archive for zero-copy on-demand streaming (`asset-stream://`).
* **`REQ-MD-01-011` (Mode B External Folder Mount):** In External Folder Mode, the backend shall mount the directory directly or copy metadata to `<AppLocalDataDir>/<UUID>/` without duplicating heavy asset payloads.
* **`REQ-MD-01-012` (Mode C Unbound Scaffold Creation):** Creating a new workspace shall scaffold default `main.md`, `assets.json`, and an empty `assets/` folder in `App Local`.

---

### 1.3 Single-Workspace Process Locking & File Handles

* **`REQ-MD-01-020` (Process Lock Validation):** The backend shall write `<AppLocalDataDir>/<UUID>/.lock` storing `{ "pid": current_pid, "status": "Locked" }`. Access shall be rejected if another active process PID holds the lock.
* **`REQ-MD-01-021` (Exclusive Master OS Handles):** The system shall acquire exclusive OS write handles on local `main.md` and `assets.json`, plus an exclusive read/share lock on target `.hasmmd` archives.

---

### 1.4 Dynamic Path Resolution & State Commitment

* **`REQ-MD-01-030` (Runtime Absolute Path Resolution):** Portable package-relative paths (`assets/<uuid>.<ext>`) in `assets.json` shall be dynamically expanded in memory to environment-specific `resolvedPath` URIs before being committed to the React store.
* **`REQ-MD-01-031` (State Commitment & Direct Route):** Upon successful validation, the backend shall return `PackageStatePayload` carrying `resolvedPath` entries, set `isLoaded = true` in `usePackageStore`, and route directly to `/editor`.

---

## 2. Non-Functional Requirements

### 2.1 CLI & Boot Performance SLA

* **`REQ-MD-01-100` (Verification Execution Time SLA):** Headless verification via `verify` subcommand shall complete and exit within **50ms** for packages containing up to 1,000 asset mappings.
* **`REQ-MD-01-101` (Instant GUI Mount SLA):** Selective metadata import and dynamic path resolution shall mount `/editor` within **100ms** regardless of total ZIP archive size.