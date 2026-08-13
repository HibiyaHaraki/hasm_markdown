# REQ-MD-04: Workspace Save, Export, Asset Delta Synchronization, Path Normalization, and Archive Writing Requirements

## 1. Functional Requirements

### 1.1 Save Invocation & Target Determination

* **`REQ-MD-04-001` (In-Place Save Trigger):** Upon clicking the "Save" toolbar button, the system shall execute an in-place overwrite save using the active workspace target path (`targetPath`).
* **`REQ-MD-04-002` (Export As Trigger & OS Dialog):** Upon clicking "Export Package" (or "Save As"), the system shall invoke the OS native save file dialog to capture a new destination target path (`newTargetPath`) and target format (`.hasmmd` ZIP Archive or Folder).
* **`REQ-MD-04-003` (Progress Modal Display & Event Subscription):** Upon starting save or export execution, the frontend shall display a non-dismissible Save/Export Progress Modal and subscribe to `save_progress` IPC events.

---

### 1.2 Asset Delta Calculation (Deletion & Addition Lists)

* **`REQ-MD-04-010` (Deletion List Generation):** The Rust backend shall scan the in-memory manifest for asset entries marked as `isDeleted: true` and construct a `delete_list: Vec<AssetUuid>`.
* **`REQ-MD-04-011` (Addition List Generation):** The Rust backend shall compare active in-memory asset UUID keys against the target archive/folder binary index and construct an `addition_list: Vec<AssetUuid>`.
* **`REQ-MD-04-012` (Unmodified Asset Bounding):** Asset binaries missing from both `delete_list` and `addition_list` shall be classified as unmodified and exempted from extraction, re-compression, or redundant copy operations.

---

### 1.3 Delta Execution & Target Storage Writing

* **`REQ-MD-04-020` (Soft-Deleted Binary Purge):** The backend shall physically unlink and delete all asset binary files matching `delete_list` from the target storage (`assets/<uuid>.<ext>`).
* **`REQ-MD-04-021` (New Asset Binary Compression/Packing):** For every asset entry in `addition_list`, the backend shall read the binary payload from its source `resolvedPath` and append/compress it into the target storage (`assets/<uuid>.<ext>`).
* **`REQ-MD-04-022` (Atomic Zip Target Writing):** When writing a `.hasmmd` (ZIP) archive, the backend shall build a temporary package at `<AppLocalDataDir>/<UUID>/output.tmp.zip` before executing an OS-level atomic file replacement over the destination path to prevent file corruption.

---

### 1.4 Archive Manifest Synchronization & Relative Path Normalization

* **`REQ-MD-04-030` (Soft-Deleted Metadata Stripping):** The backend shall permanently remove metadata records and UUID keys matching `delete_list` from the target `assets.json`.
* **`REQ-MD-04-031` (Addition Metadata Commit):** The backend shall append metadata records matching `addition_list` to the target `assets.json`.
* **`REQ-MD-04-032` (Portable Relative Path Normalization):** Before writing `assets.json` to the target storage, the backend shall normalize all `resolvedPath` entries back into portable package-relative format (`assets/<uuid_filename>`).

---

### 1.5 App Local Synchronization & Absolute Path Re-binding

* **`REQ-MD-04-040` (App Local Manifest Flush):** Immediately following target write completion, the backend shall copy the normalized target `assets.json` and `main.md` back into the local workspace directory (`<AppLocalDataDir>/<UUID>/`).
* **`REQ-MD-04-041` (Runtime Absolute Path Re-expansion):** The backend shall dynamically re-expand every relative entry in the local manifest into an active runtime `resolvedPath` (`asset-stream://<UUID>/<asset_uuid>` for Mode A ZIP, or absolute OS path for Mode B/C Folder/Local).
* **`REQ-MD-04-042` (Store Commitment & Dirty Flag Reset):** Upon receiving `SaveExecutionPayload`, the frontend shall update `usePackageStore` with the re-bound manifest, update `lastSavedContent = rawContent`, set `isDirty = false`, close the progress modal, and render a success toast notification.

---

## 2. Non-Functional Requirements

### 2.1 I/O Efficiency and Data Safety

* **`REQ-MD-04-100` (Minimal Delta I/O Performance):** For packages with over 1GB of unmodified media assets, the save operation shall complete within 3 seconds by restricting file I/O exclusively to `delete_list` and `addition_list` delta processing.
* **`REQ-MD-04-101` (Zero-Corruption Atomic Commits):** Target archive files shall be updated exclusively via atomic file replacement (`output.tmp.zip` $\rightarrow$ `targetPath`), guaranteeing that unexpected application crashes or power loss during save leave the original master file completely uncorrupted.