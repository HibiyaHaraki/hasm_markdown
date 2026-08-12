# REQ-MD-01: App Launch, Import, and Workspace Verification Requirements

## 1. Functional Requirements

### 1.1 Application Launch, Multi-Instance Coexistence, and Environment Validation

* **`REQ-MD-01-001` (CLI Launch Handling):** The system shall accept application execution triggered via CLI/Terminal arguments (`hasm_markdown [target_path]`).
* **`REQ-MD-01-002` (Multi-Instance Application Execution):** The system shall allow multiple application instances (`hasm_markdown` process windows) to execute simultaneously across the operating system.
* **`REQ-MD-01-003` (App Version Read):** Upon startup, the Rust backend shall read its own application version metadata.
* **`REQ-MD-01-004` (App Version Error Handling):** If reading the application version fails or encounters inconsistency, the system shall render the `/error-app` screen and halt execution.

---

### 1.2 Workspace Isolation and 3-Mode Import

* **`REQ-MD-01-010` (UUID Temporary Directory Creation):** Upon initiating workspace import, the system shall create a unique UUID directory (`<UUID>/`) within the `App Local` storage area (`<AppLocalDataDir>/`).
* **`REQ-MD-01-011` (Mode A - ZIP Extraction):** When a ZIP archive (`.hasmmd` / `.zip`) is specified, the system shall extract the archive contents into the generated `<UUID>/` directory.
* **`REQ-MD-01-012` (Mode A - Archive Target Binding):** Upon successful ZIP archive extraction, the system shall set the internal state `StorageTarget` to `Archive(archive_path)`.
* **`REQ-MD-01-013` (Mode B - Folder Recursive Copy):** When an external folder is specified, the system shall recursively copy the target directory contents into the generated `<UUID>/` directory.
* **`REQ-MD-01-014` (Mode B - Folder Target Binding):** Upon successful external folder copy, the system shall set the internal state `StorageTarget` to `Folder(folder_path)`.
* **`REQ-MD-01-015` (Mode C - New Scaffold Creation):** When "Create New" is specified, the system shall scaffold a default `main.md` file, an initial empty `assets.json` file, and an `assets/` directory inside the generated `<UUID>/` directory.
* **`REQ-MD-01-016` (Mode C - Unbound Target Binding):** Upon successful scaffold creation, the system shall set the internal state `StorageTarget` to `Unbound`.

---

### 1.3 Single-Workspace Process Locking and Essential OS File Handle Reservation

* **`REQ-MD-01-020` (Single-Workspace Process Lock Check):** Prior to opening a workspace, the system shall inspect `<UUID>/.lock`. If a lock file exists containing an active OS Process ID (PID), the system shall reject loading to restrict workspace access strictly to a single process at a time.
* **`REQ-MD-01-021` (Double Opening Conflict Interception):** When single-workspace lock validation fails, the system shall abort loading and display a lock conflict modal indicating that the workspace is already open in another window.
* **`REQ-MD-01-022` (Process Lock File Creation):** Upon successfully opening a free workspace, the system shall write `<UUID>/.lock` containing the active process PID.
* **`REQ-MD-01-023` (Core Files OS Physical Lock):** During an active editor session, the Rust backend shall acquire exclusive OS write/delete file handles over `<UUID>/main.md` and `<UUID>/assets.json` to physically block external process modification or deletion.
* **`REQ-MD-01-024` (Source Archive OS Lock - Mode A):** When operating under `StorageTarget::Archive`, the Rust backend shall acquire an OS exclusive read/share lock on the source `.hasmmd` archive file to prevent external moving, renaming, or deletion during execution.
* **`REQ-MD-01-025` (Manifest Read and Parse):** The system shall read `<UUID>/assets.json` and parse/expand it into the in-memory `AssetManifest` struct (`HashMap<String, AssetMetadata>`) in Rust.

---

### 1.4 Structural Verification, Non-Fatal Cross-Check, and Direct Navigation

* **`REQ-MD-01-030` (Structure Check - main.md):** Prior to screen navigation, the system shall verify the physical existence of `<UUID>/main.md`.
* **`REQ-MD-01-031` (Structure Check - assets.json):** Prior to screen navigation, the system shall verify the physical existence of `<UUID>/assets.json`.
* **`REQ-MD-01-032` (Structure Check - assets Directory):** Prior to screen navigation, the system shall verify the physical existence of the `<UUID>/assets/` directory.
* **`REQ-MD-01-033` (Core Structural Failure Handling):** If any required core component (`main.md`, `assets.json`, `assets/` directory) is completely missing, the system shall render the `/error-model` screen and halt loading.
* **`REQ-MD-01-034` (Missing Physical Asset Aggregation - Non-Fatal):** The system shall cross-check entries in `assets.json` against physical files in `<UUID>/assets/`. If physical asset files are missing, the system shall collect all missing asset details into a `missingAssets` array without halting the workspace loading process.
* **`REQ-MD-01-035` (Orphan File Detection - Warning):** The system shall scan the `<UUID>/assets/` directory for physical files not registered in `assets.json` and collect their filenames into a `warnings` array without halting execution.
* **`REQ-MD-01-036` (React Store Payload Commitment):** Upon completing structural verification, the Rust backend shall return `PackageStatePayload` containing `missingAssets` and `warnings`, and the React frontend shall commit it to `usePackageStore`.
* **`REQ-MD-01-037` (Direct Editor Navigation):** Even if `missingAssets` or `warnings` exist, the system shall bypass error screens and directly navigate to the `/editor` screen, delegating live red-text warning rendering to `REQ-MD-02`.

---

## 2. Non-Functional Requirements

### 2.1 User Experience and UI State Management

* **`REQ-MD-01-100` (React Loading State On):** At the start of the import process, the React frontend shall set the store's `isLoading` state to `true` to disable duplicate button triggers.
* **`REQ-MD-01-101` (React Loading State Off):** Upon completion (success or failure) of the import process, the React frontend shall reset the store's `isLoading` state to `false`.
* **`REQ-MD-01-102` (Progress Event Emission):** During ZIP extraction or folder copying, the Rust backend shall emit `import_progress` events at regular intervals containing progress metrics.
* **`REQ-MD-01-103` (Progress Bar UI Update):** Upon receiving an `import_progress` event, the React frontend shall update the store's `loadingProgress` state and refresh the progress bar UI.

---

### 2.2 Robustness, Exception Handling, and Timeout Control

* **`REQ-MD-01-110` (Dynamic Timeout Calculation):** The system shall calculate and enforce a dynamic upper timeout limit based on overall data volume: $\text{Timeout} = \max(30, \text{TotalSizeMB} / 10)$ seconds.
* **`REQ-MD-01-111` (Stall Guard Heartbeat Reset):** Whenever 1 or more bytes are written to disk, the system shall reset the stall countdown timer.
* **`REQ-MD-01-112` (Stall Timeout Trigger):** If disk write operations freeze continuously for 15 seconds, the system shall forcibly abort the import process.
* **`REQ-MD-01-113` (Incomplete Workspace Cleanup):** If an import operation fails or times out, the Rust backend shall physically purge the incomplete `<UUID>/` directory.
* **`REQ-MD-01-114` (Import Failure User Notification):** Upon import failure or timeout, the React frontend shall display an error toast notification and remain on the `/select` screen.