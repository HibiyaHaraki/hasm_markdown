# EVL-MD-02: Text Editing, Asset Path Resolution, Missing Asset Red-Highlighting, and Autosave Evaluation Specification

This document defines the comprehensive test matrix, acceptance criteria, and traceability mapping for validating custom `markdown-it` asset resolution, real-time text monitoring for missing asset red-text rendering, code editor line warning decorators, diff tracking (`isDirty`), manual saves (`Ctrl+S`), atomic periodic autosaves (10s loop), and save lock isolation.

---

## 1. Desktop App Level Tests (E2E / System Integration)

| Test ID | Trace Requirement ID | Test Type | Test Scenario | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-02-E2E-001`** | `REQ-MD-02-003` `REQ-MD-02-004` | Positive (Red-Text Highlighting) | Editor Load with Missing Physical Asset Tags | 1. Open workspace with `missingAssets = [{ alias: "diag.png" }]`. 2. Render `/editor`. | 1. Preview pane displays `<span class="missing-asset-warning">` in red text. 2. Code editor applies red background decorator to corresponding line. |
| **`TC-MD-02-E2E-002`** | `REQ-MD-02-005` | Positive (Live Typing Red-Text Update) | Type Missing Asset Tag in Live Editor | 1. Type `![missing](asset:unregistered)` into editor. | 1. Preview updates within 16ms, rendering red text span. 2. Code editor line receives red warning decorator dynamically. |
| **`TC-MD-02-E2E-003`** | `REQ-MD-02-011` `REQ-MD-02-012` | Positive (Manual Save) | Modify Buffer and Perform Manual Save (Ctrl+S) | 1. Type text into editor. 2. Verify window title shows `*`. 3. Press `Ctrl+S`. | 1. Header `*` disappears. 2. "Saved" Toast appears. 3. `main.md` on disk is updated. |
| **`TC-MD-02-E2E-004`** | `REQ-MD-02-020` `REQ-MD-02-024` | Positive (Autosave Loop) | Modify Buffer and Wait 10 Seconds | 1. Type text into editor (`isDirty = true`). 2. Do not press Ctrl+S. 3. Wait 10 seconds. | 1. Autosave triggers automatically. 2. `main.md` on disk is updated. 3. Header status updates to "Autosaved at HH:mm:ss". |
| **`TC-MD-02-E2E-005`** | `REQ-MD-02-025` | Negative (Autosave Fail) | Autosave Failure Due to Write Error | 1. Set `main.md` permissions to read-only on disk. 2. Modify text in editor. 3. Wait 10 seconds. | 1. Autosave fails. 2. `isDirty` remains `true`. 3. Warning Toast appears ("Autosave failed: Disk write error"). |

---

## 2. React Level Tests (Frontend Component & UI Store State)

| Test ID | Trace Requirement ID | Test Type | Component / Target | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-02-REACT-001`** | `REQ-MD-02-001` `REQ-MD-02-002` | Positive (Asset Protocol) | `MarkdownEditor.tsx` | 1. Pass valid asset mapping to `markdown-it` plugin. 2. Render `![alt](asset:diagram)`. | 1. `src` attribute is rewritten to `asset://<UUID>/assets/<uuid_filename>`. |
| **`TC-MD-02-REACT-002`** | `REQ-MD-02-003` | Positive (Red Span HTML) | `MarkdownEditor.tsx` | 1. Render `![alt](asset:missing)` where `missing` is in `missingAssets`. | 1. Output HTML contains `<span class="missing-asset-warning">![alt](asset:missing) - Missing File</span>`. |
| **`TC-MD-02-REACT-003`** | `REQ-MD-02-004` | Positive (Code Decorator) | `CodeEditor.tsx` | 1. Supply text containing missing asset tag. | 1. Monitored lines receive red warning decoration CSS class. |
| **`TC-MD-02-REACT-004`** | `REQ-MD-02-011` | Positive (Dirty Computation) | `usePackageStore` | 1. Change `rawContent`. 2. Revert `rawContent` to match `lastSavedContent`. | 1. `isDirty` becomes `true` on edit. 2. `isDirty` reverts to `false` when text matches saved state. |
| **`TC-MD-02-REACT-005`** | `REQ-MD-02-021` | Positive (Skip Autosave) | `AutosaveLoop.tsx` | 1. Trigger 10s timer with `isDirty = false`. | 1. IPC `save_main_markdown` command is NOT invoked. |
| **`TC-MD-02-REACT-006`** | `REQ-MD-02-101` | Negative (Save Lock Guard) | `usePackageStore` | 1. Set `isSaving = true`. 2. Press `Ctrl+S` or trigger 10s timer. | 1. Secondary save action is blocked immediately. |

---

## 3. Rust Level Tests (Backend Engine, I/O & Lock Execution)

| Test ID | Trace Requirement ID | Test Type | Rust Module / Function | Test Steps | Expected Result |
| --- | --- | --- | --- | --- | --- |
| **`TC-MD-02-RUST-001`** | `REQ-MD-02-012` | Positive (Save Command) | `commands::save_main_markdown` | 1. Invoke `save_main_markdown` with valid content payload. | 1. File content is written to disk. 2. Returns `Ok(SaveResult { saved_at })`. |
| **`TC-MD-02-RUST-002`** | `REQ-MD-02-023` | Positive (Atomic Overwrite) | `HasmMarkdownPackage::save` | 1. Invoke save action. 2. Trace file system operations. | 1. Writes buffer to `<UUID>/main.md.tmp`. 2. Executes atomic rename over `<UUID>/main.md`. |
| **`TC-MD-02-RUST-003`** | `REQ-MD-02-025` | Negative (Disk Full / Permission) | `commands::save_main_markdown` | 1. Simulate I/O error during file write. | 1. Returns `Err(PackageError::IoError)`. 2. Original `main.md` remains uncorrupted. |