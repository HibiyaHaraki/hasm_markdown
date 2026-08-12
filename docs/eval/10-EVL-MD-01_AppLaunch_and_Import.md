# EVL-MD-01: App Launch, Import, and Workspace Verification Evaluation Specification

This document defines the comprehensive test matrix, acceptance criteria, and traceability mapping for validating application startup, multi-instance execution, CLI argument handling, 3-mode workspace import, single-workspace process locking (PID check), OS physical file handles (`main.md`, `assets.json`, `.hasmmd`), dynamic progress streaming, stall timeouts, missing asset array collection without halting, and core structural verification.

---

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-E2E-001`** | `REQ-MD-01-001` `REQ-MD-01-002` `REQ-MD-01-037` | Positive (CLI Launch) | Mode A Archive Launch via CLI | 1. Execute `hasm_markdown /path/to/doc.hasmmd` from CLI. 2. Allow import to finish. | 1. App launches, bypasses `/select`. 2. Extracts archive to `<UUID>/`. 3. Navigates directly to `/editor`. |
| **`TC-MD-01-E2E-002`** | `REQ-MD-01-002` | Positive (Multi-Instance) | Run Multiple App Process Windows Simultaneously | 1. Launch Instance A on Workspace X. 2. Launch Instance B on Workspace Y. | 1. Both app process windows run simultaneously without crashing or cross-instance interference. |
| **`TC-MD-01-E2E-003`** | `REQ-MD-01-001` | Negative (Invalid Path) | CLI Launch with Non-existent File Path | 1. Execute `hasm_markdown /invalid/path/doc.hasmmd` from CLI. | 1. App launches safely. 2. Displays error Toast ("File not found"). 3. Falls back to `/select` screen. |
| **`TC-MD-01-E2E-004`** | `REQ-MD-01-004` | Negative (Fatal Version) | App Launch with Corrupted Binary Metadata | 1. Corrupt version metadata header. 2. Launch application. | 1. App execution halts. 2. React Router navigates to `/error-app`. |
| **`TC-MD-01-E2E-005`** | `REQ-MD-01-013` `REQ-MD-01-102` | Positive (Folder Copy) | Mode B Folder Import with Progress Bar | 1. Select 100MB folder on `/select`. 2. Click Import. | 1. `isLoading` becomes `true`. 2. Progress UI updates via events. 3. Copies folder and renders `/editor`. |
| **`TC-MD-01-E2E-006`** | `REQ-MD-01-020` `REQ-MD-01-021` | Negative (Lock Conflict) | Open Workspace Currently Locked by Running Instance | 1. Instance A opens Workspace X. 2. Instance B attempts to open Workspace X. | 1. Instance B detects active PID in `.lock`. 2. Instance B displays Lock Conflict Modal ("Workspace already open in another window") and halts import. |
| **`TC-MD-01-E2E-007`** | `REQ-MD-01-023` `REQ-MD-01-024` | Positive (External OS Lock) | Attempt External Deletion of Locked Core Files | 1. Open Workspace X in app. 2. Open OS File Explorer/Terminal. 3. Attempt to delete `<UUID>/main.md` or source `.hasmmd`. | 1. OS rejects deletion attempt with "File in use / Access Denied" error. |
| **`TC-MD-01-E2E-008`** | `REQ-MD-01-033` | Negative (Data Error) | Core Structural Verification Detects Missing `main.md` | 1. Delete `main.md` from target workspace prior to load. 2. Trigger import. | 1. Verification flags missing core file. 2. Rejects with error. 3. Navigates to `/error-model`. |
| **`TC-MD-01-E2E-009`** | `REQ-MD-01-034` `REQ-MD-01-037` | Positive (Missing Assets Direct Route) | Import Package with Missing Physical Asset Files | 1. Place `assets.json` referencing `img1.png` and `img2.png`. 2. Remove `img1.png` from `assets/`. 3. Import package. | 1. Backend collects missing asset details into `missingAssets`. 2. App bypasses `/error-model` and navigates directly to `/editor`. |
| **`TC-MD-01-E2E-010`** | `REQ-MD-01-112` `REQ-MD-01-113` | Negative (Stall Timeout) | Import Process Frozen (> 15s No Bytes Written) | 1. Initiate large import. 2. Freeze disk write for > 15 seconds. | 1. Stall Guard triggers. 2. Incomplete workspace purged. 3. Shows Toast error and stays on `/select`. |

---

## 2. React Level Tests (Frontend Component & UI Store State)

| Test ID | Trace Requirement ID | Test Type | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-REACT-001`** | `REQ-MD-01-100` | Positive (Loading On) | `usePackageStore` | 1. Render `/select`. 2. Dispatch import action. | 1. Sets `isLoading = true`. 2. Disables UI buttons to block double clicks. |
| **`TC-MD-01-REACT-002`** | `REQ-MD-01-100` | Negative (Double Click) | `SelectPage.tsx` | 1. Rapidly click "Import" button twice. | 1. First click sets `isLoading = true`. 2. Second click is ignored (disabled state). |
| **`TC-MD-01-REACT-003`** | `REQ-MD-01-101` `REQ-MD-01-036` | Positive (Loading Off) | `usePackageStore` | 1. Mock IPC resolve with `PackageStatePayload`. | 1. Resets `isLoading = false`. 2. Commits payload (including `missingAssets`) to store. |
| **`TC-MD-01-REACT-004`** | `REQ-MD-01-103` | Positive (Progress UI) | `ProgressBar.tsx` | 1. Emit mock `import_progress` `{ percentage: 50.0 }`. | 1. `loadingProgress` updates to 50.0. 2. Progress bar renders smoothly. |
| **`TC-MD-01-REACT-005`** | `REQ-MD-01-021` | Positive (Lock Modal UI) | `LockConflictModal.tsx` | 1. Mock IPC reject with `PackageError::WorkspaceLocked`. | 1. Resets `isLoading = false`. 2. Renders Lock Conflict Modal with message. |
| **`TC-MD-01-REACT-006`** | `REQ-MD-01-037` | Positive (Direct Route) | `SelectPage.tsx` / App Router | 1. Mock IPC resolve with payload containing non-empty `missingAssets`. | 1. Does not trigger error route. 2. Immediately executes navigation to `/editor`. |

---

## 3. Rust Level Tests (Backend Engine, I/O & Lock Execution)

| Test ID | Trace Requirement ID | Test Type | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-RUST-001`** | `REQ-MD-01-003` | Positive (Version Check) | `commands::get_app_version` | 1. Invoke `get_app_version()`. | 1. Returns `Ok(AppVersion Payload)`. |
| **`TC-MD-01-RUST-002`** | `REQ-MD-01-010` `REQ-MD-01-015` | Positive (New Scaffold) | `HasmMarkdownPackage::new` | 1. Invoke `create_new_package()`. | 1. Creates `<UUID>/`. 2. Scaffolds `main.md`, `assets.json`, `assets/`. |
| **`TC-MD-01-RUST-003`** | `REQ-MD-01-011` | Positive (ZIP Extract) | `import_archive` | 1. Pass valid `.hasmmd` path. | 1. Unzips files to `<UUID>/`. 2. Sets `StorageTarget::Archive`. |
| **`TC-MD-01-RUST-004`** | `REQ-MD-01-020` `REQ-MD-01-022` | Positive (PID Lock) | `acquire_lock` | 1. Initialize workspace. 2. Call `acquire_lock()`. | 1. Writes `.lock` containing current OS PID. |
| **`TC-MD-01-RUST-005`** | `REQ-MD-01-020` `REQ-MD-01-021` | Negative (Active PID Lock) | `acquire_lock` | 1. Write active PID into `<UUID>/.lock`. 2. Call `acquire_lock()` from another thread/process. | 1. Returns `Err(PackageError::WorkspaceLocked)`. |
| **`TC-MD-01-RUST-006`** | `REQ-MD-01-023` | Positive (Core File Handles) | `reserve_file_handles` | 1. Open workspace. 2. Attempt write/delete from external process. | 1. Rust holds exclusive handles over `main.md` and `assets.json`. 2. OS blocks external modification. |
| **`TC-MD-01-RUST-007`** | `REQ-MD-01-024` | Positive (Archive Lock) | `reserve_file_handles` | 1. Open Mode A archive workspace. 2. Attempt external file move on `.hasmmd`. | 1. Rust holds exclusive read/share lock on `.hasmmd`. 2. OS blocks moving/deleting source file. |
| **`TC-MD-01-RUST-008`** | `REQ-MD-01-025` | Positive (Manifest Load) | `load_manifest` | 1. Place `assets.json` with 3 entries. 2. Call `load_manifest()`. | 1. Parses JSON into `AssetManifest` (`HashMap` with 3 items). |
| **`TC-MD-01-RUST-009`** | `REQ-MD-01-030` `031` `032` | Positive (Core Verify Pass) | `verify_structure` | 1. Place valid `main.md`, `assets.json`, `assets/`. 2. Run verify. | 1. Returns `Ok(PackageStatePayload)`. |
| **`TC-MD-01-RUST-010`** | `REQ-MD-01-031` | Negative (Core Verify Fail) | `verify_structure` | 1. Delete `assets.json`. 2. Run `verify_structure()`. | 1. Returns `Err(PackageValidationError::MissingAssetsJson)`. |
| **`TC-MD-01-RUST-011`** | `REQ-MD-01-034` | Positive (Non-Fatal Missing Assets) | `verify_structure` | 1. Register `a.png` and `b.png` in `assets.json`. 2. Delete physical `a.png` from `assets/`. 3. Run verify. | 1. Returns `Ok(PackageStatePayload)` containing `MissingAssetInfo` array for `a.png` without throwing Error. |
| **`TC-MD-01-RUST-012`** | `REQ-MD-01-110` | Positive (Dynamic Timeout) | `calc_timeout` | 1. Pass total size 500MB. | 1. Returns calculated timeout of 50 seconds. |
| **`TC-MD-01-RUST-013`** | `REQ-MD-01-112` `REQ-MD-01-113` | Negative (Stall & Purge) | `import_folder` | 1. Freeze write handle (> 15s). | 1. Triggers Stall Guard. 2. Purges incomplete `<UUID>/` directory. |