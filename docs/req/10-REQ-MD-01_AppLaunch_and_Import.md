# App Launch, Import, and Workspace Verification Requirements

## 1. Functional Requirements

### 1.1 Application Launch and Environment Validation

* **`REQ-MD-01-001` (CLI Launch Handling):** The system shall accept application execution triggered via CLI/Terminal arguments (`hasm_markdown [target_path]`).
* **`REQ-MD-01-002` (App Version Read):** Upon startup, the Rust backend shall read its own application version metadata.
* **`REQ-MD-01-003` (App Version Error Handling):** If reading the application version fails or encounters inconsistency, the system shall render the `/error-app` screen and halt execution.

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

### 1.3 Exclusive Locking and Memory Caching

* **`REQ-MD-01-020` (Process Lock File Creation):** After placing workspace files, the system shall create a `<UUID>/.lock` file containing the current OS Process ID (PID).
* **`REQ-MD-01-021` (Double Opening Conflict Interception):** If a valid PID lock already exists inside `<UUID>/`, the system shall abort loading and display a lock conflict dialog.
* **`REQ-MD-01-022` (Manifest Read and Parse):** The system shall read `<UUID>/assets.json` and parse/expand it into the in-memory `AssetManifest` struct (`HashMap<String, AssetMetadata>`) in Rust.

---

### 1.4 Structural Verification, Asset Cross-Check, and React State Commitment

* **`REQ-MD-01-030` (Structure Check - main.md):** Prior to screen navigation, the system shall verify the physical existence of `<UUID>/main.md`.
* **`REQ-MD-01-031` (Structure Check - assets.json):** Prior to screen navigation, the system shall verify the physical existence of `<UUID>/assets.json`.
* **`REQ-MD-01-032` (Structure Check - assets Directory):** Prior to screen navigation, the system shall verify the physical existence of the `<UUID>/assets/` directory.
* **`REQ-MD-01-033` (Basic Structure Verification Failure Handling):** If any required basic component (`main.md`, `assets.json`, `assets/`) is missing, the system shall render the `/error-model` screen.
* **`REQ-MD-01-034` (Missing Physical Asset Aggregation - Fatal Error):** The system shall cross-check each entry in `assets.json` against physical files in `<UUID>/assets/`. If physical asset files are missing, the system shall collect all missing asset details (alias and expected UUID filename) into an array and return a `MissingPhysicalAssets` error to display a detailed missing file table on the `/error-model` screen.
* **`REQ-MD-01-035` (Orphan File Detection - Warning):** The system shall scan the `<UUID>/assets/` directory for physical files not registered in `assets.json`. If orphan files are detected, the system shall collect their filenames into a `warnings` array without halting execution.
* **`REQ-MD-01-036` (React Store Payload Commitment):** Upon successful verification, the Rust backend shall return `PackageStatePayload` (including any collected warnings), and the React frontend shall commit it to `usePackageStore`.
* **`REQ-MD-01-037` (markdown-it Asset Map Initialization):** The React frontend shall initialize `markdown-it` asset path resolution rules using the committed `assets.json` manifest data.
* **`REQ-MD-01-038` (Warning Toast Display & Editor Page Navigation):** Upon completing state commitment, if warnings exist, the React frontend shall display a Warning Toast indicating unregistered orphan files, and navigate to the `/editor` screen.

---

## 2. Non-Functional Requirements

### 2.1 User Experience and UI State Management

* **`REQ-MD-01-100` (React Loading State On):** At the start of the import process, the React frontend shall set the store's `isLoading` state to `true` to disable duplicate button triggers.
* **`REQ-MD-01-101` (React Loading State Off):** Upon completion (success or failure) of the import process, the React frontend shall reset the store's `isLoading` state to `false`.
* **`REQ-MD-01-102` (Progress Event Emission):** During ZIP extraction or folder copying, the Rust backend shall emit `import_progress` events at regular intervals containing progress metrics (percentage, current filename, processed bytes, total bytes).
* **`REQ-MD-01-103` (Progress Bar UI Update):** Upon receiving an `import_progress` event, the React frontend shall update the store's `loadingProgress` state and refresh the progress bar UI.

---

### 2.2 Robustness, Exception Handling, and Timeout Control

* **`REQ-MD-01-110` (Dynamic Timeout Calculation):** The system shall calculate and enforce a dynamic upper timeout limit based on overall data volume: $\text{Timeout} = \max(30, \text{TotalSizeMB} / 10)$ seconds.
* **`REQ-MD-01-111` (Stall Guard Heartbeat Reset):** Whenever 1 or more bytes are written to disk, the system shall reset the stall countdown timer.
* **`REQ-MD-01-112` (Stall Timeout Trigger):** If disk write operations freeze continuously for 15 seconds, the system shall forcibly abort the import process.
* **`REQ-MD-01-113` (Incomplete Workspace Cleanup):** If an import operation fails or times out, the Rust backend shall physically purge the incomplete `<UUID>/` directory.
* **`REQ-MD-01-114` (Import Failure User Notification):** Upon import failure or timeout, the React frontend shall display an error toast notification and remain on the `/select` screen.