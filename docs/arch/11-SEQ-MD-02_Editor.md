# Text Editing, Dynamic Asset Path Resolution, Missing Asset Red-Highlighting, and Local Autosave

## 1. Sequence Overview

This sequence handles the real-time text editing operational lifecycle within the primary Markdown Editor screen (`/editor`). To protect system responsiveness and prevent unintended high I/O spikes caused by heavy archive re-compression, **all `Ctrl+S` manual save shortcuts are explicitly removed**. The 3-second periodic autosave loop focuses strictly on fast, lightweight local updates (`main.md` and `assets.json` in `App Local`). Full package packaging, asset copying, and ZIP archive writing are delegated exclusively to **`SEQ-MD-04` (User-Triggered Save Action)**.

### Key Operations Covered

1. **Component Mount & Dynamic Path Resolution:** Resolving local image tokens (`![alt](asset:alias)`) to active runtime absolute paths (`resolvedPath`) or `asset-stream://` archive streaming URIs provided by `usePackageStore`.
2. **Missing Asset Red-Text Highlighting:** Evaluating image tokens against `missingAssets`. Re-rendering missing asset markup with warning red CSS spans in preview and red line decorators in the code editor.
3. **Real-time Text Editing & Diff Tracking:** Updating live buffers (`rawContent`) in memory and tracking modified states (`isDirty`) against the last saved buffer.
4. **3-Second Periodic Local-Only Autosave Loop:** Periodically persisting the text buffer to `<UUID>/main.md` in `App Local` via atomic file operations without invoking heavy external archiving processes.
5. **Independent Editor Appearance and Syntax Colors:** Rendering one syntax-colored `contenteditable` Markdown surface with locally persisted Light or Dark editor appearance independent from the application color pattern.

---

## 2. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant React as Frontend (React / Editor Store)
    participant CodeEditor as Code Editor Component (Monaco / CodeMirror)
    participant MarkdownIt as markdown-it Engine (Custom Asset Plugin)
    participant Timer as Local Autosave Loop (3s Interval)
    participant Rust as Backend (Tauri / Rust Core)
    participant AppLocal as App Local Storage (<AppLocalDataDir>/<UUID>/)

    %% Phase 1: Editor Mount, Dynamic Path Resolution & Red-Text Rendering
    Note over React: Component Mount (/editor active with payload containing missingAssets & resolvedPaths)
    activate React
    
    React->>MarkdownIt: Initialize markdown-it with Dynamic Asset Resolver Plugin
    Note over React,MarkdownIt: Pass manifest with resolvedPath (absolute) & targetType ('Archive' | 'Folder')
    
    React->>React: Read main.md raw text from usePackageStore
    React->>MarkdownIt: render(raw_markdown_text)
    activate MarkdownIt
    
    loop Token Inspection & Dynamic Path Binding
        MarkdownIt->>MarkdownIt: Intercept image tokens (e.g., ![alt](asset:alias))
        
        alt Alias missing from Manifest OR Listed in missingAssets
            MarkdownIt->>MarkdownIt: Wrap token in Warning Red HTML (<span class="missing-asset-warning">![alt](asset:alias) - Missing File</span>)
        else StorageTarget is Archive (ZIP) AND Asset NOT added locally
            MarkdownIt->>MarkdownIt: Rewrite src to streaming protocol (asset-stream://<UUID>/<asset_uuid>)
        else Asset has absolute resolvedPath (Folder Mode OR Locally Added Asset)
            MarkdownIt->>MarkdownIt: Rewrite src to local protocol (asset://<resolved_absolute_path>)
        end
    end
    
    MarkdownIt-->>React: Return rendered HTML string with resolved URIs / Red-Text elements
    deactivate MarkdownIt
    
    React->>CodeEditor: Apply Red Warning Text Decorators to lines matching missing asset tags
    React->>User: Render Editor UI (Preview displays streaming/local images or Red Text)
    deactivate React

    %% Phase 2: Real-time Editing, Buffer Update & Diff Tracking
    User->>React: Type / Modify Text in Code Editor
    activate React
    React->>React: Update local contentState buffer in memory
    React->>React: Compute diff vs lastSavedContent & Update isDirty flag
    
    %% Real-time Text Re-evaluation
    React->>MarkdownIt: Live render(updated_raw_text)
    activate MarkdownIt
    MarkdownIt->>MarkdownIt: Re-evaluate image tokens against manifest & missingAssets
    MarkdownIt-->>React: Return updated HTML
    deactivate MarkdownIt
    
    React->>CodeEditor: Update Red Warning Decorators on modified lines
    React->>User: Re-render Editor & Preview with updated Red Warning Text
    deactivate React

    %% Phase 3: 3-Second Periodic Local-Only Autosave Loop (No Heavy Zip Packaging)
    loop Every 3 Seconds Interval
        Timer->>React: Trigger Local Autosave Check
        activate React
        
        alt isDirty == false OR isSaving == true
            React->>React: Skip Autosave Cycle
        else isDirty == true AND isSaving == false
            React->>React: setIsSaving(true)
            React->>Rust: invoke("save_local_markdown_buffer", { uuid, content: current_buffer })
            activate Rust
            
            %% Fast Local Disk Write Only (App Local Sandbox)
            Rust->>AppLocal: Atomic Write <UUID>/main.md.tmp -> <UUID>/main.md
            
            alt Local File Write Success
                AppLocal-->>Rust: File Written
                Rust-->>React: Return Ok(AutosaveResult)
                React->>React: Update lastSavedContent = current_buffer
                React->>React: Recalculate missingAssets and retain backend warnings
                React->>React: setDirty(false)
                React->>React: setIsSaving(false)
                React->>User: Update Header UI Status ("Autosaved locally at HH:mm:ss")
            else Local File Write Error
                AppLocal-->>Rust: Write Failure Error
                Rust-->>React: Return Err(PackageError::IoError)
                deactivate Rust
                
                React->>React: setIsSaving(false)
                React->>React: Keep isDirty(true)
                React->>User: Display Warning Toast ("Local autosave failed: Disk write error")
            end
        end
        deactivate React
    end

```

---

## 3. Data Contracts & State Specifications

The current React implementation keeps one lightweight `contenteditable` Markdown editor. Its rendered spans color Markdown headings, markers, links/assets, inline code, strong text, and emphasis in the same surface that accepts input, so wrapping stays aligned with the line-number gutter. The preview uses a `markdown-it` asset resolver plugin. The editor Light/Dark appearance persists independently from the application color pattern. Active folder assets use `asset://<resolvedPath>`, archive assets retain `asset-stream://<UUID>/<asset_uuid>`, and missing or soft-deleted aliases render as escaped `.missing-asset-warning` spans.

### 3.1 Editor Local State (`usePackageStore` / Editor Context)

```typescript
export interface EditorState {
  rawContent: string;           // Active live buffer in editor
  lastSavedContent: string;     // Content buffer at last successful local autosave or save action
  isDirty: boolean;             // Computed as (rawContent !== lastSavedContent)
  isSaving: boolean;            // Lock flag preventing concurrent save/autosave calls
  lastAutosavedAt: number | null;// Unix timestamp of last successful local autosave
  missingAssets: MissingAssetInfo[]; // Active list of referenced assets missing physical files
  manifest: RuntimeAssetManifest;   // Maps Alias -> Runtime Metadata containing absolute resolvedPath
}

```

### 3.2 Backend Command Interface (`save_local_markdown_buffer`)

```typescript
// Tauri IPC Invocation Payload for Local Fast Autosave
export interface SaveLocalMarkdownBufferArgs {
  uuid: string;         // Active workspace UUID
  content: string;      // UTF-8 plain text string of main.md
}

export type SaveLocalMarkdownBufferResult = 
  | { status: "Ok"; savedAt: number }
  | { status: "Err"; error: "IoError" | "WorkspaceLocked" };

```

---

## 4. Operational Guard & Responsiveness Rules

1. **Total Elimination of `Ctrl+S` Keyboard Shortcut:**
The application explicitely unbinds and intercepts `Ctrl+S` / `Cmd+S` keydown events within the editor component to prevent accidental execution of long-running file operations.
2. **Strict Local Isolation of Autosave:**
The 3-second periodic autosave loop is strictly bounded to writing plain UTF-8 text to `<UUID>/main.md` in `App Local`. After a successful save it re-scans the saved buffer for missing/deleted asset references and retains backend warning records without replacing the mounted manifest or gutter visual state from a partial autosave response. It **never** invokes ZIP re-compression, archive updates, or heavy asset file copying.
3. **Save Action Offloading:**
All heavy persistence tasks (normalizing relative paths, syncing added/deleted assets, writing back to target folders, or re-building `.hasmmd` ZIP archives) are offloaded exclusively to **`SEQ-MD-04`**, triggered only by an explicit user click on the UI "Save Package" button.