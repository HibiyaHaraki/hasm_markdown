# App Launch, Import, and Workspace Verification

## 1. Sequence Overview

This sequence handles the application startup lifecycle from CLI/OS launch up to populating the React State Store and rendering the primary Markdown editor (`/editor`).

### Key Operations Covered

1. **CLI Execution & App Version Validation:** Accepts optional CLI arguments (`hasm_markdown [target_path]`). Reads app version metadata and routes to `/error-app` if corrupted.
2. **React Loading State Management:** Sets `isLoading: true` and `loadingProgress: 0` before long-running imports to disable UI buttons and prevent double clicks.
3. **Target Entry Mode Routing:**
* **Mode A (ZIP Archive `.hasmmd`):** Extracts contents into `<AppLocalDataDir>/<UUID>/`.
* **Mode B (Folder Workspace):** Copies directory recursively into `<AppLocalDataDir>/<UUID>/`.
* **Mode C (Create New):** Scaffolds default `main.md`, `assets.json`, and `assets/` directory in App Local.


4. **Dynamic Timeout & Stall Guard:** Emits `import_progress` events every chunk. Resets the stall countdown timer as long as bytes are being written. Times out only if write operations freeze for more than 15 seconds.
5. **Lock Acquisition & Manifest Caching:** Writes `<UUID>/.lock` storing the active Process ID (PID). Parses `assets.json` into an in-memory `AssetManifest` (`HashMap<String, AssetMetadata>`).
6. **Detailed Structural Verification & Asset Cross-Check:**
* Verifies the physical existence of `main.md`, `assets.json`, and `assets/`.
* **Missing Assets Check (Error):** Cross-checks `assets.json` entries against physical files in `assets/`. If physical files are missing, appends all missing asset metadata to an array and routes to `/error-model` with the detailed list.
* **Orphan Files Check (Warning):** Scans `assets/` for files not registered in `assets.json`. Appends orphan filenames to a warning array and passes them to React to display a Warning Toast upon opening the editor.


7. **State Commitment:** Commits `PackageStatePayload` (including any warnings) to `usePackageStore`, resets `isLoading: false`, and routes to `/editor`.

---

## 2. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as OS / CLI Terminal
    participant React as Frontend (React / UI Store)
    participant Rust as Backend (Tauri / Rust)
    participant AppLocal as App Local Storage (<AppLocalDataDir>/<UUID>/)
    participant ExtStorage as Archive / External Storage (.hasmmd / Folder)

    %% Phase 1: CLI Launch & App Version Validation
    User->>CLI: Execute `hasm_markdown [target_path]`
    CLI->>Rust: Launch Process with CLI Arguments
    activate Rust
    
    Rust->>Rust: Read Application Version Metadata
    alt Invalid Application Version
        Rust->>React: Launch with Version Error Flag
        activate React
        React->>User: Render System Error Page (/error-app)
        deactivate React
    else Version Valid
        Rust->>React: Launch Application Window with CLI Context
    end
    deactivate Rust

    %% Phase 2: Selection & Mode-Specific Imports (With Progress & Stall Timeout)
    activate React
    alt Route 2-A: ZIP Archive Mode (.hasmmd)
        alt CLI Path Provided
            React->>React: setIsLoading(true, "Extracting archive...")
            React->>React: Listen to "import_progress" event
            React->>Rust: invoke("import_archive", { archive_path: cli_target_path })
        else UI Selection
            React->>User: Render File Selection Page (/select)
            User->>React: Select .hasmmd / .zip File
            React->>React: setIsLoading(true, "Extracting archive...")
            React->>React: Listen to "import_progress" event
            React->>Rust: invoke("import_archive", { archive_path })
        end
        deactivate React
        activate Rust
        
        Rust->>AppLocal: Generate new UUID & Create directory <AppLocalDataDir>/<UUID>/
        Rust->>Rust: Calculate Dynamic Timeout based on Archive Size + Stall Guard
        
        loop Unzip Chunk / File Copy
            Rust->>ExtStorage: Read & Extract Zip Chunk
            ExtStorage-->>AppLocal: Write file
            Rust->>Rust: Reset Stall Timer (Countdown reset on progress)
            Rust-->>React: emit("import_progress", { percentage, current_file, processed_bytes, total_bytes })
            React->>React: setLoadingProgress(percentage)
        end

    else Route 2-B: Folder Workspace Mode
        activate React
        alt CLI Path Provided
            React->>React: setIsLoading(true, "Copying workspace folder...")
            React->>React: Listen to "import_progress" event
            React->>Rust: invoke("import_folder", { folder_path: cli_target_path })
        else UI Selection
            React->>User: Render File Selection Page (/select)
            User->>React: Select External Folder Directory
            React->>React: setIsLoading(true, "Copying workspace folder...")
            React->>React: Listen to "import_progress" event
            React->>Rust: invoke("import_folder", { folder_path })
        end
        deactivate React
        activate Rust
        
        Rust->>AppLocal: Generate new UUID & Create directory <AppLocalDataDir>/<UUID>/
        Rust->>Rust: Calculate Dynamic Timeout based on Total Directory Size
        
        loop File Copy
            Rust->>ExtStorage: Read file
            ExtStorage-->>AppLocal: Copy file
            Rust->>Rust: Reset Stall Timer (Countdown reset on progress)
            Rust-->>React: emit("import_progress", { percentage, current_file, processed_bytes, total_bytes })
            React->>React: setLoadingProgress(percentage)
        end

    else Route 2-C: Create New Mode
        activate React
        React->>User: Render File Selection Page (/select)
        User->>React: Select "Create New HASM Markdown"
        React->>React: setIsLoading(true, "Scaffolding new workspace...")
        React->>Rust: invoke("create_new_package")
        deactivate React
        activate Rust
        
        Rust->>AppLocal: Generate new UUID & Create directory <AppLocalDataDir>/<UUID>/
        Rust->>AppLocal: Scaffold initial main.md, assets.json, and assets/ directory
        Rust->>Rust: Set StorageTarget::Unbound
    end

    %% Stall Detection / Failure Branch
    alt Import Stalled (No byte written for > 15s) or IO Error
        Rust->>AppLocal: Purge Incomplete <UUID>/ Directory
        Rust-->>React: Return PackageError::ImportStalled / IoError
        activate React
        React->>React: setIsLoading(false)
        React->>User: Display Toast Error ("Import Stalled or Failed") & Stay on /select
        deactivate React
    end

    %% Phase 3: Lock Acquisition & Manifest Caching
    Rust->>AppLocal: Write <UUID>/.lock (PID: current_process_id)
    alt Lock Acquisition Failed
        AppLocal-->>Rust: Error (File Locked by another PID)
        Rust-->>React: Return PackageError::WorkspaceLocked
        activate React
        React->>React: setIsLoading(false)
        React->>User: Display Lock Conflict Modal
        deactivate React
    end

    Rust->>AppLocal: Read <UUID>/assets.json
    AppLocal-->>Rust: Return assets.json content
    Rust->>Rust: Parse assets.json -> AssetManifest (HashMap<String, AssetMetadata>)

    %% Phase 4: Structural Verification, Cross-Check & React State Commitment
    Rust->>AppLocal: Check existence of main.md, assets.json, and assets/
    alt Structure Check Failed (Missing main.md, assets.json, or assets/)
        AppLocal-->>Rust: File or Directory Missing
        Rust-->>React: Return PackageValidationError::MissingMainMarkdown / MissingAssetsJson / InvalidAssetDirectory
        activate React
        React->>React: setIsLoading(false)
        React->>User: Render Data Error Page (/error-model)
        deactivate React
    else Basic Structure Intact
        Rust->>AppLocal: Cross-check manifest entries against assets/ physical files
        
        alt Missing Physical Assets Detected (Error Branch)
            Rust->>Rust: Collect missing asset details into Vec<MissingAssetInfo>
            Rust-->>React: Return PackageValidationError::MissingPhysicalAssets { missing_assets }
            activate React
            React->>React: setIsLoading(false)
            React->>User: Render Data Error Page (/error-model with detailed missing assets table)
            deactivate React
            
        else Physical Assets Valid
            Rust->>AppLocal: Scan assets/ for unregistered orphan files
            opt Orphan Files Found (Warning Branch)
                Rust->>Rust: Collect orphan filenames into Vec<PackageWarning>
            end
            
            Rust->>Rust: Store HasmMarkdownPackage into Mutex<Option<HasmMarkdownPackage>>
            Rust-->>React: Return Ok(PackageStatePayload { ..., warnings })
            deactivate Rust
            
            %% React State Commitment
            activate React
            React->>React: setPackageStore(payload) [Update React Context / Zustand Store]
            React->>React: Initialize markdown-it with manifest asset map
            React->>React: setIsLoading(false)
            
            opt Warnings Exist
                React->>User: Display Warning Toast ("Unregistered orphan files detected in assets/")
            end
            
            React->>User: Render Markdown Editor Page (/editor)
            deactivate React
        end
    end

```

---

## 3. Data Contracts & State Specifications

### 3.1 React UI State (`usePackageStore`)

```typescript
export interface PackageUIState {
  isLoading: boolean;              // Global blocking loading flag
  loadingMessage: string | null;   // Active loading label (e.g., "Extracting archive...")
  loadingProgress: number;        // Progress percentage (0 to 100)
  packageData: PackageStatePayload | null; // Active workspace data
  error: PackageError | PackageValidationError | null; // Last encountered error (includes missing assets list)
}

```

### 3.2 Detailed Asset Error & Warning Payloads

```typescript
export interface MissingAssetInfo {
  alias: string;             // Display name referenced in Markdown (e.g. "diagram.png")
  expectedFilename: string;  // Expected physical UUID filename (e.g. "3f8b9a20-1c2d-4e5f.png")
}

export interface PackageWarning {
  orphanFiles: string[];     // Physical filenames in assets/ not registered in assets.json
}

```

### 3.3 Response Payload (`PackageStatePayload`)

```typescript
export interface PackageStatePayload {
  uuid: string;                     // Temporary workspace UUID
  tempDirPath: string;              // Absolute path to <AppLocalDataDir>/<UUID>/
  targetType: 'Archive' | 'Folder' | 'Unbound'; // StorageTarget variant
  targetPath: string | null;        // Active master target path on disk
  isDirty: boolean;                 // Initial unsaved changes flag (false)
  manifest: {
    version: string;
    assets: Record<string, {
      uuid: string;
      filename: string;
      mimeType: string;
      createdAt: number;
    }>;
  };
  warnings: PackageWarning[];       // Non-fatal warnings (e.g., orphan files)
}

```

---

## 4. Error Handling & Timeout Strategy

1. **Stall Detection Guard:**
* Calculated Dynamic Timeout Base: $\text{Timeout (sec)} = \max\left(30, \frac{\text{Total Size (MB)}}{10 \text{ MB/s}}\right)$
* Heartbeat Check: The countdown resets on every chunk processed. If no byte is written for over **15 seconds**, the import is flagged as stalled, the partial `<UUID>/` workspace is purged, and `setIsLoading(false)` is invoked.


2. **Error & Warning Matrix:**

| Scenario | Component | Action | Resulting UI / State |
| --- | --- | --- | --- |
| **App Version Read Failure** | Rust Backend | Catch version reading error | Redirect to `/error-app` screen |
| **Import Stalled (> 15s No I/O)** | Rust Backend | Trigger Stall Guard, purge `<UUID>/` | Set `isLoading: false`, show Toast error |
| **Workspace Locked by PID** | Rust Backend | Detect existing valid `.lock` file | Set `isLoading: false`, show Lock Modal |
| **Missing `main.md` / `assets.json**` | Rust Backend | Fail `verify_structure()` | Set `isLoading: false`, redirect to `/error-model` |
| **Missing Physical Asset File(s)** | Rust Backend | Collect missing aliases into `Vec<MissingAssetInfo>` | Redirect to `/error-model` showing missing file table |
| **Unregistered Orphan Assets in `assets/**` | Rust Backend | Collect orphan filenames into `warnings` array | Render `/editor` normally + display Warning Toast |