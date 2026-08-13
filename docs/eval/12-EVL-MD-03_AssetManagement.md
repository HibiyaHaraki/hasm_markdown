# EVL-MD-03: Asset Window Operations, Single-Asset Upload Constraint, Soft-Deletion (Delete Flag), and Dynamic Path Mapping Evaluation Specification

This document defines the comprehensive test matrix, acceptance criteria, and traceability mapping for validating Asset Window rendering, single-file drop/select constraints, custom alias naming, dynamic path binding (`resolvedPath`), real-time `main.md` reference inspection before deletion, soft-deletion via `isDeleted: true` flag in `assets.json`, progress streaming events (`asset_register_progress` / `asset_delete_progress`), and editor red-text state synchronization upon window closure.

The executable evaluation command is `npm run check:seq-md-03`. It reports each UI, browser, and Rust case individually using the fixed colored PASS/FAIL format. It uses a deterministic multi-asset browser fixture and the Rust suite covers alias reservation and deleted-reference line tracking.

---

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-03-E2E-001`** | `REQ-MD-03-010` `REQ-MD-03-012` | Positive (Single Drop & Rename) | Drag & Drop Single Image onto Asset Window | 1. Open Asset Window. 2. Drag & drop 1 image file. 3. Enter custom alias `arch_v1.png` in Modal. | 1. Naming Modal appears. 2. Asset is registered with `arch_v1.png`. 3. Fast binding completes without heavy archive re-compression. |
| **`TC-MD-03-E2E-002`** | `REQ-MD-03-010` | Positive / Boundary (Multi-Drop) | Drag & Drop Multiple Images Simultaneously | 1. Open Asset Window. 2. Drag & drop 3 image files at once. | 1. System accepts only `files[0]`. 2. Displays toast notification ("Single file upload supported. Processing first item."). |
| **`TC-MD-03-E2E-003`** | `REQ-MD-03-013` | Negative (Alias Collision) | Enter Alias Reserved by Active or Soft-Deleted Asset | 1. Attempt to register asset with an alias string currently active OR marked `isDeleted: true`. | 1. Modal rejects submission. 2. Renders inline error ("Alias or reserved name already exists in workspace history."). |
| **`TC-MD-03-E2E-004`** | `REQ-MD-03-020` `REQ-MD-03-021` | Positive (In-Use Delete Warning) | Delete Asset Currently Referenced in `main.md` | 1. Target asset referenced on Line 12 of `main.md`. 2. Click "Delete" on asset item. | 1. System scans `rawContent`. 2. Displays Warning Modal explicitly highlighting line 12 reference before confirmation. |
| **`TC-MD-03-E2E-005`** | `REQ-MD-03-022` `REQ-MD-03-031` | Positive (Soft Delete & Red Text Sync) | Soft-Delete Asset and Close Window | 1. Confirm delete for target asset. 2. Inspect `assets.json`. 3. Close Asset Window. | 1. Entry in `assets.json` receives `isDeleted: true` (UUID & metadata preserved). 2. Code Editor applies red line decorators to references. |

---

## 2. React Level Tests (Frontend Component & UI Store State)

| Test ID | Trace Requirement ID | Test Type | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-03-REACT-001`** | `REQ-MD-03-002` | Positive (Active Asset Filter) | `AssetWindow.tsx` | 1. Render Asset Window with a mix of active and `isDeleted: true` manifest entries. | 1. Only active non-deleted assets are displayed in the UI grid/list. |
| **`TC-MD-03-REACT-002`** | `REQ-MD-03-015` | Positive (Cursor Text Insertion) | `MarkdownEditor.tsx` | 1. Place active cursor on Line 5. 2. Complete single asset addition via Modal. | 1. Text `![alt](asset:custom_alias)` is inserted at cursor position on Line 5. |
| **`TC-MD-03-REACT-003`** | `REQ-MD-03-023` | Positive (Progress Listener) | `AssetWindow.tsx` | 1. Trigger asset registration or soft-deletion. 2. Listen to `asset_register_progress` / `asset_delete_progress`. | 1. UI renders progress bar / spinner updating from 0% to 100%. |
| **`TC-MD-03-REACT-004`** | `REQ-MD-03-030` | Positive (Window Close Recalc) | `usePackageStore` | 1. Dismiss Asset Window after soft-deleting an asset. | 1. Triggers recalculation of `missingAssets` and `warnings`. 2. Editor decorators update instantly. |

---

## 3. Rust Level Tests (Backend Engine, Binding & Manifest Mutation)

| Test ID | Trace Requirement ID | Test Type | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-03-RUST-001`** | `REQ-MD-03-014` | Positive (Dynamic Path Binding) | `commands::register_and_bind_single_asset_path` | 1. Invoke IPC with valid source path and custom alias. | 1. Generates UUID. 2. Creates `RuntimeAssetMetadata` with `resolvedPath = source_path`. 3. Operation completes within 10ms without ZIP copy. |
| **`TC-MD-03-RUST-002`** | `REQ-MD-03-022` | Positive (Soft Delete Flag) | `commands::soft_delete_asset_mapping` | 1. Invoke IPC with target alias. 2. Inspect updated `assets.json`. | 1. Asset entry retains UUID, relativePath, and mimeType. 2. `isDeleted` is set to `true` and `deletedAt` timestamp is added. |
| **`TC-MD-03-RUST-003`** | `REQ-MD-03-013` | Negative (Soft-Deleted Collision Check) | `manifest::validate_alias` | 1. Test alias string against a manifest containing an entry with `isDeleted: true`. | 1. Returns `Err(PackageError::AliasCollision)`. Soft-deleted aliases remain reserved. |