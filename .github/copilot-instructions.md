# HASM Markdown Copilot Guidance

## Documentation Is the Source of Truth

- Start by reviewing [`docs/`](docs/), especially:
  - [`docs/arch/01-system-overview.md`](docs/arch/01-system-overview.md) for the application overview.
  - [`docs/arch/02-directory-structure.md`](docs/arch/02-directory-structure.md) for module ownership and APIs.
  - [`docs/arch/00-hasm_markdown-structure.md`](docs/arch/00-hasm_markdown-structure.md) for the HASM Markdown data model and storage format.
  - [`docs/arch/`](docs/arch/) for detailed sequence diagrams and explanations.
  - [`docs/eval/`](docs/eval/) for test cases.
  - [`docs/req/`](docs/req/) for requirements derived from the architecture documents.
- Write all changes under [`docs/`](docs/) in English.
- When behavior or data flow changes, update the corresponding architecture, requirement, and evaluation documentation in the same change. Keep sequence diagrams, implementation comments/logs, and tests consistent.

## Boundaries and Dependencies

- Ask for approval before modifying a Git submodule, including `src/hasm_color_pattern`, `src/hasm_logger`, or `src-tauri/src/hasm_logger`.
- Do not change generated artifacts or build output unless the task explicitly requires it.
- Preserve the existing React/Vite frontend and Rust/Tauri backend separation. Place code in the owning module described by the directory-structure documentation.

## Implementation Practices

- Make focused, minimal changes; do not mix unrelated refactors with feature or bug-fix work.
- Maintain existing public interfaces and serialized data shapes unless the requirement explicitly changes them.
- Handle errors explicitly; avoid panics, unchecked assumptions, and silent failure for filesystem, archive, IPC, and workspace-lock operations.
- Add concise comments to relate non-obvious logic to the relevant `SEQ-MD-*` architecture flow.
- Add sequence-tagged logs at important operation boundaries so execution can be compared with [`docs/arch/`](docs/arch/), for example `[SEQ-MD-01][IMPORT]`.
- Always use the shared `hasm_logger` functions for application logging. Use the JavaScript logger in `src/hasm_logger`, the Rust logger in `src-tauri/src/hasm_logger`, and the Python logger when working in Python. Do not add ad hoc logging frameworks or raw `console` logging for application events.
- Never log secrets, credentials, or unnecessary full document/asset contents.

## Testing and Validation

- Add or update focused tests when changing observable behavior, especially for documented evaluation cases.
- Run the narrowest relevant check first. Available checks include:
  - `npm run check:seq-md-01`
  - `npm run check:tauri-build`
  - `npm run check:react-render`
  - `npm run check`
- Keep tests deterministic and avoid relying on local absolute paths, timing-sensitive behavior, or network access.
- Report validation run results and any checks that could not be run.