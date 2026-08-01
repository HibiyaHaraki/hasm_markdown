# HASMMD Format and ZIP Behavior

This document describes the package format and compression behavior.

## Package layout before compression

```text
<app-local-data>/<uuid>/
  main.md
  assets/
```

- `main.md` is the primary markdown document.
- `assets/` stores media and supporting files.

## Archive format

- File extension: `.hasmmd`
- Internal format: ZIP (Deflated compression)
- Implemented in Rust with `zip` crate.

## Save pipeline

1. Ensure local package folder exists.
2. Persist latest markdown into `main.md`.
3. Walk every file and folder under local package.
4. Add entries to ZIP writer.
5. Finalize archive and update package state.

## Open pipeline

1. Create a fresh UUID workspace folder under app local data.
2. Extract `.hasmmd` content into workspace.
3. Read `main.md` and return content to frontend.

## Notes

- Temporal layer and archive layer are separated by design.
- Temporal layer uses `appLocalDataDir` for extracted/editable package contents.
- Archive layer stores `.hasmmd` files in user-facing paths (default dialog start path uses `documentDir`).
- Exporting to `.hasmmd` is explicit through Save As.
- Autosave writes only to local package, not to `.hasmmd` directly.
