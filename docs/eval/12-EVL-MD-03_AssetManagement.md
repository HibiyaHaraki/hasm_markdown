# EVL-MD-03: Asset Window Operations, Single-Asset Upload Constraint, Soft-Deletion (Delete Flag), and Dynamic Path Mapping Evaluation Specification

This document defines the comprehensive test matrix, acceptance criteria, and traceability mapping for validating Asset Window rendering, single-file drop/select constraints, custom alias naming, dynamic path binding (`resolvedPath`), real-time `main.md` reference inspection before deletion, soft-deletion via `isDeleted: true` flag in `assets.json`, progress streaming events (`asset_register_progress` / `asset_delete_progress`), and editor red-text state synchronization upon window closure.

The executable evaluation command is `npm run check:seq-md-03`. It reports each UI, browser, and Rust case individually using the fixed colored PASS/FAIL format. It uses a deterministic multi-asset browser fixture and the Rust suite covers alias reservation and deleted-reference line tracking.

---

## Preconditions and Verification

The asset scenarios require a loaded workspace and specific manifest/cursor/modal state. They do not become valid merely because the Vite server is reachable.

| Precondition | Verification | Current automation status |
| --- | --- | --- |
| Node dependencies, Playwright Chromium, Rust, and the evaluation Vite port are available. | CI installs prerequisites; the script starts Vite with `--strictPort` and waits for its URL. | Satisfied when startup succeeds. |
| The browser fixture contains active assets, a soft-deleted asset, and an alias reserved by workspace history. | `check-seq-md-03.mjs` creates a deterministic multi-asset manifest and mock IPC responses. | Satisfied. |
| The editor has mounted and exposes a cursor position before an asset insertion assertion. | The browser fixture opens the editor and drives the cursor before testing insertion. | Satisfied by the fixture. |
| Asset Window, naming, collision, and delete-warning controls are rendered before they are interacted with. | Each browser case opens the relevant UI state before locating its control. | Satisfied by the harness where the control exists; a missing accessible control is a test failure, not a reason to wait. |
| A real external image file and the native single-file picker are available for desktop scenarios. | Run the desktop cases in the packaged Tauri application with an actual image file. | Not established by mocked Playwright IPC. |

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Precondition | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-03-E2E-001`** | `REQ-MD-03-011` `REQ-MD-03-012` | Positive (Picker Selection & Rename) | Asset Window is open and one valid image file is selectable. | Select One Image and Rename It | 1. Open Asset Window. 2. Click "Select image". 3. Enter custom alias `arch_v1.png` in Modal. | 1. Alias form appears with the selected filename. 2. Asset is registered with `arch_v1.png`. 3. Fast binding completes without heavy archive re-compression. |
| **`TC-MD-03-E2E-002`** | `REQ-MD-03-010` | Positive (Drag-and-Drop Unavailable) | Asset Window is open. | Verify Picker-Only Asset Selection | 1. Open Asset Window. 2. Inspect its selection controls. | 1. No drag-and-drop target is rendered. 2. The themed "Select image" button is available. |
| **`TC-MD-03-E2E-003`** | `REQ-MD-03-013` | Negative (Alias Collision) | Manifest reserves the candidate alias. | Enter Alias Reserved by Active or Soft-Deleted Asset | 1. Attempt to register asset with an alias string currently active OR marked `isDeleted: true`. | 1. Modal rejects submission. 2. Renders inline error ("Alias or reserved name already exists in workspace history."). |
| **`TC-MD-03-E2E-004`** | `REQ-MD-03-020` `REQ-MD-03-021` | Positive (In-Use Delete Warning) | Open Asset Window lists an asset referenced by `main.md`. | Delete Asset Currently Referenced in `main.md` | 1. Target asset referenced on Line 12 of `main.md`. 2. Click "Delete" on asset item. | 1. System scans `rawContent`. 2. Displays Warning Modal explicitly highlighting line 12 reference before confirmation. |
| **`TC-MD-03-E2E-005`** | `REQ-MD-03-022` `REQ-MD-03-031` | Positive (Soft Delete & Red Text Sync) | Delete confirmation is open for a referenced active asset. | Soft-Delete Asset and Close Window | 1. Confirm delete for target asset. 2. Inspect `assets.json`. 3. Close Asset Window. | 1. Entry in `assets.json` receives `isDeleted: true` (UUID & metadata preserved). 2. Code Editor applies red line decorators to references. |
| **`TC-MD-03-E2E-006`** | `REQ-MD-03-014` `REQ-MD-03-016` | Positive (Alias and Runtime Display) | Workspace has a unique alias and a readable external image. | Register External Image and Use Its Alias | 1. Register a real image using a unique custom alias. 2. Confirm the editor insertion and asset shelf show that alias. 3. Observe the editor/preview image before saving. | 1. Markdown uses `asset:<custom_alias>`. 2. Manifest stores the generated UUID, MIME type, and absolute source path in `resolvedPath`. 3. Preview and shelf display the image from the external source without copying it into the workspace. |

---

## 2. React Level Tests (Frontend Component & UI Store State)

| Test ID | Trace Requirement ID | Test Type | Precondition | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-03-REACT-001`** | `REQ-MD-03-002` | Positive (Active Asset Filter) | Manifest contains active and soft-deleted assets. | `AssetWindow.tsx` | 1. Render Asset Window with a mix of active and `isDeleted: true` manifest entries. | 1. Only active non-deleted assets are displayed in the UI grid/list. |
| **`TC-MD-03-REACT-002`** | `REQ-MD-03-015` | Positive (Cursor Text Insertion) | Editor has an active cursor on Line 5. | `MarkdownEditor.tsx` | 1. Place active cursor on Line 5. 2. Complete single asset addition via Modal. | 1. Text `![alt](asset:custom_alias)` is inserted at cursor position on Line 5. |
| **`TC-MD-03-REACT-003`** | `REQ-MD-03-023` | Positive (Progress Listener) | Asset Window has a progress-event subscription. | `AssetWindow.tsx` | 1. Trigger asset registration or soft-deletion. 2. Listen to `asset_register_progress` / `asset_delete_progress`. | 1. UI renders progress bar / spinner updating from 0% to 100%. |
| **`TC-MD-03-REACT-004`** | `REQ-MD-03-030` | Positive (Window Close Recalc) | Store contains a reference to a soft-deleted asset. | `usePackageStore` | 1. Dismiss Asset Window after soft-deleting an asset. | 1. Triggers recalculation of `missingAssets` and `warnings`. 2. Editor decorators update instantly. |
| **`TC-MD-03-REACT-005`** | `REQ-MD-03-014` `REQ-MD-03-016` `REQ-MD-03-017` | Positive (Alias Shelf, Image Source, and Tooltip) | Package contains an active asset with deterministic image bytes and a runtime resolved path. | Main Editor Asset Shelf and Preview | 1. Render a package with an active asset and a deterministic image byte fixture. 2. Hover the asset alias in the shelf. 3. Click the alias. | 1. The tooltip contains only the resolved runtime path. 2. The alias inserts `![alt](asset:<alias>)` at the cursor. 3. The shelf and preview use the resolved runtime image source, not a literal unresolved `asset://C:/...` URL. |
| **`TC-MD-03-REACT-006`** | `REQ-MD-03-001` `REQ-MD-03-002` `REQ-MD-03-017` | Positive (Preview Path Tooltip) | Asset Window has an active manifest entry with a runtime resolved path. | `AssetWindow.jsx` | 1. Open Asset Window with an active manifest entry. 2. Hover or keyboard-focus the asset alias. | 1. The Bootstrap tooltip contains only `resolvedPath`. 2. Other `assets.json` fields are not shown. 3. Soft-deleted entries remain excluded from the active list. |

---

## 3. Rust Level Tests (Backend Engine, Binding & Manifest Mutation)

| Test ID | Trace Requirement ID | Test Type | Precondition | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-03-RUST-001`** | `REQ-MD-03-014` | Positive (Dynamic Path Binding) | Source path is readable and alias is unreserved. | `commands::register_and_bind_single_asset_path` | 1. Invoke IPC with valid source path and custom alias. | 1. Generates UUID. 2. Creates `RuntimeAssetMetadata` with `resolvedPath = source_path`. 3. Operation completes within 10ms without ZIP copy. |
| **`TC-MD-03-RUST-002`** | `REQ-MD-03-022` | Positive (Soft Delete Flag) | Manifest contains the target active alias. | `commands::soft_delete_asset_mapping` | 1. Invoke IPC with target alias. 2. Inspect updated `assets.json`. | 1. Asset entry retains UUID, relativePath, and mimeType. 2. `isDeleted` is set to `true` and `deletedAt` timestamp is added. |
| **`TC-MD-03-RUST-003`** | `REQ-MD-03-013` | Negative (Soft-Deleted Collision Check) | Manifest contains a soft-deleted entry for the candidate alias. | `manifest::validate_alias` | 1. Test alias string against a manifest containing an entry with `isDeleted: true`. | 1. Returns `Err(PackageError::AliasCollision)`. Soft-deleted aliases remain reserved. |