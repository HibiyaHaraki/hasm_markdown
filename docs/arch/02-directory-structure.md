# HASM Markdown Implementation Directory Structure (Fully Integrated)

This document defines the production-ready directory and file layout for implementing the HASM Markdown Desktop Application (`hasm_markdown`). It covers the dual-layer architecture spanning the **Tauri v2 Rust Backend Engine** and the **React TypeScript Frontend System**, including Protected Routing Guards (`<WorkspaceGuard>`), Global Diagnostic Notifications, Save State Readouts, and 3-Color Theme Management (`SEQ-MD-06_Others`).

---

## 1. High-Level Directory Overview

```text
hasm_markdown/
├── src-tauri/                      # Rust Backend (Tauri v2 Desktop Native Core)
│   ├── Cargo.toml                  # Cargo Dependencies & Build Manifest
│   ├── tauri.conf.json             # Tauri Window, IPC & Security Permissions Config
│   └── src/                        # Core Application Rust Engine Source
├── src/                            # React Frontend (TypeScript / UI Store / Editor Layer)
│   ├── package.json                # Frontend Dependencies (React, Zustand, markdown-it, Monaco)
│   ├── vite.config.ts              # Vite Build Configuration
│   └── src/                        # React Frontend Source Directory
└── docs/                           # Architecture, Sequence & Evaluation Specifications

```

---

## 2. Rust Backend Directory Layout (`src-tauri/src/`)

```text
src-tauri/src/
├── main.rs                         # Application Entry Point & Tauri Builder Setup
├── lib.rs                          # Library Root & Tauri IPC Command Registration
├── commands/                       # IPC Invocation Handler Functions (React -> Rust)
│   ├── mod.rs                      # Module Exports for IPC Handlers
│   ├── workspace.rs                # Workspace Launch, Selective Import & Close Commands
│   ├── editor.rs                   # Fast Local Autosave Buffer Persistence Commands
│   ├── asset.rs                    # Single-Asset Path Binding & Soft-Delete Commands
│   ├── save.rs                     # Workspace In-Place Save & Export As Commands
│   └── config.rs                   # AppConfig & Color Theme Persistence Commands (SEQ-MD-06)
├── domain/                         # Core Business Logic & Struct Definitions
│   ├── mod.rs                      # Module Exports
│   ├── package.rs                  # HasmMarkdownPackage Entity Logic & State Management
│   ├── manifest.rs                 # AssetManifest & RuntimeAssetMetadata Logic
│   ├── lock.rs                     # Single-Instance PID Lock Management (.lock)
│   ├── delta.rs                    # Asset Delta Computation Context (delete_list & addition_list)
│   └── config.rs                   # AppConfig Entity & ThemeMode Preference Logic (SEQ-MD-06)
├── services/                       # File I/O, Compression & Path Resolution Engines
│   ├── mod.rs                      # Module Exports
│   ├── zip_engine.rs               # Selective Unpack & Atomic Temporary ZIP Writer Engine
│   ├── path_resolver.rs            # Relative Path Normalization & Runtime Absolute Expansion
│   └── custom_protocol.rs          # Virtual Asset Streaming Protocol (asset-stream://)
└── models/                         # DTOs & Serializable IPC Payloads
    ├── mod.rs                      # Module Exports
    ├── payload.rs                  # PackageStatePayload, SaveExecutionPayload & Event Models
    └── error.rs                    # PackageError & PackageValidationError Definitions

```

---

## 3. React Frontend Directory Layout (`src/src/`)

```text
src/src/
├── main.tsx                        # React DOM Entry Point
├── App.tsx                         # Primary Route Architecture & Layout Structure
├── router/                         # Application Routing & Security Guard System
│   ├── index.tsx                   # React Router Configuration
│   └── WorkspaceGuard.tsx          # Protected Route Guard (Intercepts Unloaded Workspace Access) [★Reflected]
├── store/                          # Global Application State Management
│   └── usePackageStore.ts          # Zustand Store (rawContent, manifest, isDirty, missingAssets, themeMode)
├── context/                        # Cross-Cutting React Context Providers
│   └── ThemeContext.tsx            # App-wide 3-Color Theme Provider (Light/Dark/High-Contrast) [★Reflected]
├── components/                     # Reusable React UI Components
│   ├── common/                     # Generic UI Elements (Button, Modal, Toast, Header)
│   │   ├── Header.tsx              # Title Bar, Save State Indicator & Diagnostic Badges [★Reflected]
│   │   ├── GlobalMenu.tsx          # Global Drawer for Error List & Warning List Notifications [★Reflected]
│   │   ├── ThemeSelector.tsx       # 3-Color Theme Switcher Control Component [★Reflected]
│   │   ├── SaveProgressModal.tsx   # Progress Bar Modal for Save/Export Streaming Events
│   │   └── UnsavedChangesModal.tsx # Interception Modal for Closing Dirty Workspaces
│   ├── editor/                     # Markdown Code Editor & Preview Components
│   │   ├── MarkdownEditor.tsx      # Code Mirror / Monaco Editor with Line Decorators
│   │   ├── MarkdownPreview.tsx     # Preview Pane Component Powered by markdown-it
│   │   └── plugins/                # Custom markdown-it Engine Plugins
│   │       └── assetResolverPlugin.ts # Asset Alias-to-resolvedPath Protocol Rewriter
│   └── asset/                      # Asset Management Sub-window Components
│       ├── AssetWindow.tsx         # Asset Management Main Modal/Sidebar Panel
│       ├── AssetDropzone.tsx       # Drag & Drop Single-Asset Upload Component
│       ├── AliasNamingModal.tsx    # Custom Alias Naming Modal Component
│       └── AssetCard.tsx           # Active Registered Asset Grid/Item Renderer
├── pages/                          # Primary Screen Components
│   ├── SelectPage.tsx              # Workspace Selection Screen (/select)
│   ├── EditorPage.tsx              # Primary Markdown Editing Screen (/editor)
│   ├── LoadingModelPage.tsx        # Unpacking / Mounting Loading Screen (/loading-model)
│   ├── ErrorModelPage.tsx          # Data / Structural Integrity Error Screen (/error-model)
│   └── ErrorAppPage.tsx            # Runtime System Error Screen (/error-app)
├── hooks/                          # Custom React Hooks
│   ├── useAutosaveLoop.ts          # 10-Second Periodic Local Fast Autosave Hook
│   ├── useAssetManager.ts          # Single-Asset Upload & Soft-Delete Action Hook
│   ├── useWorkspaceSave.ts         # In-Place Save & Export As Execution Hook
│   └── useTheme.ts                 # Custom Hook for 16ms Instant Theme Switching [★Reflected]
├── types/                          # TypeScript Interface Specifications
│   ├── package.ts                  # PackageStatePayload, RuntimeAssetMetadata & Store Types
│   ├── ipc.ts                      # Tauri IPC Command Names & Payload Type Definitions
│   ├── asset.ts                    # MissingAssetInfo, Warning & Alias Naming Types
│   └── theme.ts                    # AppThemeMode & AppThemeConfig Specifications [★Reflected]
└── utils/                          # Helper Utility Functions
    ├── ipcClient.ts                # Strongly-typed Tauri invoke & listen wrapper
    └── pathSanitizer.ts            # Alias & File Path Sanitization Helpers

```

---

## 4. Specific Component Reflections Summary

1. **Routing Guard (`<WorkspaceGuard>`):**
* **`src/src/router/WorkspaceGuard.tsx`:** ワークスペース未ロード状態（`isLoaded === false`）での `/editor` 等へのアクセスを遮断し、`/select` へ安全にリダイレクトするガードを配置。


2. **Global Menu & Diagnostic Notifications (`SEQ-MD-06_Others`):**
* **`src/src/components/common/GlobalMenu.tsx`:** 全画面で共通利用可能な通知ドロワー。`missingAssets`（Error List）および孤立ファイル/論理削除アセット（Warning List）の集約バッジと一覧を表示。
* **`src/src/components/common/Header.tsx`:** 保存状態 readout（「未保存 (*)」「保存中...」「HH:mm:ss にローカル保存済み」「マスター同期完了」）のリアルタイムインジケーターを統合。


3. **3-Color Theme Switching System (`SEQ-MD-06_Others`):**
* **`src/src/context/ThemeContext.tsx` & `useTheme.ts`:** `Light` / `Dark` / `High-Contrast` のテーマ切替を 16ms（1フレーム）でルート DOM（`data-theme`）に適用するプロバイダーおよびフック。
* **`src-tauri/src/commands/config.rs` & `domain/config.rs`:** テーマ設定を Rust 側の `AppConfig` に永久化保存する IPC バックエンド。