# HASM Markdown Implementation Directory Structure & Component API Specification

This document defines the complete directory layout and module component API mapping (classes, structs, functions, custom hooks, and IPC handlers) for implementing the HASM Markdown Desktop Application (`hasm_markdown.exe`).

The sequence flows and specifications referenced below correspond to:

* [SEQ-MD-01: App Launch, CLI Interface, Selective Import, Workspace Locking, and Path Resolution](https://www.google.com/search?q=./10-SEQ-MD-01_AppLaunch_and_Import.md)[cite: 22]
* [SEQ-MD-02: Text Editing, Dynamic Asset Path Resolution, Red-Highlighting, and Local Autosave](https://www.google.com/search?q=./11-SEQ-MD-02_Editor.md)[cite: 14]
* [SEQ-MD-03: Asset Management Operations, Single-Asset Upload, Soft-Deletion, and Editor Sync](https://www.google.com/search?q=./12-SEQ-MD-03_AssetManagement.md)[cite: 15]
* [SEQ-MD-04: Workspace Save, Export, Asset Delta Packing, Path Normalization, and Archive Writing](https://www.google.com/search?q=./13-SEQ-MD-04_Save.md)[cite: 16]
* [SEQ-MD-05: Workspace Close, Process Lock Release, and App Local Cleanup Lifecycle](https://www.google.com/search?q=./14-SEQ-MD-05_Close.md)[cite: 17]
* [SEQ-MD-06_Others: Global Menu Notifications, Save State Indicator, and Dynamic Color Theme Switching](https://www.google.com/search?q=./15-SEQ-MD-06_Others.md)[cite: 18]

---

## 1. High-Level Directory Overview

```text
hasm_markdown/
├── src-tauri/                      # Rust Backend Engine (Tauri v2 Native Core)
│   ├── Cargo.toml                  # Cargo Dependencies & Build Manifest
│   ├── tauri.conf.json             # Tauri Window, IPC & Security Permissions Config
│   └── src/                        # Core Application Rust Engine Source
├── src/                            # React Frontend Layer (JavaScript / JSX / Zustand)
│   ├── package.json                # Frontend Dependencies (React, Zustand, markdown-it, Monaco)
│   ├── vite.config.js              # Vite Build Configuration
│   ├── main.jsx                    # React DOM Entry Point
│   ├── App.jsx                     # Primary Router Gate & Tauri Window Event Listeners
│   └── ...                         # React Source Directory
└── docs/                           # Architecture, Sequence & Evaluation Specifications

```

---

## 2. Rust Backend Directory Layout & API Specification (`src-tauri/src/`)

```text
src-tauri/src/
├── main.rs                         # Application Entry Point & CLI Dispatcher
├── lib.rs                          # Library Root & Tauri Builder Setup
├── cli/                            # Headless CLI Engine Modules
│   ├── mod.rs                      # Subcommand Router
│   ├── args.rs                     # Subcommand Argument Structs (clap)
│   ├── verify.rs                   # Headless Structural & Asset Verification
│   └── preview.rs                  # Folder-Type Absolute Path Markdown Streamer
├── commands/                       # Tauri IPC Commands Facade Layer
│   ├── mod.rs                      # IPC Module Register
│   ├── workspace.rs                # Workspace Import, Mounting & Unmounting Commands
│   ├── editor.rs                   # Fast Local Autosave Buffer Commands
│   ├── asset.rs                    # Single-Asset Path Binding & Soft-Delete Commands
│   ├── save.rs                     # In-Place Save & Export As Delta Commands
│   └── config.rs                   # Theme & AppConfig Persistence Commands
├── domain/                         # Core Business Domain & Invariants
│   ├── mod.rs                      # Module Register
│   ├── package.rs                  # HasmMarkdownPackage Struct & Operations
│   ├── manifest.rs                 # AssetManifest & RuntimeAssetMetadata Structs
│   ├── lock.rs                     # ProcessLockPayload Struct & PID Lock Engine
│   ├── delta.rs                    # AssetDeltaContext & Sync Context Calculation
│   └── config.rs                   # AppConfig Entity & Theme Enums
├── repository/                     # File I/O, Compression & Path Engines
│   ├── mod.rs                      # Module Register
│   ├── zip_engine.rs               # Selective Unpack & Atomic ZIP Writer
│   ├── path_resolver.rs            # Relative Normalization & Absolute Expansion Engine
│   └── custom_protocol.rs          # Virtual Streaming Protocol (asset-stream://)
└── models/                         # DTOs & IPC Response Structs
    ├── mod.rs                      # Module Register
    ├── payload.rs                  # PackageStatePayload & Event Payloads
    ├── cli.rs                      # CliVerifyResult & CliPreviewResult
    └── error.rs                    # PackageError & PackageValidationError Enums

```

### 2.1 Entry Point & Lifecycle (`main.rs`, `lib.rs`)

* **`main.rs`**
* `fn main()`: Application entry point. Parses CLI arguments via `cli::args::parse_cli_args()`[cite: 21]. If subcommands (`verify`, `preview`) are detected, executes headless CLI logic and terminates with exit code `0` or `1`[cite: 20, 22]. Otherwise, delegates to `lib::run()`.


* **`lib.rs`**
* `fn run()`: Initializes Tauri v2 App Builder, sets up thread-safe `HasmMarkdownState` managed state, registers custom `asset-stream://` protocol, binds IPC commands, and launches application window[cite: 20, 21, 22].
* `fn setup_app_environment(app: &mut App) -> Result<(), Box<dyn Error>>`: Initializes `<AppLocalDataDir>` base directory.



### 2.2 CLI Commands (`cli/`)

* **`cli/args.rs`**
* `struct CliArgs`: Top-level CLI argument parser (`clap`). Defines `--path` and subcommands (`Verify`, `Preview`, `Open`)[cite: 21].
* `enum SubCommand`: Variants `Verify { path: PathBuf, json: bool }`, `Preview { folder_path: PathBuf }`, `Open { path: Option<PathBuf> }`[cite: 21, 22].


* **`cli/verify.rs`**
* `fn exec_cli_verify(target_path: &Path, json_output: bool) -> Result<i32, PackageError>`: Executes headless non-GUI verification of `main.md` and `assets.json`[cite: 20, 21, 22]. Prints diagnostic JSON/Text and returns exit code `0` (Valid) or `1` (Invalid)[cite: 20, 22].


* **`cli/preview.rs`**
* `fn exec_cli_preview(folder_path: &Path) -> Result<(), PackageError>`: Enforces **Folder Type Only (Mode B)**[cite: 20, 22]. Reads `main.md` and `assets.json`, resolves `asset:alias` links to OS absolute paths, and streams converted Markdown to `stdout`[cite: 20, 22].



### 2.3 IPC Facade Layer (`commands/`)

* **`commands/workspace.rs`**
* `fn open_archive_workspace(state: State<HasmMarkdownState>, archive_path: String) -> Result<PackageStatePayload, PackageError>`: Extracts `main.md` and `assets.json` ONLY to `App Local`, acquires PID lock, and expands relative paths to `resolvedPath`[cite: 20, 22].
* `fn open_folder_workspace(state: State<HasmMarkdownState>, folder_path: String) -> Result<PackageStatePayload, PackageError>`: Mounts external folder workspace directly and acquires PID lock[cite: 20, 22].
* `fn create_new_package(state: State<HasmMarkdownState>) -> Result<PackageStatePayload, PackageError>`: Scaffolds empty workspace template in `App Local`[cite: 20, 22].
* `fn close_and_cleanup_workspace(state: State<HasmMarkdownState>, uuid: String) -> Result<WorkspaceClosePayload, PackageError>`: Releases OS master handles, updates `.lock` payload to `pid: 0` / `status: "Unlocked"`, and cleans temp buffers[cite: 17, 20].


* **`commands/editor.rs`**
* `fn save_local_markdown_buffer(state: State<HasmMarkdownState>, uuid: String, content: String) -> Result<SaveLocalResult, PackageError>`: Executes 3-second fast local autosave to `<UUID>/main.md` in `App Local`[cite: 14, 19, 20].


* **`commands/asset.rs`**
* `fn register_and_bind_single_asset_path(state: State<HasmMarkdownState>, source_path: String, custom_alias: String) -> Result<RuntimeAssetMetadata, PackageError>`: Binds external single image path, generates UUID, and updates `assets.json`[cite: 15, 19, 20].
* `fn soft_delete_asset_mapping(state: State<HasmMarkdownState>, alias: String) -> Result<(), PackageError>`: Executes soft-deletion by setting `isDeleted: true` without deleting files[cite: 15, 19, 20].


* **`commands/save.rs`**
* `fn execute_package_save_or_export(app_handle: AppHandle, state: State<HasmMarkdownState>, uuid: String, export_target_path: Option<String>) -> Result<SaveExecutionPayload, PackageError>`: Executes Delta Sync algorithm, purges soft-deleted assets, packs new additions, normalizes manifest paths to relative format (`assets/<uuid>.<ext>`), and replaces target storage[cite: 16, 19, 20].


* **`commands/config.rs`**
* `fn update_app_theme_config(state: State<HasmMarkdownState>, theme: String) -> Result<(), PackageError>`: Persists active theme selection into `AppConfig`[cite: 18, 20, 21].



### 2.4 Domain Layer (`domain/`)

* **`domain/package.rs`**
* `struct HasmMarkdownPackage`: Domain aggregate root (`uuid`, `temp_dir_path`, `target`, `is_dirty`, `manifest`)[cite: 19].
* `enum StorageTarget`: Variants `Archive(PathBuf)`, `Folder(PathBuf)`, `Unbound`[cite: 19].


* **`domain/manifest.rs`**
* `struct AssetManifest`: HashMap cache of `alias -> RuntimeAssetMetadata`[cite: 19].
* `struct RuntimeAssetMetadata`: Asset fields (`uuid`, `relative_path`, `resolved_path`, `mime_type`, `size`, `is_external`, `is_deleted`, `deleted_at`)[cite: 19].


* **`domain/lock.rs`**
* `struct ProcessLockPayload`: Fields `pid: u32`, `status: String`, `workspace_uuid: String`, `last_acquired_at: u64`, `last_released_at: Option<u64>`[cite: 17, 19].
* `fn acquire_workspace_lock(workspace_dir: &Path) -> Result<(), PackageError>`: Writes/validates `.lock` file.
* `fn release_workspace_lock(workspace_dir: &Path) -> Result<(), PackageError>`: Sets payload to `pid: 0` / `status: "Unlocked"`[cite: 17, 20].


* **`domain/delta.rs`**
* `struct AssetDeltaContext`: Fields `delete_list: Vec<String>`, `addition_list: Vec<String>`, `unmodified_list: Vec<String>`[cite: 16, 19, 20].
* `fn compute_deltas(manifest: &AssetManifest, target_index: &[String]) -> AssetDeltaContext`: Computes delta arrays[cite: 16, 20].



### 2.5 Infrastructure & Repository Layer (`repository/`)

* **`repository/zip_engine.rs`**
* `fn extract_metadata_only(zip_path: &Path, target_dir: &Path) -> Result<(), PackageError>`: Unpacks `main.md` and `assets.json` ONLY[cite: 20, 22].
* `fn write_atomic_zip_package(target_path: &Path, delta: &AssetDeltaContext, temp_dir: &Path) -> Result<(), PackageError>`: Atomically constructs/replaces ZIP package[cite: 16, 20].


* **`repository/path_resolver.rs`**
* `fn resolve_relative_to_absolute(relative_path: &str, target: &StorageTarget, uuid: &Uuid) -> String`: Expands `assets/<uuid>.<ext>` to `asset-stream://` or OS absolute path[cite: 19, 20, 22].
* `fn normalize_absolute_to_relative(manifest: &mut AssetManifest)`: Converts all active paths back to `assets/<uuid>.<ext>` prior to saving[cite: 16, 19, 20].


* **`repository/custom_protocol.rs`**
* `fn register_asset_stream_protocol(app: &mut App) -> Result<(), Box<dyn Error>>`: Handles `asset-stream://<UUID>/<asset_uuid>` requests for streaming images directly from ZIP files without full unpacking[cite: 14, 19, 20, 22].



---

## 3. React Frontend Directory Layout & Component Specification (`src/`)

```text
src/
├── package.json                    # Dependencies (React 18, Zustand, markdown-it, Monaco)
├── vite.config.js                  # Vite Config & Submodule Aliasing
├── main.jsx                        # Entry Point
├── App.jsx                         # Main Router Layout & Event Watchers
├── hasm_color_pattern/             # Git Submodule: Shared Theme Palettes & Styles
├── hasm_logger/                    # Git Submodule: Shared logging functions
├── router/                         # Route Management & Guards
│   ├── index.jsx                   # React Router Declarative Mapping
│   └── WorkspaceGuard.jsx          # Protected Route Guard (Barrier 2)
├── store/                          # Global State Store
│   └── usePackageStore.js          # Zustand Store (Workspace State & Buffers)
├── context/                        # Context Providers
│   └── ThemeContext.jsx            # 3-Color Theme Provider linked to hasm_color_pattern
├── components/                     # Atomic & Functional UI Components
│   ├── common/                     # Shared UI Components
│   │   ├── Header.jsx              # Status Bar & Save Readout
│   │   ├── GlobalMenu.jsx          # Diagnostic Drawer (Error & Warning Lists)
│   │   ├── ThemeSelector.jsx       # Theme Toggle Selector Component
│   │   ├── SaveProgressModal.jsx   # Progress Overlay for Save/Export
│   │   └── UnsavedChangesModal.jsx # Interception Modal for Closing Dirty Workspaces
│   ├── editor/                     # Code Editor & Preview Components
│   │   ├── MarkdownEditor.jsx      # Code Editor Component with Warning Decorators
│   │   ├── MarkdownPreview.jsx     # HTML Preview Pane (markdown-it)
│   │   └── plugins/
│   │       └── assetResolverPlugin.js # Custom markdown-it Plugin for asset: Rewriting
│   └── asset/                      # Asset Sub-window Components
│       ├── AssetWindow.jsx         # Asset Management Main Panel
│       ├── AliasNamingModal.jsx    # Custom Alias Input Modal
│       └── AssetCard.jsx           # Registered Asset Grid Item Renderer
├── pages/                          # Screen Page Views
│   ├── SelectPage.jsx              # Workspace Selection View (/select)
│   ├── EditorPage.jsx              # Main Editor Workspace View (/editor)
│   ├── LoadingModelPage.jsx        # Unpacking / Mounting Loading View (/loading-model)
│   ├── ErrorModelPage.jsx          # Structural Integrity Error View (/error-model)
│   └── ErrorAppPage.jsx            # Runtime System Error View (/error-app)
├── hooks/                          # Custom Hooks
│   ├── useAutosaveLoop.js          # 3-Second Fast Local Autosave Hook
│   ├── useAssetManager.js          # Asset Upload & Soft-Delete Action Hook
│   ├── useWorkspaceSave.js         # In-Place Save & Export Hook
│   └── useTheme.js                 # 16ms Instant Theme Switch Hook
└── utils/                          # Helper Utility Modules
    ├── ipcClient.js                # Strongly-typed Tauri invoke/listen Client
    └── pathSanitizer.js            # Alias & String Sanitization Utilities

```

### 3.1 Entry & Router Layer (`src/`)

* **`main.jsx`**
* Entry point rendering `<App/>` within React DOM root.


* **`App.jsx`**
* Top-level layout container. Mounts `<Header/>`, sets up `useWindowCloseListener` (intercepting window close to run `SEQ-MD-05`), and renders React Router view container[cite: 17, 21].


* **`router/index.jsx`**
* Declarative React Router mapping:
* `/select` $\rightarrow$ `SelectPage`[cite: 20, 21]
* `/loading-model` $\rightarrow$ `LoadingModelPage`[cite: 20, 21]
* `/editor` $\rightarrow$ `<WorkspaceGuard><EditorPage/></WorkspaceGuard>`[cite: 20, 21]
* `/error-model` $\rightarrow$ `ErrorModelPage`[cite: 20, 21]
* `/error-app` $\rightarrow$ `ErrorAppPage`[cite: 20, 21]




* **`router/WorkspaceGuard.jsx`**
* **Route Protection Guard (Barrier 2):** Intercepts direct URL navigation attempts to `/editor`[cite: 20, 21]. If `isLoaded === false` or `uuid === null`, cancels rendering, displays a warning toast, and redirects immediately to `/select`[cite: 20, 21].



### 3.2 State Management & Context (`store/`, `context/`)

* **`store/usePackageStore.js`**
* Zustand central store managing global application state[cite: 20, 21]:
* **State Fields:** `uuid`, `tempDirPath`, `targetType`, `targetPath`, `isLoaded`, `isLoading`, `rawContent`, `lastSavedContent`, `isDirty`, `isSaving`, `manifest`, `missingAssets`, `warnings`, `themeMode`[cite: 14, 20].
* **Actions:** `setPackageState(payload)`, `updateRawContent(text)`, `setDirty(status)`, `setMissingAssets(list)`, `setWarnings(list)`, `resetPackageStore()`[cite: 14, 15, 17, 20].




* **`context/ThemeContext.jsx`**
* React Context Provider bound to `hasm_color_pattern` submodule[cite: 21]. Controls root DOM `data-theme` attribute and CSS custom variables[cite: 18, 21].



### 3.3 UI Components (`components/`)

* **`components/common/Header.jsx`**
* Top status header. Displays active target path, PID lock status, live save state indicator ("Unsaved Changes (*)", "Saving...", "Autosaved Locally at HH:mm:ss", "Master Target Synced"), theme selector, and diagnostic badges[cite: 18, 20, 21].


* **`components/common/GlobalMenu.jsx`**
* Persistent diagnostic drawer. Displays **Error List** (`missingAssets` tags, lock conflicts) and **Warning List** (unregistered orphan files, soft-deleted asset references)[cite: 18, 20, 21].


* **`components/common/ThemeSelector.jsx`**
* Dropdown selector component for toggling themes (`Light`, `Dark`, `High-Contrast`)[cite: 18, 21].


* **`components/common/SaveProgressModal.jsx`**
* Progress overlay displaying progress bar and status text during `SEQ-MD-04` save/export operations[cite: 16, 21].


* **`components/common/UnsavedChangesModal.jsx`**
* Modal dialog displayed when closing a dirty workspace[cite: 17, 21]. Options: "Save" (invokes `SEQ-MD-04`), "Discard Changes" (proceeds to close), "Cancel"[cite: 17].


* **`components/editor/MarkdownEditor.jsx`**
* Code editor component (CodeMirror / Monaco)[cite: 21]. Unbinds `Ctrl+S` shortcuts[cite: 14, 20]. Highlights missing or soft-deleted asset lines with red warning decorators[cite: 14, 15, 20, 21].


* **`components/editor/MarkdownPreview.jsx`**
* Live HTML preview pane powered by `markdown-it` engine and `assetResolverPlugin`[cite: 14, 21].


* **`components/editor/plugins/assetResolverPlugin.js`**
* Custom `markdown-it` plugin[cite: 14, 21]. Rewrites `![alt](asset:alias)` tokens[cite: 14, 20]. If alias exists and active, rewrites `src` to `resolvedPath` (`asset-stream://` or OS absolute path)[cite: 14, 20]. If missing or `isDeleted: true`, wraps token in `<span class="missing-asset-warning">` red text span[cite: 14, 15, 20].


* **`components/asset/AssetWindow.jsx`**
* Asset management panel (modal/sidebar)[cite: 15, 21]. Displays registered assets (filtering out `isDeleted: true`), missing file warnings, and orphan file lists[cite: 15, 21].


* **`components/asset/AliasNamingModal.jsx`**
* Modal prompting user for a custom asset alias name (pre-filled with sanitized raw filename)[cite: 15, 21].


* **`components/asset/AssetCard.jsx`**
* Card renderer for individual registered asset items with thumbnail preview and "Delete" button[cite: 15, 21].



### 3.4 Screen Pages (`pages/`)

* **`pages/SelectPage.jsx` (`/select`)**
* Workspace selection screen[cite: 20, 21]. Provides "Open `.hasmmd` Archive", "Open Workspace Folder", and "Create New Package" buttons[cite: 20, 22].


* **`pages/EditorPage.jsx` (`/editor`)**
* Primary Markdown workspace view[cite: 20, 21]. Renders split view (Code Editor & Preview), toolbar controls ("Assets", "Save Package", "Export As", "Close"), and attaches `useAutosaveLoop`[cite: 14, 15, 16, 17, 21].


* **`pages/LoadingModelPage.jsx` (`/loading-model`)**
* Loading overlay screen showing progress bar during initial selective unpacking or folder mounting[cite: 20, 21, 22].


* **`pages/ErrorModelPage.jsx` (`/error-model`)**
* Data/structural integrity error screen (e.g., missing `main.md` or corrupted archive)[cite: 20, 21, 22].


* **`pages/ErrorAppPage.jsx` (`/error-app`)**
* System/runtime error screen (e.g., missing binaries or environment failure)[cite: 20, 21, 22].



### 3.5 Custom React Hooks (`hooks/`)

* **`hooks/useAutosaveLoop.js`**
* 3-second periodic timer hook[cite: 14, 21]. Checks `isDirty === true` and `isSaving === false`, then invokes `save_local_markdown_buffer` IPC command to update `<UUID>/main.md` in `App Local` without triggering heavy ZIP packaging[cite: 14, 19, 20].


* **`hooks/useAssetManager.js`**
* Encapsulates single-asset upload (`register_and_bind_single_asset_path`) and soft-deletion (`soft_delete_asset_mapping`)[cite: 15, 19, 21]. Scans `main.md` text for active references before confirming deletion[cite: 15].


* **`hooks/useWorkspaceSave.js`**
* Handles In-Place Save and Export As actions (`execute_package_save_or_export`)[cite: 16, 19, 21]. Monitors `save_progress` IPC event stream to update `SaveProgressModal`[cite: 16].


* **`hooks/useTheme.js`**
* Hook for 16ms instant theme toggling[cite: 18, 21]. Updates `ThemeContext`, sets root DOM `data-theme` attribute, and invokes `update_app_theme_config` IPC command[cite: 18, 20].



### 3.6 Helper Utilities (`utils/`)

* **`utils/ipcClient.js`**
* Centralized strongly-typed wrapper around `@tauri-apps/api/core` `invoke()` and `listen()` API calls[cite: 21].


* **`utils/pathSanitizer.js`**
* Sanitizes user input asset alias strings (removes invalid file characters and restricts extensions)[cite: 21].



---

## 4. Full IPC Channel Mapping Matrix

| Tauri IPC Command | Target Module | Parameters | Description & Purpose | Sequence Ref |
| --- | --- | --- | --- | --- |
| `open_archive_workspace` | `commands::workspace` | `archive_path: String` | Extracts `main.md` & `assets.json` ONLY to `App Local`, acquires PID lock, resolves paths | `SEQ-MD-01`[cite: 20, 22] |
| `open_folder_workspace` | `commands::workspace` | `folder_path: String` | Mounts external folder workspace, acquires PID lock, resolves absolute paths | `SEQ-MD-01`[cite: 20, 22] |
| `create_new_package` | `commands::workspace` | *None* | Scaffolds default workspace template in `App Local` | `SEQ-MD-01`[cite: 20, 22] |
| `close_and_cleanup_workspace` | `commands::workspace` | `uuid: String` | Releases master OS handles, updates `.lock` payload (`pid: 0` / `Unlocked`), cleans temp files | `SEQ-MD-05`[cite: 17, 20] |
| `save_local_markdown_buffer` | `commands::editor` | `uuid: String, content: String` | Fast local-only 3-second periodic autosave to `<UUID>/main.md` in `App Local` | `SEQ-MD-02`[cite: 14, 19, 20] |
| `register_and_bind_single_asset_path` | `commands::asset` | `source_path: String, custom_alias: String` | Binds single external image path, generates UUID, updates `assets.json` (1-file limit) | `SEQ-MD-03`[cite: 15, 19, 20] |
| `soft_delete_asset_mapping` | `commands::asset` | `alias: String` | Sets `isDeleted: true` in `assets.json` without removing UUID or physical binary | `SEQ-MD-03`[cite: 15, 19, 20] |
| `execute_package_save_or_export` | `commands::save` | `uuid: String, export_target_path: Option<String>` | Executes Delta Sync algorithm, purges deleted assets, packs additions, replaces target file | `SEQ-MD-04`[cite: 16, 19, 20] |
| `update_app_theme_config` | `commands::config` | `theme: String` | Persists user theme preference (`Light`, `Dark`, `High-Contrast`) into `AppConfig` | `SEQ-MD-06`[cite: 18, 20, 21] |