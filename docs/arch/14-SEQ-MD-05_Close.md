# Workspace Close, Process Lock Release, and App Local Cleanup Lifecycle

## 1. Sequence Overview

This sequence handles the operational lifecycle for closing an active workspace—whether triggered by navigating back to the selection screen (`/select`), closing the specific workspace window, or quitting the application. It guarantees data protection, universal OS file handle safety across all storage targets (`Mode A` Archive and `Mode B` Folder), process lock unbinding, and local disk hygiene:

1. **Unsaved Changes Interception (`isDirty` Check):** Prompting a dirty-state confirmation modal if unsaved changes exist, allowing the user to Save (delegating to `SEQ-MD-04`), Discard Changes, or Cancel Close.
2. **Universal OS File Handle Release (Target-Specific):** Explicitly closing OS file handles applied directly to the master storage target:
* **Mode A (ZIP Target `.hasmmd`):** Releasing exclusive write lock and read/share handles held directly on the `.hasmmd` archive file.
* **Mode B (Folder Target):** Releasing exclusive write file handles held on `main.md` and `assets.json` within the target external directory.


3. **Single-Workspace Process Lock Release (PID Unlock Update):** Retaining the physical `.lock` file within `App Local` to prevent race conditions while atomically updating its internal status payload from an active PID to an unassigned/unlocked state (`PID: 0` / `status: "Unlocked"`).
4. **App Local Sandbox Garbage Collection:** Selectively cleaning up temporary workspace buffers and cache files in `<AppLocalDataDir>/<UUID>/` without corrupting retained workspace state.
5. **State Reset & Route Transition:** Resetting `usePackageStore` to its null state and routing to `/select` or terminating the application window cleanly.

Closing cleans App Local temporary state and releases handles; it does not remove images already materialized in the saved folder or archive target.

---

## 2. Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Toolbar as Window / App Header UI
    participant ConfirmModal as Unsaved Changes Confirmation Modal UI
    participant React as React Frontend Core (usePackageStore)
    participant Rust as Backend (Tauri / Rust Core)
    participant AppLocal as App Local Storage (<AppLocalDataDir>/<UUID>/)
    participant ExtStorage as Master Target Storage (.hasmmd Archive / External Folder)

    %% Phase 1: Close Invocation & Unsaved Changes Guard
    User->>Toolbar: Click "Close Workspace" (or Window Close / App Quit)
    activate Toolbar
    Toolbar->>React: Trigger Workspace Close Request
    deactivate Toolbar
    activate React

    alt Workspace is Dirty (isDirty == true)
        React->>ConfirmModal: Open Unsaved Changes Modal ("You have unsaved changes. Save before closing?")
        
        alt User Clicks "Save"
            User->>ConfirmModal: Select "Save"
            activate ConfirmModal
            ConfirmModal->>React: Execute Save Action
            deactivate ConfirmModal
            
            React->>Rust: Delegate to SEQ-MD-04 (execute_package_save_or_export)
            activate Rust
            Rust-->>React: Return Ok(SaveExecutionPayload)
            deactivate Rust
            Note over React: Proceed to Close Phase after successful save
        else User Clicks "Cancel"
            User->>ConfirmModal: Select "Cancel"
            activate ConfirmModal
            ConfirmModal->>React: Abort Close Operation
            deactivate ConfirmModal
            
            React->>User: Dismiss modal, remain in /editor
        else User Clicks "Discard Changes"
            User->>ConfirmModal: Select "Discard Changes"
            activate ConfirmModal
            ConfirmModal->>React: Confirm Discard & Proceed to Close
            deactivate ConfirmModal
        end
    end

    %% Phase 2: Master Target OS File Handle Release
    Note over React,Rust: Initiating Safe Unmount Lifecycle (Master Lock Release)
    React->>Rust: invoke("close_and_cleanup_workspace", { uuid })
    activate Rust

    alt Storage Target is ZIP Archive (Mode A)
        Rust->>ExtStorage: Close Exclusive Write Lock & Read/Share Handles on target .hasmmd Archive File
    else Storage Target is External Folder Workspace (Mode B)
        Rust->>ExtStorage: Close Exclusive Write Handles on main.md and assets.json in Target External Directory
    end

    %% Phase 3: Single-Instance Process Lock Status Update (PID Unbind)
    Rust->>AppLocal: Read <UUID>/.lock File Handle
    Rust->>AppLocal: Atomic Write Payload to <UUID>/.lock ({ pid: 0, status: "Unlocked", releasedAt: timestamp })
    Note over Rust,AppLocal: Physical .lock file in App Local is preserved to maintain workspace session safely
    AppLocal-->>Rust: Lock Status Updated Successfully

    %% Phase 4: App Local Sandbox Garbage Collection (Temp Buffer Cleanup)
    Rust->>AppLocal: Clean up temporary cache/buffer files in <AppLocalDataDir>/<UUID>/
    alt Cleanup Successful
        AppLocal-->>Rust: Temp Cache Cleaned
    else Cleanup Warning
        AppLocal-->>Rust: Log Non-Fatal Warning
    end

    Rust->>Rust: Clear HasmMarkdownPackage instance from Mutex<Option<HasmMarkdownPackage>>
    Rust-->>React: Return Ok(WorkspaceClosePayload)
    deactivate Rust

    %% Phase 5: Frontend State Reset & Navigation
    React->>React: resetPackageStore() [Purge manifest, rawContent, missingAssets, warnings]
    
    alt Invoked via Navigation / Close Button
        React->>User: Route to Workspace Selection Page (/select)
    else Invoked via Window Close / App Quit
        React->>Rust: invoke("exit_application_window")
        activate Rust
        Rust->>User: Destroy Window / Exit Process Cleanly
        deactivate Rust
    end
    deactivate React

```

---

## 3. Data Contracts & State Specifications

### 3.1 Lock File Payload Format (`<AppLocalDataDir>/<UUID>/.lock`)

```json
{
  "pid": 0,
  "status": "Unlocked",
  "workspaceUuid": "3f8b9a20-1c2d-4e5f-a678-9b0c1d2e3f4a",
  "lastReleasedAt": 1786533440000
}

```

### 3.2 IPC Invocation & Payload Specification (`close_and_cleanup_workspace`)

```typescript
export interface CloseWorkspaceArgs {
  uuid: string;             // Active workspace UUID to unmount
  forceDiscard?: boolean;   // True if explicit "Discard Changes" was confirmed
}

export interface WorkspaceClosePayload {
  uuid: string;             // Closed workspace UUID
  lockReleased: boolean;    // True if .lock payload was set to PID: 0 / Unlocked
  masterHandlesClosed: boolean; // True if master archive / target folder locks were released
  closedAt: number;         // Epoch timestamp of completed close action
}

```

---

## 4. Operational Guard & Lock Release Rules

1. **Target-Specific Lock Release:**
* **Mode A (ZIP):** Reverses the lock acquired during launch by releasing all file handles (read-stream and write-lock) bound to the `.hasmmd` archive file on disk.
* **Mode B (Folder):** Reverses the locks acquired on `main.md` and `assets.json` within the external workspace directory.


2. **App Local Lock Retention and Atomic Status Transition:**
The `.lock` file residing inside `<AppLocalDataDir>/<UUID>/` is updated atomically to `pid: 0` and `status: "Unlocked"`. It is kept on disk as a session reference.
3. **Safe Multi-Instance Re-mounting:**
Any new application window attempting to open the workspace in `SEQ-MD-01` verifies that the target archive / folder is free of active OS handles and that `.lock` exhibits an `Unlocked` status before binding new locks.