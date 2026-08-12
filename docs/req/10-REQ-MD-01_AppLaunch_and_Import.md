# REQ-MD-01: App Launch, Import, Workspace Locking, and Lightweight Metadata Initialization Requirements

## 1. Functional Requirements

### 1.1 Multi-Instance Window Management & Single-Workspace Process Locking

* **`REQ-MD-01-001` (Multi-Instance Application Launch):** The application shall support launching multiple independent application windows across the operating system.
* **`REQ-MD-01-002` (Single-Workspace Lock Creation):** Upon opening a workspace target, the system shall read `<AppLocalDataDir>/<UUID>/.lock` and check the active OS process table.
* **`REQ-MD-01-003` (Lock Conflict Rejection):** If `.lock` exists and contains a Process ID (PID) currently running in the OS process table, the system shall reject workspace mounting and display a lock conflict modal ("Workspace already open in another window").
* **`REQ-MD-01-004` (Lock Acquisition & File Handles):** If the workspace is free, the system shall write the current PID to `.lock` and open exclusive write file handles on `<UUID>/main.md` and `<UUID>/assets.json`. In ZIP Archive Mode (`Mode A`), the system shall additionally acquire an exclusive read/share handle on the source `.hasmmd` archive.

---

### 1.2 Selective Lightweight Metadata Extraction & Zero-Copy Streaming

* **`REQ-MD-01-010` (Selective Archive Unpacking - Mode A):** When opening a `.hasmmd` (ZIP) workspace, the Rust backend shall extract **only** `main.md` and `assets.json` into `<AppLocalDataDir>/<UUID>/`. Media asset binaries (`assets/*`) shall **not** be extracted upfront.
* **`REQ-MD-01-011` (Zero-Upfront Copy Import):** The system shall open workspace archives in under 100 milliseconds regardless of total package byte size by deferring asset binary extraction to on-demand streaming.
* **`REQ-MD-01-012` (Folder Workspace Mounting - Mode B):** When mounting an external directory, the system shall mount `main.md` and `assets.json` directly without duplicating heavy media payloads.
* **`REQ-MD-01-013` (Workspace Scaffolding - Mode C):** When creating a new package, the system shall scaffold initial default `main.md`, `assets.json`, and an empty `assets/` directory in `App Local`.

---

### 1.3 Portable Relative Paths & Runtime Absolute Path Expansion

* **`REQ-MD-01-020` (Portable Relative Path Disk Format):** All asset path references stored in `assets.json` on disk shall strictly use package-relative format (`assets/<uuid_filename>`).
* **`REQ-MD-01-021` (Runtime Absolute Path Resolution):** During workspace initialization (Phase 3), the Rust backend shall parse `assets.json` and expand every `relativePath` entry into an active runtime absolute path (`resolvedPath`).
* **`REQ-MD-01-022` (ZIP Archive Streaming Protocol Binding):** For Mode A (ZIP Archive), the backend shall map `resolvedPath` to the virtual streaming protocol (`asset-stream://<UUID>/<asset_uuid>`).
* **`REQ-MD-01-023` (Folder/Local Path Binding):** For Mode B/C (Folder or Local), the backend shall resolve `resolvedPath` by joining the absolute workspace root path with `relativePath`.

---

### 1.4 Structural Validation & Non-Fatal Missing Asset Check

* **`REQ-MD-01-030` (Core Metadata Validation):** The system shall verify the physical existence of `main.md` and `assets.json`. If either file is missing, the system shall abort mounting and render the Data Error Page (`/error-model`).
* **`REQ-MD-03-031` (Non-Fatal Asset Cross-Check):** The backend shall cross-check manifest asset keys against the ZIP archive central directory or external folder directory.
* **`REQ-MD-01-032` (Missing Assets Array Population):** Any asset key present in `assets.json` that is missing from physical storage or marked with `isDeleted: true` shall be collected into `Vec<MissingAssetInfo>` without blocking workspace loading.
* **`REQ-MD-01-033` (State Commitment & Direct Route):** Upon successful validation, the system shall commit `PackageStatePayload` (containing pre-resolved absolute paths) to `usePackageStore`, clear global loading flags, and route directly to `/editor`.

---

## 2. Non-Functional Requirements

### 2.1 Startup Performance and Memory Footprint

* **`REQ-MD-01-100` (Instant Startup SLA):** Workspace opening and metadata extraction (`Mode A` / `Mode B`) shall complete within 100ms for packages up to 10GB in total size.
* **`REQ-MD-01-101` (Zero Storage Duplication):** Opening a ZIP workspace shall consume 0 bytes of extra disk space in `App Local` for asset binaries prior to explicit user editing/saving actions.