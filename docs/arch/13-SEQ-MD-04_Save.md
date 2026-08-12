# Workspace Save, Export, Asset Delta Packing, Path Normalization, and Archive Writing

## 1. Sequence Overview

This sequence defines the execution lifecycle for persisting the active workspace. It unifies **In-Place Save (Overwrite)** and **Package Export (Save As / Convert)** into a single consolidated sequence. To maximize performance and prevent full archive re-compression overheads, it executes a **Delta Asset Synchronization Algorithm** based on five strict operational steps:

1. **Deletion List Generation:** Scanning `assets.json` for entries marked with `isDeleted: true`.
2. **Addition List Generation:** Comparing in-memory UUIDs against the target archive/folder index to collect newly added external assets.
3. **Delta Execution:** Unlinking deletion list binaries and appending addition list binaries into the target storage.
4. **Archive Manifest Synchronization & Path Normalization:** Stripping soft-deleted entries, committing new asset records, and converting all `resolvedPath` references to portable package-relative paths (`assets/<uuid_filename>`).
5. **App Local Sync & Absolute Path Re-binding:** Flushing the normalized manifest back to `App Local` and re-expanding relative paths to absolute `resolvedPath` URIs in memory.

---

## 2. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Toolbar as Editor Toolbar UI
    participant SaveModal as Save / Export Progress Modal
    participant React as React Frontend Core
    participant Store as usePackageStore
    participant Rust as Backend (Tauri / Rust Core)
    participant AppLocal as App Local Storage (<AppLocalDataDir>/<UUID>/)
    participant TargetStorage as Target Storage (.hasmmd / Folder)

    %% Phase 1: Invocation & Target Determination
    alt Scenario A: In-Place Save ("Save" Button Click)
        User->>Toolbar: Click "Save" Button
        activate Toolbar
        Toolbar->>React: Trigger Save Action (Target: Active targetPath)
        deactivate Toolbar
        activate React
    else Scenario B: Export As ("Export / Save As" Menu Click)
        User->>Toolbar: Click "Export Package" Menu Item
        activate Toolbar
        Toolbar->>Rust: invoke("open_save_file_dialog")
        deactivate Toolbar
        activate Rust
        
        Rust->>User: Open OS Native Save File Dialog (.hasmmd / Folder)
        User->>Rust: Select Destination Path (e.g. /path/to/exported_pkg.hasmmd)
        
        alt User Canceled Dialog
            Rust-->>React: Return Ok(None)
            React->>User: Dismiss dialog without action
        else Destination Selected
            Rust-->>React: Return selected export path (newTargetPath)
            deactivate Rust
            activate React
        end
    end

    %% Phase 2: Lock Verification & Modal Initialization
    React->>SaveModal: Open Save / Export Progress Modal
    activate SaveModal
    SaveModal->>User: Display Progress Bar & Status Spinner
    
    React->>React: Listen to "save_progress" IPC events
    React->>Rust: invoke("execute_package_save_or_export", { uuid, export_target_path: newTargetPath | null })
    activate Rust

    %% Phase 3: Delta List Generation (Deletion & Addition)
    Rust-->>React: emit("save_progress", { stage: "ComputingAssetDeltas", percentage: 10.0 })
    React->>SaveModal: Update Progress UI ("Computing asset deletion & addition delta lists...")
    
    Rust->>Rust: Scan assets.json in memory for entries with isDeleted: true -> Construct `delete_list: Vec<AssetUuid>`
    Rust->>Rust: Compare memory asset UUIDs vs Target Archive/Folder Index -> Construct `addition_list: Vec<AssetUuid>`

    %% Phase 4: Delta Execution & Binary Compression
    Rust-->>React: emit("save_progress", { stage: "ExecutingAssetDeltas", percentage: 30.0 })
    React->>SaveModal: Update Progress UI ("Applying asset additions and deletions...")
    
    %% Execution on Target Storage
    Rust->>TargetStorage: Remove binary entries matching `delete_list` (Purge soft-deleted assets)
    
    loop Copy / Compress Items in `addition_list`
        Rust->>TargetStorage: Read binary from source `resolvedPath` -> Append to Target `assets/<uuid>.<ext>`
        Rust-->>React: emit("save_progress", { stage: "ExecutingAssetDeltas", percentage: 30.0 + (processed / total * 40.0) })
        React->>SaveModal: Update Progress Bar Percentage
    end

    %% Phase 5: Archive Manifest Sync & Path Normalization
    Rust-->>React: emit("save_progress", { stage: "SyncingManifest", percentage: 80.0 })
    React->>SaveModal: Update Progress UI ("Normalizing paths & writing target assets.json...")
    
    Rust->>Rust: Remove entries in `delete_list` from target assets.json
    Rust->>Rust: Add metadata entries in `addition_list` to target assets.json
    Rust->>Rust: Normalize ALL active manifest paths to relative format ("assets/<uuid>.<ext>")
    
    Rust->>TargetStorage: Write relative assets.json and main.md into Target Storage (.hasmmd / Folder)

    %% Phase 6: App Local Sync & Absolute Path Re-binding
    Rust-->>React: emit("save_progress", { stage: "RebindingAppLocal", percentage: 90.0 })
    React->>SaveModal: Update Progress UI ("Syncing App Local and re-binding absolute paths...")
    
    Rust->>AppLocal: Copy target normalized assets.json & main.md -> <AppLocalDataDir>/<UUID>/
    
    loop Expand Relative Paths to Absolute resolvedPaths
        alt Storage Target is ZIP Archive (.hasmmd)
            Rust->>Rust: Bind relativePath -> `asset-stream://<UUID>/<asset_uuid>`
        else Storage Target is Folder Workspace
            Rust->>Rust: Join target root path + relativePath -> OS Absolute Path
        end
    end

    Rust-->>React: emit("save_progress", { stage: "Complete", percentage: 100.0 })
    
    Rust-->>React: Return Ok(SaveExecutionPayload { targetPath, savedAt, updatedManifest })
    deactivate Rust

    %% Phase 7: State Commitment & UI Synchronization
    React->>Store: Update packageData (Set new targetPath, manifest = updatedManifest with resolvedPaths, lastSavedContent = rawContent, isDirty = false)
    activate Store
    Store-->>React: State Updated
    deactivate Store

    React->>SaveModal: Close Progress Modal
    deactivate SaveModal
    React->>User: Display Success Toast ("Workspace saved successfully") & Update Window Header
    deactivate React

```

---

## 3. Data Contracts & State Specifications

### 3.1 IPC Invocation Payload (`execute_package_save_or_export`)

```typescript
export interface ExecuteSaveOrExportArgs {
  uuid: string;                   // Active workspace UUID
  exportTargetPath: string | null;// Null for In-Place Overwrite; Absolute path string for Export As
  formatType?: 'Archive' | 'Folder'; // Optional target format override during export
}

export interface SaveExecutionPayload {
  targetPath: string;             // Final target path on disk where package was committed
  savedAt: number;                // Epoch timestamp of completed save
  updatedManifest: RuntimeAssetManifest; // Re-bound manifest with active resolvedPath entries
}

```

### 3.2 Delta Operation Context (Internal Rust Engine)

```rust
pub struct AssetDeltaContext {
    pub delete_list: Vec<String>,       // List of Asset UUIDs / Aliases marked with isDeleted: true
    pub addition_list: Vec<String>,     // List of Asset UUIDs present in memory but missing from Target
    pub unmodified_list: Vec<String>,   // List of existing valid Asset UUIDs requiring zero I/O
}

```

---

## 4. Operational Guard & Delta Sync Rules

1. **Strict Delta Execution Bounding:**
Unmodified assets (`unmodified_list`) are never extracted, copied, or re-compressed during save. Only entries in `delete_list` and `addition_list` trigger file I/O operations, ensuring saving remains near-instantaneous even for multi-gigabyte packages.
2. **Complete Soft-Delete Purge:**
Items in `delete_list` are permanently deleted from the target archive/folder binary storage and stripped from the target `assets.json` during Phase 4 & 5. Once save completes, soft-deleted entries are purged from React `usePackageStore`.
3. **App Local Sync & Re-binding Guarantee:**
Immediately following target write completion, the normalized `assets.json` is flushed to `App Local`, and all relative paths are dynamically re-expanded into `resolvedPath` absolute URIs. This guarantees that the live editor preview remains fully responsive and unbroken after a save operation.