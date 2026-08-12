# Text Editing, Custom Markdown Asset Resolution, Missing Asset Red-Highlighting, and Autosave

## 1. Sequence Overview

This sequence handles the operational lifecycle within the primary Markdown Editor screen (`/editor`). Since `main.md` and `assets.json` are secured under exclusive OS file locks during active sessions, external file modification is prevented by design. This sequence focuses strictly on:

1. **Component Mount & Custom `markdown-it` Plugin Path Resolution:** Upon `/editor` mount, resolving local alias image markup (e.g., `![diagram](asset:uuid-key)`) to `App Local` protocol URLs using the in-memory manifest cached in `usePackageStore`.
2. **Missing Asset Red-Text Styling (Preview & Code Editor):** Evaluating image tokens against `missingAssets`. Re-rendering missing asset markup with a warning red-text CSS class in the preview pane, and decorating the corresponding code lines in the code editor with red warning markers.
3. **Real-time Editing & Diff Tracking:** Processing user typing input, re-evaluating missing asset tags on the fly, updating local UI State, and calculating the `isDirty` flag against the last saved buffer.
4. **Manual Save (`Ctrl+S`) & 10-Second Periodic Autosave Loop:** Periodically writing text buffers safely to `<UUID>/main.md` via atomic write/rename operations without blocking UI responsiveness.

---

## 2. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant React as Frontend (React / Editor Store)
    participant CodeEditor as Code Editor Component (Monaco / CodeMirror)
    participant MarkdownIt as markdown-it Engine (Custom Asset Plugin)
    participant Timer as Autosave Loop (10s Interval)
    participant Rust as Backend (Tauri / Rust Core)
    participant AppLocal as App Local Storage (<AppLocalDataDir>/<UUID>/)

    %% Phase 1: Editor Mount & Initial Missing Asset Red-Text Rendering
    Note over React: Component Mount (/editor active with payload containing missingAssets)
    activate React
    
    React->>MarkdownIt: Initialize markdown-it with Custom Asset Resolver Plugin
    Note over React,MarkdownIt: Pass manifest asset map & missingAssets list from usePackageStore
    
    React->>React: Read main.md raw text from usePackageStore
    React->>MarkdownIt: render(raw_markdown_text)
    activate MarkdownIt
    
    loop Token Inspection & Transformation
        MarkdownIt->>MarkdownIt: Intercept image tokens (e.g. ![alt](asset:alias))
        alt Alias missing from Manifest OR Listed in missingAssets
            MarkdownIt->>MarkdownIt: Wrap token in Warning Red HTML (<span class="missing-asset-warning">![alt](asset:alias) - Missing File</span>)
        else Physical Asset Exists
            MarkdownIt->>MarkdownIt: Rewrite src to asset protocol (asset://<UUID>/assets/<filename>)
        end
    end
    
    MarkdownIt-->>React: Return rendered HTML string with Red-Text elements
    deactivate MarkdownIt
    
    React->>CodeEditor: Apply Red Warning Text Decorators to lines matching missing asset tags
    React->>User: Render Editor UI (Preview & Editor show Red Text for missing assets)
    deactivate React

    %% Phase 2: Real-time Editing & Live Red-Text Update
    User->>React: Type / Modify Text in Editor
    activate React
    React->>React: Update local contentState buffer
    React->>React: Compute diff vs lastSavedContent & Update isDirty flag
    
    %% Real-time Text Monitoring for Missing Assets
    React->>MarkdownIt: Live render(updated_raw_text)
    activate MarkdownIt
    MarkdownIt->>MarkdownIt: Re-evaluate image tokens against manifest & missingAssets
    MarkdownIt-->>React: Return updated HTML with Red Warning Spans
    deactivate MarkdownIt
    
    React->>CodeEditor: Update Red Warning Decorators on modified lines
    React->>User: Re-render Editor & Preview with updated Red Warning Text
    deactivate React

    %% Phase 3: Manual Save (Ctrl+S)
    opt User Triggered Manual Save
        User->>React: Press Ctrl+S (Manual Save)
        activate React
        React->>React: Trigger Manual Save Action
        React->>Rust: invoke("save_main_markdown", { content: current_buffer })
        activate Rust
        Rust->>AppLocal: Atomic Write to <UUID>/main.md
        AppLocal-->>Rust: Write Success
        Rust-->>React: Return Ok(())
        deactivate Rust
        
        React->>React: Update lastSavedContent = current_buffer
        React->>React: setDirty(false)
        React->>User: Display Toast Notification ("Saved") & Update Header UI
        deactivate React
    end

    %% Phase 4: 10-Second Periodic Autosave Loop
    loop Every 10 Seconds Interval
        Timer->>React: Trigger Autosave Check
        activate React
        
        alt isDirty == false OR isSaving == true
            React->>React: Skip Autosave Cycle
        else isDirty == true AND isSaving == false
            React->>React: setIsSaving(true)
            React->>Rust: invoke("save_main_markdown", { content: current_buffer })
            activate Rust
            
            Rust->>AppLocal: Write buffer to <UUID>/main.md.tmp
            Rust->>AppLocal: Rename <UUID>/main.md.tmp -> <UUID>/main.md (Atomic Overwrite)
            
            alt File Write Success
                AppLocal-->>Rust: File Written
                Rust-->>React: Return Ok(SaveResult)
                React->>React: Update lastSavedContent = current_buffer
                React->>React: setDirty(false)
                React->>React: setIsSaving(false)
                React->>User: Update Header UI Status ("Autosaved at HH:mm:ss")
            else File Write Error
                AppLocal-->>Rust: Write Failure Error
                Rust-->>React: Return Err(PackageError::IoError)
                deactivate Rust
                
                React->>React: setIsSaving(false)
                React->>React: Keep isDirty(true)
                React->>User: Display Warning Toast ("Autosave failed: Disk write error")
            end
        end
        deactivate React
    end

```

---

## 3. Data Contracts & State Specifications

### 3.1 Editor Local State (`usePackageStore` / Editor Context)

```typescript
export interface EditorState {
  rawContent: string;           // Active live buffer in editor
  lastSavedContent: string;     // Content buffer at last successful save/load
  isDirty: boolean;             // Computed as (rawContent !== lastSavedContent)
  isSaving: boolean;            // Lock flag preventing concurrent save calls
  lastAutosavedAt: number | null;// Unix timestamp of last successful save
  missingAssets: MissingAssetInfo[]; // Active list of referenced assets missing physical files
  assetResolutionMap: Record<string, string>; // Alias -> Resolved asset URL dictionary
}

```

### 3.2 Backend Command Interface (`save_main_markdown`)

```typescript
// Tauri IPC Invocation Payload
export interface SaveMainMarkdownArgs {
  uuid: string;         // Active workspace UUID
  content: string;      // UTF-8 plain text string of main.md
}

// Return Payload
export type SaveMainMarkdownResult = 
  | { status: "Ok"; savedAt: number }
  | { status: "Err"; error: "IoError" | "WorkspaceLocked" | "InvalidUuid" };

```

---

## 4. Error Handling & Concurrency Strategy

1. **OS Locked Environment Guarantee:**
* Because `main.md` and `assets.json` are secured under exclusive OS file handles acquired in `SEQ-MD-01`, external write collisions on workspace metadata are guaranteed not to occur during active sessions.


2. **Atomic File Overwrite (Safe Writing):**
* To prevent file corruption if the process crashes mid-save, Rust writes the text buffer to a temporary file (`main.md.tmp`) first and then performs an atomic rename (`rename()`) over `main.md`.


3. **Concurrent Save Interception (`isSaving` Lock):**
* If a user manually presses `Ctrl+S` at the exact millisecond the 10-second timer fires, the `isSaving` flag prevents duplicate simultaneous IPC calls to Rust.
