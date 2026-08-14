# EVL-MD-02: Text Editing, Dynamic Asset Path Resolution, Live Missing/Deleted Red-Highlighting, and Local Autosave Evaluation Specification

This document defines the comprehensive test matrix, acceptance criteria, and traceability mapping for validating custom `markdown-it` asset resolution (`resolvedPath`), live red-text warning rendering for missing/soft-deleted assets (`isDeleted`), code editor warning decorators, diff tracking (`isDirty`), explicit unbinding of manual save shortcuts (`Ctrl+S`), independent editor appearance/syntax colors, and 3-second periodic local-only autosaves inside the `App Local` sandbox.

The executable evaluation command is `npm run check:seq-md-02`. It runs pure resolver checks, a warmed five-reference median responsiveness check against the 16 ms interactive budget, a 100-reference stress guard capped at 100 ms, a Playwright browser fixture with multiple active/missing/soft-deleted assets, deterministic fake-IPC autosave success/failure checks, and the editor interaction checks. Rust storage checks run through `npm run check:tauri-build` and include an inline valid `.hasmmd` archive fixture with two manifest-backed assets.

---

## Preconditions and Verification

Preconditions describe the document and application state required for each assertion. A server HTTP response alone is insufficient; the evaluated page must also render the editor fixture.

| Precondition | Verification | Current automation status |
| --- | --- | --- |
| Node dependencies and Playwright Chromium are installed, and the evaluation Vite port is available. | CI installs dependencies/browser; the script launches Vite with `--strictPort` and polls the server URL. | Satisfied when Vite launches; a port conflict fails the command. |
| Resolver cases receive a manifest with deterministic active, missing, and soft-deleted entries. | The script constructs manifest fixtures before calling the resolver. | Satisfied. |
| Browser cases begin with a mounted editor, preview, and mock workspace payload. | The `?eval=md02` fixture registers Tauri IPC mocks before page navigation and waits for editor controls. | Satisfied by the browser fixture. |
| Autosave cases have a controllable dirty buffer and an explicit success or failure IPC response. | The fixture records `save_local_markdown_buffer` calls and returns deterministic results. | Satisfied by mocks; not a real filesystem-permission test. |
| The real App Local directory is writable for the 3-second autosave and atomic-write scenarios. | Run the desktop cases against a real Tauri workspace and inspect `<AppLocalDataDir>/<UUID>/main.md`. | Not established by the mocked browser harness. |

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Precondition | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-02-E2E-001`** | `REQ-MD-02-003` `REQ-MD-02-004` | Positive (Red-Text Highlighting) | Mounted workspace contains a missing or soft-deleted asset reference. | Editor Load with Missing or Soft-Deleted Asset Tags | 1. Open workspace with `missingAssets = [{ alias: "diag.png" }]` or `isDeleted: true`. 2. Render `/editor`. | 1. Preview pane displays `<span class="missing-asset-warning">` in red text. 2. Code editor applies red background decorator to corresponding line. |
| **`TC-MD-02-E2E-002`** | `REQ-MD-02-005` | Positive (Live Typing Red-Text Update) | Mounted editor has an editable text buffer. | Type Missing Asset Tag in Live Editor | 1. Type `![missing](asset:unregistered)` into editor. | 1. Preview updates within 16ms, rendering red text span. 2. Code editor line receives red warning decorator dynamically. |
| **`TC-MD-02-E2E-003`** | `REQ-MD-02-012` | Positive (Shortcut Interception) | Mounted editor has a writable text buffer. | Attempt Manual Save via Keyboard Shortcut (Ctrl+S / Cmd+S) | 1. Modify text buffer in editor. 2. Press `Ctrl+S` (or `Cmd+S` on macOS). 3. Inspect IPC calls and disk I/O. | 1. Shortcut is intercepted and ignored. 2. Heavy archive packaging IPC is **NOT** invoked. 3. No system freeze or I/O spike occurs. |
| **`TC-MD-02-E2E-004`** | `REQ-MD-02-020` `REQ-MD-02-024` | Positive (Local Autosave Loop) | Mounted workspace has a writable App Local `main.md`. | Modify Text Buffer and Wait 3 Seconds | 1. Type text into editor (`isDirty = true`). 2. Wait 3 seconds. | 1. Fast local autosave triggers automatically. 2. `<UUID>/main.md` in `App Local` is updated. 3. Header status updates to "Autosaved locally at HH:mm:ss". |
| **`TC-MD-02-E2E-005`** | `REQ-MD-02-025` | Negative (Local Autosave Fail) | Mounted workspace has a read-only App Local `main.md`. | Local Autosave Failure Due to Write Error | 1. Set `<UUID>/main.md` permissions to read-only in `App Local`. 2. Modify text in editor. 3. Wait 3 seconds. | 1. Local autosave fails gracefully. 2. `isDirty` remains `true`. 3. Warning Toast appears ("Local autosave failed: Disk write error"). |

---

## 2. React Level Tests (Frontend Component & UI Store State)

| Test ID | Trace Requirement ID | Test Type | Precondition | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-02-REACT-001`** | `REQ-MD-02-001` `REQ-MD-02-002` | Positive (Streaming Protocol) | Mode A manifest contains an active `diagram` asset. | `MarkdownEditor.tsx` | 1. Render `![alt](asset:diagram)` in Mode A (ZIP Archive). | 1. `src` attribute is rewritten to `asset-stream://<UUID>/<asset_uuid>`. |
| **`TC-MD-02-REACT-002`** | `REQ-MD-02-002` | Positive (Local Protocol) | Local manifest contains an active asset with an absolute `resolvedPath`. | `MarkdownEditor.tsx` | 1. Render `![alt](asset:diagram)` with local absolute `resolvedPath`. | 1. `src` attribute is rewritten to `asset://<resolved_absolute_path>`. |
| **`TC-MD-02-REACT-003`** | `REQ-MD-02-003` | Positive (Soft-Deleted Asset) | Manifest contains `deleted` with `isDeleted: true`. | `MarkdownEditor.tsx` | 1. Render `![alt](asset:deleted)` where asset has `isDeleted: true`. | 1. Output HTML contains `<span class="missing-asset-warning">![alt](asset:deleted) - Missing File</span>`. |
| **`TC-MD-02-REACT-004`** | `REQ-MD-02-011` | Positive (Dirty Computation) | Store has matching `rawContent` and `lastSavedContent`. | `usePackageStore` | 1. Modify `rawContent`. 2. Revert `rawContent` to match `lastSavedContent`. | 1. `isDirty` becomes `true` on edit. 2. `isDirty` reverts to `false` when text matches saved state. |
| **`TC-MD-02-REACT-005`** | `REQ-MD-02-021` | Positive (Skip Autosave) | Autosave loop has a clean mounted workspace. | `AutosaveLoop.tsx` | 1. Trigger 3s timer with `isDirty = false`. | 1. IPC `save_local_markdown_buffer` command is NOT invoked. |

---

## 3. Rust Level Tests (Backend Engine & Fast Local Disk I/O)

The browser smoke check (`npm run check:react-render`) covers the editor and preview mount without a Tauri runtime. The backend check (`npm run check:tauri-build`) covers the Rust workspace tests, including metadata-only archive mounting, folder path resolution, and local markdown persistence.

| Test ID | Trace Requirement ID | Test Type | Precondition | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- | --- |
| **`TC-MD-01-RUST-001`** | `REQ-MD-02-023` | Positive (Fast Local Write) | App Local workspace directory exists and is writable. | `commands::save_local_markdown_buffer` | 1. Invoke `save_local_markdown_buffer` with UTF-8 text payload. | 1. Atomic write executed to `<AppLocalDataDir>/<UUID>/main.md`. 2. Operation completes within 5ms without touching ZIP archives. |
| **`TC-MD-02-RUST-002`** | `REQ-MD-02-023` | Positive (Atomic Local Rename) | App Local workspace directory contains `main.md`. | `HasmMarkdownPackage::save_local` | 1. Invoke local autosave action. 2. Trace file system operations. | 1. Writes buffer to `<UUID>/main.md.tmp`. 2. Executes atomic rename over `<UUID>/main.md`. |
| **`TC-MD-02-RUST-003`** | `REQ-MD-02-025` | Negative (Disk Full / Error) | App Local workspace contains an existing `main.md`. | `commands::save_local_markdown_buffer` | 1. Simulate I/O error during local file write. | 1. Returns `Err(PackageError::IoError)`. 2. Existing `main.md` in `App Local` remains uncorrupted. |