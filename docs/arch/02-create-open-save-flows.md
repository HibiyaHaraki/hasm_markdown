# Create Open Save Flows

This document explains the core runtime flows for create, open, autosave, and save as.

Storage layers used in these flows:

- Temporal layer: `appLocalDataDir` workspace used for extraction and editing.
- Archive layer: user file locations for `.hasmmd` (default dialog location uses `documentDir`).

## Create new package on startup

```mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant RC as Rust Command
    participant MD as HASMMarkdown
    participant FS as Temporal FS (appLocalDataDir)

    FE->>RC: create_new_hasmmd(basePath)
    RC->>MD: create_new_hasmmd(basePath)
    MD->>FS: create UUID folder
    MD->>FS: create main.md + assets/
    MD-->>RC: new package state
    RC-->>FE: package state
    FE->>FE: set initial markdown
```

## Open existing archive

```mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant RC as Rust Command
    participant MD as HASMMarkdown
    participant FS as Temporal FS (appLocalDataDir)
    participant AR as Archive FS (.hasmmd location)

    FE->>RC: open_hasmmd(basePath, hasmmdPath)
    RC->>MD: open_hasmmd(...)
    MD->>AR: read .hasmmd archive
    MD->>FS: create UUID local folder
    MD->>FS: unzip .hasmmd
    MD->>FS: read main.md
    FS-->>MD: markdown text
    MD-->>RC: package + markdown
    RC-->>FE: package + markdown
```

## Autosave loop

```mermaid
flowchart TD
    A[User edits markdown] --> B[10s timer]
    B --> C{Changed since last save?}
    C -- No --> A
    C -- Yes --> D[invoke save_local_package]
    D --> E[Write main.md in local package]
    E --> A
```

## Save As portable archive

```mermaid
sequenceDiagram
    autonumber
    participant FE as Frontend
    participant RC as Rust Command
    participant MD as HASMMarkdown
    participant FS as Temporal FS (appLocalDataDir)
    participant AR as Archive FS (.hasmmd location)

    FE->>RC: save_local_package(markdown)
    RC->>MD: save_local_package(markdown)
    MD->>FS: write main.md

    FE->>RC: save_hasmmd(targetPath)
    RC->>MD: save_hasmmd(targetPath)
    MD->>FS: walk package directory
    MD->>AR: zip files and folders to .hasmmd
    MD-->>RC: update hasmmd_local_path
    RC-->>FE: updated package state
```