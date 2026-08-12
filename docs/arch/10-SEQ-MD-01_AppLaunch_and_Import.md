# SEQ-MD-01: App Launch, CLI Interface, Selective Import, Workspace Locking, and Path Resolution

## 1. Sequence Overview

This sequence handles the application startup lifecycle from CLI/OS launch up to populating the React State Store, establishing single-instance workspace process locking, acquiring exclusive OS file handles, **resolving asset relative paths into runtime absolute paths (`resolvedPath`)**, and executing non-GUI CLI subcommands or rendering the Markdown editor (`/editor`).

### Key Operations Covered

1. **CLI Subcommand Router (`verify`, `preview`, `open`):**
* **`verify <PATH>`:** Executes headless non-GUI verification of a `.hasmmd` archive or folder workspace, outputting structural errors/warnings to `stdout`/JSON and exiting with code `0` or `1`.


* **`preview <FOLDER_PATH>`:** Enforces **Folder Type Only (Mode B)** execution. Reads `main.md` and `assets.json`, resolves relative asset tags (`![alt](asset:alias)`) to OS absolute file paths, and outputs the converted Markdown stream to `stdout` for external editor compatibility.
* **`open <PATH>`:** Launches the full interactive GUI application window, initiating selective import and state store commitment.




2. **Multi-Instance Execution & Workspace Process Isolation:** Permits multiple application process windows across the OS while restricting access to a specific workspace directory to a single active process via PID `.lock` validation.


3. **Selective Lightweight Import & Zero-Copy Asset Streaming:**
* **Mode A (ZIP Target `.hasmmd`):** Extracts **only** lightweight metadata (`main.md` and `assets.json`) into `<AppLocalDataDir>/<UUID>/`. Asset images are read via dynamic on-demand stream directly from the ZIP archive (`asset-stream://`).


* **Mode B (Folder Workspace):** Mounts external directories directly or copies metadata without duplicating heavy media payloads.


* **Mode C (Create New):** Scaffolds default `main.md`, `assets.json`, and empty `assets/` in App Local.




4. **Single-Workspace Process Lock & Essential File OS Handles:**
* Writes `<UUID>/.lock` storing the active Process ID (PID). Rejects access if another active process PID holds the lock.


* Acquires exclusive OS write file handles over `<UUID>/main.md` and `<UUID>/assets.json`, plus an exclusive read/share lock on the source `.hasmmd` archive.




5. **Runtime Absolute Path Resolution (`relativePath` $\rightarrow$ `resolvedPath`):**
* Reads `assets.json` containing portable package-relative paths (`assets/<uuid_filename>`).


* Rust dynamically expands every relative entry into an active runtime absolute path (`resolvedPath`), binding it to the current OS environment in memory.




6. **State Commitment & Direct Editor Navigation:** Commits `PackageStatePayload` (carrying resolved absolute paths) to `usePackageStore`, sets `isLoaded: true`, and directly routes to `/editor`.



---

## 2. Sequence Diagrams by CLI Subcommand

### 2.1 Subcommand A: `hasm_markdown verify <PATH> [--json]` (Non-GUI Verification)

```mermaid
sequenceDiagram
    autonumber
    actor User as Terminal / User
    participant CLI as CLI Argument Parser (clap)
    participant Rust as Backend Verification Engine

    User->>CLI: Execute `hasm_markdown verify <PATH> [--json]`
    activate CLI
    CLI->>Rust: Invoke `exec_cli_verify(target_path, json_flag)`
    deactivate CLI
    activate Rust

    Rust->>Rust: Inspect Target Path Type (.hasmmd ZIP Archive vs Folder Directory)

    alt Target Path Does Not Exist
        Rust-->>User: Output Error ("Path does not exist") & Exit Process (Code 1)
    else Target is Valid Path
        Rust->>Rust: Check Physical Existence of main.md and assets.json
        
        alt Structural File Missing
            Rust-->>User: Output Validation Result (Missing Core Metadata) & Exit Process (Code 1)
        else Metadata Structure Intact
            Rust->>Rust: Read assets.json & Cross-check entries against assets/ or ZIP Index
            Rust->>Rust: Collect missingAssets and orphan warnings
            
            alt Validation Errors Found (missingAssets.length > 0)
                alt --json flag present
                    Rust-->>User: Print JSON Payload {"status": "Invalid", "missingAssets": [...]} & Exit (Code 1)
                else Standard Text Output
                    Rust-->>User: Print Human-Readable Error List & Exit Process (Code 1)
                end
            else Package Valid
                alt --json flag present
                    Rust-->>User: Print JSON Payload {"status": "Valid", "warnings": [...]} & Exit (Code 0)
                else Standard Text Output
                    Rust-->>User: Print "Package verification successful" & Exit Process (Code 0)
                end
            end
        end
    end
    deactivate Rust

```

---

### 2.2 Subcommand B: `hasm_markdown preview <FOLDER_PATH>` (Folder-Only Absolute Path Stream)

```mermaid
sequenceDiagram
    autonumber
    actor User as External Editor / Terminal
    participant CLI as CLI Argument Parser (clap)
    participant Rust as Backend Path Resolver Engine

    User->>CLI: Execute `hasm_markdown preview <FOLDER_PATH>`
    activate CLI
    CLI->>Rust: Invoke `exec_cli_preview(folder_path)`
    deactivate CLI
    activate Rust

    Rust->>Rust: Inspect Target Path Type

    alt Target is ZIP Archive (.hasmmd) OR Invalid Directory
        Rust-->>User: Output Error ("Preview subcommand supports Folder Type workspace directories only") & Exit Process (Code 1)
    else Target is Valid Folder Directory (Mode B)
        Rust->>Rust: Read main.md and assets.json from Target Directory
        
        alt main.md or assets.json Read Failure
            Rust-->>User: Output Error ("Failed to read workspace metadata from target folder") & Exit Process (Code 1)
        else Read Success
            loop Parse & Resolve Image Link Tokens
                Rust->>Rust: Scan main.md for `![alt](asset:alias)` tags
                Rust->>Rust: Map alias key against assets.json entries
                alt Alias Found in Manifest
                    Rust->>Rust: Replace `asset:alias` with OS Absolute Path (e.g. `/path/to/folder/assets/3f8b9a20.png`)
                else Alias Missing
                    Rust->>Rust: Leave tag unmapped or flag missing warning
                end
            end
            
            Rust-->>User: Stream Converted Markdown Buffer to stdout & Exit Process (Code 0)
        end
    end
    deactivate Rust

```

---

### 2.3 Subcommand C: `hasm_markdown open <PATH>` / Interactive Desktop GUI Startup

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as OS / CLI Launcher
    participant React as Frontend (React / UI Store)
    participant Rust as Backend (Tauri / Rust Core)
    participant AppLocal as App Local Storage (<AppLocalDataDir>/<UUID>/)
    participant ExtStorage as Master Target Storage (.hasmmd / Folder)

    %% Phase 1: Launch & Version Check
    User->>CLI: Execute `hasm_markdown open [target_path]` (or `hasm_markdown [path]`)
    CLI->>Rust: Launch Process Instance with CLI Context
    activate Rust
    
    Rust->>Rust: Read Application Version Metadata
    alt Invalid Application Version
        Rust->>React: Launch Window with Version Error Flag
        activate React
        React->>User: Render System Error Page (/error-app)
        deactivate React
    else Version Valid
        Rust->>React: Launch Application Window with CLI Context
    end
    deactivate Rust

    %% Phase 2: Selection & Selective Import
    activate React
    alt Mode A: ZIP Archive Target (.hasmmd)
        alt CLI Path Provided
            React->>React: setIsLoading(true, "Opening workspace archive...")
            React->>Rust: invoke("open_archive_workspace", { archive_path: cli_target_path })
        else UI Selection
            React->>User: Render File Selection Page (/select)
            User->>React: Select .hasmmd / .zip File
            React->>React: setIsLoading(true, "Opening workspace archive...")
            React->>Rust: invoke("open_archive_workspace", { archive_path })
        end
        deactivate React
        activate Rust
        
        Rust->>AppLocal: Generate UUID & Create <AppLocalDataDir>/<UUID>/
        Rust->>ExtStorage: Extract main.md & assets.json ONLY to <UUID>/ (Selective Unpack)

    else Mode B: Folder Workspace Target
        activate React
        alt CLI Path Provided
            React->>React: setIsLoading(true, "Mounting workspace folder...")
            React->>Rust: invoke("open_folder_workspace", { folder_path: cli_target_path })
        else UI Selection
            React->>User: Render File Selection Page (/select)
            User->>React: Select External Folder Directory
            React->>React: setIsLoading(true, "Mounting workspace folder...")
            React->>Rust: invoke("open_folder_workspace", { folder_path })
        end
        deactivate React
        activate Rust
        
        Rust->>AppLocal: Generate UUID & Create <AppLocalDataDir>/<UUID>/
        Rust->>ExtStorage: Read main.md & assets.json -> Mount directly

    else Mode C: Create New Workspace Mode
        activate React
        React->>User: Render File Selection Page (/select)
        User->>React: Select "Create New HASM Markdown"
        React->>React: setIsLoading(true, "Scaffolding new workspace...")
        React->>Rust: invoke("create_new_package")
        deactivate React
        activate Rust
        
        Rust->>AppLocal: Generate UUID & Create <AppLocalDataDir>/<UUID>/
        Rust->>AppLocal: Scaffold initial main.md, assets.json, and empty assets/ directory
        Rust->>Rust: Set StorageTarget::Unbound
    end

    %% Phase 3: Single-Instance Lock, File Handles & Runtime Path Resolution
    Rust->>AppLocal: Read <UUID>/.lock File Payload
    alt Lock File Active with Running PID
        AppLocal-->>Rust: Active PID detected in OS process table
        Rust-->>React: Return PackageError::WorkspaceLocked
        activate React
        React->>React: setIsLoading(false)
        React->>User: Display Lock Conflict Modal ("Workspace already open in another window")
        deactivate React
    else Workspace Lock Available / Unlocked
        Rust->>AppLocal: Atomic Write <UUID>/.lock ({ pid: current_pid, status: "Locked" })
        
        Rust->>AppLocal: Acquire Exclusive Write Handles on <UUID>/main.md & assets.json
        opt Mode A (ZIP Target)
            Rust->>ExtStorage: Acquire Exclusive Read/Share Lock on target .hasmmd archive
        end
    end

    Rust->>AppLocal: Read <UUID>/assets.json
    AppLocal-->>Rust: Return relative assets.json content
    
    loop Expand Relative Paths to Runtime Absolute Paths
        alt Mode A (ZIP Target)
            Rust->>Rust: Bind relativePath -> resolvedPath ("asset-stream://<UUID>/<asset_uuid>")
        else Mode B / Mode C (Folder / Local Target)
            Rust->>Rust: Join workspace root path + relativePath -> resolvedPath (Absolute OS Path)
        end
    end

    %% Phase 4: State Commitment & Editor Navigation
    Rust->>AppLocal: Check existence of main.md and assets.json
    alt Core Metadata Missing
        AppLocal-->>Rust: Missing Core Metadata
        Rust-->>React: Return PackageValidationError::MissingMainMarkdown
        activate React
        React->>React: setIsLoading(false)
        React->>User: Render Data Error Page (/error-model)
        deactivate React
    else Metadata Intact
        Rust->>ExtStorage: Cross-check manifest asset keys against ZIP index / external assets/
        opt Missing Assets Detected
            Rust->>Rust: Collect into Vec<MissingAssetInfo>
        end
        
        Rust->>Rust: Store HasmMarkdownPackage in Thread-Safe State
        Rust-->>React: Return Ok(PackageStatePayload { manifest_with_resolved_paths, missing_assets, warnings })
        deactivate Rust
        
        activate React
        React->>React: setPackageStore(payload) [Commit store with resolvedPaths & set isLoaded = true]
        React->>React: Initialize markdown-it with manifest map
        React->>React: setIsLoading(false)
        React->>User: Render Markdown Editor Page (/editor)
        deactivate React
    end

```

---

## 3. Data Contracts & State Specifications

### 3.1 CLI Verification Output Format (`hasm_markdown verify --json`)

```json
{
  "status": "Invalid",
  "targetPath": "/path/to/my_package.hasmmd",
  "missingAssets": [
    {
      "alias": "architecture_diagram.png",
      "expectedRelativePath": "assets/3f8b9a20-1c2d-4e5f.png",
      "referencedLines": [12, 45]
    }
  ],
  "warnings": [
    {
      "code": "OrphanAssetFound",
      "filename": "assets/9e8d7c6b-5a4f-3e2d.png"
    }
  ]
}

```

### 3.2 Runtime Asset Manifest Payload (`PackageStatePayload`)

```typescript
export interface RuntimeAssetMetadata {
  uuid: string;             // Asset UUID
  relativePath: string;     // Portable package relative path (e.g., "assets/3f8b9a20.png")
  resolvedPath: string;     // Absolute runtime path (e.g., "C:\Users\...\assets\3f8b9a20.png" or "asset-stream://<UUID>/<asset_uuid>")
  mimeType: string;         // MIME string
  size: number;             // Byte size
  isExternal: boolean;      // True if referencing external OS file directly
  isDeleted: boolean;       // Soft deletion flag
}

export interface PackageStatePayload {
  uuid: string;                     // Temporary workspace UUID
  tempDirPath: string;              // Absolute path to <AppLocalDataDir>/<UUID>/
  targetType: 'Archive' | 'Folder' | 'Unbound'; // StorageTarget variant
  targetPath: string | null;        // Active master target path on disk (.hasmmd path or folder path)
  isDirty: boolean;                 // Initial unsaved changes flag (false)
  manifest: {
    version: string;
    assets: Record<string, RuntimeAssetMetadata>; // Maps Alias -> Runtime Metadata containing absolute resolvedPath
  };
  missingAssets: MissingAssetInfo[];// Referenced assets missing from ZIP index or folder
  warnings: PackageWarning[];       // Unregistered orphan assets in workspace
}

```

---

## 4. Path Resolution & CLI Execution Guard Rules

1. **Heading-Based Subcommand Routing:**
* `hasm_markdown verify <PATH>` is completely non-interactive; it executes headless verification and outputs diagnostics directly to terminal streams.


* `hasm_markdown preview <FOLDER_PATH>` guarantees Folder Type exclusivity; execution on ZIP archives is rejected immediately with an informative error message.
* `hasm_markdown open <PATH>` bootstraps the GUI layer and routes directly to `/editor`.




2. **Relative Storage on Disk vs Absolute Resolution in Memory:**
`assets.json` stored on disk inside `.hasmmd` or workspace folders **always** uses workspace-relative paths (`assets/<uuid_filename>`) for maximum portability across operating systems. Rust dynamically resolves `relativePath` into environment-specific `resolvedPath` URIs upon startup.