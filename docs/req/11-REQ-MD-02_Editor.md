# REQ-MD-02: Text Editing, Dynamic Asset Resolution, Live Missing/Deleted Red-Highlighting, and Local Autosave Requirements

## 1. Functional Requirements

### 1.1 Custom Markdown Asset Resolution & Live Red-Text Highlighting

* **`REQ-MD-02-001` (Custom Asset Plugin Initialization):** Upon `/editor` page mount, the React frontend shall initialize `markdown-it` with a custom asset resolver plugin using the active manifest asset map (populated with runtime absolute `resolvedPath` entries) and the `missingAssets` array.
* **`REQ-MD-02-002` (Streaming & Local Asset Protocol Rewriting):**
* When an image tag references a valid active asset in ZIP Archive Mode (`Mode A`), `markdown-it` shall rewrite the `src` attribute to the virtual streaming protocol (`asset-stream://<UUID>/<asset_uuid>`).
* When an image tag references a valid active asset in Folder/Local Mode (`Mode B/C`) or a locally added file, `markdown-it` shall rewrite the `src` attribute to the local protocol format (`asset://<resolved_absolute_path>`).


* **`REQ-MD-02-003` (Missing / Soft-Deleted Asset Red-Text Rendering):** When an image tag references an alias missing from `assets.json`, listed in `missingAssets`, or marked as `isDeleted: true`, `markdown-it` shall render the element wrapped in a warning CSS class (`<span class="missing-asset-warning">`) displaying the missing tag text in red/warning styling.
* **`REQ-MD-02-004` (Code Editor Line Warning Decorators):** The code editor component (Monaco/CodeMirror) shall scan line contents and apply visual red warning background/text decorators to lines containing missing or soft-deleted asset tags.
* **`REQ-MD-02-005` (Real-time Text Change Monitoring):** As the user modifies the raw text buffer, the system shall re-evaluate image tags in real-time and update both the preview HTML red-text spans and the editor line decorators on the fly within 16ms.

---

### 1.2 Text Editing, Diff Tracking, and Shortcut Unbinding

* **`REQ-MD-02-010` (Live Buffer Update):** The React editor component shall capture user keystrokes and immediately update the local `rawContent` state buffer in memory.
* **`REQ-MD-02-011` (Dirty Flag Computation):** The React frontend shall continuously compute `isDirty = (rawContent !== lastSavedContent)` and update the window header UI with an unsaved indicator (`*`) when `isDirty === true`.
* **`REQ-MD-02-012` (Manual Save Shortcut Elimination):** The editor component shall explicitly intercept and unbind `Ctrl+S` / `Cmd+S` keydown events, disabling all keyboard shortcut manual save triggers to prevent accidental execution of heavy archive packaging I/O.

---

### 1.3 10-Second Periodic Fast Local Autosave Loop

* **`REQ-MD-02-020` (Periodic Local Timer Execution):** The React frontend shall execute a local autosave check every 10 seconds.
* **`REQ-MD-02-021` (Local Autosave Skip Conditions):** The local autosave check shall immediately skip execution if `isDirty === false` or `isSaving === true`.
* **`REQ-MD-02-022` (Local Autosave Lock Acquisition):** Before issuing a local autosave IPC request, the React frontend shall set `isSaving = true` to prevent concurrent local I/O calls.
* **`REQ-MD-02-023` (Fast Local File Atomic Overwrite):** The Rust backend shall write the UTF-8 text buffer exclusively to `<AppLocalDataDir>/<UUID>/main.md.tmp` first and perform an atomic file rename to `<UUID>/main.md`. It shall **never** trigger ZIP re-compression, archive updates, or heavy asset copying during this loop.
* **`REQ-MD-02-024` (Local Autosave Success Commitment):** Upon successful local file write, the system shall update `lastSavedContent`, set `isDirty = false`, set `isSaving = false`, and update the header UI status with the last local saved timestamp ("Autosaved locally at HH:mm:ss").
* **`REQ-MD-02-025` (Local Autosave Failure Recovery):** If file write fails during local autosave, the system shall set `isSaving = false`, retain `isDirty = true`, and display a warning toast notification ("Local autosave failed: Disk write error").

---

## 2. Non-Functional Requirements

### 2.1 UI Responsiveness and Local I/O Bounding

* **`REQ-MD-02-100` (Non-blocking Preview Rendering):** Real-time `markdown-it` parsing and red-text decoration updates shall execute within 16ms to maintain 60 FPS editor responsiveness during active typing.
* **`REQ-MD-02-101` (Strict Local I/O Bounding):** The 10-second periodic autosave loop shall complete within 5ms by restricting I/O strictly to plain UTF-8 text writes inside the `App Local` sandbox directory.