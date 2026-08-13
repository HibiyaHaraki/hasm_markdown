# EVL-MD-07: Normal Multi-Feature Workspace Workflow

This evaluation covers the normal user journey across workspace creation, Markdown editing, asset registration, soft deletion, missing-asset diagnostics, archive export/reopen, and folder export. It intentionally complements the focused MD-01 through MD-04 evaluations instead of replacing them.

The executable command is `npm run check:normal-workflow`. Each step prints an individual PASS/FAIL result using the repository evaluation format.

## Workflow

| Test ID | Covered Sequence | Scenario | Expected Result |
| --- | --- | --- | --- |
| `TC-MD-07-001` | MD-01 | Create a new HASM Markdown workspace | Empty Markdown and an empty manifest are available for editing. |
| `TC-MD-07-002` | MD-02 | Edit Markdown | The live buffer changes and the dirty state becomes true. |
| `TC-MD-07-003` | MD-03 | Add several assets | Multiple aliases are registered with resolved paths and remain visible as active assets. |
| `TC-MD-07-004` | MD-03 | Include assets in Markdown | Markdown contains valid `asset:<alias>` image tags and the preview resolves them. |
| `TC-MD-07-005` | MD-03 | Delete an asset referenced by Markdown | The in-use warning identifies the reference line and soft deletion preserves the metadata. |
| `TC-MD-07-006` | MD-03 | Check the error list | The deleted reference appears in the missing-assets diagnostics and preview warning. |
| `TC-MD-07-007` | MD-02 | Delete a non-existing asset reference | The missing alias is highlighted in the preview and editor warning gutter. |
| `TC-MD-07-008` | MD-04 | Save as `.hasmmd` | Deleted metadata is purged, active assets are normalized, and the archive target is committed. |
| `TC-MD-07-009` | MD-01/MD-02 | Reopen the saved archive | Markdown and active asset paths are restored using the archive streaming protocol. |
| `TC-MD-07-010` | MD-03/MD-04 | Edit, add/delete assets, and export as folder | The folder target contains normalized metadata, active additions, and no soft-deleted records. |
| `TC-MD-07-011` | MD-05 | Close and reopen the application | Requires the MD-05 close implementation; this remains a separate acceptance gate. |

## Scope Note

`TC-MD-07-011` is documented now so the complete normal journey is visible, but the executable workflow reports it as pending until `SEQ-MD-05` implements close interception, lock release, App Local cleanup, and application relaunch. The focused `check-seq-md-01` through `check-seq-md-04` commands remain the executable gates for the implemented portions.
