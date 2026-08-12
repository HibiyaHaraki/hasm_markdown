# REQ-MD-03: Asset Window Operations, Single-Asset Upload Constraint, Soft-Deletion (Delete Flag), and Dynamic Path Mapping Requirements

## 1. Functional Requirements

### 1.1 Asset Window Display & State Readout

* **`REQ-MD-03-001` (Asset Window Initialization):** Upon clicking the "Assets" toolbar button, the system shall mount the Asset Window (Modal or Sidebar) and read active package metadata (`manifest`, `missingAssets`, `warnings`) from `usePackageStore`.
* **`REQ-MD-03-002` (Active Asset List Filtering):** The Asset Window shall render registered assets while filtering out entries marked as `isDeleted: true`.
* **`REQ-MD-03-003` (Missing and Orphan Alerts Display):** The Asset Window shall render distinct alert badges for assets listed in `missingAssets` and unregistered orphan files.

---

### 1.2 Single-Asset Upload & Custom Alias Assignment

* **`REQ-MD-03-010` (Single File Drop Constraint):** When user drops multiple files onto the Asset Window dropzone, the frontend shall accept only the first item (`files[0]`) and display an informational toast notification ("Single file upload supported. Processing first item.").
* **`REQ-MD-03-011` (Single File Picker Constraint):** The OS file dialog invoked via the "Add Asset" button shall strictly enforce single-file selection mode.
* **`REQ-MD-03-012` (Alias Naming Modal Prompt):** Upon selecting or dropping a valid image file, the system shall display an Alias Naming Modal pre-filled with the sanitized base filename.
* **`REQ-MD-03-013` (Alias Collision Validation):** The system shall validate the submitted alias string against all manifest keys (including both active assets and soft-deleted entries). If a collision is detected, the modal shall reject submission and render an inline error ("Alias or reserved name already exists in workspace history.").
* **`REQ-MD-03-014` (Dynamic Path Binding without Heavy Copying):** Upon alias validation, the backend shall construct a `RuntimeAssetMetadata` entry binding the source absolute path to `resolvedPath` without executing immediate ZIP re-compression or heavy archive copying.
* **`REQ-MD-03-015` (Inline Markdown Text Insertion):** If an active cursor is present in the main code editor, the frontend shall insert the formatted image tag `![alt](asset:<custom_alias>)` at the current line upon successful asset registration.

---

### 1.3 In-Use Reference Inspection & Soft-Deletion (`isDeleted` Flag)

* **`REQ-MD-03-020` (Real-Time `main.md` Text Scan):** Upon clicking "Delete" for a selected asset, the system shall scan `usePackageStore.rawContent` for occurrences of `![*](asset:<target_alias>)`.
* **`REQ-MD-03-021` (In-Use Warning Modal):** If the target alias is present in `rawContent`, the system shall display a warning dialog explicitly stating the line numbers affected before prompting for deletion confirmation.
* **`REQ-MD-03-022` (Soft-Deletion Execution - `isDeleted` Flag):** Executing a delete action shall set `isDeleted: true` and attach `deletedAt: timestamp` on the target asset entry in `assets.json` and memory stores. The system shall **not** remove the metadata entry, UUID, or physical file during this action.
* **`REQ-MD-03-023` (Progress Event Streaming):** During asset registration and soft-deletion operations, the Rust backend shall emit progress events (`asset_register_progress` and `asset_delete_progress`) to update the frontend UI status/spinner.

---

### 1.4 State Synchronization & Missing Asset Recalculation

* **`REQ-MD-03-030` (Window Close Recalculation Trigger):** Closing or dismissing the Asset Window shall trigger a full recalculation of `missingAssets` and `warnings` arrays.
* **`REQ-MD-03-031` (Soft-Deleted Asset Missing State Mapping):** Any asset tag referenced in `main.md` that maps to an entry with `isDeleted: true` shall be included in `missingAssets`.
* **`REQ-MD-03-032` (Editor Decorator & Preview Red-Text Sync):** Upon recalculation, the frontend shall commit updated arrays to `usePackageStore`, updating red warning line decorators in the code editor and red-text spans in the preview pane.

---

## 2. Non-Functional Requirements

### 2.1 Storage Integrity and Fast UI Responsiveness

* **`REQ-MD-03-100` (Collision-Free Asset History):** Retaining soft-deleted entries in `assets.json` shall prevent alias/UUID collisions and accidental duplicate key generation throughout the workspace session.
* **`REQ-MD-03-101` (Instant Registration SLA):** Registering a new asset via absolute path binding (`resolvedPath`) shall complete within 10ms without blocking user UI interaction.