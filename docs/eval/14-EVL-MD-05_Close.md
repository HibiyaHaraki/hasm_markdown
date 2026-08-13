# EVL-MD-05: Workspace Close, OS Target Handle Release, Process Lock Unbinding, and App Local Cleanup Evaluation Specification

This document defines the comprehensive test matrix, acceptance criteria, and traceability mapping for validating the workspace close lifecycle. It covers dirty state interception (`isDirty`), target-specific OS file handle release (`Mode A` ZIP vs `Mode B` Folder), process lock status transition (`.lock` payload update to `PID: 0` / `Unlocked`), `App Local` sandbox cache garbage collection, and frontend store reset.

---

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-05-E2E-001`** | `REQ-MD-05-001` `REQ-MD-05-003` | Positive (Dirty Close Cancel) | Attempt Close with Unsaved Changes and Click Cancel | 1. Modify text buffer (`isDirty = true`). 2. Click "Close Workspace". 3. Click "Cancel" in Unsaved Changes Modal. | 1. Modal is dismissed. 2. Navigation is aborted. 3. Active workspace remains mounted in `/editor` with zero data loss. |
| **`TC-MD-05-E2E-002`** | `REQ-MD-05-001` `REQ-MD-05-002` | Positive (Dirty Close Save) | Attempt Close with Unsaved Changes and Click Save | 1. Modify text buffer (`isDirty = true`). 2. Click "Close Workspace". 3. Click "Save" in Modal. | 1. Delegates to `SEQ-MD-04` save execution. 2. Save completes successfully. 3. Workspace unmounts and routes to `/select`. |
| **`TC-MD-05-E2E-003`** | `REQ-MD-05-001` `REQ-MD-05-004` | Positive (Dirty Close Discard) | Attempt Close with Unsaved Changes and Click Discard | 1. Modify text buffer (`isDirty = true`). 2. Click "Close Workspace". 3. Click "Discard Changes" in Modal. | 1. Bypasses save execution. 2. Unmounts workspace immediately. 3. Buffer edits are discarded. |
| **`TC-MD-05-E2E-004`** | `REQ-MD-05-010` `REQ-MD-05-021` | Positive (Mode A Close & Lock Check) | Close ZIP Archive Workspace (`Mode A`) and Verify OS Lock State | 1. Mount `.hasmmd` archive. 2. Close workspace. 3. Inspect target `.hasmmd` via external OS process. 4. Inspect `<UUID>/.lock`. | 1. OS write/share lock on `.hasmmd` is completely released. 2. File can be renamed/moved in OS File Explorer. 3. `<UUID>/.lock` contains `pid: 0` and `status: "Unlocked"`. |
| **`TC-MD-05-E2E-005`** | `REQ-MD-05-011` | Positive (Mode B Close & Lock Check) | Close Folder Workspace (`Mode B`) and Verify OS Lock State | 1. Mount external folder workspace. 2. Close workspace. 3. Attempt external text edit on `main.md`. | 1. OS write lock on external `main.md` and `assets.json` is released. 2. External application can edit and save `main.md` without permission errors. |

---

## 2. React Level Tests (Frontend Component & UI Store State)

| Test ID | Trace Requirement ID | Test Type | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-05-REACT-001`** | `REQ-MD-05-031` | Positive (Store Reset) | `usePackageStore` | 1. Complete workspace close IPC invocation. 2. Inspect active store state. | 1. `usePackageStore` is reset to initial null state. 2. `rawContent`, `manifest`, `missingAssets`, and `warnings` are cleared. |
| **`TC-MD-05-REACT-002`** | `REQ-MD-05-032` | Positive (Navigation Routing) | `Header.tsx` / Router | 1. Click "Close Workspace" button on a clean workspace (`isDirty = false`). | 1. Invokes unmount IPC command. 2. Routes user to `/select` page immediately. |

---

## 3. Rust Level Tests (Backend Engine, Lock Transition & GC)

| Test ID | Trace Requirement ID | Test Type | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-05-RUST-001`** | `REQ-MD-05-021` | Positive (Lock Payload Transition) | `workspace::unlock` | 1. Invoke `close_and_cleanup_workspace`. 2. Parse JSON payload of `<UUID>/.lock`. | 1. Physical `.lock` file exists on disk. 2. Payload is set to `{"pid": 0, "status": "Unlocked", ...}`. |
| **`TC-MD-05-RUST-002`** | `REQ-MD-05-030` | Positive (Temp Sandbox GC) | `workspace::cleanup_cache` | 1. Create temporary render caches in `<AppLocalDataDir>/<UUID>/`. 2. Execute workspace close. | 1. Temporary cache files are deleted. 2. Retained workspace configuration remains intact. |
| **`TC-MD-05-RUST-003`** | `REQ-MD-05-101` | Positive (Re-Mount SLA) | `commands::close_and_cleanup_workspace` | 1. Measure duration of close IPC command. 2. Re-open workspace in a new process immediately. | 1. Close command completes within 20ms. 2. Subsequent `open_workspace` call detects `Unlocked` state and claims the lock instantly. |