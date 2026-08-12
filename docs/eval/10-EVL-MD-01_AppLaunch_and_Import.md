# EVL-MD-01: App Launch, Import, Workspace Locking, and Lightweight Metadata Initialization Evaluation Specification

This document defines the comprehensive test matrix, acceptance criteria, and traceability mapping for validating multi-instance execution, single-workspace process locking (`.lock`), selective lightweight metadata import (`Mode A` / `Mode B`), portable relative path handling with runtime absolute path expansion (`resolvedPath`), structural validation, and instant editor routing.

---

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-E2E-001`** | `REQ-MD-01-001` | Positive (Multi-Instance) | Multi-Window Application Launch | 1. Launch instance A of `hasm_markdown`. 2. Launch instance B of `hasm_markdown` pointing to a different workspace target. | 1. Both instances launch successfully into separate desktop windows without process conflict. |
| **`TC-MD-01-E2E-002`** | `REQ-MD-01-002` `REQ-MD-01-003` | Negative (Lock Conflict) | Open Workspace Already Locked by Active Process | 1. Open Workspace X in Window A (PID 1024 active, writing `.lock`). 2. Attempt to open Workspace X in Window B. | 1. Window B rejects workspace mounting. 2. Displays Lock Conflict Modal ("Workspace already open in another window"). |
| **`TC-MD-01-E2E-003`** | `REQ-MD-01-010` `REQ-MD-01-011` | Positive (Instant Import) | Open 10GB `.hasmmd` Archive Package | 1. Select a 10GB `.hasmmd` ZIP archive. 2. Trigger workspace open. 3. Measure duration from selection to `/editor` render. | 1. Startup completes within 100ms. 2. Only `main.md` and `assets.json` are extracted to `App Local`. 3. Zero asset binaries are copied upfront. |
| **`TC-MD-01-E2E-004`** | `REQ-MD-01-020` `REQ-MD-01-021` | Positive (Path Expansion) | Verify Asset Resolution on Workspace Open | 1. Open workspace with relative entries (`assets/fig1.png`). 2. Inspect active React Store (`usePackageStore`). | 1. Manifest entries contain dynamically expanded `resolvedPath` (absolute OS path or `asset-stream://` URI). |
| **`TC-MD-01-E2E-005`** | `REQ-MD-01-030` | Negative (Missing Metadata) | Open Workspace with Corrupted/Missing `main.md` | 1. Open target directory lacking `main.md`. | 1. Application aborts mounting. 2. Renders Data Error Page (`/error-model`). |

---

## 2. React Level Tests (Frontend Component & UI Store State)

| Test ID | Trace Requirement ID | Test Type | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-REACT-001`** | `REQ-MD-01-033` | Positive (State Commitment) | `usePackageStore` | 1. Receive `PackageStatePayload` from backend `invoke`. | 1. Store is populated with `uuid`, `tempDirPath`, and manifest containing `resolvedPath` entries. 2. `isLoading` becomes `false`. |
| **`TC-MD-01-REACT-002`** | `REQ-MD-01-032` | Positive (Missing Asset Array) | `usePackageStore` | 1. Open workspace with asset keys missing from physical ZIP index. | 1. `missingAssets` array is populated with missing key details. 2. Editor routes successfully without fatal errors. |
| **`TC-MD-01-REACT-003`** | `REQ-MD-01-012` | Positive (Folder Mount) | `SelectPage.tsx` | 1. Select Mode B (Folder Mode). | 1. Dispatches `open_folder_workspace` IPC command with target path. |

---

## 3. Rust Level Tests (Backend Engine, Lock Execution & Path Expansion)

| Test ID | Trace Requirement ID | Test Type | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-RUST-001`** | `REQ-MD-01-004` | Positive (Lock File Acquisition) | `workspace::lock` | 1. Execute `open_archive_workspace`. 2. Inspect `<UUID>/.lock`. | 1. File contains active process PID. 2. Exclusive write file handles held on `main.md` and `assets.json`. |
| **`TC-MD-01-RUST-002`** | `REQ-MD-01-010` | Positive (Selective Extraction) | `workspace::unpack` | 1. Unpack `.hasmmd` archive containing 500MB of images. | 1. `main.md` and `assets.json` extracted to `<AppLocalDataDir>/<UUID>/`. 2. `assets/` subfolder remains empty in `App Local`. |
| **`TC-MD-01-RUST-003`** | `REQ-MD-01-021` `REQ-MD-01-022` | Positive (Path Resolution) | `manifest::resolve` | 1. Parse `assets.json` in Mode A (ZIP Archive). 2. Inspect returned manifest. | 1. Maps `relativePath` (`assets/a.png`) to `resolvedPath` (`asset-stream://<UUID>/a`). |
| **`TC-MD-01-RUST-004`** | `REQ-MD-01-003` | Negative (Stale Lock Cleanup) | `workspace::lock` | 1. Write `.lock` with dead PID. 2. Execute workspace open. | 1. Detects dead PID in OS process table. 2. Overwrites stale lock file and successfully opens workspace. |