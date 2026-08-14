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
  - `npm run check:seq-md-02`
  - `npm run check:seq-md-01`
  - `npm run check:tauri-build`
  - `npm run check:react-render`
  - `npm run check`
- Keep tests deterministic and avoid relying on local absolute paths, timing-sensitive behavior, or network access.
- Report validation run results and any checks that could not be run.
- Logging format of the test script is fixed
  - If test fail, please provide detail error messages
  - IF test pass, please return RESULT, TEST ID, and TEST NAME

  ## UI Design Policy

  The canonical UI policy is [`docs/design-policy.md`](../docs/design-policy.md). Apply it to every page, state, dialog, and responsive breakpoint:

  - Design for Serenity, Paper and Ink, and Mathematical Minimalism. Use generous whitespace, crisp geometric borders, restrained motion, and a calm high-end writing atmosphere.
  - Use `Yu Mincho`, `游明朝`, `Georgia`, or `serif` for editor, Markdown preview, and body content. Keep at least `0.03em` letter spacing and `1.7` to `1.8` line height for serif content.
  - Avoid flashy animation, bright primary colors, generic flat UI, decorative blobs, purple-on-white defaults, nested cards, and oversized marketing layouts.
  - Use the `src/hasm_color_pattern` APIs. Define theme values as CSS Custom Properties at `:root`; all chrome, inputs, editor text, dialogs, assets, and `markdown-it` preview must use those variables immediately.
  - Do not use pure black or pure white as base surfaces. Preserve readable contrast across every pattern.
  - Never reuse a dark theme accent as foreground text on a dark surface. Derive contrast-safe readable accent and on-accent tokens for labels, links, active controls, warnings, and focus states; keep reading text at WCAG AA contrast where practical.
  - Keep the default editor/preview dual pane responsive. The main navigation is a hamburger-triggered off-canvas drawer containing file actions, themes, text scale, focus mode, assets, and diagnostics.
  - Provide Small, Medium, and Large text presets through `--base-font-size`, plus Split, Editor, and Preview focus modes. Keep controls stable and ensure text never overflows its parent on desktop or mobile.
  - When assets exist, keep their aliases discoverable on the main editor page through a compact, theme-aware shelf. Clicking an asset should insert its existing Markdown reference at the current cursor; preserve the serialized `asset:` syntax.
  - Bootstrap is allowed only for grid, flexbox, and structural utilities. Override its component appearance with HASM styles; do not add another UI library. Use accessible labels for unfamiliar icon-only controls.
  - Prefer existing components, pattern APIs, shared HASM logger functions, and documented module ownership. Keep changes focused and update related architecture, requirement, evaluation, and test documentation when behavior changes.