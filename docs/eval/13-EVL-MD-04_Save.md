# EVL-MD-04: Workspace Save, Export, Asset Delta Synchronization, Path Normalization, and Archive Writing Evaluation Specification

This document defines the comprehensive test matrix, acceptance criteria, and traceability mapping for validating workspace save and export operations, including deletion list generation (`isDeleted: true`), addition list generation (UUID comparison), delta execution, soft-deleted binary purging, atomic ZIP file replacement, archive manifest relative path normalization, App Local synchronization, and runtime absolute path re-binding (`resolvedPath`).

The executable evaluation command is `npm run check:seq-md-04`. It reports individual frontend and Rust save cases using the fixed PASS/FAIL format and exercises progress updates, in-place save invocation, Save As cancellation, dirty-state commitment, delta planning, deletion purging, and path normalization.

---

## Preconditions and Verification

Save assertions require a dirty loaded workspace, a known manifest delta, and a defined save destination. They are state preconditions rather than an arbitrary delay before clicking Save.

| Precondition | Verification | Current automation status |
| --- | --- | --- |
| Node dependencies, Playwright Chromium, Rust, and the evaluation Vite port are available. | CI installs prerequisites; the script launches Vite with `--strictPort` and waits for its URL. | Satisfied when startup succeeds. |
| The browser workspace is mounted with `isDirty: true`, one addition, one soft-deleted entry, and a rebindable external asset source. | `check-seq-md-04.mjs` supplies a deterministic package payload and mock save responses. | Satisfied by the fixture. |
| The save/export IPC mock emits ordered progress updates and returns a committed package state. | The script registers progress callbacks and mocked `execute_package_save_or_export` results before navigation. | Satisfied by mocks. |
| The Save As scenario has an explicit dialog outcome. | The fixture returns either a selected destination or cancellation through the dialog mock. | Satisfied by mocks. |
| A real archive/folder target is writable and can tolerate interruption for performance and crash-safety cases. | Run the desktop cases against a real target and inspect the written archive/folder after an interrupted save. | Not established by mocked browser IPC. |

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Precondition | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-04-E2E-001`** | `REQ-MD-04-001` `REQ-MD-04-022` | Positive (In-Place Save) | Dirty workspace has one added and one soft-deleted asset. | Execute In-Place Save with Added and Soft-Deleted Assets | 1. Add 1 new asset and soft-delete 1 existing asset. 2. Click "Save" button. 3. Monitor Save Progress Modal and inspect target `.hasmmd` archive. | 1. Progress modal displays stage transitions. 2. Soft-deleted asset is purged from target archive. 3. New asset is compressed into target archive. 4. `targetPath` file is successfully updated via atomic replacement. |
| **`TC-MD-04-E2E-002`** | `REQ-MD-04-002` | Positive (Export As Dialog) | Dirty workspace has a writable export destination. | Export Package to New Destination via OS Save Dialog | 1. Modify workspace. 2. Click "Export Package" menu item. 3. Select new destination path via OS Save Dialog. | 1. OS Save Dialog opens successfully. 2. Package is exported to the specified destination path. 3. Active workspace switches to the new target path. |
| **`TC-MD-04-E2E-003`** | `REQ-MD-04-100` | Positive (Minimal Delta Performance) | Dirty package contains 1GB of unmodified media assets. | Save Package with 1GB Unmodified Assets | 1. Setup package containing 1GB of media assets. 2. Modify only text buffer (`main.md`). 3. Trigger Save action. | 1. Save operation completes within 3 seconds. 2. Unmodified assets are completely skipped during binary packing phase. |
| **`TC-MD-04-E2E-004`** | `REQ-MD-04-101` | Negative (Crash Safety / Atomic Write) | Existing target archive is readable before save begins. | Simulate Power Loss / Interrupt During Save | 1. Trigger Save action. 2. Forcefully kill backend process mid-stream during temporary zip generation. | 1. Original master target archive remains completely intact and uncorrupted. 2. No partial file truncation occurs on `targetPath`. |
| **`TC-MD-04-E2E-005`** | `REQ-MD-04-043` `REQ-MD-04-044` `REQ-MD-04-045` `REQ-MD-04-046` | Positive (External Asset Materialization) | Dirty workspace has a registered readable external image. | Save Registered External Image to Folder and Archive | 1. Register an image under a unique alias without copying it. 2. Save to a folder and export to `.hasmmd`. 3. Inspect target binaries and manifests. | 1. Both targets contain `assets/<uuid>.<extension>`. 2. Portable manifests contain relative paths and no external absolute source path. 3. The alias and Markdown reference remain unchanged. 4. The active runtime manifest rebinds paths for continued display. |

---

## 2. React Level Tests (Frontend Component & Progress State)

| Test ID | Trace Requirement ID | Test Type | Precondition | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-04-REACT-001`** | `REQ-MD-04-003` | Positive (Progress Modal) | Save/export action emits ordered progress events. | `SaveProgressModal.tsx` | 1. Trigger save/export action. 2. Listen to emitted `save_progress` IPC events. | 1. Progress modal renders active stage label and updates progress bar percentage from 0% to 100%. |
| **`TC-MD-04-REACT-002`** | `REQ-MD-04-042` | Positive (Store Commit & Dirty Reset) | Store contains a dirty package and a successful save result. | `usePackageStore` | 1. Complete save execution successfully. 2. Inspect active store state. | 1. `isDirty` resets to `false`. 2. `lastSavedContent` matches current `rawContent`. 3. Manifest is updated with re-bound `resolvedPath` entries. |
| **`TC-MD-04-REACT-003`** | `REQ-MD-04-002` | Positive (Dialog Canceled) | Export dialog is configured to return cancellation. | `SaveMenu.tsx` | 1. Trigger "Export Package". 2. Cancel OS Save Dialog. | 1. Returns `Ok(None)`. 2. Progress modal does not appear; workspace state remains unchanged. |
| **`TC-MD-04-REACT-004`** | `REQ-MD-04-043` `REQ-MD-04-046` | Positive (Runtime Rebinding After Save) | Active manifest contains a registered external image. | Main Editor, Preview, and Asset Shelf | 1. Complete save/export for a registered external image. 2. Inspect the active manifest and image surfaces. | 1. Alias and Markdown remain stable. 2. Runtime sources use the selected folder path or archive stream mapping. 3. Preview and shelf remain displayable after save. |

---

## 3. Rust Level Tests (Backend Engine, Delta Algorithm & Atomic Writing)

| Test ID | Trace Requirement ID | Test Type | Precondition | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-04-RUST-001`** | `REQ-MD-04-010` `REQ-MD-04-011` | Positive (Delta List Generation) | Manifest has one new and one soft-deleted asset. | `save::compute_deltas` | 1. Execute save with a manifest containing 1 soft-deleted asset and 1 new addition. | 1. Correctly generates `delete_list` containing soft-deleted UUID and `addition_list` containing new asset UUID. |
| **`TC-MD-04-RUST-002`** | `REQ-MD-04-020` `REQ-MD-04-030` | Positive (Soft-Delete Purge) | Target contains binaries and metadata for the delete list. | `save::execute_deltas` | 1. Run delta execution with non-empty `delete_list`. | 1. Physically unlinks target binaries matching `delete_list`. 2. Removes corresponding metadata records from target `assets.json`. |
| **`TC-MD-04-RUST-003`** | `REQ-MD-04-032` | Positive (Path Normalization) | Runtime manifest contains active absolute `resolvedPath` entries. | `manifest::normalize_paths` | 1. Process runtime manifest containing absolute `resolvedPath` entries prior to write. | 1. Transforms all active manifest entries into package-relative format (`assets/<uuid>.<ext>`). |
| **`TC-MD-04-RUST-004`** | `REQ-MD-04-040` `REQ-MD-04-041` | Positive (App Local Re-binding) | App Local contains a normalized saved manifest. | `save::sync_app_local` | 1. Flush normalized manifest to `App Local`. 2. Invoke absolute path re-expansion. | 1. Re-bounds relative paths to active runtime `resolvedPath` URIs (`asset-stream://` or absolute OS path). |
| **`TC-MD-04-RUST-005`** | `REQ-MD-04-043` `REQ-MD-04-044` `REQ-MD-04-045` | Positive (External Source Materialization) | Fixture image exists at a readable absolute source path. | `save::execute_package_save_or_export` | 1. Register a fixture image with an absolute source path. 2. Save to a folder and archive. 3. Inspect copied bytes and portable manifests. | 1. Source remains external before save. 2. Each target receives the binary under its relative asset path. 3. Absolute source paths are absent from portable manifests while runtime rebinding remains available. |