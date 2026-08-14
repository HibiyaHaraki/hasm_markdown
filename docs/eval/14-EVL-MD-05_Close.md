# EVL-MD-05: Workspace Close, OS Target Handle Release, Process Lock Unbinding, and App Local Cleanup Evaluation Specification

This document defines the comprehensive test matrix, acceptance criteria, and traceability mapping for validating the workspace close lifecycle. It covers dirty state interception (`isDirty`), target-specific OS file handle release (`Mode A` ZIP vs `Mode B` Folder), process lock status transition (`.lock` payload update to `PID: 0` / `Unlocked`), `App Local` sandbox cache garbage collection, and frontend store reset.

The executable evaluation command is `npm run check:seq-md-05`. It reports individual dirty-close choices, archive/folder handle cases, moved-package reopen/edit coverage, store routing checks, and Rust lock-transition, cleanup, and remount cases using the fixed PASS/FAIL format.

---

## Preconditions and Verification

Close behavior is valid only from an explicitly mounted workspace with known dirty state and target type. The browser cases model these states; they do not prove operating-system handle release.

| Precondition | Verification | Current automation status |
| --- | --- | --- |
| Node dependencies, Playwright Chromium, Rust, and the evaluation Vite port are available. | CI installs prerequisites; the script launches Vite with `--strictPort` and waits for its URL. | Satisfied when startup succeeds. |
| Dirty-close cases begin with a mounted workspace whose buffer differs from its last saved content. | `check-seq-md-05.mjs` supplies deterministic dirty package state before opening the close flow. | Satisfied by the fixture. |
| Clean-close, archive, folder, moved-target, and saved-asset cases have an explicit target type and mock IPC result. | The script sets target-specific package payloads and registers close/reopen/dialog mocks. | Satisfied by mocks. |
| The Unsaved Changes modal is open before its Cancel, Save, or Discard action is selected. | Each browser case initiates close from the dirty state and waits for the modal controls. | Satisfied by the harness. |
| Real OS file-handle release, external editor write access, and multi-process lock behavior are available for desktop verification. | Run the listed Mode A/Mode B cases in the packaged application with a second process or external editor. | Not established by mocked Playwright IPC. |

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Precondition | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-05-E2E-001`** | `REQ-MD-05-001` `REQ-MD-05-003` | Positive (Dirty Close Cancel) | Mounted workspace has unsaved buffer changes. | Attempt Close with Unsaved Changes and Click Cancel | 1. Modify text buffer (`isDirty = true`). 2. Click "Close Workspace". 3. Click "Cancel" in Unsaved Changes Modal. | 1. Modal is dismissed. 2. Navigation is aborted. 3. Active workspace remains mounted in `/editor` with zero data loss. |
| **`TC-MD-05-E2E-002`** | `REQ-MD-05-001` `REQ-MD-05-002` | Positive (Dirty Close Save) | Mounted workspace has unsaved buffer changes. | Attempt Close with Unsaved Changes and Click Save | 1. Modify text buffer (`isDirty = true`). 2. Click "Close Workspace". 3. Click "Save" in Modal. | 1. Delegates to `SEQ-MD-04` save execution. 2. Save completes successfully. 3. Workspace unmounts and routes to `/select`. |
| **`TC-MD-05-E2E-003`** | `REQ-MD-05-001` `REQ-MD-05-004` | Positive (Dirty Close Discard) | Mounted workspace has unsaved buffer changes. | Attempt Close with Unsaved Changes and Click Discard | 1. Modify text buffer (`isDirty = true`). 2. Click "Close Workspace". 3. Click "Discard Changes" in Modal. | 1. Bypasses save execution. 2. Unmounts workspace immediately. 3. Buffer edits are discarded. |
| **`TC-MD-05-E2E-004`** | `REQ-MD-05-010` `REQ-MD-05-021` | Positive (Mode A Close & Lock Check) | Mounted Mode A workspace has a locked `.hasmmd` target. | Close ZIP Archive Workspace (`Mode A`) and Verify OS Lock State | 1. Mount `.hasmmd` archive. 2. Close workspace. 3. Inspect target `.hasmmd` via external OS process. 4. Inspect `<UUID>/.lock`. | 1. OS write/share lock on `.hasmmd` is completely released. 2. File can be renamed/moved in OS File Explorer. 3. `<UUID>/.lock` contains `pid: 0` and `status: "Unlocked"`. |
| **`TC-MD-05-E2E-005`** | `REQ-MD-05-011` | Positive (Mode B Close & Lock Check) | Mounted Mode B workspace has an external folder target. | Close Folder Workspace (`Mode B`) and Verify OS Lock State | 1. Mount external folder workspace. 2. Close workspace. 3. Attempt external text edit on `main.md`. | 1. OS write lock on external `main.md` and `assets.json` is released. 2. External application can edit and save `main.md` without permission errors. |
| **`TC-MD-05-E2E-006`** | `REQ-MD-05-010` `REQ-MD-05-011` | Positive (Moved Package Reopen) | Saved package exists at its original location. | Save, Move Package, Reopen, and Edit | 1. Save the package. 2. Move the archive/folder to a different path. 3. Open the moved package. 4. Edit its Markdown. | 1. The moved package opens successfully. 2. Metadata and asset paths are rebound for the new location. 3. Markdown remains editable and dirty tracking works. |
| **`TC-MD-05-E2E-007`** | `REQ-MD-05-010` `REQ-MD-05-011` `REQ-MD-05-033` | Positive (Close After Asset Save) | Mounted workspace has saved a registered external image. | Close Workspace After Folder/Archive Asset Materialization | 1. Save a workspace containing a registered external image. 2. Close the workspace. 3. Inspect the saved folder or archive and reopen it. | 1. Close releases target handles and marks the App Local lock as unlocked. 2. Saved image binaries remain available in `assets/`. 3. Reopen resolves the saved relative asset paths and preview remains displayable. |

---

## 2. React Level Tests (Frontend Component & UI Store State)

| Test ID | Trace Requirement ID | Test Type | Precondition | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-05-REACT-001`** | `REQ-MD-05-031` | Positive (Store Reset) | Store contains an active mounted workspace. | `usePackageStore` | 1. Complete workspace close IPC invocation. 2. Inspect active store state. | 1. `usePackageStore` is reset to initial null state. 2. `rawContent`, `manifest`, `missingAssets`, and `warnings` are cleared. |
| **`TC-MD-05-REACT-002`** | `REQ-MD-05-032` | Positive (Navigation Routing) | Mounted workspace is clean. | `Header.tsx` / Router | 1. Click "Close Workspace" button on a clean workspace (`isDirty = false`). | 1. Invokes unmount IPC command. 2. Routes user to `/select` page immediately. |
| **`TC-MD-05-REACT-003`** | `REQ-MD-05-033` | Positive (Saved Asset State Boundary) | Active manifest contains a saved rebound asset path. | Workspace close state | 1. Close a workspace after save/export has rebound an asset path. 2. Inspect the target after the React store is reset. | 1. React clears the active package state. 2. The saved target and its asset binary are unaffected by App Local cleanup. |

---

## 3. Rust Level Tests (Backend Engine, Lock Transition & GC)

| Test ID | Trace Requirement ID | Test Type | Precondition | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-05-RUST-001`** | `REQ-MD-05-021` | Positive (Lock Payload Transition) | App Local workspace contains an active `.lock` file. | `workspace::unlock` | 1. Invoke `close_and_cleanup_workspace`. 2. Parse JSON payload of `<UUID>/.lock`. | 1. Physical `.lock` file exists on disk. 2. Payload is set to `{"pid": 0, "status": "Unlocked", ...}`. |
| **`TC-MD-05-RUST-002`** | `REQ-MD-05-030` | Positive (Temp Sandbox GC) | App Local workspace contains temporary render caches. | `workspace::cleanup_cache` | 1. Create temporary render caches in `<AppLocalDataDir>/<UUID>/`. 2. Execute workspace close. | 1. Temporary cache files are deleted. 2. Retained workspace configuration remains intact. |
| **`TC-MD-05-RUST-003`** | `REQ-MD-05-101` | Positive (Re-Mount SLA) | Mounted workspace has an active App Local lock. | `commands::close_and_cleanup_workspace` | 1. Measure duration of close IPC command. 2. Re-open workspace in a new process immediately. | 1. Close command completes within 20ms. 2. Subsequent `open_workspace` call detects `Unlocked` state and claims the lock instantly. |
| **`TC-MD-05-RUST-004`** | `REQ-MD-05-033` | Positive (Target Asset Preservation) | Folder and archive targets contain a materialized image. | `workspace::close_and_cleanup_workspace` | 1. Materialize an image into a folder and archive target. 2. Close the active workspace. 3. Inspect both targets after cleanup. | 1. Target image binaries remain present and readable. 2. Only App Local temporary buffers/caches are cleaned. 3. Reopen can rebind the saved relative asset paths. |