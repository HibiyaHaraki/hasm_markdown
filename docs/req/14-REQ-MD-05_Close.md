# REQ-MD-05: Workspace Close, OS Target Handle Release, Process Lock Unbinding, and App Local Cleanup Requirements

## 1. Functional Requirements

### 1.1 Unsaved Changes Guard (`isDirty` Interception)

* **`REQ-MD-05-001` (Dirty State Close Interception):** When the user triggers a workspace close action (via menu navigation, window close, or app exit) while `isDirty === true`, the React frontend shall intercept the event and display an Unsaved Changes Modal.
* **`REQ-MD-05-002` (Save Branch Execution):** Selecting "Save" in the Unsaved Changes Modal shall delegate directly to `SEQ/REQ-MD-04` (execute package save/export) before proceeding with workspace unmounting.
* **`REQ-MD-05-003` (Cancel Branch Abort):** Selecting "Cancel" shall immediately abort the close operation, dismiss the modal, and retain the user in `/editor` with zero loss of state.
* **`REQ-MD-05-004` (Discard Branch Execution):** Selecting "Discard Changes" shall bypass save execution and immediately initiate the workspace unmount sequence, abandoning modified buffer state in `App Local`.

---

### 1.2 Target-Specific OS File Handle Release

* **`REQ-MD-05-010` (Mode A ZIP Archive Lock Release):** In ZIP Archive Mode (`Mode A`), the Rust backend shall close all exclusive write locks and read/share stream handles applied to the master `.hasmmd` archive file on disk.
* **`REQ-MD-05-011` (Mode B Folder Workspace Lock Release):** In Folder Workspace Mode (`Mode B`), the Rust backend shall close all exclusive write locks applied directly to `main.md` and `assets.json` within the target external directory.
* **`REQ-MD-05-012` (Master Lock Verification):** Closing master file handles shall completely restore OS-level file access permissions to external applications and processes upon completion.

---

### 1.3 Process Lock Retention and PID Unlock Transition

* **`REQ-MD-05-020` (Physical Lock File Retention):** The Rust backend shall **never** physically delete or unlink `<AppLocalDataDir>/<UUID>/.lock` during workspace closure, preserving the directory structure for safe session tracking.
* **`REQ-MD-05-021` (Atomic Lock Status Unlock Payload):** The Rust backend shall atomically update the JSON payload inside `<UUID>/.lock` to set `pid: 0`, `status: "Unlocked"`, and `lastReleasedAt: timestamp`.
* **`REQ-MD-05-022` (Active Instance Deregistration):** The backend shall remove the active `HasmMarkdownPackage` reference from thread-safe memory (`Mutex<Option<HasmMarkdownPackage>>`).

---

### 1.4 Sandbox Garbage Collection & State Reset

* **`REQ-MD-05-030` (App Local Temporary Buffer Cleanup):** The backend shall scan and delete temporary buffer files, uncommitted text edits, and intermediate render caches inside `<AppLocalDataDir>/<UUID>/`.
* **`REQ-MD-05-031` (Frontend Store Reset):** Upon receiving `WorkspaceClosePayload` from the IPC call, the React frontend shall reset `usePackageStore` to its null state (clearing `manifest`, `rawContent`, `missingAssets`, and `warnings`).
* **`REQ-MD-05-032` (Route Transition or Window Termination):**
* If invoked via UI navigation, the system shall route the user to `/select`.
* If invoked via window close or app exit, the system shall destroy the window or terminate the application process cleanly.
* **`REQ-MD-05-033` (Saved Asset Target Preservation):** Closing a workspace shall release its handles and clean only App Local temporary state; it shall not delete or invalidate images already materialized in the saved folder or archive target.



---

## 2. Non-Functional Requirements

### 2.1 File System Safety and Lock Integrity

* **`REQ-MD-05-100` (Guaranteed Handle Release Order):** OS master file handles shall be explicitly released **prior** to updating `.lock` status, eliminating race conditions where secondary windows detect an `Unlocked` state while file handles remain actively locked.
* **`REQ-MD-05-101` (Safe Session Re-Mounting SLA):** The complete unmount and unlock sequence shall execute within 20ms, allowing immediate subsequent re-opening of the workspace in a new process or window.