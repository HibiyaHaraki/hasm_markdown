# REQ-MD-02: Text Editing, Asset Path Resolution, Missing Asset Red-Highlighting, and Autosave Requirements

## 1. Functional Requirements

### 1.1 Custom Markdown Asset Resolution & Live Red-Text Highlighting

* **`REQ-MD-02-001` (Custom Asset Plugin Initialization):** Upon `/editor` page mount, the React frontend shall initialize `markdown-it` with a custom asset resolver plugin using the active manifest asset map and `missingAssets` list.
* **`REQ-MD-02-002` (Valid Asset Protocol Rewriting):** When an image tag references a valid alias registered in `assets.json` with an existing physical file, `markdown-it` shall rewrite the `src` attribute to the local protocol format (`asset://<UUID>/assets/<uuid_filename>`).
* **`REQ-MD-02-003` (Missing Asset HTML Red-Text Rendering):** When an image tag references an alias missing from `assets.json` or present in the `missingAssets` list, `markdown-it` shall render the element wrapped in a warning CSS class (`<span class="missing-asset-warning">`) displaying the missing tag text in red/warning styling.
* **`REQ-MD-02-004` (Code Editor Line Warning Decorators):** The code editor component (Monaco/CodeMirror) shall scan line contents and apply visual red warning background/text decorators to lines containing missing asset tags.
* **`REQ-MD-02-005` (Real-time Text Change Monitoring):** As the user modifies the raw text buffer, the system shall re-evaluate image tags in real-time and update both the preview HTML red-text spans and the editor line decorators on the fly.

---

### 1.2 Text Editing, Diff Tracking, and Manual Save

* **`REQ-MD-02-010` (Live Buffer Update):** The React editor component shall capture user keystrokes and immediately update the local `rawContent` state buffer.
* **`REQ-MD-02-011` (Dirty Flag Computation):** The React frontend shall continuously compute `isDirty = (rawContent !== lastSavedContent)` and update the window header UI with an unsaved indicator (`*`) when `isDirty === true`.
* **`REQ-MD-02-012` (Manual Save Shortcut Trigger):** When the user presses `Ctrl+S`, the system shall invoke the `save_main_markdown` IPC command with the current `rawContent` buffer regardless of the autosave timer.
* **`REQ-MD-02-013` (Manual Save Commitment & UI State Reset):** Upon successful manual save, the system shall update `lastSavedContent = rawContent`, set `isDirty = false`, and display a "Saved" toast notification.

---

### 1.3 10-Second Periodic Autosave Loop

* **`REQ-MD-02-020` (Periodic Timer Execution):** The React frontend shall run an autosave check every 10 seconds.
* **`REQ-MD-02-021` (Autosave Skip Conditions):** The autosave check shall immediately skip execution if `isDirty === false` or `isSaving === true`.
* **`REQ-MD-02-022` (Autosave Lock Acquisition):** Before issuing an autosave IPC request, the React frontend shall set `isSaving = true` to prevent concurrent save calls.
* **`REQ-MD-02-023` (Atomic File Overwrite):** The Rust backend shall write the text buffer to `<UUID>/main.md.tmp` first and perform an atomic file rename to `<UUID>/main.md` to prevent corruption during unexpected process termination.
* **`REQ-MD-02-024` (Autosave Success State Commitment):** Upon successful file write, the system shall update `lastSavedContent`, set `isDirty = false`, set `isSaving = false`, and update the header UI status with the last saved timestamp.
* **`REQ-MD-02-025` (Autosave Failure Recovery):** If file write fails during autosave, the system shall set `isSaving = false`, retain `isDirty = true`, and display a warning toast notification ("Autosave failed: Disk write error").

---

## 2. Non-Functional Requirements

### 2.1 UI Responsiveness and Concurrency

* **`REQ-MD-02-100` (Non-blocking Preview Rendering):** Real-time `markdown-it` parsing and red-text decoration updates shall execute within 16ms to maintain 60 FPS editor responsiveness during typing.
* **`REQ-MD-02-101` (Save Race Condition Guard):** The `isSaving` flag shall strictly isolate manual save (`Ctrl+S`) triggers and periodic autosave cycles to prevent duplicate concurrent I/O operations on `main.md`.