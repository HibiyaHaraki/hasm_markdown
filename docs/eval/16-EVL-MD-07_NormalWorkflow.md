# EVL-MD-07: Normal Multi-Feature Workspace Workflow

This evaluation covers the normal user journey across workspace creation, Markdown editing, asset registration, soft deletion, missing-asset diagnostics, archive export/reopen, and folder export. It intentionally complements the focused MD-01 through MD-04 evaluations instead of replacing them.

The executable command is `npm run check:normal-workflow`. This workflow intentionally uses the standalone repository evaluation format rather than the Playwright Test reporter. Each step prints an individual PASS/FAIL result and generates `.eval-reports/normal-workflow-report.html` with Test Step, Expected Behavior, Actual Behavior, Test Step Result, and App Local/archive/folder storage snapshots.

## Preconditions and Verification

This workflow is a deterministic storage-and-state simulation. Each phase must establish the output state required by the next phase; it is not a substitute for a native GUI acceptance run.

| Precondition | Verification | Current automation status |
| --- | --- | --- |
| Node dependencies and the Rust toolchain are available. | CI runs `npm ci`; the workflow command invokes its required repository tooling. | Satisfied by CI setup. |
| The workflow starts from an isolated empty workspace with an empty manifest. | `check-normal-workflow.mjs` creates deterministic temporary workspace, archive, and folder fixtures. | Satisfied by the harness. |
| Added assets have unique aliases and deterministic source bytes before Markdown insertion. | The script generates fixture asset metadata/content and verifies active manifest entries. | Satisfied by the harness. |
| Deletion checks begin with an existing Markdown reference and a registered active asset. | The workflow inserts the reference before marking the manifest entry as deleted. | Satisfied by the simulated workflow. |
| Save/export/reopen phases have writable temporary archive and folder targets, plus normalized manifest expectations. | The script uses isolated temporary targets and checks snapshots after each phase. | Satisfied by the harness. |
| Repeated close/reopen cycles begin only after the prior cycle has released its simulated lock and retained the saved target. | Each cycle verifies the saved snapshot before constructing the next remount state. | Satisfied by the simulation; native file-handle release is covered separately by MD-05. |
| Real native dialogs, Tauri IPC, renderer behavior, and OS-level handle release are available for end-to-end GUI acceptance. | Execute the normal workflow manually in the packaged desktop application. | Not established by this simulation. |

## Workflow

| Test ID | Covered Sequence | Precondition | Scenario | Expected Result |
| --- | --- | --- | --- | --- |
| `TC-MD-07-001` | MD-01 | An isolated temporary workspace path is empty and writable. | Create a new HASM Markdown workspace | Empty Markdown and an empty manifest are available for editing. |
| `TC-MD-07-002` | MD-02 | A workspace is mounted with `rawContent` equal to `lastSavedContent`. | Edit Markdown | The live buffer changes and the dirty state becomes true. |
| `TC-MD-07-003` | MD-03 | Three source assets have unique aliases and deterministic source bytes. | Add several assets | Multiple aliases are registered with resolved paths and remain visible as active assets. |
| `TC-MD-07-004` | MD-03 | The active manifest contains each alias referenced by the Markdown fixture. | Include assets in Markdown | Markdown contains valid `asset:<alias>` image tags and the preview resolves them. |
| `TC-MD-07-005` | MD-03 | An active asset is referenced by Markdown on a known line. | Delete an asset referenced by Markdown | The in-use warning identifies the reference line and soft deletion preserves the metadata. |
| `TC-MD-07-006` | MD-03 | A Markdown reference targets an asset already marked `isDeleted: true`. | Check the error list | The deleted reference appears in the missing-assets diagnostics and preview warning. |
| `TC-MD-07-007` | MD-02 | Markdown contains an `asset:` alias absent from the active manifest. | Delete a non-existing asset reference | The missing alias is highlighted in the preview and editor warning gutter. |
| `TC-MD-07-008` | MD-04 | The workspace has active and soft-deleted manifest entries and a writable archive target. | Save as `.hasmmd` | Deleted metadata is purged, active assets are normalized, and the archive target is committed. |
| `TC-MD-07-009` | MD-01/MD-02 | A valid archive was created by `TC-MD-07-008`. | Reopen the saved archive | Markdown and active asset paths are restored using the archive streaming protocol. |
| `TC-MD-07-010` | MD-03/MD-04 | The reopened workspace has a writable folder export target and active asset additions. | Edit, add/delete assets, and export as folder | The folder target contains normalized metadata, active additions, and no soft-deleted records. |
| `TC-MD-07-011` | MD-02/MD-03/MD-05 | A saved workspace is unlocked and can be remounted for cycle 1. | Close, reopen, edit, add, and delete cycle 1 | Reopen the package, edit Markdown, add an asset, include it in Markdown, delete an asset, verify diagnostics, then close. |
| `TC-MD-07-012` | MD-02/MD-03/MD-05 | Cycle 1 closed its workspace and retained a valid saved target. | Close, reopen, edit, add, and delete cycle 2 | Repeat the full edit/add/include/delete/diagnostic/close flow after the second remount. |
| `TC-MD-07-013` | MD-02/MD-03/MD-05 | Cycle 2 closed its workspace and retained a valid saved target. | Close, reopen, edit, add, and delete cycle 3 | Repeat the full edit/add/include/delete/diagnostic/close flow after the third remount. |

## Scope Note

Each of `TC-MD-07-011` through `TC-MD-07-013` performs this detailed sequence:

1. Close the current workspace and release its lock.
2. Open the saved package again.
3. Edit Markdown and verify the buffer is editable.
4. Add a new asset with an external resolved path.
5. Insert the new asset alias into Markdown.
6. Delete an existing asset and mark it `isDeleted` with `deletedAt`.
7. Verify the deleted asset appears in the missing-asset diagnostics.
8. Close the workspace and continue to the next cycle.

The focused `check-seq-md-05` command covers the browser Save/Discard/Cancel choices and Rust lock/cleanup behavior.
