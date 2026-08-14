# Asset Management Window Operations, Single-Asset Upload, Soft-Deletion (Delete Flag), Dynamic Path Mapping, and Editor State Synchronization

## 1. Sequence Overview

This sequence defines the complete user-driven asset management lifecycle operating between the Main Editor, the dedicated Asset Window (Sidebar/Modal), and the Rust backend storage engine. It strictly enforces a **Single Asset per Upload Operation Constraint** and a **Soft Delete Strategy (`isDeleted: true` flag)** to avoid UUID/alias collisions and prevent storage corruption. It is partitioned into 5 modular sub-sequences:

1. **`SEQ-MD-03-A` (Open Asset Window):** Invoked via Toolbar button to inspect registered assets, physical missing file warnings, deleted asset flags, and unregistered orphan files.
2. **`SEQ-MD-03-C` (Add Single Asset via File Picker + Custom Alias Naming):** Invoking the themed OS native file picker control (single selection), prompting the Alias Naming Modal, registering the absolute path into the active manifest, and updating runtime mappings. Drag-and-drop is intentionally unavailable.
4. **`SEQ-MD-03-D` (Soft Delete Asset with Real-time `main.md` Reference Inspection & Delete Flag):** Scanning active `main.md` text prior to deletion, displaying line warnings if referenced, and marking the asset entry as `isDeleted: true` in `assets.json` without removing metadata or UUIDs.
5. **`SEQ-MD-03-E` (Close Asset Window & Sync State to Editor):** Recalculating active `missingAssets` (including `isDeleted` entries) and `warnings` arrays upon closing/mutating, committing updated state to React for live editor red-text decoration updates.

---

## 2. Sequence Diagrams

### 2.1 `SEQ-MD-03-A`: Open Asset Window

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Toolbar as Editor Toolbar UI
    participant AssetWin as Asset Window (Modal / Sidebar)
    participant Store as usePackageStore (React State)

    User->>Toolbar: Click "Assets" Button
    activate Toolbar
    Toolbar->>AssetWin: Open / Mount Asset Window Component
    deactivate Toolbar
    activate AssetWin
    
    AssetWin->>Store: Read active packageData (manifest with resolvedPaths & isDeleted flags, missingAssets, warnings)
    activate Store
    Store-->>AssetWin: Return current workspace asset state
    deactivate Store
    
    AssetWin->>AssetWin: Render Active Registered Assets List (Filter out isDeleted: true), Missing Asset Alerts, and Orphan Warnings
    AssetWin->>User: Display Asset Management UI Panel
    deactivate AssetWin

```

---

### 2.2 `SEQ-MD-03-B`: Drag-and-Drop Is Unavailable

```mermaid
sequenceDiagram
    actor User
    participant AssetWin as Asset Window UI
    User->>AssetWin: Attempt to drag an image file
    AssetWin-->>User: No drag-and-drop target or handler is available

```

---

### 2.3 `SEQ-MD-03-C`: Add Single Asset via File Picker with Custom Alias Naming

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant AssetWin as Asset Window UI
    participant Modal as Alias Naming Modal UI
    participant React as React Frontend Core
    participant Rust as Backend (Tauri / Rust Core)
    participant AppLocal as App Local Storage (<AppLocalDataDir>/<UUID>/)

    User->>AssetWin: Click "Select image" Button
    activate AssetWin
    AssetWin->>Rust: invoke("open_single_image_picker")
    deactivate AssetWin
    activate Rust
    
    Rust->>User: Open OS Native File Picker Dialog (Single File Selection Mode)
    User->>Rust: Select Image File (e.g. /path/to/my_chart.png)
    
    alt User Canceled Selection
        Rust-->>React: Return Ok(None)
        React->>User: Close dialog without changes
    else File Selected
        Rust-->>React: Return selected absolute file path & raw filename
        deactivate Rust
        activate React
        
        React->>Modal: Prompt Alias Naming Modal (Pre-filled with raw filename)
        activate Modal
        Modal->>User: Display input field for custom asset alias name
        User->>Modal: Confirm / Edit Alias Name (e.g. "my_custom_chart.png")
        Modal->>React: Submit customized alias string
        deactivate Modal
        
        React->>React: Listen to "asset_register_progress" event
        React->>Rust: invoke("register_and_bind_single_asset_path", { source_path, custom_alias })
        activate Rust
        
        alt Alias Collision (Active or Soft-Deleted)
            Rust-->>React: Return Err(PackageError::AliasCollision)
            React->>Modal: Display Error ("Alias name already exists in workspace.")
        else Alias Unique
            Rust->>Rust: Generate UUID key (<asset_uuid>)
            Rust->>Rust: Construct RuntimeAssetMetadata { relativePath: "assets/<uuid>.<ext>", resolvedPath: source_path, isExternal: true, isDeleted: false }
            
            Rust-->>React: emit("asset_register_progress", { stage: "GeneratingThumbnail", percentage: 50.0 })
            React->>Modal: Update Progress UI
            
            Rust->>Rust: Update in-memory RuntimeAssetManifest
            Rust->>AppLocal: Write assets.json.tmp -> Rename to assets.json (Atomic Local Workspace Update)
            
            Rust-->>React: Return Ok(AssetRegisterPayload { alias, asset_uuid, resolvedPath })
            deactivate Rust
            
            React->>React: Update usePackageStore manifest
            React->>User: Close Naming Modal, Refresh Asset Grid & Display Success Toast
        end
        deactivate React
    end

```

---

### 2.4 `SEQ-MD-03-D`: Soft Delete Asset with Real-time `main.md` Reference Inspection & Delete Flag

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant AssetWin as Asset Window UI
    participant React as React Frontend Core
    participant Store as usePackageStore
    participant Rust as Backend (Tauri / Rust Core)
    participant AppLocal as App Local Storage (<AppLocalDataDir>/<UUID>/)

    User->>AssetWin: Select Asset Item & Click "Delete" Button
    activate AssetWin
    AssetWin->>React: Trigger Delete Request for target alias (e.g. "sample_1.png")
    deactivate AssetWin
    activate React
    
    %% Real-time main.md Text Reference Scan
    React->>Store: Read active main.md text buffer (rawContent)
    React->>React: Scan rawContent for occurrences of `![*](asset:sample_1.png)`
    
    alt Asset IS Referenced in main.md (In-Use Warning Path)
        React->>User: Display Warning Modal ("Asset 'sample_1.png' is in use on Line 12. Deleting it will cause a missing asset warning in your document. Proceed?")
        User->>React: Click "Confirm Delete"
    else Asset NOT Referenced in main.md
        React->>User: Display Standard Confirmation Modal ("Delete asset 'sample_1.png'?")
        User->>React: Click "Confirm Delete"
    end
    
    React->>React: Listen to "asset_delete_progress" event
    React->>Rust: invoke("soft_delete_asset_mapping", { alias: "sample_1.png" })
    activate Rust
    
    Rust-->>React: emit("asset_delete_progress", { stage: "SettingDeleteFlag", percentage: 50.0 })
    React->>AssetWin: Render Deletion Progress UI / Spinner
    
    %% Soft Delete Operation: Retain Metadata & Set Flag
    Rust->>Rust: Set metadata.isDeleted = true & metadata.deletedAt = timestamp
    Note over Rust,AppLocal: Physical file and UUID metadata are preserved in assets.json to prevent collision
    
    Rust->>AppLocal: Write assets.json.tmp -> Rename to assets.json (Atomic Local Workspace Update)
    Rust-->>React: emit("asset_delete_progress", { stage: "Complete", percentage: 100.0 })
    Rust-->>React: Return Ok(AssetDeleteResult { alias, isDeleted: true })
    deactivate Rust
    
    React->>React: Update usePackageStore manifest (Mark item as isDeleted: true)
    React->>User: Remove Item from Active Asset List View & Display Toast Notification ("Asset 'sample_1.png' marked as deleted")
    deactivate React

```

---

### 2.5 `SEQ-MD-03-E`: Close Asset Window & Sync State to Editor

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant AssetWin as Asset Window UI
    participant React as React Frontend Core
    participant Store as usePackageStore
    participant MainEditor as Main Editor & Preview Pane

    User->>AssetWin: Click "Close" (X) Button / Dismiss Window
    activate AssetWin
    AssetWin->>React: Trigger Window Closing Callback
    deactivate AssetWin
    activate React
    
    React->>React: Read active main.md text buffer and updated manifest
    
    %% Recalculate Missing Assets (Error Array) - Treating isDeleted: true as Missing
    React->>React: Scan main.md text for all `![alt](asset:alias)` references
    React->>React: Filter aliases marked as isDeleted: true OR missing physical files -> Generate new missingAssets array
    
    %% Recalculate Orphan Files (Warning Array)
    React->>React: Compare physical files in assets/ vs active non-deleted manifest entries -> Generate new warnings array
    
    React->>Store: Dispatch setPackageState({ missingAssets: new_list, warnings: new_list })
    activate Store
    Store-->>React: Store Updated
    deactivate Store
    
    React->>MainEditor: Re-evaluate Code Editor Line Decorators & Preview HTML Spans
    activate MainEditor
    
    alt Missing or Soft-Deleted Assets Found in Text
        MainEditor->>MainEditor: Apply Red Warning Background / Red Text Styling to missing/deleted tags
    else All Referenced Assets Active & Physically Exist
        MainEditor->>MainEditor: Clear Red Warning Styles & Render Valid Image Previews
    end
    
    MainEditor-->>User: Render Main Editor with Fully Synchronized Red-Text Warnings
    deactivate MainEditor
    deactivate React

```

---

## 3. Data Contracts & State Specifications

### 3.1 Runtime Asset Metadata Specification (Soft Delete Enabled)

```typescript
export interface RuntimeAssetMetadata {
  uuid: string;             // Immutable Asset UUID
  relativePath: string;     // Portable package-relative path for saving (e.g. "assets/3f8b9a20.png")
  resolvedPath: string;     // Active absolute path on OS or asset-stream:// URI
  mimeType: string;         // MIME string
  size: number;             // Byte size
  isExternal: boolean;      // True if referencing external OS file directly
  isDeleted: boolean;       // Soft delete flag (true = marked for deletion on next save)
  deletedAt?: number;       // Unix epoch timestamp when soft delete was requested
}

```

### 3.2 Progress Event Payloads (`asset_register_progress` / `asset_delete_progress`)

```typescript
export interface AssetRegisterProgressPayload {
  stage: 'ValidatingAlias' | 'GeneratingThumbnail' | 'Complete';
  percentage: number;      // Progress percentage (0.0 to 100.0)
}

export interface AssetDeleteProgressPayload {
  stage: 'SettingDeleteFlag' | 'Complete';
  percentage: number;      // Progress percentage (0.0 to 100.0)
}

```

---

## 4. Operational Guard & State Transition Rules

1. **Single Asset Upload Guard (`SEQ-MD-03-C`):**
The Asset Window provides only the OS file picker in single-selection mode. It does not render a drag-and-drop target or register drop handlers.
2. **Metadata Retention & Soft Delete Strategy (`SEQ-MD-03-D`):**
Executing a delete action sets `isDeleted: true` on the target asset entry within `assets.json` and memory stores. The entry, UUID, and alias key remain intact to prevent alias/UUID collisions during the session. Physical unlinking or exclusion from final ZIP packages occurs exclusively during **`SEQ-MD-04` (Save Action)**.
3. **Editor Missing Asset Red-Text Flagging (`SEQ-MD-03-E`):**
Any image tag in `main.md` referencing an asset marked with `isDeleted: true` is automatically flagged in `missingAssets`, immediately triggering red warning line decorators in the Code Editor and warning spans in Preview.